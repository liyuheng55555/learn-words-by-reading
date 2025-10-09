const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;
const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'word_scores.db');
const MIN_SCORE = -4;
const STRICT_THRESHOLD = 0.85;
const PARTIAL_THRESHOLD = 0.6;
const PUBLIC_ROOT = path.join(__dirname, '..');

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
  meaning TEXT,
  score REAL NOT NULL DEFAULT 0,
  submissions INTEGER NOT NULL DEFAULT 0,
  last_submission TEXT,
  correct_count INTEGER NOT NULL DEFAULT 0,
  incorrect_count INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS word_contexts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  term TEXT NOT NULL,
  sentence TEXT NOT NULL,
  article TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_word_contexts_term_created_at ON word_contexts(term, created_at DESC);
CREATE TABLE IF NOT EXISTS grading_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  submitted_at TEXT NOT NULL,
  article TEXT,
  total_terms INTEGER NOT NULL DEFAULT 0,
  correct_terms INTEGER NOT NULL DEFAULT 0,
  partial_terms INTEGER NOT NULL DEFAULT 0,
  incorrect_terms INTEGER NOT NULL DEFAULT 0,
  avg_similarity REAL,
  scored INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS session_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  term TEXT NOT NULL,
  similarity REAL,
  standard_answer TEXT,
  explanation TEXT,
  context TEXT,
  FOREIGN KEY(session_id) REFERENCES grading_sessions(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_session_results_session ON session_results(session_id);
CREATE TABLE IF NOT EXISTS score_snapshots (
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
`;
  await runSqlite(schema);
  await ensureTableColumns();
  await ensureGradingSessionColumns();
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

function getContentType(ext) {
  switch ((ext || '').toLowerCase()) {
    case '.html':
      return 'text/html; charset=utf-8';
    case '.js':
      return 'application/javascript; charset=utf-8';
    case '.css':
      return 'text/css; charset=utf-8';
    case '.json':
      return 'application/json; charset=utf-8';
    case '.svg':
      return 'image/svg+xml';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.gif':
      return 'image/gif';
    case '.ico':
      return 'image/x-icon';
    default:
      return 'application/octet-stream';
  }
}

const STATIC_ROUTES = new Map([
  ['/', 'geo_vocab_fill_in_webpage_english→chinese.html'],
  ['/index.html', 'geo_vocab_fill_in_webpage_english→chinese.html'],
  ['/fill.html', 'geo_vocab_fill_in_webpage_english→chinese.html'],
  ['/geo_vocab_fill_in_webpage_english→chinese.html', 'geo_vocab_fill_in_webpage_english→chinese.html'],
  ['/history', 'history.html'],
  ['/history.html', 'history.html'],
  ['/progress', 'progress.html'],
  ['/progress.html', 'progress.html']
]);

function tryServeStatic(req, res, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return false;
  }

  let safePathname = pathname || '/';
  try {
    safePathname = decodeURIComponent(safePathname);
  } catch (error) {
    console.warn('Failed to decode pathname', pathname, error.message);
    return false;
  }

  let relativePath = null;
  if (STATIC_ROUTES.has(safePathname)) {
    relativePath = STATIC_ROUTES.get(safePathname);
  } else if (!safePathname.startsWith('/api/')) {
    const cleaned = safePathname.replace(/\/+/g, '/');
    if (cleaned.includes('..')) {
      return false;
    }
    relativePath = cleaned === '/' ? STATIC_ROUTES.get('/') : cleaned.slice(1);
  }

  if (!relativePath) {
    return false;
  }

  const fullPath = path.join(PUBLIC_ROOT, relativePath);
  const resolved = path.resolve(fullPath);
  if (!resolved.startsWith(PUBLIC_ROOT)) {
    return false;
  }

  let stat;
  try {
    stat = fs.statSync(resolved);
  } catch (error) {
    return false;
  }

  if (stat.isDirectory()) {
    return false;
  }

  const contentType = getContentType(path.extname(resolved));
  res.writeHead(200, {
    'Content-Type': contentType,
    'Access-Control-Allow-Origin': '*'
  });

  if (req.method === 'HEAD') {
    res.end();
    return true;
  }

  const stream = fs.createReadStream(resolved);
  stream.on('error', (error) => {
    console.error('Failed to stream static file', error.message);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    }
    res.end('Internal Server Error');
  });
  stream.pipe(res);
  return true;
}

function escapeSqlString(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/'/g, "''");
}

async function getScores() {
  const output = await runSqlite('SELECT term, meaning, score, submissions, last_submission, correct_count, incorrect_count FROM word_scores ORDER BY rowid;', { json: true });
  if (!output) return [];
  try {
    const records = JSON.parse(output) || [];
    if (!Array.isArray(records) || !records.length) return [];
    const contextMap = await fetchRecentContexts(records.map((record) => record.term), 3);
    return records.map((record) => ({
      ...record,
      recent_contexts: contextMap.get(record.term) || []
    }));
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

async function pruneOldContexts(terms, keep = 30) {
  if (!Array.isArray(terms) || terms.length === 0) return;
  const unique = Array.from(new Set(terms
    .map((term) => (typeof term === 'string' ? term.trim() : ''))
    .filter(Boolean)));
  if (!unique.length) return;

  const statements = ['BEGIN TRANSACTION;'];
  const limit = Math.max(1, Number(keep) || 30);
  for (const term of unique) {
    const termEscaped = escapeSqlString(term);
    statements.push(`DELETE FROM word_contexts WHERE term = '${termEscaped}' AND id NOT IN (SELECT id FROM word_contexts WHERE term = '${termEscaped}' ORDER BY created_at DESC, id DESC LIMIT ${limit});`);
  }
  statements.push('COMMIT;');
  await runSqlite(statements.join('\n'));
}

async function storeWordContexts(results, article) {
  if (!Array.isArray(results) || results.length === 0) return;

  const timestamp = new Date().toISOString();
  const fallbackArticle = typeof article === 'string' ? article.trim() : '';
  const statements = ['BEGIN TRANSACTION;'];
  let hasInsert = false;

  for (const item of results) {
    if (!item || typeof item.term !== 'string') continue;
    const term = item.term.trim();
    if (!term) continue;

    const contextRaw = typeof item.context === 'string' ? item.context.trim() : '';
    if (!contextRaw) continue;

    const articleRaw = typeof item.article === 'string' && item.article.trim()
      ? item.article.trim()
      : fallbackArticle;

    const termEscaped = escapeSqlString(term);
    const sentenceEscaped = escapeSqlString(contextRaw);
    const articleEscaped = articleRaw ? `'${escapeSqlString(articleRaw)}'` : 'NULL';

    statements.push(`INSERT INTO word_contexts(term, sentence, article, created_at) VALUES ('${termEscaped}', '${sentenceEscaped}', ${articleEscaped}, '${timestamp}');`);
    hasInsert = true;
  }

  if (!hasInsert) return;

  statements.push('COMMIT;');
  await runSqlite(statements.join('\n'));

  const affectedTerms = results
    .map((item) => (item && typeof item.term === 'string' ? item.term.trim() : ''))
    .filter(Boolean);
  await pruneOldContexts(affectedTerms, 30);
}

async function fetchRecentContexts(terms = null, limitPerTerm = 3) {
  const limit = Math.max(1, Number(limitPerTerm) || 3);
  let sql = 'SELECT term, sentence, article, created_at FROM word_contexts';
  let uniqueTerms = [];

  if (Array.isArray(terms) && terms.length) {
    uniqueTerms = Array.from(new Set(terms
      .map((term) => (typeof term === 'string' ? term.trim() : ''))
      .filter(Boolean)));
    if (!uniqueTerms.length) {
      return new Map();
    }
    const escapedList = uniqueTerms.map((term) => `'${escapeSqlString(term)}'`).join(',');
    sql += ` WHERE term IN (${escapedList})`;
  }

  sql += ' ORDER BY created_at DESC, id DESC';

  const limitMultiplier = uniqueTerms.length ? uniqueTerms.length : limit * 50;
  const fetchLimit = uniqueTerms.length
    ? Math.max(limit * uniqueTerms.length * 3, limit)
    : Math.max(limit * limitMultiplier, limit * 20);

  sql += ` LIMIT ${fetchLimit};`;

  const raw = await runSqlite(sql, { json: true });
  const contexts = new Map();
  if (!raw) return contexts;

  let rows;
  try {
    rows = JSON.parse(raw);
  } catch (error) {
    console.error('Failed to parse contexts JSON:', error.message);
    return contexts;
  }

  for (const row of rows) {
    if (!row || typeof row.term !== 'string') continue;
    const term = row.term;
    const sentence = typeof row.sentence === 'string' ? row.sentence : '';
    const article = typeof row.article === 'string' ? row.article : '';
    const createdAt = typeof row.created_at === 'string' ? row.created_at : null;
    if (!sentence) continue;

    const list = contexts.get(term) || [];
    if (list.length >= limit) continue;
    list.push({ sentence, article, created_at: createdAt });
    contexts.set(term, list);
  }

  return contexts;
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
      `UPDATE word_scores SET score = MAX(${MIN_SCORE}, score + (${delta})), submissions = submissions + 1, last_submission = '${timestamp}', correct_count = correct_count + ${isCorrect}, incorrect_count = incorrect_count + ${incorrect} WHERE term = '${termEscaped}';`
    );
  }
  statements.push('COMMIT;');
  await runSqlite(statements.join('\n'));
}

function normalizeResultItem(item) {
  if (!item || typeof item.term !== 'string') {
    return null;
  }
  const term = item.term.trim();
  if (!term) return null;
  const similarityRaw = Number(item.similarity);
  const similarity = Number.isFinite(similarityRaw) ? similarityRaw : null;
  const standardAnswer = typeof item.standard_answer === 'string'
    ? item.standard_answer
    : (typeof item.standardAnswer === 'string' ? item.standardAnswer : null);
  const explanation = typeof item.explanation === 'string'
    ? item.explanation
    : (typeof item.detail === 'string' ? item.detail : null);
  const context = typeof item.context === 'string' ? item.context : null;
  return { term, similarity, standardAnswer, explanation, context };
}

async function recordGradingSession(results, article, { scored = false } = {}) {
  if (!Array.isArray(results) || results.length === 0) {
    return null;
  }

  const normalized = [];
  let total = 0;
  let correct = 0;
  let partial = 0;
  let incorrect = 0;
  let similaritySum = 0;
  let similarityCount = 0;

  for (const item of results) {
    const normalizedItem = normalizeResultItem(item);
    if (!normalizedItem) continue;
    total += 1;

    if (normalizedItem.similarity === null) {
      incorrect += 1;
    } else if (normalizedItem.similarity >= STRICT_THRESHOLD) {
      correct += 1;
      similaritySum += normalizedItem.similarity;
      similarityCount += 1;
    } else if (normalizedItem.similarity >= PARTIAL_THRESHOLD) {
      partial += 1;
      similaritySum += normalizedItem.similarity;
      similarityCount += 1;
    } else {
      incorrect += 1;
      similaritySum += normalizedItem.similarity;
      similarityCount += 1;
    }

    normalized.push(normalizedItem);
  }

  if (!normalized.length) {
    return null;
  }

  const timestamp = new Date().toISOString();
  const avgSimilarity = similarityCount > 0 ? similaritySum / similarityCount : null;
  const articleSql = article && typeof article === 'string' && article.trim()
    ? `'${escapeSqlString(article)}'`
    : 'NULL';
  const avgSql = Number.isFinite(avgSimilarity) ? avgSimilarity.toFixed(6) : 'NULL';
  const totalTerms = total;

  const statements = ['BEGIN TRANSACTION;'];
  const scoredValue = scored ? 1 : 0;
  statements.push(`INSERT INTO grading_sessions(submitted_at, article, total_terms, correct_terms, partial_terms, incorrect_terms, avg_similarity, scored) VALUES ('${timestamp}', ${articleSql}, ${totalTerms}, ${correct}, ${partial}, ${incorrect}, ${avgSql}, ${scoredValue});`);

  const sessionIdSelector = `(SELECT id FROM grading_sessions WHERE submitted_at = '${timestamp}' ORDER BY id DESC LIMIT 1)`;

  for (const entry of normalized) {
    const termEscaped = escapeSqlString(entry.term);
    const similaritySql = entry.similarity === null ? 'NULL' : entry.similarity.toFixed(6);
    const standardSql = entry.standardAnswer && entry.standardAnswer.trim()
      ? `'${escapeSqlString(entry.standardAnswer)}'`
      : 'NULL';
    const explanationSql = entry.explanation && entry.explanation.trim()
      ? `'${escapeSqlString(entry.explanation)}'`
      : 'NULL';
    const contextSql = entry.context && entry.context.trim()
      ? `'${escapeSqlString(entry.context)}'`
      : 'NULL';

    statements.push(`INSERT INTO session_results(session_id, term, similarity, standard_answer, explanation, context) VALUES (${sessionIdSelector}, '${termEscaped}', ${similaritySql}, ${standardSql}, ${explanationSql}, ${contextSql});`);
  }

  statements.push('COMMIT;');
  await runSqlite(statements.join('\n'));

  const lookupRaw = await runSqlite(`SELECT id FROM grading_sessions WHERE submitted_at = '${timestamp}' ORDER BY id DESC LIMIT 1;`, { json: true });
  if (!lookupRaw) return null;
  try {
    const parsed = JSON.parse(lookupRaw);
    const record = Array.isArray(parsed) ? parsed[0] : null;
    const sessionId = record ? Number(record.id) : null;
    if (!Number.isFinite(sessionId)) {
      return null;
    }

    if (scored) {
      await createScoreSnapshot(sessionId, timestamp, normalized);
    }
    return sessionId;
  } catch (error) {
    console.error('Failed to parse session lookup result:', error.message);
    return null;
  }
}

async function createScoreSnapshot(sessionId, timestamp, termEntries = []) {
  const terms = Array.isArray(termEntries)
    ? termEntries
        .map((entry) => {
          if (!entry) return null;
          if (typeof entry === 'string') return entry;
          if (typeof entry.term === 'string') return entry.term;
          return null;
        })
        .map((term) => (term ? term.trim() : ''))
        .filter(Boolean)
    : [];

  if (!terms.length) return;

  const uniqueTerms = Array.from(new Set(terms));
  if (!uniqueTerms.length) return;

  const escapedList = uniqueTerms.map((term) => `'${escapeSqlString(term)}'`).join(',');
  const sql = `SELECT
    COUNT(*) AS practiced,
    SUM(CASE WHEN score < 0 THEN 1 ELSE 0 END) AS below_zero,
    SUM(CASE WHEN score >= 0 AND score < 2 THEN 1 ELSE 0 END) AS zero_to_two,
    SUM(CASE WHEN score >= 2 AND score < 999 THEN 1 ELSE 0 END) AS above_two,
    SUM(CASE WHEN score >= 999 THEN 1 ELSE 0 END) AS mastered
  FROM word_scores
  WHERE term IN (${escapedList}) AND submissions > 0;`;

  const raw = await runSqlite(sql, { json: true });
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw);
    const stats = Array.isArray(parsed) && parsed.length ? parsed[0] : null;
    if (!stats) return;

    const practiced = Number(stats.practiced) || 0;
    if (practiced <= 0) return;

    const below = Number(stats.below_zero) || 0;
    const zeroToTwo = Number(stats.zero_to_two) || 0;
    const aboveTwo = Number(stats.above_two) || 0;
    const mastered = Number(stats.mastered) || 0;
    const takenAt = timestamp || new Date().toISOString();

    const insert = `INSERT INTO score_snapshots(session_id, taken_at, total_practiced, below_zero, zero_to_two, above_two, mastered)
      VALUES (${sessionId}, '${takenAt}', ${practiced}, ${below}, ${zeroToTwo}, ${aboveTwo}, ${mastered});`;
    await runSqlite(insert);
  } catch (error) {
    console.error('Failed to create score snapshot:', error.message);
  }
}

async function listSessions(limit = 50) {
  const cappedLimit = Math.max(1, Math.min(Number(limit) || 50, 200));
  const sql = `SELECT id, submitted_at, total_terms, correct_terms, partial_terms, incorrect_terms, avg_similarity, scored FROM grading_sessions ORDER BY submitted_at DESC, id DESC LIMIT ${cappedLimit};`;
  const raw = await runSqlite(sql, { json: true });
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('Failed to parse session list:', error.message);
    return [];
  }
}

async function getDailyStats(days = 7) {
  const windowDays = Math.max(1, Math.min(Number(days) || 7, 31));
  const sql = `WITH ranked AS (
    SELECT DATE(taken_at) AS day,
           total_practiced,
           below_zero,
           zero_to_two,
           above_two,
           mastered,
           ROW_NUMBER() OVER (PARTITION BY DATE(taken_at) ORDER BY taken_at DESC, id DESC) AS rn
    FROM score_snapshots
  ), latest AS (
    SELECT day,
           total_practiced,
           below_zero,
           zero_to_two,
           above_two,
           mastered
    FROM ranked
    WHERE rn = 1
  ), baseline AS (
    SELECT day,
           total_practiced,
           below_zero,
           zero_to_two,
           above_two,
           mastered
    FROM latest
    WHERE day < DATE('now', '-' || ${windowDays - 1} || ' day')
    ORDER BY day DESC
    LIMIT 1
  ), window AS (
    SELECT * FROM latest WHERE day >= DATE('now', '-' || ${windowDays - 1} || ' day')
  ), combined AS (
    SELECT * FROM baseline
    UNION ALL
    SELECT * FROM window
  ), numbered AS (
    SELECT day,
           total_practiced,
           below_zero,
           zero_to_two,
           above_two,
           mastered,
           LAG(total_practiced) OVER (ORDER BY day) AS prev_total,
           LAG(below_zero) OVER (ORDER BY day) AS prev_below,
           LAG(above_two) OVER (ORDER BY day) AS prev_above
    FROM combined
  )
  SELECT day,
         CASE
           WHEN prev_total IS NULL THEN total_practiced
           WHEN total_practiced - prev_total < 0 THEN 0
           ELSE total_practiced - prev_total
         END AS practiced,
         CASE
           WHEN prev_below IS NULL THEN below_zero
           WHEN below_zero - prev_below < 0 THEN 0
           ELSE below_zero - prev_below
         END AS below_zero,
         CASE
           WHEN prev_above IS NULL THEN above_two
           WHEN above_two - prev_above < 0 THEN 0
           ELSE above_two - prev_above
         END AS above_two,
         total_practiced,
         below_zero AS total_below_zero,
         above_two AS total_above_two,
         zero_to_two AS total_zero_to_two,
         mastered AS total_mastered
  FROM numbered
  WHERE day >= DATE('now', '-' || ${windowDays - 1} || ' day')
  ORDER BY day ASC;`;
  const raw = await runSqlite(sql, { json: true });
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('Failed to parse daily stats:', error.message);
    return [];
  }
}

async function fetchSessionDetail(id) {
  const sessionId = Number(id);
  if (!Number.isInteger(sessionId) || sessionId <= 0) return null;

  const sessionRaw = await runSqlite(`SELECT id, submitted_at, article, total_terms, correct_terms, partial_terms, incorrect_terms, avg_similarity, scored FROM grading_sessions WHERE id = ${sessionId} LIMIT 1;`, { json: true });
  if (!sessionRaw) return null;
  let sessionRecord;
  try {
    const parsed = JSON.parse(sessionRaw);
    sessionRecord = Array.isArray(parsed) ? parsed[0] : null;
  } catch (error) {
    console.error('Failed to parse session detail:', error.message);
    return null;
  }
  if (!sessionRecord) return null;

  const resultsRaw = await runSqlite(`SELECT term, similarity, standard_answer, explanation, context FROM session_results WHERE session_id = ${sessionId} ORDER BY term COLLATE NOCASE;`, { json: true });
  let results = [];
  if (resultsRaw) {
    try {
      const parsed = JSON.parse(resultsRaw);
      if (Array.isArray(parsed)) {
        results = parsed;
      }
    } catch (error) {
      console.error('Failed to parse session results:', error.message);
    }
  }

  return { session: sessionRecord, results };
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
  const sql = `SELECT term, meaning, score, submissions, last_submission, correct_count, incorrect_count FROM word_scores WHERE term IN (${escapedList});`;
  let parsed = [];
  const raw = await runSqlite(sql, { json: true });
  if (raw) {
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      console.error('Failed to parse targeted score query:', error.message);
    }
  }
  if (!parsed.length) return [];

  const recordMap = new Map(parsed.map(item => [item.term, item]));
  const contextMap = await fetchRecentContexts(uniqueTerms, 3);

  return uniqueTerms
    .map(term => {
      const record = recordMap.get(term);
      if (!record) return null;
      return {
        ...record,
        recent_contexts: contextMap.get(term) || []
      };
    })
    .filter(Boolean);
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
  if (!names.has('meaning')) {
    alters.push('ALTER TABLE word_scores ADD COLUMN meaning TEXT;');
  }
  for (const stmt of alters) {
    await runSqlite(stmt);
  }
}

async function ensureGradingSessionColumns() {
  const infoRaw = await runSqlite('PRAGMA table_info(grading_sessions);', { json: true });
  let columns = [];
  try {
    columns = JSON.parse(infoRaw);
  } catch (error) {
    console.error('Failed to read grading sessions table info:', error.message);
    return;
  }
  const names = new Set(columns.map((col) => col.name));
  if (!names.has('scored')) {
    await runSqlite('ALTER TABLE grading_sessions ADD COLUMN scored INTEGER NOT NULL DEFAULT 0;');
  }
  await runSqlite('UPDATE grading_sessions SET scored = 1 WHERE scored = 0 AND id IN (SELECT DISTINCT session_id FROM score_snapshots);');
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
    const article = typeof payload.article === 'string' ? payload.article : '';
    const sessionIdRaw = payload.session_id ?? payload.sessionId;
    const existingSessionId = Number(sessionIdRaw);
    const hasExistingSession = Number.isInteger(existingSessionId) && existingSessionId > 0;
    if (results.length === 0) {
      return sendJson(res, 400, { error: '缺少有效的判题结果数据' });
    }

    await applyScores(results);
    if (!hasExistingSession) {
      await storeWordContexts(results, article);
    }
    let sessionId;
    if (hasExistingSession) {
      sessionId = existingSessionId;
      await runSqlite(`UPDATE grading_sessions SET scored = 1 WHERE id = ${sessionId};`);
      await createScoreSnapshot(sessionId, new Date().toISOString(), results);
    } else {
      sessionId = await recordGradingSession(results, article, { scored: true });
    }
    const submittedTerms = results
      .filter(item => item && typeof item.term === 'string')
      .map(item => item.term.trim())
      .filter(Boolean);
    const scores = await getScoresForTerms(submittedTerms);
    return sendJson(res, 200, { updated: submittedTerms.length, scores, session_id: sessionId });
  } catch (error) {
    console.error('Failed to process POST /api/word-scores', error);
    return sendJson(res, 500, { error: error.message || '服务器内部错误' });
  }
}

async function handleCreateSession(req, res) {
  try {
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const raw = Buffer.concat(chunks).toString('utf-8');
    const payload = JSON.parse(raw || '{}');
    const results = Array.isArray(payload.results) ? payload.results : [];
    const article = typeof payload.article === 'string' ? payload.article : '';
    if (results.length === 0) {
      return sendJson(res, 400, { error: '缺少有效的判题结果数据' });
    }

    const normalized = results
      .map((item) => normalizeResultItem(item))
      .filter(Boolean);
    if (!normalized.length) {
      return sendJson(res, 400, { error: '缺少有效的判题结果数据' });
    }

    await storeWordContexts(normalized, article);
    const sessionId = await recordGradingSession(normalized, article, { scored: false });
    if (!sessionId) {
      return sendJson(res, 500, { error: '无法创建判题记录' });
    }

    return sendJson(res, 200, { session_id: sessionId });
  } catch (error) {
    console.error('Failed to create grading session', error);
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
  const { pathname, query } = url.parse(req.url, true);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    return res.end();
  }

  if (tryServeStatic(req, res, pathname || '/')) {
    return;
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

  if (pathname === '/api/sessions' && req.method === 'POST') {
    return handleCreateSession(req, res);
  }

  if (pathname === '/api/sessions' && req.method === 'GET') {
    try {
      const limit = query && query.limit ? Number(query.limit) : 50;
      const sessions = await listSessions(limit);
      return sendJson(res, 200, { sessions });
    } catch (error) {
      console.error('Failed to list grading sessions', error);
      return sendJson(res, 500, { error: error.message || '服务器内部错误' });
    }
  }

  if (pathname.startsWith('/api/sessions/') && req.method === 'GET') {
    const idPart = pathname.replace('/api/sessions/', '').trim();
    const id = Number(idPart);
    if (!Number.isInteger(id) || id <= 0) {
      return sendJson(res, 400, { error: '无效的历史记录ID' });
    }
    try {
      const detail = await fetchSessionDetail(id);
      if (!detail) {
        return sendJson(res, 404, { error: '未找到对应的历史记录' });
      }
      return sendJson(res, 200, detail);
    } catch (error) {
      console.error('Failed to fetch grading session detail', error);
      return sendJson(res, 500, { error: error.message || '服务器内部错误' });
    }
  }

  if (pathname === '/api/stats/daily' && req.method === 'GET') {
    try {
      const days = query && query.days ? Number(query.days) : 7;
      const stats = await getDailyStats(days);
      return sendJson(res, 200, { stats });
    } catch (error) {
      console.error('Failed to fetch daily stats', error);
      return sendJson(res, 500, { error: error.message || '服务器内部错误' });
    }
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
