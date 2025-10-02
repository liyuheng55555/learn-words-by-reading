#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'word_scores.db');

function runSqlite(sql, { json = false } = {}) {
  return new Promise((resolve, reject) => {
    const args = [];
    if (json) {
      args.push('-json');
    }
    args.push(DB_PATH);

    const child = spawn('sqlite3', args);
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('error', (error) => reject(error));

    child.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(stderr || `sqlite3 exited with code ${code}`));
      }
      resolve(stdout.trim());
    });

    child.stdin.end(sql + '\n');
  });
}

async function fetchSessions() {
  const sql = `SELECT id, submitted_at FROM grading_sessions ORDER BY submitted_at ASC, id ASC;`;
  const raw = await runSqlite(sql, { json: true });
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('Failed to parse sessions:', error.message);
    return [];
  }
}

async function ensureSnapshotTable() {
  const createSql = `CREATE TABLE IF NOT EXISTS score_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    taken_at TEXT NOT NULL,
    total_practiced INTEGER NOT NULL,
    below_zero INTEGER NOT NULL,
    zero_to_two INTEGER NOT NULL,
    above_two INTEGER NOT NULL,
    mastered INTEGER NOT NULL,
    FOREIGN KEY(session_id) REFERENCES grading_sessions(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_score_snapshots_taken_at ON score_snapshots(taken_at);
  CREATE INDEX IF NOT EXISTS idx_score_snapshots_session ON score_snapshots(session_id);`;
  await runSqlite(createSql);
}

async function createSnapshotForSession(sessionId, timestamp) {
  const statsSql = `SELECT
    SUM(CASE WHEN submissions > 0 THEN 1 ELSE 0 END) AS practiced,
    SUM(CASE WHEN submissions > 0 AND score < 0 THEN 1 ELSE 0 END) AS below_zero,
    SUM(CASE WHEN submissions > 0 AND score >= 0 AND score < 2 THEN 1 ELSE 0 END) AS zero_to_two,
    SUM(CASE WHEN submissions > 0 AND score >= 2 AND score < 999 THEN 1 ELSE 0 END) AS above_two,
    SUM(CASE WHEN submissions > 0 AND score >= 999 THEN 1 ELSE 0 END) AS mastered
  FROM word_scores;`;
  const raw = await runSqlite(statsSql, { json: true });
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw);
    const stats = Array.isArray(parsed) && parsed.length ? parsed[0] : null;
    if (!stats) return false;
    const practiced = Number(stats.practiced) || 0;
    if (practiced === 0) return false;
    const below = Number(stats.below_zero) || 0;
    const zeroTwo = Number(stats.zero_to_two) || 0;
    const aboveTwo = Number(stats.above_two) || 0;
    const mastered = Number(stats.mastered) || 0;
    const takenAt = timestamp || new Date().toISOString();

    const insert = `INSERT INTO score_snapshots(session_id, taken_at, total_practiced, below_zero, zero_to_two, above_two, mastered)
      VALUES (${sessionId}, '${takenAt}', ${practiced}, ${below}, ${zeroTwo}, ${aboveTwo}, ${mastered});`;
    await runSqlite(insert);
    return true;
  } catch (error) {
    console.error('Failed to compute snapshot for session', sessionId, error.message);
    return false;
  }
}

async function main() {
  if (!fs.existsSync(DB_PATH)) {
    console.error('Database not found:', DB_PATH);
    process.exit(1);
  }

  await ensureSnapshotTable();

  const sessions = await fetchSessions();
  if (!sessions.length) {
    console.log('No sessions found.');
    return;
  }

  const existingRaw = await runSqlite('SELECT session_id FROM score_snapshots;', { json: true });
  let existing = new Set();
  if (existingRaw) {
    try {
      const parsed = JSON.parse(existingRaw);
      existing = new Set(parsed.map(item => Number(item.session_id)).filter(Number.isFinite));
    } catch (error) {
      console.warn('Failed to parse existing snapshot list:', error.message);
    }
  }

  let created = 0;
  for (const session of sessions) {
    const id = Number(session.id);
    if (!Number.isFinite(id) || existing.has(id)) {
      continue;
    }
    const timestamp = typeof session.submitted_at === 'string' && session.submitted_at.trim()
      ? session.submitted_at.trim()
      : new Date().toISOString();
    const success = await createSnapshotForSession(id, timestamp);
    if (success) {
      created += 1;
      console.log(`Snapshot created for session #${id}`);
    }
  }

  console.log(`Done. ${created} snapshots created.`);
}

main().catch((error) => {
  console.error('Failed to backfill snapshots:', error);
  process.exitCode = 1;
});
