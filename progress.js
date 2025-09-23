const API_BASE = localStorage.getItem('score-api-url') || 'http://localhost:4000';
const progressStatusEl = document.getElementById('progress-status');
const progressBodyEl = document.getElementById('progress-body');
const progressSearchEl = document.getElementById('progress-search');
const scoreFilterEl = document.getElementById('score-filter');
const statusFilterEl = document.getElementById('status-filter');
const refreshBtn = document.getElementById('refresh-progress');

let ALL_RECORDS = [];

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

  return records.filter(record => {
    const term = record.term || '';
    const score = Number(record.score) || 0;
    const submissions = Number(record.submissions) || 0;

    if (q && !term.toLowerCase().includes(q)) return false;
    if (hasScoreLimit && score > scoreLimit) return false;

    if (status === 'fresh' && submissions > 0) return false;
    if (status === 'mastered' && score !== 999) return false;
    if (status === 'learning' && (submissions === 0 || score >= 999)) return false;

    return true;
  });
}

function renderTable(records) {
  if (!progressBodyEl) return;

  if (!records.length) {
    progressBodyEl.innerHTML = '<tr><td class="empty" colspan="5">未找到匹配的词汇。</td></tr>';
    return;
  }

  progressBodyEl.innerHTML = records.map(record => {
    const term = record.term || '';
    const score = Number(record.score) || 0;
    const submissions = Number(record.submissions) || 0;
    const lastSubmission = record.last_submission;

    const masteredClass = score >= 999 ? 'status-mastered' : (submissions === 0 ? 'status-fresh' : '');

    return `
      <tr class="${masteredClass}">
        <td>${escapeHtml(term)}</td>
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
    ALL_RECORDS = Array.isArray(data.scores) ? data.scores : [];
    renderTable(applyFilters(ALL_RECORDS));
    setProgressStatus(`已加载 ${ALL_RECORDS.length} 个词汇`, 'ok');
  } catch (error) {
    console.error('[Progress] 获取词汇失败', error);
    setProgressStatus(`加载失败：${error.message}`, 'warn');
    progressBodyEl.innerHTML = '<tr><td class="empty" colspan="5">无法加载词汇数据。</td></tr>';
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
        ALL_RECORDS[idx] = data.record;
      } else {
        ALL_RECORDS.push(data.record);
      }
      renderTable(applyFilters(ALL_RECORDS));
      setProgressStatus(`已更新「${term}」`, 'ok');
    } else {
      await fetchAllScores();
    }
  } catch (error) {
    console.error('[Progress] 更新词汇失败', error);
    setProgressStatus(`更新失败：${error.message}`, 'warn');
  }
}

progressSearchEl.addEventListener('input', () => {
  renderTable(applyFilters(ALL_RECORDS));
});

scoreFilterEl.addEventListener('input', () => {
  renderTable(applyFilters(ALL_RECORDS));
});

statusFilterEl.addEventListener('change', () => {
  renderTable(applyFilters(ALL_RECORDS));
});

progressBodyEl.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  if (!target.classList.contains('mark-btn')) return;
  const term = target.dataset.term;
  const action = target.dataset.action;
  if (term && action) {
    updateWord(term, action);
  }
});

if (refreshBtn) {
  refreshBtn.addEventListener('click', () => {
    fetchAllScores();
  });
}

fetchAllScores();
