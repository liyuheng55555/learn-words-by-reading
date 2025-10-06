import { escapeHtml } from '../utils/html.js';
import { formatDateTime } from '../utils/time.js';
import { fetchJson } from '../services/http.js';

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
const resultsHeadEl = document.getElementById('history-results-head');
const chartCanvas = document.getElementById('history-chart');
const chartEmptyEl = document.getElementById('history-chart-empty');

const SESSION_CACHE = new Map();
let CURRENT_LOW_WORDS = [];
let CURRENT_SESSION_RESULTS = [];
let RESULT_SORT_FIELD = 'term';
let RESULT_SORT_ASC = true;
let DAILY_STATS = [];

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

function renderSessionList(sessions) {
  if (!sessionListEl) return;
  if (!Array.isArray(sessions) || !sessions.length) {
    sessionListEl.innerHTML = '<li class="history-session-item empty">暂无历史记录，请先同步一次判题结果。</li>';
    return;
  }

  const items = sessions.map((session) => {
    const submitted = formatDateTime(session.submitted_at);
    const incorrect = Number(session.incorrect_terms) || 0;
    const partial = Number(session.partial_terms) || 0;
    const total = Number(session.total_terms) || 0;
    const avg = Number(session.avg_similarity);
    const avgDisplay = Number.isFinite(avg) ? avg.toFixed(2) : '—';
    const scoreClass = incorrect > 0 ? 'warn' : 'ok';
    return `
      <li class="history-session-item" data-id="${session.id}">
        <button type="button" class="history-session-button">
          <div class="history-session-row">
            <span class="history-session-id">#${session.id}</span>
            <span class="history-session-date">${escapeHtml(submitted)}</span>
          </div>
          <div class="history-session-row small ${scoreClass}">
            <span>词数：${total}</span>
            <span>错误：${incorrect}</span>
            <span>部分正确：${partial}</span>
            <span>平均：${avgDisplay}</span>
          </div>
        </button>
      </li>
    `;
  }).join('');

  sessionListEl.innerHTML = items;
}

async function fetchSessions({ autoSelect = false } = {}) {
  try {
    setHistoryStatus('正在载入历史记录…', 'info');
    const base = readScoreApiBase();
    const endpoint = `${base.replace(/\/$/, '')}/api/sessions?limit=100`;
    const data = await fetchJson(endpoint);
    const sessions = Array.isArray(data?.sessions) ? data.sessions : [];
    renderSessionList(sessions);
    setHistoryStatus(`已载入 ${sessions.length} 条历史记录`, 'ok');
    if (autoSelect && sessions.length) {
      selectSession(Number(sessions[0].id));
    }
  } catch (error) {
    console.error('[History] 获取历史记录失败:', error);
    setHistoryStatus(`加载失败：${error.message}`, 'warn');
    sessionListEl.innerHTML = '<li class="history-session-item empty warn">无法加载历史记录。</li>';
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
    const standard = escapeHtml(item.standard_answer || item.standardAnswer || '');
    const explanation = escapeHtml(item.explanation || '');
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

function renderSessionDetail(detail) {
  if (!detailContentEl || !detailEmptyEl) return;
  if (!detail || !detail.session) {
    CURRENT_LOW_WORDS = [];
    if (copyLowBtn) {
      copyLowBtn.disabled = true;
      copyLowBtn.textContent = '复制 ≤0.5 词';
    }
    detailContentEl.classList.add('hidden');
    detailEmptyEl.classList.remove('hidden');
    return;
  }

  detailEmptyEl.classList.add('hidden');
  detailContentEl.classList.remove('hidden');

  const { session, results } = detail;
  const submitted = formatDateTime(session.submitted_at);
  const total = Number(session.total_terms) || (Array.isArray(results) ? results.length : 0);
  const avg = Number(session.avg_similarity);
  const avgDisplay = Number.isFinite(avg) ? avg.toFixed(2) : '—';
  const correct = Number(session.correct_terms) || 0;
  const partial = Number(session.partial_terms) || 0;
  const incorrect = Number(session.incorrect_terms) || 0;

  detailTitleEl.textContent = `历史记录 #${session.id}`;
  detailMetaEl.textContent = `提交时间：${submitted} ｜ 总词数：${total} ｜ 平均相似度：${avgDisplay} ｜ 正确/部分/错误：${correct}/${partial}/${incorrect}`;

  if (openSessionLink) {
    openSessionLink.href = `geo_vocab_fill_in_webpage_english→chinese.html?session=${session.id}`;
  }

  if (articleEl) {
    const articleHtml = convertMarkdownToHtml(session.article || '');
    articleEl.innerHTML = articleHtml;
  }

  RESULT_SORT_FIELD = 'term';
  RESULT_SORT_ASC = true;
  CURRENT_SESSION_RESULTS = Array.isArray(results) ? [...results] : [];
  renderResultsTable();
}

async function selectSession(id) {
  if (!Number.isInteger(id) || id <= 0) return;
  Array.from(sessionListEl?.querySelectorAll('.history-session-item.active') || []).forEach((item) => {
    item.classList.remove('active');
  });
  const targetItem = sessionListEl?.querySelector(`.history-session-item[data-id="${id}"]`);
  if (targetItem) {
    targetItem.classList.add('active');
  }

  if (SESSION_CACHE.has(id)) {
    renderSessionDetail(SESSION_CACHE.get(id));
    return;
  }

  try {
    setHistoryStatus(`正在加载记录 #${id}…`, 'info');
    const base = readScoreApiBase();
    const endpoint = `${base.replace(/\/$/, '')}/api/sessions/${id}`;
    const detail = await fetchJson(endpoint);
    SESSION_CACHE.set(id, detail);
    renderSessionDetail(detail);
    setHistoryStatus(`已加载记录 #${id}`, 'ok');
  } catch (error) {
    console.error('[History] 加载详情失败:', error);
    setHistoryStatus(`加载记录 #${id} 失败：${error.message}`, 'warn');
  }
}

if (scoreApiInput) {
  scoreApiInput.addEventListener('change', () => {
    const value = scoreApiInput.value.trim();
    if (value) {
      localStorage.setItem('score-api-url', value);
    }
    fetchDailyStats(7);
  });
}

if (refreshBtn) {
  refreshBtn.addEventListener('click', () => {
    SESSION_CACHE.clear();
    fetchSessions({ autoSelect: false });
  });
}

if (sessionListEl) {
  sessionListEl.addEventListener('click', (event) => {
    const target = event.target.closest('.history-session-item');
    if (!target) return;
    const id = Number(target.dataset.id);
    if (Number.isInteger(id)) {
      selectSession(id);
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

// Initialize page
readScoreApiBase();
fetchDailyStats(7);
fetchSessions({ autoSelect: true });
