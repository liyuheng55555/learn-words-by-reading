const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;
const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'word_scores.db');

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
  score REAL NOT NULL DEFAULT 0
);`;
  await runSqlite(schema);
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
  const output = await runSqlite('SELECT term, score FROM word_scores ORDER BY LOWER(term);', { json: true });
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
  for (const item of results) {
    if (!item || typeof item.term !== 'string') continue;
    const similarity = Number(item.similarity);
    if (!Number.isFinite(similarity)) continue;
    const delta = computeDelta(similarity);
    const termEscaped = item.term.replace(/'/g, "''");
    statements.push(
      `INSERT INTO word_scores(term, score) VALUES ('${termEscaped}', 0) ON CONFLICT(term) DO NOTHING;`
    );
    statements.push(
      `UPDATE word_scores SET score = score + (${delta}) WHERE term = '${termEscaped}';`
    );
  }
  statements.push('COMMIT;');
  await runSqlite(statements.join('\n'));
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
