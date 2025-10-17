import { escapeHtml } from '../utils/html.js';
import { fetchJson } from '../services/http.js';

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
const summaryEl = document.getElementById('progress-summary');
const meaningToggleEl = document.getElementById('toggle-meaning');
const progressTableWrapperEl = document.querySelector('.progress-table');
const progressTableEl = document.querySelector('.progress-table table');
const addWordFormEl = document.getElementById('add-word-form');
const newTermEl = document.getElementById('new-term');
const newMeaningEl = document.getElementById('new-meaning');
const addWordStatusEl = document.getElementById('add-word-status');

let ALL_RECORDS = [];
let SORT_FIELD = 'order';
let SORT_ASC = true;
const CONTEXT_CACHE = new Map();
let CURRENT_CONTEXT_TERM = '';
let SHOW_MEANING = true;
let IS_CREATING_WORD = false;

function setProgressStatus(message, kind = 'info') {
  if (!progressStatusEl) return;
  progressStatusEl.classList.remove('ok', 'warn');
  if (kind === 'ok') progressStatusEl.classList.add('ok');
  if (kind === 'warn') progressStatusEl.classList.add('warn');
  progressStatusEl.textContent = message || '';
}

function setAddWordStatus(message, kind = 'info') {
  if (!addWordStatusEl) return;
  addWordStatusEl.textContent = message || '';
  addWordStatusEl.classList.remove('ok', 'error', 'warn');
  if (!message) return;
  if (kind === 'ok') addWordStatusEl.classList.add('ok');
  if (kind === 'error') addWordStatusEl.classList.add('error');
  if (kind === 'warn') addWordStatusEl.classList.add('warn');
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

function upsertRecord(record) {
  if (!record || typeof record.term !== 'string') return;
  const term = record.term;
  const contexts = Array.isArray(record.recent_contexts) ? record.recent_contexts.slice(0, 3) : [];
  const existingIndex = ALL_RECORDS.findIndex(item => item.term === term);
  if (existingIndex >= 0) {
    const previousOrder = Number.isFinite(ALL_RECORDS[existingIndex]._order)
      ? ALL_RECORDS[existingIndex]._order
      : existingIndex;
    ALL_RECORDS[existingIndex] = { ...record, _order: previousOrder };
  } else {
    const nextOrder = Number.isFinite(record._order) ? record._order : ALL_RECORDS.length;
    ALL_RECORDS.push({ ...record, _order: nextOrder });
  }
  CONTEXT_CACHE.set(term, contexts);
}

function removeRecord(term) {
  if (!term || typeof term !== 'string') return;
  const normalized = term.trim();
  if (!normalized) return;
  const nextRecords = ALL_RECORDS.filter(item => item && item.term !== normalized);
  if (nextRecords.length === ALL_RECORDS.length) return;
  ALL_RECORDS = nextRecords;
  CONTEXT_CACHE.delete(normalized);
  if (CURRENT_CONTEXT_TERM === normalized) {
    hideContextPanel();
  }
}

function updateMeaningVisibility() {
  const hide = !SHOW_MEANING;
  if (progressTableWrapperEl) {
    progressTableWrapperEl.classList.toggle('hide-meaning', hide);
  }
  if (progressTableEl) {
    progressTableEl.classList.toggle('hide-meaning', hide);
    const meaningHeader = progressTableEl.querySelector('th.meaning-col');
    if (meaningHeader instanceof HTMLElement) {
      meaningHeader.style.display = hide ? 'none' : '';
    }
    const meaningCells = progressTableEl.querySelectorAll('td.meaning-cell');
    meaningCells.forEach((cell) => {
      if (cell instanceof HTMLElement) {
        cell.style.display = hide ? 'none' : '';
      }
    });
  }
  if (meaningToggleEl && meaningToggleEl.checked !== SHOW_MEANING) {
    meaningToggleEl.checked = SHOW_MEANING;
  }
}

function renderTable(records) {
  if (!progressBodyEl) return;

  if (!records.length) {
    progressBodyEl.innerHTML = '<tr><td class="empty" colspan="7">未找到匹配的词汇。</td></tr>';
    updateMeaningVisibility();
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
    const meaningContent = SHOW_MEANING ? escapeHtml(meaning || '—') : '';

    const masteredClass = score >= 999 ? 'status-mastered' : (submissions === 0 ? 'status-fresh' : '');

    return `
      <tr class="${masteredClass}">
        <td>${Number.isFinite(order) ? order + 1 : ''}</td>
        <td>${termButton}</td>
        <td class="meaning-cell"${SHOW_MEANING ? '' : ' style="display:none"'}>${meaningContent}</td>
        <td>${formatScore(score)}</td>
        <td>${submissions}</td>
        <td>${escapeHtml(formatTimestamp(lastSubmission))}</td>
        <td class="actions">
          <button data-term="${escapeHtml(term)}" data-action="mastered" class="mark-btn mastered">标记已掌握</button>
          <button data-term="${escapeHtml(term)}" data-action="reset" class="mark-btn reset">重置未练习</button>
          <button data-term="${escapeHtml(term)}" data-action="delete" class="mark-btn delete">删除词汇</button>
        </td>
      </tr>
    `;
  }).join('');

  updateMeaningVisibility();
}

function renderSummary(records) {
  if (!summaryEl) return;

  const practicedRecords = records.filter(record => Number(record.submissions) > 0);
  const total = practicedRecords.length;
  const belowZero = practicedRecords.filter(record => Number(record.score) < 0).length;
  const zeroToTwo = practicedRecords.filter(record => {
    const score = Number(record.score) || 0;
    return score >= 0 && score < 2;
  }).length;
  const aboveTwo = practicedRecords.filter(record => {
    const score = Number(record.score) || 0;
    return score >= 2 && score < 999;
  }).length;
  const mastered = practicedRecords.filter(record => Number(record.score) >= 999).length;

  summaryEl.innerHTML = `
    <div class="summary-item">
      <span class="summary-label">练习总数</span>
      <span class="summary-value">${total}</span>
    </div>
    <div class="summary-item">
      <span class="summary-label">分数 &lt; 0</span>
      <span class="summary-value">${belowZero}</span>
    </div>
    <div class="summary-item">
      <span class="summary-label">0–2 分</span>
      <span class="summary-value">${zeroToTwo}</span>
    </div>
    <div class="summary-item">
      <span class="summary-label">≥ 2 分</span>
      <span class="summary-value">${aboveTwo}</span>
    </div>
    <div class="summary-item">
      <span class="summary-label">已掌握</span>
      <span class="summary-value">${mastered}</span>
    </div>
  `;
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
    const data = await fetchJson(endpoint);
    const scores = Array.isArray(data?.scores) ? data.scores : [];
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
    renderSummary(applyFilters(ALL_RECORDS));
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
    const data = await fetchJson(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ term, action })
    });
    if (data?.record) {
      upsertRecord(data.record);
      rerender();
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

async function deleteWord(term) {
  const target = typeof term === 'string' ? term.trim() : '';
  if (!target) return;
  const shouldDelete = typeof window !== 'undefined'
    ? window.confirm(`确定要删除「${target}」吗？删除后该词汇的分数和语境记录将被移除。`)
    : true;
  if (!shouldDelete) return;

  try {
    setProgressStatus(`正在删除「${target}」…`, 'info');
    const endpoint = `${API_BASE.replace(/\/$/, '')}/api/words/${encodeURIComponent(target)}`;
    const data = await fetchJson(endpoint, { method: 'DELETE' });
    if (data?.deleted) {
      removeRecord(target);
      rerender();
      setProgressStatus(`已删除「${target}」`, 'ok');
    } else {
      await fetchAllScores();
    }
  } catch (error) {
    console.error('[Progress] 删除词汇失败', error);
    setProgressStatus(`删除失败：${error.message}`, 'warn');
  }
}

async function createWord(rawTerm, rawMeaning) {
  if (!newTermEl || !newMeaningEl) return;
  const term = typeof rawTerm === 'string' ? rawTerm.trim() : '';
  const meaning = typeof rawMeaning === 'string' ? rawMeaning.trim() : '';
  if (!term) {
    setAddWordStatus('请输入英文词汇', 'error');
    newTermEl.focus();
    return;
  }
  if (!meaning) {
    setAddWordStatus('请输入对应的中文释义', 'error');
    newMeaningEl.focus();
    return;
  }
  if (IS_CREATING_WORD) {
    setAddWordStatus('正在添加，请稍候…');
    return;
  }

  try {
    IS_CREATING_WORD = true;
    setAddWordStatus(`正在添加「${term}」…`);
    const endpoint = `${API_BASE.replace(/\/$/, '')}/api/words`;
    const data = await fetchJson(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ term, meaning })
    });
    if (data?.record) {
      upsertRecord(data.record);
      rerender();
      setAddWordStatus(`已添加「${term}」`, 'ok');
      newTermEl.value = '';
      newMeaningEl.value = '';
      newTermEl.focus();
    } else {
      setAddWordStatus('添加成功，但未返回词汇记录', 'warn');
      await fetchAllScores();
    }
  } catch (error) {
    const message = error?.message || '添加失败';
    if (message.includes('UNIQUE') || message.includes('已存在') || message.includes('409')) {
      setAddWordStatus('该词汇已存在，无需重复添加', 'error');
    } else {
      setAddWordStatus(`添加失败：${message}`, 'error');
    }
    console.error('[Progress] 添加词汇失败', error);
  } finally {
    IS_CREATING_WORD = false;
  }
}

function rerender(){
  const filtered = applyFilters(ALL_RECORDS);
  renderTable(filtered);
  renderSummary(filtered);
}

if (meaningToggleEl) {
  SHOW_MEANING = Boolean(meaningToggleEl.checked);
  updateMeaningVisibility();
  meaningToggleEl.addEventListener('change', () => {
    SHOW_MEANING = meaningToggleEl.checked;
    updateMeaningVisibility();
    rerender();
  });
}

if (addWordFormEl) {
  addWordFormEl.addEventListener('submit', (event) => {
    event.preventDefault();
    createWord(newTermEl?.value ?? '', newMeaningEl?.value ?? '');
  });
  [newTermEl, newMeaningEl].forEach((input) => {
    if (input) {
      input.addEventListener('input', () => {
        if (addWordStatusEl && addWordStatusEl.textContent) {
          setAddWordStatus('');
        }
      });
    }
  });
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
    if (action === 'delete') {
      deleteWord(term);
    } else {
      updateWord(term, action);
    }
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
