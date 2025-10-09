const STORAGE_KEY = 'grading-history-records';
const MAX_RECORDS = 50;

function hasStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function safeParse(value) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn('[HistoryStorage] Failed to parse stored value:', error);
    return [];
  }
}

function readRecords() {
  if (!hasStorage()) return [];
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  return safeParse(raw).map(normalizeRecord).filter(Boolean);
}

function writeRecords(records) {
  if (!hasStorage()) return;
  const normalized = Array.isArray(records) ? records.map(normalizeRecord).filter(Boolean) : [];
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized.slice(0, MAX_RECORDS)));
  dispatchUpdateEvent();
}

function dispatchUpdateEvent() {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
  window.dispatchEvent(new CustomEvent('grading-history-updated'));
}

function normalizeRecord(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : null;
  if (!id) return null;
  const createdAt = typeof raw.createdAt === 'string' && raw.createdAt ? raw.createdAt : new Date().toISOString();
  const article = typeof raw.article === 'string' ? raw.article : '';
  const summary = normalizeSummary(raw.summary);
  const results = normalizeResults(raw.results);
  const status = raw.status === 'submitted' ? 'submitted' : 'pending';
  const sessionId = Number.isInteger(raw.sessionId) ? raw.sessionId : null;
  const submittedAt = typeof raw.submittedAt === 'string' && raw.submittedAt ? raw.submittedAt : null;
  const scored = raw.scored === true;
  return {
    id,
    createdAt,
    article,
    summary,
    results,
    status,
    sessionId,
    submittedAt,
    scored
  };
}

function normalizeSummary(raw) {
  if (!raw || typeof raw !== 'object') {
    return {
      total: 0,
      correct: 0,
      partial: 0,
      incorrect: 0,
      avg: null
    };
  }
  const toNumber = (value) => (Number.isFinite(value) ? value : Number(value));
  const total = Number.isFinite(raw.total) ? raw.total : Math.max(0, Number(raw.total) || 0);
  const correct = Number.isFinite(raw.correct) ? raw.correct : Math.max(0, Number(raw.correct) || 0);
  const partial = Number.isFinite(raw.partial) ? raw.partial : Math.max(0, Number(raw.partial) || 0);
  const incorrect = Number.isFinite(raw.incorrect) ? raw.incorrect : Math.max(0, Number(raw.incorrect) || 0);
  const avgNumber = toNumber(raw.avg);
  const avg = Number.isFinite(avgNumber) ? avgNumber : null;
  return { total, correct, partial, incorrect, avg };
}

function normalizeResults(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const term = typeof item.term === 'string' ? item.term.trim() : '';
      if (!term) return null;
      const similarityNumber = Number(item.similarity);
      const similarity = Number.isFinite(similarityNumber) ? similarityNumber : null;
      const standard = typeof item.standard_answer === 'string'
        ? item.standard_answer
        : (typeof item.standardAnswer === 'string' ? item.standardAnswer : null);
      const explanation = typeof item.explanation === 'string' ? item.explanation : null;
      const context = typeof item.context === 'string' ? item.context : null;
      return {
        term,
        similarity,
        standard_answer: standard,
        explanation,
        context
      };
    })
    .filter(Boolean);
}

function generateRecordId() {
  const randomPart = Math.random().toString(36).slice(2, 10);
  return `gh_${Date.now()}_${randomPart}`;
}

export function loadGradingHistory() {
  const records = readRecords();
  return records
    .sort((a, b) => {
      const aTime = new Date(a.submittedAt || a.createdAt).getTime();
      const bTime = new Date(b.submittedAt || b.createdAt).getTime();
      return Number.isFinite(bTime) ? bTime - aTime : 0;
    })
    .slice(0, MAX_RECORDS);
}

export function addGradingHistoryRecord({ article = '', summary = {}, results = [] } = {}) {
  if (!hasStorage()) return null;
  const recordSummary = normalizeSummary(summary);
  const recordResults = normalizeResults(results);
  if (!recordResults.length) return null;
  const records = readRecords();
  const record = {
    id: generateRecordId(),
    createdAt: new Date().toISOString(),
    article: typeof article === 'string' ? article : '',
    summary: recordSummary,
    results: recordResults,
    status: 'pending',
    sessionId: null,
    submittedAt: null,
    scored: false
  };
  const updated = [record, ...records].slice(0, MAX_RECORDS);
  writeRecords(updated);
  return record;
}

export function updateGradingHistoryRecord(id, updates = {}) {
  if (!hasStorage() || !id) return null;
  const records = readRecords();
  let changed = false;
  const updatedRecords = records.map((record) => {
    if (record.id !== id) return record;
    const next = { ...record };
    if ('article' in updates && typeof updates.article === 'string') {
      next.article = updates.article;
    }
    if ('summary' in updates && updates.summary) {
      next.summary = normalizeSummary(updates.summary);
    }
    if ('results' in updates && Array.isArray(updates.results)) {
      const normalizedResults = normalizeResults(updates.results);
      if (normalizedResults.length) {
        next.results = normalizedResults;
      }
    }
    if (typeof updates.status === 'string' && (updates.status === 'pending' || updates.status === 'submitted')) {
      next.status = updates.status;
    }
    if ('sessionId' in updates) {
      const sessionIdNumber = Number(updates.sessionId);
      next.sessionId = Number.isInteger(sessionIdNumber) && sessionIdNumber > 0 ? sessionIdNumber : null;
    }
    if ('submittedAt' in updates) {
      next.submittedAt = typeof updates.submittedAt === 'string' && updates.submittedAt ? updates.submittedAt : null;
    }
    if ('scored' in updates) {
      next.scored = !!updates.scored;
    }
    changed = true;
    return next;
  });
  if (changed) {
    writeRecords(updatedRecords);
  }
  return changed ? getGradingHistoryRecord(id) : null;
}

export function markGradingHistorySubmitted(id, sessionInfo = {}) {
  if (!hasStorage() || !id) return null;
  const { sessionId = null, submittedAt = new Date().toISOString() } = sessionInfo;
  const sessionIdNumber = Number(sessionId);
  return updateGradingHistoryRecord(id, {
    status: 'submitted',
    sessionId: Number.isInteger(sessionIdNumber) && sessionIdNumber > 0 ? sessionIdNumber : null,
    submittedAt
  });
}

export function markGradingHistoryScored(id, sessionInfo = {}) {
  if (!hasStorage() || !id) return null;
  const { sessionId = null } = sessionInfo;
  const sessionIdNumber = Number(sessionId);
  return updateGradingHistoryRecord(id, {
    scored: true,
    sessionId: Number.isInteger(sessionIdNumber) && sessionIdNumber > 0 ? sessionIdNumber : null
  });
}

export function getGradingHistoryRecord(id) {
  if (!hasStorage() || !id) return null;
  const records = readRecords();
  return records.find((record) => record.id === id) || null;
}

export function clearGradingHistory() {
  if (!hasStorage()) return;
  window.localStorage.removeItem(STORAGE_KEY);
  dispatchUpdateEvent();
}
