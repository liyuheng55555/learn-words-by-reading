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
  last_submission TEXT,
  correct_count INTEGER NOT NULL DEFAULT 0,
  incorrect_count INTEGER NOT NULL DEFAULT 0
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
  const output = await runSqlite('SELECT term, score, submissions, last_submission, correct_count, incorrect_count FROM word_scores ORDER BY rowid;', { json: true });
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
    const isCorrect = similarity >= 0.6 ? 1 : 0;
    const incorrect = isCorrect ? 0 : 1;
    const termEscaped = item.term.replace(/'/g, "''");
    statements.push(
      `INSERT INTO word_scores(term, score, submissions, last_submission, correct_count, incorrect_count) VALUES ('${termEscaped}', 0, 0, NULL, 0, 0) ON CONFLICT(term) DO NOTHING;`
    );
    statements.push(
      `UPDATE word_scores SET score = score + (${delta}), submissions = submissions + 1, last_submission = '${timestamp}', correct_count = correct_count + ${isCorrect}, incorrect_count = incorrect_count + ${incorrect} WHERE term = '${termEscaped}';`
    );
  }
  statements.push('COMMIT;');
  await runSqlite(statements.join('\n'));
}

async function getScoresForTerms(terms) {
  if (!terms || !terms.length) return [];
  const uniqueTerms = [];
  const seen = new Set();
  for (const term of terms) {
    if (!term || typeof term !== 'string') continue;
    const trimmed = term.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    uniqueTerms.push(trimmed);
  }
  if (!uniqueTerms.length) return [];

  const escapedList = uniqueTerms.map(term => `'${term.replace(/'/g, "''")}'`).join(',');
  const sql = `SELECT term, score, submissions, last_submission, correct_count, incorrect_count FROM word_scores WHERE term IN (${escapedList});`;
  let parsed = [];
  const raw = await runSqlite(sql, { json: true });
  if (raw) {
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      console.error('Failed to parse targeted score query:', error.message);
    }
  }
  const map = new Map(parsed.map(item => [item.term, item]));
  return uniqueTerms.map(term => map.get(term)).filter(Boolean);
}

async function getSuggestedTerms(practicedCount = 0, totalCount = 0, masteryThreshold = 1) {
  const takePracticed = Math.max(0, Math.min(practicedCount, totalCount));
  const takeTotal = Math.max(0, totalCount);

  const result = { practiced: [], fresh: [] };
  if (!takeTotal) return result;

  if (takePracticed > 0) {
    const thresholdQuery = Number.isFinite(masteryThreshold)
      ? `AND score < ${masteryThreshold}`
      : '';
    const sql = `SELECT term, score FROM word_scores
      WHERE submissions > 0 ${thresholdQuery}
      ORDER BY score ASC, submissions ASC, rowid ASC
      LIMIT ${takePracticed};`;
    const raw = await runSqlite(sql, { json: true });
    try {
      result.practiced = raw ? JSON.parse(raw) : [];
    } catch (error) {
      console.error('Failed to parse practiced suggestion:', error.message);
    }

    const fallbackRemaining = Math.max(0, takePracticed - result.practiced.length);
    if (fallbackRemaining > 0) {
      const excludeList = (result.practiced || [])
        .map(entry => entry && typeof entry.term === 'string' ? entry.term : null)
        .filter(Boolean)
        .map(term => `'${term.replace(/'/g, "''")}'`)
        .join(',');
      const exclusionClause = excludeList ? `AND term NOT IN (${excludeList})` : '';
      const fallbackSql = `SELECT term, score FROM word_scores
        WHERE submissions > 0 AND score >= 0 ${exclusionClause}
        ORDER BY score ASC, submissions ASC, rowid ASC
        LIMIT ${fallbackRemaining};`;
      const fallbackRaw = await runSqlite(fallbackSql, { json: true });
      try {
        const fallback = fallbackRaw ? JSON.parse(fallbackRaw) : [];
        result.practiced = [...(result.practiced || []), ...fallback];
      } catch (error) {
        console.error('Failed to parse practiced fallback suggestion:', error.message);
      }
    }
  }

  const remaining = Math.max(0, takeTotal - (result.practiced?.length || 0));
  if (remaining > 0) {
    const sql = `SELECT term, score FROM word_scores
      WHERE submissions = 0
      ORDER BY rowid ASC
      LIMIT ${remaining};`;
    const raw = await runSqlite(sql, { json: true });
    try {
      result.fresh = raw ? JSON.parse(raw) : [];
    } catch (error) {
      console.error('Failed to parse fresh suggestion:', error.message);
    }
  }

  return result;
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
  if (!names.has('correct_count')) {
    alters.push('ALTER TABLE word_scores ADD COLUMN correct_count INTEGER NOT NULL DEFAULT 0;');
  }
  if (!names.has('incorrect_count')) {
    alters.push('ALTER TABLE word_scores ADD COLUMN incorrect_count INTEGER NOT NULL DEFAULT 0;');
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
      statements.push(`INSERT INTO word_scores(term, score, submissions, last_submission, correct_count, incorrect_count) VALUES ('${escaped}', 0, 0, NULL, 0, 0) ON CONFLICT(term) DO NOTHING;`);
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
    const submittedTerms = results
      .filter(item => item && typeof item.term === 'string')
      .map(item => item.term.trim())
      .filter(Boolean);
    const scores = await getScoresForTerms(submittedTerms);
    return sendJson(res, 200, { updated: submittedTerms.length, scores });
  } catch (error) {
    console.error('Failed to process POST /api/word-scores', error);
    return sendJson(res, 500, { error: error.message || '服务器内部错误' });
  }
}

async function handleWordStatus(req, res) {
  try {
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const raw = Buffer.concat(chunks).toString('utf-8');
    const payload = JSON.parse(raw || '{}');
    const term = typeof payload.term === 'string' ? payload.term.trim() : '';
    const action = payload.action;
    if (!term) {
      return sendJson(res, 400, { error: '缺少词汇名称' });
    }
    if (action !== 'mastered' && action !== 'reset') {
      return sendJson(res, 400, { error: '未知操作类型' });
    }

    const escaped = term.replace(/'/g, "''");
    const statements = ['BEGIN TRANSACTION;'];
    statements.push(`INSERT INTO word_scores(term, score, submissions, last_submission, correct_count, incorrect_count) VALUES ('${escaped}', 0, 0, NULL, 0, 0) ON CONFLICT(term) DO NOTHING;`);

    if (action === 'mastered') {
      const timestamp = new Date().toISOString();
      statements.push(`UPDATE word_scores SET score = 999, submissions = submissions + 1, last_submission = '${timestamp}', correct_count = correct_count + 1 WHERE term = '${escaped}';`);
    } else if (action === 'reset') {
      statements.push(`UPDATE word_scores SET score = 0, submissions = 0, last_submission = NULL, correct_count = 0, incorrect_count = 0 WHERE term = '${escaped}';`);
    }

    statements.push('COMMIT;');
    await runSqlite(statements.join('\n'));

    const [result] = await getScoresForTerms([term]);
    return sendJson(res, 200, { term, action, record: result || null });
  } catch (error) {
    console.error('Failed to update word status', error);
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
      const practicedCount = Math.max(0, Math.min(50, Number(query.practiced) || 0));
      const totalCount = Math.max(0, Math.min(50, Number(query.total) || 0));
      const threshold = Number(query.threshold);
      const masteryThreshold = Number.isFinite(threshold) ? threshold : 1;
      const data = await getSuggestedTerms(practicedCount, totalCount, masteryThreshold);
      return sendJson(res, 200, {
        practiced: Array.isArray(data.practiced) ? data.practiced : [],
        fresh: Array.isArray(data.fresh) ? data.fresh : []
      });
    } catch (error) {
      console.error('Failed to fetch word suggestions', error);
      return sendJson(res, 500, { error: error.message || '服务器内部错误' });
    }
  }

  if (pathname === '/api/word-status' && req.method === 'POST') {
    return handleWordStatus(req, res);
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
