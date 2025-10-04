import { escapeHtml } from '../utils/html.js';

export function createVocabListController({ listElement, filterInput, scoreCache, makeId }) {
  function updateFilledState(vocabs) {
    if (!Array.isArray(vocabs)) return;
    for (const term of vocabs) {
      const input = document.getElementById(makeId(term));
      if (!input) continue;
      const wrapper = input.closest('.item');
      if (!wrapper) continue;
      const hasValue = input.value && input.value.trim().length > 0;
      wrapper.classList.toggle('filled', hasValue);
    }
  }

  function updateScoreBadges() {
    if (!listElement) return;
    const badges = listElement.querySelectorAll('.score-badge');
    badges.forEach((badge) => {
      const term = badge.dataset.termScore;
      const value = term && scoreCache?.has(term) ? scoreCache.get(term) : null;
      if (typeof value === 'number') {
        badge.textContent = value.toFixed(2);
        badge.classList.add('score-known');
      } else {
        badge.textContent = '—';
        badge.classList.remove('score-known');
      }
    });
  }

  function buildList(vocabs) {
    if (!listElement || !Array.isArray(vocabs)) return;
    const query = filterInput?.value?.trim().toLowerCase();
    const items = [];

    for (const term of vocabs) {
      if (query && !term.toLowerCase().includes(query)) continue;
      const id = makeId(term);
      const rawScore = scoreCache?.has(term) ? scoreCache.get(term) : null;
      const scoreDisplay = typeof rawScore === 'number' ? rawScore.toFixed(2) : '—';
      items.push(`
        <div class="item">
          <div class="term" data-term="${escapeHtml(term)}">
            <span>${escapeHtml(term)}</span>
            <span class="score-badge" data-term-score="${escapeHtml(term)}">${scoreDisplay}</span>
            <span class="jump" data-term="${escapeHtml(term)}">跳到文中</span>
          </div>
          <input aria-label="${escapeHtml(term)} 中文意思" placeholder="中文意思…" id="${escapeHtml(id)}" data-term="${escapeHtml(term)}" />
        </div>
      `);
    }

    listElement.innerHTML = items.join('');
    updateFilledState(vocabs);
    updateScoreBadges();
  }

  return {
    buildList,
    updateFilledState,
    updateScoreBadges
  };
}
