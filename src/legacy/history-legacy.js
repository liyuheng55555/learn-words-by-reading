import { escapeHtml } from '../utils/html.js';
import { formatDateTime } from '../utils/time.js';
import { fetchJson } from '../services/http.js';
import {
  loadGradingHistory,
  getGradingHistoryRecord,
  markGradingHistorySubmitted,
  markGradingHistoryScored
} from '../utils/history-storage.js';

const historyStatusEl = document.getElementById('history-status');
const sessionListEl = document.getElementById('history-session-list');
const refreshBtn = document.getElementById('history-refresh');
const scoreApiInput = document.getElementById('history-score-api');
const detailEmptyEl = document.getElementById('history-detail-empty');
const detailContentEl = document.getElementById('history-detail-content');
const detailTitleEl = document.getElementById('history-detail-title');
const detailMetaEl = document.getElementById('history-detail-meta');
const articleEl = document.getElementById('history-article');
const resultsBodyEl = document.getElementById('history-results-body');
const openSessionLink = document.getElementById('history-open-session');
const copyLowBtn = document.getElementById('history-copy-low');
const scoreRecordBtn = document.getElementById('history-score-record');
const resultsHeadEl = document.getElementById('history-results-head');
const chartCanvas = document.getElementById('history-chart');
const chartEmptyEl = document.getElementById('history-chart-empty');
const toggleMeaningEl = document.getElementById('history-toggle-meaning');

const SESSION_CACHE = new Map();
let CURRENT_LOW_WORDS = [];
let CURRENT_SESSION_RESULTS = [];
let RESULT_SORT_FIELD = 'term';
let RESULT_SORT_ASC = true;
let DAILY_STATS = [];
let SHOW_MEANING = true;
let LOCAL_HISTORY = loadGradingHistory();
let REMOTE_SESSIONS = [];
let HISTORY_INDEX = new Map();
let HISTORY_ENTRIES = [];
let LAST_SELECTED_ENTRY_ID = null;
let SESSION_REFRESH_TIMER = null;
let CURRENT_DETAIL_CONTEXT = null;

if (scoreRecordBtn && !scoreRecordBtn.dataset.originalText) {
  scoreRecordBtn.dataset.originalText = scoreRecordBtn.textContent || '计分';
  scoreRecordBtn.classList.add('hidden');
}

function setHistoryStatus(message, kind = 'info') {
  if (!historyStatusEl) return;
  historyStatusEl.textContent = message || '';
  historyStatusEl.classList.remove('ok', 'warn');
  if (kind === 'ok') historyStatusEl.classList.add('ok');
  if (kind === 'warn') historyStatusEl.classList.add('warn');
}

function readScoreApiBase() {
  const inputValue = scoreApiInput?.value?.trim();
  if (inputValue) {
    localStorage.setItem('score-api-url', inputValue);
    return inputValue;
  }
  const stored = localStorage.getItem('score-api-url');
  if (stored) {
    if (scoreApiInput) scoreApiInput.value = stored;
    return stored;
  }
  const fallback = 'http://localhost:4000';
  if (scoreApiInput) scoreApiInput.value = fallback;
  return fallback;
}

function bucketSimilarity(value) {
  if (!Number.isFinite(value)) return 'unknown';
  if (value >= 0.85) return 'correct';
  if (value >= 0.6) return 'partial';
  return 'incorrect';
}

function parseHistoryNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function parseHistoryAverage(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function getScoreLabel(scored) {
  return scored ? '已计分' : '未计分';
}

function getScoreClass(scored) {
  return scored ? 'scored' : 'unscored';
}

function buildHistoryEntries() {
  const entries = [];
  const localRecords = Array.isArray(LOCAL_HISTORY) ? LOCAL_HISTORY : [];
  const seenSessions = new Set();

  localRecords.forEach((record) => {
    if (!record || typeof record !== 'object') return;
    if (Number.isInteger(record.sessionId)) {
      seenSessions.add(Number(record.sessionId));
    }
    entries.push({
      id: `local-${record.id}`,
      source: 'local',
      status: record.status === 'submitted' ? 'submitted' : 'pending',
      createdAt: record.createdAt,
      submittedAt: record.submittedAt,
      sessionId: Number.isInteger(record.sessionId) ? Number(record.sessionId) : null,
      summary: record.summary || { total: 0, correct: 0, partial: 0, incorrect: 0, avg: null },
      article: record.article || '',
      results: Array.isArray(record.results) ? record.results : [],
      recordId: record.id,
      record,
      scored: record.scored === true
    });
  });

  const remoteSessions = Array.isArray(REMOTE_SESSIONS) ? REMOTE_SESSIONS : [];
  remoteSessions.forEach((session) => {
    if (!session || typeof session !== 'object') return;
    const numericId = parseHistoryNumber(session.id, null);
    if (numericId && seenSessions.has(numericId)) {
      // 本地记录已经覆盖该会话，避免重复显示
      return;
    }
    entries.push({
      id: `remote-${session.id}`,
      source: 'remote',
      status: 'submitted',
      createdAt: session.submitted_at,
      submittedAt: session.submitted_at,
      sessionId: numericId,
      summary: {
        total: parseHistoryNumber(session.total_terms),
        correct: parseHistoryNumber(session.correct_terms),
        partial: parseHistoryNumber(session.partial_terms),
        incorrect: parseHistoryNumber(session.incorrect_terms),
        avg: parseHistoryAverage(session.avg_similarity)
      },
      session,
      scored: Boolean(Number(session.scored))
    });
  });

  entries.sort((a, b) => {
    if (a.scored !== b.scored) {
      return a.scored ? 1 : -1;
    }
    const timeA = new Date(a.submittedAt || a.createdAt).getTime();
    const timeB = new Date(b.submittedAt || b.createdAt).getTime();
    if (Number.isFinite(timeB) && Number.isFinite(timeA)) {
      return timeB - timeA;
    }
    if (Number.isFinite(timeB)) return -1;
    if (Number.isFinite(timeA)) return 1;
    return 0;
  });

  const index = new Map();
  entries.forEach((entry) => {
    index.set(entry.id, entry);
  });
  HISTORY_INDEX = index;
  HISTORY_ENTRIES = entries;
  return entries;
}

function renderSessionList(entries) {
  if (!sessionListEl) return;
  if (!Array.isArray(entries) || !entries.length) {
    sessionListEl.innerHTML = '<li class="history-session-item empty">暂无判题记录，请先完成一次判题。</li>';
    return;
  }

  const items = entries.map((entry) => {
    const submittedIso = entry.submittedAt || entry.createdAt;
    const submitted = submittedIso ? formatDateTime(submittedIso) : '—';
    const summary = entry.summary || {};
    const total = parseHistoryNumber(summary.total);
    const incorrect = parseHistoryNumber(summary.incorrect);
    const partial = parseHistoryNumber(summary.partial);
    const avg = parseHistoryAverage(summary.avg);
    const avgDisplay = Number.isFinite(avg) ? avg.toFixed(2) : '—';
    const scoreClass = incorrect > 0 ? 'warn' : 'ok';
    const statusClass = getScoreClass(entry.scored);
    const statusText = getScoreLabel(entry.scored);
    const displayId = entry.sessionId
      ? `#${entry.sessionId}`
      : (entry.source === 'local' ? `本地 · ${entry.recordId.slice(-6)}` : `#${entry.id}`);
    return `
      <li class="history-session-item" data-id="${entry.id}">
        <button type="button" class="history-session-button">
          <div class="history-session-row">
            <span class="history-session-id">${escapeHtml(displayId)}</span>
            <span class="history-session-date">${escapeHtml(submitted)}</span>
          </div>
          <div class="history-session-row small ${scoreClass}">
            <span>词数：${total}</span>
            <span>错误：${incorrect}</span>
            <span>部分正确：${partial}</span>
            <span>平均：${avgDisplay}</span>
            <span class="history-session-status ${statusClass}">${statusText}</span>
          </div>
        </button>
      </li>
    `;
  }).join('');

  sessionListEl.innerHTML = items;
  if (LAST_SELECTED_ENTRY_ID) {
    setActiveSessionItem(LAST_SELECTED_ENTRY_ID);
  }
}

function refreshHistoryList({ autoSelect = false } = {}) {
  LOCAL_HISTORY = loadGradingHistory();
  buildHistoryEntries();
  renderSessionList(HISTORY_ENTRIES);
  if (HISTORY_ENTRIES.length === 0) {
    detailContentEl?.classList.add('hidden');
    detailEmptyEl?.classList.remove('hidden');
    LAST_SELECTED_ENTRY_ID = null;
    return;
  }
  if (LAST_SELECTED_ENTRY_ID && HISTORY_INDEX.has(LAST_SELECTED_ENTRY_ID)) {
    setActiveSessionItem(LAST_SELECTED_ENTRY_ID);
    return;
  }
  if (autoSelect) {
    selectFirstHistoryEntry();
  }
}

function selectFirstHistoryEntry() {
  if (!HISTORY_ENTRIES.length) return;
  const first = HISTORY_ENTRIES[0];
  if (first) {
    selectSession(first.id);
  }
}

function setActiveSessionItem(entryId) {
  if (!sessionListEl) return;
  Array.from(sessionListEl.querySelectorAll('.history-session-item.active') || []).forEach((item) => {
    item.classList.remove('active');
  });
  if (!entryId) return;
  const targetItem = sessionListEl.querySelector(`.history-session-item[data-id="${entryId}"]`);
  if (targetItem) {
    targetItem.classList.add('active');
  }
}

async function fetchSessions({ autoSelect = false } = {}) {
  try {
    setHistoryStatus('正在载入判题历史（已提交）…', 'info');
    const base = readScoreApiBase();
    const endpoint = `${base.replace(/\/$/, '')}/api/sessions?limit=100`;
    const data = await fetchJson(endpoint);
    REMOTE_SESSIONS = Array.isArray(data?.sessions) ? data.sessions : [];
    refreshHistoryList({ autoSelect });
    setHistoryStatus(`已载入 ${REMOTE_SESSIONS.length} 条已提交记录`, 'ok');
  } catch (error) {
    console.error('[History] 获取历史记录失败:', error);
    setHistoryStatus(`云端记录加载失败：${error.message}`, 'warn');
    refreshHistoryList({ autoSelect: false });
  }
}

async function fetchDailyStats(days = 7) {
  try {
    const base = readScoreApiBase();
    const endpoint = `${base.replace(/\/$/, '')}/api/stats/daily?days=${encodeURIComponent(days)}`;
    const data = await fetchJson(endpoint);
    const stats = Array.isArray(data?.stats) ? data.stats : [];
    DAILY_STATS = fillMissingDays(stats, days);
    if (chartEmptyEl) {
      chartEmptyEl.classList.toggle('hidden', DAILY_STATS.some(item => item.practiced || item.below_zero || item.above_two));
    }
    renderDailyChart(DAILY_STATS);
  } catch (error) {
    console.error('[History] 获取每日统计失败:', error);
    if (chartEmptyEl) {
      chartEmptyEl.classList.remove('hidden');
      chartEmptyEl.textContent = `无法加载趋势数据：${error.message}`;
    }
  }
}

function convertMarkdownToHtml(content = '') {
  if (typeof content !== 'string' || !content.trim()) {
    return '<p>（无文章内容记录）</p>';
  }
  const paragraphs = content.split(/\n\n+/);
  const htmlParagraphs = paragraphs.map((paragraph) => {
    const converted = paragraph.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    return `<p>${converted}</p>`;
  });
  return htmlParagraphs.join('\n');
}

function sortResults(results) {
  const arr = Array.isArray(results) ? [...results] : [];
  const direction = RESULT_SORT_ASC ? 1 : -1;
  arr.sort((a, b) => {
    switch (RESULT_SORT_FIELD) {
      case 'similarity': {
        const sa = Number(a?.similarity);
        const sb = Number(b?.similarity);
        const aValid = Number.isFinite(sa);
        const bValid = Number.isFinite(sb);
        if (!aValid && !bValid) return 0;
        if (!aValid) return 1 * direction;
        if (!bValid) return -1 * direction;
        if (sa === sb) {
          return (a.term || '').localeCompare(b.term || '') * direction;
        }
        return (sa - sb) * direction;
      }
      case 'standard': {
        const aStd = (a?.standard_answer || a?.standardAnswer || '').toString();
        const bStd = (b?.standard_answer || b?.standardAnswer || '').toString();
        const result = aStd.localeCompare(bStd, 'zh', { sensitivity: 'base' });
        return result === 0 ? (a.term || '').localeCompare(b.term || '') * direction : result * direction;
      }
      case 'explanation': {
        const aExp = (a?.explanation || '').toString();
        const bExp = (b?.explanation || '').toString();
        const result = aExp.localeCompare(bExp, 'zh', { sensitivity: 'base' });
        return result === 0 ? (a.term || '').localeCompare(b.term || '') * direction : result * direction;
      }
      case 'term':
      default: {
        return ((a?.term || '').localeCompare(b?.term || '', 'en', { sensitivity: 'base' })) * direction;
      }
    }
  });
  return arr;
}

function updateHeaderIndicators() {
  if (!resultsHeadEl) return;
  const headers = resultsHeadEl.querySelectorAll('th[data-sort]');
  headers.forEach((header) => {
    const key = header.dataset.sort;
    if (!key) return;
    header.classList.add('sortable');
    if (key === RESULT_SORT_FIELD) {
      header.classList.add('active');
      header.dataset.indicator = RESULT_SORT_ASC ? '↑' : '↓';
    } else {
      header.classList.remove('active');
      header.dataset.indicator = '';
    }
  });
}

function renderResultsTable() {
  if (!resultsBodyEl) return;

  const sorted = sortResults(CURRENT_SESSION_RESULTS);

  if (!sorted.length) {
    resultsBodyEl.innerHTML = '<tr><td colspan="4" class="empty">未记录判题结果。</td></tr>';
    CURRENT_LOW_WORDS = [];
    if (copyLowBtn) {
      copyLowBtn.disabled = true;
      copyLowBtn.textContent = '复制 ≤0.5 词';
    }
    updateHeaderIndicators();
    return;
  }

  const rows = sorted.map((item) => {
    const term = escapeHtml(item.term);
    const similarity = typeof item.similarity === 'number' ? item.similarity : Number(item.similarity);
    const similarityDisplay = Number.isFinite(similarity) ? similarity.toFixed(2) : '—';
    const bucket = bucketSimilarity(Number.isFinite(similarity) ? similarity : NaN);
    const standardRaw = item.standard_answer || item.standardAnswer || '';
    const explanationRaw = item.explanation || '';
    const standard = SHOW_MEANING ? escapeHtml(standardRaw) : '—';
    const explanation = SHOW_MEANING ? escapeHtml(explanationRaw) : '—';
    return `
      <tr class="history-result-${bucket}">
        <td>${term || '—'}</td>
        <td>${similarityDisplay}</td>
        <td>${standard || '—'}</td>
        <td>${explanation || '—'}</td>
      </tr>
    `;
  }).join('');

  resultsBodyEl.innerHTML = rows;

  CURRENT_LOW_WORDS = sorted
    .filter((item) => {
      if (!item || typeof item.term !== 'string') return false;
      const similarity = typeof item.similarity === 'number' ? item.similarity : Number(item.similarity);
      return Number.isFinite(similarity) && similarity <= 0.5;
    })
    .map((item) => item.term.trim())
    .filter(Boolean);

  if (copyLowBtn) {
    if (CURRENT_LOW_WORDS.length) {
      copyLowBtn.disabled = false;
      copyLowBtn.textContent = `复制 ≤0.5 词 (${CURRENT_LOW_WORDS.length})`;
    } else {
      copyLowBtn.disabled = true;
      copyLowBtn.textContent = '暂无低分词';
    }
  }

  updateHeaderIndicators();
}

function getChartContext(canvas) {
  if (!canvas) return null;
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.scale(dpr, dpr);
  }
  return ctx;
}

function renderDailyChart(stats) {
  if (!chartCanvas) return;
  const ctx = getChartContext(chartCanvas);
  if (!ctx) return;

  if (!stats || !stats.length) {
    ctx.clearRect(0, 0, chartCanvas.width, chartCanvas.height);
    if (chartEmptyEl) chartEmptyEl.classList.remove('hidden');
    return;
  }

  const width = chartCanvas.getBoundingClientRect().width;
  const height = chartCanvas.getBoundingClientRect().height;
  ctx.clearRect(0, 0, width, height);

  const labels = stats.map(item => item.day);
  const below = stats.map(item => Number(item.below_zero) || 0);
  const above = stats.map(item => Number(item.above_two) || 0);

  const maxValue = Math.max(5, ...below, ...above);
  const padding = { top: 16, right: 24, bottom: 32, left: 40 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  ctx.strokeStyle = 'rgba(147, 161, 161, 0.4)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padding.left, padding.top);
  ctx.lineTo(padding.left, padding.top + chartHeight);
  ctx.lineTo(padding.left + chartWidth, padding.top + chartHeight);
  ctx.stroke();

  const steps = Math.min(4, maxValue);
  ctx.fillStyle = 'var(--muted)';
  ctx.font = '12px sans-serif';
  for (let i = 0; i <= steps; i++) {
    const value = Math.round((maxValue / steps) * i);
    const y = padding.top + chartHeight - (chartHeight * (value / maxValue));
    ctx.fillText(String(value), 6, y + 4);
    ctx.strokeStyle = 'rgba(147, 161, 161, 0.15)';
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(padding.left + chartWidth, y);
    ctx.stroke();
  }

  labels.forEach((label, index) => {
    const x = padding.left + (chartWidth / Math.max(1, labels.length - 1)) * index;
    const y = padding.top + chartHeight + 16;
    ctx.fillStyle = 'var(--muted)';
    ctx.fillText(label.slice(5), x - 18, y);
  });

  function drawLine(data, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    data.forEach((value, index) => {
      const x = padding.left + (chartWidth / Math.max(1, data.length - 1)) * index;
      const y = padding.top + chartHeight - (chartHeight * (value / maxValue));
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();

    data.forEach((value, index) => {
      const x = padding.left + (chartWidth / Math.max(1, data.length - 1)) * index;
      const y = padding.top + chartHeight - (chartHeight * (value / maxValue));
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  drawLine(below, '#dc322f');
  drawLine(above, '#859900');
}

function fillMissingDays(stats, days = 7) {
  const today = new Date();
  const result = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    const dayString = date.toISOString().slice(0, 10);
    const found = stats.find(item => item.day === dayString);
    if (found) {
      result.push(found);
    } else {
      result.push({ day: dayString, practiced: 0, below_zero: 0, above_two: 0 });
    }
  }
  return result;
}

function renderSessionDetail(detail, options = {}) {
  if (!detailContentEl || !detailEmptyEl) return;
  const { source = 'remote', status = 'submitted', recordId = null } = options;
  const entry = LAST_SELECTED_ENTRY_ID ? HISTORY_INDEX.get(LAST_SELECTED_ENTRY_ID) : null;
  const sessionScored = Boolean(Number(detail?.session?.scored));
  const entryScored = entry ? (entry.scored === true || sessionScored) : sessionScored;

  if (!detail || !detail.session) {
    CURRENT_LOW_WORDS = [];
    if (copyLowBtn) {
      copyLowBtn.disabled = true;
      copyLowBtn.textContent = '复制 ≤0.5 词';
    }
    CURRENT_DETAIL_CONTEXT = null;
    if (scoreRecordBtn) {
      scoreRecordBtn.classList.add('hidden');
      scoreRecordBtn.disabled = true;
      delete scoreRecordBtn.dataset.recordId;
    }
    if (openSessionLink) {
      openSessionLink.classList.add('hidden');
      openSessionLink.removeAttribute('href');
    }
    detailContentEl.classList.add('hidden');
    detailEmptyEl.classList.remove('hidden');
    return;
  }

  detailEmptyEl.classList.add('hidden');
  detailContentEl.classList.remove('hidden');

  const { session, results } = detail;
  const submittedIso = session.submitted_at || session.created_at || session.createdAt || '';
  const submitted = submittedIso ? formatDateTime(submittedIso) : '—';
  const total = parseHistoryNumber(session.total_terms, Array.isArray(results) ? results.length : 0);
  const avgNumber = parseHistoryAverage(session.avg_similarity);
  const avgDisplay = Number.isFinite(avgNumber) ? avgNumber.toFixed(2) : '—';
  const correct = parseHistoryNumber(session.correct_terms);
  const partial = parseHistoryNumber(session.partial_terms);
  const inferredIncorrect = Math.max(0, total - correct - partial);
  const incorrect = parseHistoryNumber(session.incorrect_terms, inferredIncorrect);
  const statusText = getScoreLabel(entryScored);
  const statusClass = getScoreClass(entryScored);
  const timeLabel = entryScored ? '记录时间' : '记录时间';
  const titleBase = source === 'remote' ? '判题记录' : '本地判题';
  const sessionIdentifier = session.id || (recordId ? `本地-${recordId.slice(-6)}` : '');
  const titleSuffix = sessionIdentifier ? ` #${sessionIdentifier}` : '';

  if (detailTitleEl) {
    detailTitleEl.textContent = `${titleBase}${titleSuffix}`;
  }

  if (detailMetaEl) {
    const metaParts = [
      `状态：<span class="history-session-status ${statusClass}">${statusText}</span>`,
      `${timeLabel}：${escapeHtml(submitted)}`,
      `总词数：${total}`,
      `平均相似度：${avgDisplay}`,
      `正确/部分/错误：${correct}/${partial}/${incorrect}`
    ];
    detailMetaEl.innerHTML = metaParts.join(' ｜ ');
  }

  if (openSessionLink) {
    const numericSessionId = parseHistoryNumber(session.session_id ?? session.id, null);
    if ((source === 'remote' || status === 'submitted') && numericSessionId) {
      openSessionLink.href = `geo_vocab_fill_in_webpage_english→chinese.html?session=${numericSessionId}`;
      openSessionLink.classList.remove('hidden');
    } else {
      openSessionLink.classList.add('hidden');
      openSessionLink.removeAttribute('href');
    }
  }

  if (articleEl) {
    const articleHtml = convertMarkdownToHtml(session.article || '');
    articleEl.innerHTML = articleHtml;
  }

  RESULT_SORT_FIELD = 'term';
  RESULT_SORT_ASC = true;
  CURRENT_SESSION_RESULTS = Array.isArray(results) ? [...results] : [];
  renderResultsTable();

  const numericSessionId = parseHistoryNumber(session.session_id ?? session.id, null);
  CURRENT_DETAIL_CONTEXT = {
    entryId: LAST_SELECTED_ENTRY_ID,
    source,
    recordId,
    sessionId: numericSessionId,
    article: session.article || '',
    results: Array.isArray(results) ? [...results] : [],
    sessionData: { ...session }
  };

  if (scoreRecordBtn) {
    if (entryScored || !CURRENT_DETAIL_CONTEXT.results.length || (source === 'remote' && !CURRENT_DETAIL_CONTEXT.sessionId)) {
      scoreRecordBtn.classList.add('hidden');
      scoreRecordBtn.disabled = true;
      delete scoreRecordBtn.dataset.recordId;
    } else {
      scoreRecordBtn.classList.remove('hidden');
      scoreRecordBtn.disabled = false;
      if (recordId) {
        scoreRecordBtn.dataset.recordId = recordId;
      } else {
        delete scoreRecordBtn.dataset.recordId;
      }
    }
  }

  if (entry) {
    entry.session = session;
    entry.scored = entryScored;
    entry.summary = entry.summary || {};
    entry.summary.total = total;
    entry.summary.correct = correct;
    entry.summary.partial = partial;
    entry.summary.incorrect = incorrect;
    entry.summary.avg = avgNumber;
  }

  if (source === 'remote') {
    if (entryScored) {
      setHistoryStatus('该判题记录已计分，可继续复盘。', 'ok');
    } else {
      setHistoryStatus('该判题记录尚未计分，点击“计分”按钮即可累计到总分。', 'warn');
    }
  }
}

function renderLocalHistoryDetail(entry) {
  if (!entry || !entry.record) {
    renderSessionDetail(null);
    return;
  }

  const record = entry.record;
  const summary = record.summary || {};
  const total = parseHistoryNumber(summary.total, Array.isArray(record.results) ? record.results.length : 0);
  const sessionId = Number.isInteger(record.sessionId) ? record.sessionId : null;
  const avgValue = parseHistoryAverage(summary.avg);
  const session = {
    id: sessionId ?? `本地-${record.id.slice(-6)}`,
    session_id: sessionId,
    submitted_at: record.submittedAt || record.createdAt,
    total_terms: total,
    correct_terms: parseHistoryNumber(summary.correct),
    partial_terms: parseHistoryNumber(summary.partial),
    incorrect_terms: parseHistoryNumber(summary.incorrect, Math.max(0, total - parseHistoryNumber(summary.correct) - parseHistoryNumber(summary.partial))),
    avg_similarity: avgValue,
    article: record.article || ''
  };

  const results = Array.isArray(record.results)
    ? record.results.map((item) => ({
        term: item.term,
        similarity: Number.isFinite(item.similarity) ? item.similarity : (Number.isFinite(Number(item.similarity)) ? Number(item.similarity) : null),
        standard_answer: item.standard_answer ?? item.standardAnswer ?? null,
        explanation: item.explanation ?? null,
        context: item.context ?? null
      }))
    : [];

  renderSessionDetail({ session, results }, { source: 'local', status: entry.status, recordId: record.id });

  if (scoreRecordBtn) {
    if (entry.scored) {
      scoreRecordBtn.classList.add('hidden');
      scoreRecordBtn.disabled = true;
      scoreRecordBtn.dataset.recordId = record.id;
    } else {
      scoreRecordBtn.classList.remove('hidden');
      scoreRecordBtn.disabled = false;
      scoreRecordBtn.dataset.recordId = record.id;
    }
  }

  if (entry.scored) {
    setHistoryStatus('该判题记录已计入总分，可继续复盘。', 'ok');
  } else {
    setHistoryStatus('该判题记录尚未计分，点击上方“计分”按钮可累计到总分。', 'warn');
  }
}

async function selectSession(entryId) {
  if (!entryId) return;
  if (!HISTORY_INDEX.has(entryId)) {
    return;
  }
  LAST_SELECTED_ENTRY_ID = entryId;
  setActiveSessionItem(entryId);

  const entry = HISTORY_INDEX.get(entryId);
  if (!entry) return;

  if (entry.source === 'local') {
    renderLocalHistoryDetail(entry);
    return;
  }

  const sessionId = entry.sessionId;
  if (!sessionId) {
    renderSessionDetail(null);
    return;
  }

  const cacheKey = `remote-${sessionId}`;
  if (SESSION_CACHE.has(cacheKey)) {
    renderSessionDetail(SESSION_CACHE.get(cacheKey), { source: 'remote', status: 'submitted' });
    return;
  }

  try {
    setHistoryStatus(`正在加载记录 #${sessionId}…`, 'info');
    const base = readScoreApiBase();
    const endpoint = `${base.replace(/\/$/, '')}/api/sessions/${sessionId}`;
    const detail = await fetchJson(endpoint);
    SESSION_CACHE.set(cacheKey, detail);
    renderSessionDetail(detail, { source: 'remote', status: 'submitted' });
    setHistoryStatus(`已加载记录 #${sessionId}`, 'ok');
  } catch (error) {
    console.error('[History] 加载详情失败:', error);
    setHistoryStatus(`加载记录 #${sessionId} 失败：${error.message}`, 'warn');
  }
}

if (scoreApiInput) {
  scoreApiInput.addEventListener('change', () => {
    const value = scoreApiInput.value.trim();
    if (value) {
      localStorage.setItem('score-api-url', value);
    }
    fetchDailyStats(7);
    fetchSessions({ autoSelect: false });
  });
}

if (refreshBtn) {
  refreshBtn.addEventListener('click', () => {
    SESSION_CACHE.clear();
    refreshHistoryList({ autoSelect: false });
    fetchSessions({ autoSelect: false });
  });
}

if (toggleMeaningEl) {
  const stored = localStorage.getItem('history-show-meaning');
  if (stored === 'false') {
    SHOW_MEANING = false;
    toggleMeaningEl.checked = false;
  }
  toggleMeaningEl.addEventListener('change', () => {
    SHOW_MEANING = !!toggleMeaningEl.checked;
    localStorage.setItem('history-show-meaning', SHOW_MEANING ? 'true' : 'false');
    renderResultsTable();
  });
}

if (sessionListEl) {
  sessionListEl.addEventListener('click', (event) => {
    const target = event.target.closest('.history-session-item');
    if (!target) return;
    const entryId = target.dataset.id;
    if (entryId) {
      selectSession(entryId);
    }
  });
}

if (resultsHeadEl) {
  resultsHeadEl.addEventListener('click', (event) => {
    const target = event.target.closest('th[data-sort]');
    if (!target) return;
    const sortKey = target.dataset.sort;
    if (!sortKey) return;
    if (!CURRENT_SESSION_RESULTS.length) return;

    if (RESULT_SORT_FIELD === sortKey) {
      RESULT_SORT_ASC = !RESULT_SORT_ASC;
    } else {
      RESULT_SORT_FIELD = sortKey;
      RESULT_SORT_ASC = true;
    }
    renderResultsTable();
  });
}

window.addEventListener('resize', () => {
  if (DAILY_STATS.length) {
    renderDailyChart(DAILY_STATS);
  }
});

function buildPayloadFromResults(results) {
  if (!Array.isArray(results)) return [];
  return results
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const term = typeof item.term === 'string' ? item.term.trim() : '';
      if (!term) return null;
      const similarityNumber = Number(item.similarity);
      if (!Number.isFinite(similarityNumber)) return null;
      return {
        term,
        similarity: similarityNumber,
        standard_answer: typeof item.standard_answer === 'string' ? item.standard_answer : null,
        explanation: typeof item.explanation === 'string' ? item.explanation : null,
        context: typeof item.context === 'string' ? item.context : null
      };
    })
    .filter(Boolean);
}

async function scoreCurrentHistoryRecord() {
  if (!scoreRecordBtn) return;
  if (!CURRENT_DETAIL_CONTEXT || !Array.isArray(CURRENT_DETAIL_CONTEXT.results) || !CURRENT_DETAIL_CONTEXT.results.length) {
    setHistoryStatus('当前记录缺少判题结果，无法计分。', 'warn');
    return;
  }

  const payload = buildPayloadFromResults(CURRENT_DETAIL_CONTEXT.results);
  if (!payload.length) {
    setHistoryStatus('该判题记录没有可计分的相似度数据。', 'warn');
    return;
  }

  const base = readScoreApiBase();
  const endpoint = `${base.replace(/\/$/, '')}/api/word-scores`;
  const originalLabel = scoreRecordBtn.dataset.originalText || scoreRecordBtn.textContent || '计分';

  scoreRecordBtn.disabled = true;
  scoreRecordBtn.textContent = '计分中…';
  setHistoryStatus('正在将判题结果计入总分…', 'info');

  const requestBody = {
    results: payload,
    article: CURRENT_DETAIL_CONTEXT.article || ''
  };
  if (Number.isInteger(CURRENT_DETAIL_CONTEXT.sessionId) && CURRENT_DETAIL_CONTEXT.sessionId > 0) {
    requestBody.session_id = CURRENT_DETAIL_CONTEXT.sessionId;
  }

  try {
    const response = await fetchJson(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    const sessionIdRaw = response?.session_id;
    const sessionId = Number(sessionIdRaw);
    const entry = CURRENT_DETAIL_CONTEXT.entryId ? HISTORY_INDEX.get(CURRENT_DETAIL_CONTEXT.entryId) : null;

    if (CURRENT_DETAIL_CONTEXT.recordId) {
      markGradingHistorySubmitted(CURRENT_DETAIL_CONTEXT.recordId, {
        sessionId,
        submittedAt: new Date().toISOString()
      });
      markGradingHistoryScored(CURRENT_DETAIL_CONTEXT.recordId, {
        sessionId
      });
    }

    if (entry) {
      entry.scored = true;
      if (Number.isInteger(sessionId) && sessionId > 0) {
        entry.sessionId = sessionId;
      }
    }

    if (CURRENT_DETAIL_CONTEXT) {
      CURRENT_DETAIL_CONTEXT.sessionId = Number.isInteger(sessionId) && sessionId > 0 ? sessionId : CURRENT_DETAIL_CONTEXT.sessionId;
      if (CURRENT_DETAIL_CONTEXT.sessionData) {
        CURRENT_DETAIL_CONTEXT.sessionData.scored = 1;
        if (Number.isInteger(sessionId) && sessionId > 0) {
          CURRENT_DETAIL_CONTEXT.sessionData.id = sessionId;
          CURRENT_DETAIL_CONTEXT.sessionData.session_id = sessionId;
        }
      }
    }

    if (Number.isInteger(sessionId) && sessionId > 0 && Array.isArray(REMOTE_SESSIONS)) {
      const matchedSession = REMOTE_SESSIONS.find((item) => Number(item?.id) === Number(sessionId));
      if (matchedSession) {
        matchedSession.scored = 1;
      }
    }

    const successMessage = Number.isInteger(sessionId) && sessionId > 0
      ? `计分成功！历史记录 #${sessionId}`
      : '计分成功，已累计到总分';
    setHistoryStatus(successMessage, 'ok');

    if (scoreRecordBtn) {
      scoreRecordBtn.classList.add('hidden');
    }

    if (CURRENT_DETAIL_CONTEXT?.sessionData) {
      const detailForRender = {
        session: { ...CURRENT_DETAIL_CONTEXT.sessionData },
        results: Array.isArray(CURRENT_DETAIL_CONTEXT.results) ? [...CURRENT_DETAIL_CONTEXT.results] : []
      };
      renderSessionDetail(detailForRender, {
        source: CURRENT_DETAIL_CONTEXT.source,
        recordId: CURRENT_DETAIL_CONTEXT.recordId,
        status: 'submitted'
      });
      setHistoryStatus(successMessage, 'ok');
    }

    refreshHistoryList({ autoSelect: false });
    fetchSessions({ autoSelect: false });
  } catch (error) {
    console.error('[History] 判题计分失败:', error);
    setHistoryStatus(`计分失败：${error.message}`, 'warn');
  } finally {
    scoreRecordBtn.disabled = false;
    scoreRecordBtn.textContent = originalLabel;
  }
}

function fallbackCopyText(text) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.top = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  let success = false;
  try {
    success = document.execCommand('copy');
  } catch {
    success = false;
  }
  document.body.removeChild(textarea);
  return success;
}

async function copyLowScoreWords() {
  if (!Array.isArray(CURRENT_LOW_WORDS) || !CURRENT_LOW_WORDS.length) {
    setHistoryStatus('当前记录没有相似度 ≤0.5 的词汇', 'warn');
    return;
  }

  const text = CURRENT_LOW_WORDS.join(', ');
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else if (!fallbackCopyText(text)) {
      throw new Error('无法访问剪贴板');
    }
    setHistoryStatus(`已复制 ${CURRENT_LOW_WORDS.length} 个词汇到剪贴板`, 'ok');
  } catch (error) {
    const fallbackSuccess = fallbackCopyText(text);
    if (fallbackSuccess) {
      setHistoryStatus(`已复制 ${CURRENT_LOW_WORDS.length} 个词汇到剪贴板`, 'ok');
    } else {
      setHistoryStatus(`复制失败：${error.message}`, 'warn');
    }
  }
}

if (copyLowBtn) {
  copyLowBtn.addEventListener('click', copyLowScoreWords);
}

if (scoreRecordBtn) {
  scoreRecordBtn.addEventListener('click', async () => {
    await scoreCurrentHistoryRecord();
  });
}

window.addEventListener('grading-history-updated', () => {
  refreshHistoryList({ autoSelect: false });
  if (SESSION_REFRESH_TIMER) {
    clearTimeout(SESSION_REFRESH_TIMER);
  }
  SESSION_REFRESH_TIMER = setTimeout(() => {
    fetchSessions({ autoSelect: false });
  }, 250);
});

window.addEventListener('storage', (event) => {
  if (event.key === 'grading-history-records') {
    refreshHistoryList({ autoSelect: false });
    if (SESSION_REFRESH_TIMER) {
      clearTimeout(SESSION_REFRESH_TIMER);
    }
    SESSION_REFRESH_TIMER = setTimeout(() => {
      fetchSessions({ autoSelect: false });
    }, 250);
  }
});

// Initialize page
readScoreApiBase();
refreshHistoryList({ autoSelect: true });
fetchDailyStats(7);
fetchSessions({ autoSelect: false });
