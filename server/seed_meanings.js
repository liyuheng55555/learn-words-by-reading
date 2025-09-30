#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'word_scores.db');
const VOCAB_PATH = path.join(DATA_DIR, 'vocabulary.csv');

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

function escapeSqlString(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/'/g, "''");
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

async function ensureTableColumns() {
  const infoRaw = await runSqlite('PRAGMA table_info(word_scores);', { json: true });
  let columns = [];
  try {
    columns = JSON.parse(infoRaw);
  } catch (error) {
    console.error('无法读取词汇表结构:', error.message);
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
  if (!names.has('correct_count')) {
    alters.push('ALTER TABLE word_scores ADD COLUMN correct_count INTEGER NOT NULL DEFAULT 0;');
  }
  if (!names.has('incorrect_count')) {
    alters.push('ALTER TABLE word_scores ADD COLUMN incorrect_count INTEGER NOT NULL DEFAULT 0;');
  }
  if (!names.has('meaning')) {
    alters.push('ALTER TABLE word_scores ADD COLUMN meaning TEXT;');
  }
  for (const stmt of alters) {
    await runSqlite(stmt);
  }
}

async function ensureDatabase() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  const schema = `PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS word_scores (
  term TEXT PRIMARY KEY,
  meaning TEXT,
  score REAL NOT NULL DEFAULT 0,
  submissions INTEGER NOT NULL DEFAULT 0,
  last_submission TEXT,
  correct_count INTEGER NOT NULL DEFAULT 0,
  incorrect_count INTEGER NOT NULL DEFAULT 0
);
`;
  await runSqlite(schema);
  await ensureTableColumns();
}

async function seedMeanings() {
  if (!fs.existsSync(VOCAB_PATH)) {
    throw new Error(`未找到词汇表文件：${VOCAB_PATH}`);
  }

  await ensureDatabase();

  const raw = fs.readFileSync(VOCAB_PATH, 'utf-8');
  const lines = raw.split(/\r?\n/).filter(Boolean);
  if (lines.length <= 1) {
    console.log('词汇表不包含有效数据，跳过。');
    return;
  }

  const statements = ['BEGIN TRANSACTION;'];
  let changeCount = 0;

  for (let i = 1; i < lines.length; i++) {
    const columns = parseCsvLine(lines[i]);
    if (!columns || columns.length < 2) continue;
    const term = columns[1]?.trim();
    if (!term) continue;
    const meaning = columns[3]?.trim() || '';
    const escapedTerm = term.replace(/'/g, "''");

    statements.push(`INSERT INTO word_scores(term, meaning) VALUES ('${escapedTerm}', NULL) ON CONFLICT(term) DO NOTHING;`);

    if (meaning) {
      const meaningEscaped = escapeSqlString(meaning);
      statements.push(`UPDATE word_scores SET meaning = '${meaningEscaped}' WHERE term = '${escapedTerm}' AND (meaning IS NULL OR TRIM(meaning) = '');`);
      changeCount++;
    }
  }

  statements.push('COMMIT;');
  await runSqlite(statements.join('\n'));
  console.log(`已处理 ${lines.length - 1} 个词条，含中文释义的词条：${changeCount} 个。`);
}

seedMeanings()
  .catch((error) => {
    console.error('写入中文释义失败:', error.message);
    process.exitCode = 1;
  });

