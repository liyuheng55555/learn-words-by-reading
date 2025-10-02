const API_BASE = localStorage.getItem('score-api-url') || 'http://localhost:4000';
const progressStatusEl = document.getElementById('progress-status');
const progressBodyEl = document.getElementById('progress-body');
const progressSearchEl = document.getElementById('progress-search');
const scoreFilterEl = document.getElementById('score-filter');
const statusFilterEl = document.getElementById('status-filter');
const refreshBtn = document.getElementById('refresh-progress');
const tableHeaderEl = document.querySelector('.progress-table thead');
const contextPanelEl = document.getElementById('context-panel');
const contextTitleEl = document.getElementById('context-title');
const contextListEl = document.getElementById('context-list');
const contextEmptyEl = document.getElementById('context-empty');
const contextCloseBtn = document.getElementById('context-close');

let ALL_RECORDS = [];
let SORT_FIELD = 'order';
let SORT_ASC = true;
const CONTEXT_CACHE = new Map();
let CURRENT_CONTEXT_TERM = '';

function setProgressStatus(message, kind = 'info') {
  if (!progressStatusEl) return;
  progressStatusEl.classList.remove('ok', 'warn');
  if (kind === 'ok') progressStatusEl.classList.add('ok');
  if (kind === 'warn') progressStatusEl.classList.add('warn');
  progressStatusEl.textContent = message || '';
}

function formatScore(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '0.00';
  if (num === 999) return '999 (已掌握)';
  return num.toFixed(2);
}

function formatTimestamp(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function applyFilters(records) {
  const q = progressSearchEl.value.trim().toLowerCase();
  const scoreLimit = Number(scoreFilterEl.value);
  const hasScoreLimit = Number.isFinite(scoreLimit);
  const status = statusFilterEl.value;

  const filtered = records.filter(record => {
    const term = record.term || '';
    const meaning = typeof record.meaning === 'string' ? record.meaning : '';
    const score = Number(record.score) || 0;
    const submissions = Number(record.submissions) || 0;

    if (q) {
      const haystack = `${term} ${meaning}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    if (hasScoreLimit && score > scoreLimit) return false;

    if (status === 'fresh' && submissions > 0) return false;
    if (status === 'mastered' && score !== 999) return false;
    if (status === 'learning' && (submissions === 0 || score >= 999)) return false;

    return true;
  });

  return sortRecords(filtered);
}

function sortRecords(records) {
  const arr = [...records];
  const field = SORT_FIELD;
  const direction = SORT_ASC ? 1 : -1;

  arr.sort((a, b) => {
    switch (field) {
      case 'term': {
        return a.term.localeCompare(b.term, 'en', { sensitivity: 'base' }) * direction;
      }
      case 'meaning': {
        const meaningA = typeof a.meaning === 'string' ? a.meaning : '';
        const meaningB = typeof b.meaning === 'string' ? b.meaning : '';
        return meaningA.localeCompare(meaningB, 'zh', { sensitivity: 'base' }) * direction;
      }
      case 'score': {
        const diff = (Number(a.score) || 0) - (Number(b.score) || 0);
        return diff === 0 ? a.term.localeCompare(b.term) * direction : diff * direction;
      }
      case 'submissions': {
        const diff = (Number(a.submissions) || 0) - (Number(b.submissions) || 0);
        return diff === 0 ? a.term.localeCompare(b.term) * direction : diff * direction;
      }
      case 'last_submission': {
        const ta = getTimestamp(a.last_submission);
        const tb = getTimestamp(b.last_submission);
        const diff = ta - tb;
        return diff === 0 ? a.term.localeCompare(b.term) * direction : diff * direction;
      }
      case 'order':
      default: {
        const diff = (Number(a._order) || 0) - (Number(b._order) || 0);
        return diff === 0 ? a.term.localeCompare(b.term) * direction : diff * direction;
      }
    }
  });

  return arr;
}

function getTimestamp(value) {
  if (!value) return Number.NEGATIVE_INFINITY;
  const date = new Date(value);
  const ts = date.getTime();
  if (Number.isNaN(ts)) return Number.NEGATIVE_INFINITY;
  return ts;
}

function renderTable(records) {
  if (!progressBodyEl) return;

  if (!records.length) {
    progressBodyEl.innerHTML = '<tr><td class="empty" colspan="7">未找到匹配的词汇。</td></tr>';
    return;
  }

  progressBodyEl.innerHTML = records.map(record => {
    const term = record.term || '';
    const score = Number(record.score) || 0;
    const submissions = Number(record.submissions) || 0;
    const lastSubmission = record.last_submission;
    const order = Number(record._order);
    const meaning = typeof record.meaning === 'string' && record.meaning.trim() ? record.meaning.trim() : '';
    const contexts = CONTEXT_CACHE.get(term) || [];
    const hasContexts = contexts.length > 0;
    const contextBadge = hasContexts ? ' <span class="context-indicator" title="查看最近语境">语境</span>' : '';
    const termButton = `<button type="button" class="term-context-btn" data-term="${escapeHtml(term)}">${escapeHtml(term)}${contextBadge}</button>`;

    const masteredClass = score >= 999 ? 'status-mastered' : (submissions === 0 ? 'status-fresh' : '');

    return `
      <tr class="${masteredClass}">
        <td>${Number.isFinite(order) ? order + 1 : ''}</td>
        <td>${termButton}</td>
        <td class="meaning-cell">${escapeHtml(meaning || '—')}</td>
        <td>${formatScore(score)}</td>
        <td>${submissions}</td>
        <td>${escapeHtml(formatTimestamp(lastSubmission))}</td>
        <td class="actions">
          <button data-term="${escapeHtml(term)}" data-action="mastered" class="mark-btn mastered">标记已掌握</button>
          <button data-term="${escapeHtml(term)}" data-action="reset" class="mark-btn reset">重置未练习</button>
        </td>
      </tr>
    `;
  }).join('');
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function showContextPanel(term) {
  const targetTerm = typeof term === 'string' ? term.trim() : '';
  if (!targetTerm) return;
  const contexts = CONTEXT_CACHE.get(targetTerm) || [];

  if (!contextPanelEl || !contextTitleEl || !contextListEl) {
    const message = contexts.length
      ? contexts.map((item, idx) => `${idx + 1}. ${item.sentence}`).join('\n')
      : '暂无语境记录';
    alert(`「${targetTerm}」的最近语境：\n${message}`);
    return;
  }

  CURRENT_CONTEXT_TERM = targetTerm;
  contextTitleEl.textContent = `「${targetTerm}」最近语境`;
  contextListEl.innerHTML = '';
  if (contextEmptyEl) contextEmptyEl.classList.add('hidden');

  const items = contexts.slice(0, 3);
  if (!items.length) {
    if (contextEmptyEl) {
      contextEmptyEl.classList.remove('hidden');
    } else {
      contextListEl.innerHTML = '<li class="empty">暂无语境记录</li>';
    }
  } else {
    const html = items.map((item, index) => {
      const sentence = typeof item?.sentence === 'string' ? item.sentence : '';
      const createdAt = typeof item?.created_at === 'string' ? item.created_at : '';
      const timestamp = createdAt ? formatTimestamp(createdAt) : '';
      const meta = timestamp ? `<div class="context-meta">${escapeHtml(timestamp)}</div>` : '';
      return `
        <li>
          <div class="context-order">${index + 1}.</div>
          <div class="context-sentence">${escapeHtml(sentence)}</div>
          ${meta}
        </li>
      `;
    }).join('');
    contextListEl.innerHTML = html;
  }

  contextPanelEl.classList.remove('hidden');
}

function hideContextPanel() {
  if (!contextPanelEl) return;
  contextPanelEl.classList.add('hidden');
  CURRENT_CONTEXT_TERM = '';
}

async function fetchAllScores() {
  try {
    setProgressStatus('正在加载词汇数据…', 'info');
    const endpoint = `${API_BASE.replace(/\/$/, '')}/api/word-scores`;
    const response = await fetch(endpoint, { headers: { 'Accept': 'application/json' } });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP ${response.status} ${response.statusText}: ${text}`);
    }
    const data = await response.json();
    const scores = Array.isArray(data.scores) ? data.scores : [];
    CONTEXT_CACHE.clear();
    scores.forEach((record) => {
      if (!record || typeof record.term !== 'string') return;
      const term = record.term;
      const contexts = Array.isArray(record.recent_contexts) ? record.recent_contexts.slice(0, 3) : [];
      CONTEXT_CACHE.set(term, contexts);
    });
    ALL_RECORDS = scores.map((record, idx) => ({ ...record, _order: idx }));
    updateHeaderIndicators();
    renderTable(applyFilters(ALL_RECORDS));
    if (CURRENT_CONTEXT_TERM) {
      showContextPanel(CURRENT_CONTEXT_TERM);
    }
    setProgressStatus(`已加载 ${ALL_RECORDS.length} 个词汇`, 'ok');
  } catch (error) {
    console.error('[Progress] 获取词汇失败', error);
    setProgressStatus(`加载失败：${error.message}`, 'warn');
    progressBodyEl.innerHTML = '<tr><td class="empty" colspan="7">无法加载词汇数据。</td></tr>';
  }
}

async function updateWord(term, action) {
  try {
    setProgressStatus(`正在更新「${term}」…`, 'info');
    const endpoint = `${API_BASE.replace(/\/$/, '')}/api/word-status`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ term, action })
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP ${response.status} ${response.statusText}: ${text}`);
    }
    const data = await response.json();
    if (data.record) {
      // Update local cache
      const idx = ALL_RECORDS.findIndex(rec => rec.term === data.record.term);
      if (idx >= 0) {
        ALL_RECORDS[idx] = { ...data.record, _order: ALL_RECORDS[idx]._order };
      } else {
        ALL_RECORDS.push({ ...data.record, _order: ALL_RECORDS.length });
      }
      const contexts = Array.isArray(data.record.recent_contexts) ? data.record.recent_contexts.slice(0, 3) : [];
      CONTEXT_CACHE.set(data.record.term, contexts);
      renderTable(applyFilters(ALL_RECORDS));
      if (CURRENT_CONTEXT_TERM === data.record.term) {
        showContextPanel(data.record.term);
      }
      setProgressStatus(`已更新「${term}」`, 'ok');
    } else {
      await fetchAllScores();
    }
  } catch (error) {
    console.error('[Progress] 更新词汇失败', error);
    setProgressStatus(`更新失败：${error.message}`, 'warn');
  }
}

function rerender(){
  renderTable(applyFilters(ALL_RECORDS));
}

progressSearchEl.addEventListener('input', rerender);
scoreFilterEl.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    rerender();
  }
});
statusFilterEl.addEventListener('change', rerender);

if (tableHeaderEl) {
  tableHeaderEl.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const th = target.closest('th');
    if (!th) return;
    const sortKey = th.dataset.sort;
    if (!sortKey) return;

    if (SORT_FIELD === sortKey) {
      SORT_ASC = !SORT_ASC;
    } else {
      SORT_FIELD = sortKey;
      SORT_ASC = true;
    }

    updateHeaderIndicators();
    rerender();
  });
}

function updateHeaderIndicators() {
  if (!tableHeaderEl) return;
  const headers = tableHeaderEl.querySelectorAll('th');
  headers.forEach((header) => {
    const key = header.dataset.sort;
    if (!key) {
      header.classList.remove('sortable', 'active');
      header.removeAttribute('data-indicator');
      return;
    }
    header.classList.add('sortable');
    if (key === SORT_FIELD) {
      header.classList.add('active');
      header.dataset.indicator = SORT_ASC ? '↑' : '↓';
    } else {
      header.classList.remove('active');
      header.dataset.indicator = '';
    }
  });
}

progressBodyEl.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const contextBtn = target.closest('.term-context-btn');
  if (contextBtn) {
    const term = contextBtn.dataset.term;
    if (term) {
      showContextPanel(term);
    }
    return;
  }

  const markBtn = target.closest('.mark-btn');
  if (!markBtn) return;
  const term = markBtn.dataset.term;
  const action = markBtn.dataset.action;
  if (term && action) {
    updateWord(term, action);
  }
});

if (refreshBtn) {
  refreshBtn.addEventListener('click', () => {
    fetchAllScores();
  });
}

if (contextCloseBtn) {
  contextCloseBtn.addEventListener('click', hideContextPanel);
}

fetchAllScores();
updateHeaderIndicators();
