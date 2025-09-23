const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;
const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'word_scores.db');
const VOCAB_PATH = path.join(DATA_DIR, 'vocabulary.csv');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

async function runSqlite(sql, { json = false } = {}) {
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

async function ensureDatabase() {
  const schema = `PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS word_scores (
  term TEXT PRIMARY KEY,
  score REAL NOT NULL DEFAULT 0,
  submissions INTEGER NOT NULL DEFAULT 0,
  last_submission TEXT
);`;
  await runSqlite(schema);
  await ensureTableColumns();
}

function sendJson(res, statusCode, data) {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(body);
}

function sendText(res, statusCode, text) {
  res.writeHead(statusCode, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(text);
}

async function getScores() {
  const output = await runSqlite('SELECT term, score, submissions, last_submission FROM word_scores ORDER BY rowid;', { json: true });
  if (!output) return [];
  try {
    return JSON.parse(output);
  } catch (error) {
    console.error('Failed to parse sqlite json output:', output, error);
    throw new Error('无法解析数据库内容');
  }
}

function computeDelta(similarity) {
  const s = Number(similarity);
  if (!Number.isFinite(s)) return 0;
  const delta = 4 * (s - 0.5); // s=0 -> -2, s=0.5 -> 0, s=1 -> +2
  // Clamp to avoid runaway values
  return Math.max(-3, Math.min(3, delta));
}

async function applyScores(results) {
  if (!Array.isArray(results) || results.length === 0) return;
  const statements = ['BEGIN TRANSACTION;'];
  const timestamp = new Date().toISOString();
  for (const item of results) {
    if (!item || typeof item.term !== 'string') continue;
    const similarity = Number(item.similarity);
    if (!Number.isFinite(similarity)) continue;
    const delta = computeDelta(similarity);
    const termEscaped = item.term.replace(/'/g, "''");
    statements.push(
      `INSERT INTO word_scores(term, score, submissions, last_submission) VALUES ('${termEscaped}', 0, 0, NULL) ON CONFLICT(term) DO NOTHING;`
    );
    statements.push(
      `UPDATE word_scores SET score = score + (${delta}), submissions = submissions + 1, last_submission = '${timestamp}' WHERE term = '${termEscaped}';`
    );
  }
  statements.push('COMMIT;');
  await runSqlite(statements.join('\n'));
}

async function getSuggestedTerms(lowLimit = 0, newLimit = 0) {
  const statements = [];
  if (lowLimit > 0) {
    statements.push(`SELECT term, score FROM word_scores WHERE submissions > 0 ORDER BY score ASC, submissions ASC, rowid ASC LIMIT ${lowLimit};`);
  }
  if (newLimit > 0) {
    statements.push(`SELECT term, score FROM word_scores WHERE submissions = 0 ORDER BY rowid ASC LIMIT ${newLimit};`);
  }

  const results = { low: [], fresh: [] };

  if (!statements.length) return results;

  if (lowLimit > 0) {
    const lowSql = `SELECT term, score FROM word_scores WHERE submissions > 0 ORDER BY score ASC, submissions ASC, rowid ASC LIMIT ${lowLimit};`;
    const raw = await runSqlite(lowSql, { json: true });
    try {
      results.low = raw ? JSON.parse(raw) : [];
    } catch (error) {
      console.error('Failed to parse low-score suggestion:', error.message);
    }
  }

  if (newLimit > 0) {
    const newSql = `SELECT term, score FROM word_scores WHERE submissions = 0 ORDER BY rowid ASC LIMIT ${newLimit};`;
    const rawNew = await runSqlite(newSql, { json: true });
    try {
      results.fresh = rawNew ? JSON.parse(rawNew) : [];
    } catch (error) {
      console.error('Failed to parse new-term suggestion:', error.message);
    }
  }

  return results;
}

async function ensureTableColumns() {
  const infoRaw = await runSqlite('PRAGMA table_info(word_scores);', { json: true });
  let columns = [];
  try {
    columns = JSON.parse(infoRaw);
  } catch (error) {
    console.error('Failed to read table info:', error.message);
    return;
  }
  const names = new Set(columns.map((col) => col.name));
  const alters = [];
  if (!names.has('submissions')) {
    alters.push('ALTER TABLE word_scores ADD COLUMN submissions INTEGER NOT NULL DEFAULT 0;');
  }
  if (!names.has('last_submission')) {
    alters.push('ALTER TABLE word_scores ADD COLUMN last_submission TEXT;');
  }
  for (const stmt of alters) {
    await runSqlite(stmt);
  }
}

function parseCsvLine(line) {
  const cells = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      const next = line[i + 1];
      if (inQuotes && next === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      cells.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells;
}

async function hasExistingScores() {
  const output = await runSqlite('SELECT COUNT(*) AS count FROM word_scores;', { json: true });
  if (!output) return false;
  try {
    const parsed = JSON.parse(output);
    const first = Array.isArray(parsed) ? parsed[0] : null;
    const count = first ? Number(first.count) : 0;
    return Number.isFinite(count) && count > 0;
  } catch {
    return false;
  }
}

async function seedVocabulary() {
  if (!fs.existsSync(VOCAB_PATH)) return;
  if (await hasExistingScores()) return;
  try {
    const raw = fs.readFileSync(VOCAB_PATH, 'utf-8');
    const lines = raw.split(/\r?\n/).filter(Boolean);
    if (lines.length <= 1) return; // header only

    const statements = ['BEGIN TRANSACTION;'];
    for (let i = 1; i < lines.length; i++) {
      const columns = parseCsvLine(lines[i]);
      if (!columns || columns.length < 2) continue;
      const term = columns[1]?.trim();
      if (!term) continue;
      const escaped = term.replace(/'/g, "''");
      statements.push(`INSERT INTO word_scores(term, score, submissions, last_submission) VALUES ('${escaped}', 0, 0, NULL) ON CONFLICT(term) DO NOTHING;`);
    }
    statements.push('COMMIT;');
    await runSqlite(statements.join('\n'));
  } catch (error) {
    console.error('Failed to seed vocabulary:', error.message);
  }
}

async function handlePostScores(req, res) {
  try {
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const raw = Buffer.concat(chunks).toString('utf-8');
    const payload = JSON.parse(raw || '{}');
    const results = Array.isArray(payload.results) ? payload.results : [];
    if (results.length === 0) {
      return sendJson(res, 400, { error: '缺少有效的判题结果数据' });
    }

    await applyScores(results);
    const scores = await getScores();
    return sendJson(res, 200, { updated: results.length, scores });
  } catch (error) {
    console.error('Failed to process POST /api/word-scores', error);
    return sendJson(res, 500, { error: error.message || '服务器内部错误' });
  }
}

async function requestListener(req, res) {
  const { pathname } = url.parse(req.url, true);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    return res.end();
  }

  if (pathname === '/api/word-scores' && req.method === 'GET') {
    try {
      const scores = await getScores();
      return sendJson(res, 200, { scores });
    } catch (error) {
      console.error('Failed to fetch scores', error);
      return sendJson(res, 500, { error: error.message || '服务器内部错误' });
    }
  }

  if (pathname === '/api/word-scores' && req.method === 'POST') {
    return handlePostScores(req, res);
  }

  if (pathname === '/api/word-suggestions' && req.method === 'GET') {
    try {
      const { query } = url.parse(req.url, true);
      const lowLimit = Math.max(0, Math.min(50, Number(query.low) || 0));
      const newLimit = Math.max(0, Math.min(50, Number(query.fresh) || Number(query.new) || 0));
      const data = await getSuggestedTerms(lowLimit, newLimit);
      return sendJson(res, 200, {
        low: Array.isArray(data.low) ? data.low : [],
        fresh: Array.isArray(data.fresh) ? data.fresh : []
      });
    } catch (error) {
      console.error('Failed to fetch word suggestions', error);
      return sendJson(res, 500, { error: error.message || '服务器内部错误' });
    }
  }

  if (pathname === '/health') {
    return sendText(res, 200, 'ok');
  }

  res.writeHead(404, {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json; charset=utf-8'
  });
  res.end(JSON.stringify({ error: 'Not found' }));
}

async function start() {
  try {
    await ensureDatabase();
    await seedVocabulary();
  } catch (error) {
    console.error('Failed to initialize database:', error.message);
    process.exit(1);
  }

  const server = http.createServer((req, res) => {
    requestListener(req, res)
      .catch((error) => {
        console.error('Unexpected error handling request', error);
        sendJson(res, 500, { error: '服务器内部错误' });
      });
  });

  server.listen(PORT, () => {
    console.log(`Word score server listening on http://localhost:${PORT}`);
  });
}

start();
