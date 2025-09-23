// --- Vocabulary source list (unique, in requested order) ---
// This will be dynamically populated based on uploaded article
let VOCABS = [];

const listEl = document.getElementById('list');
const filterEl = document.getElementById('filter');

// Mode elements
const editModeBtn = document.getElementById('edit-mode-btn');
const viewModeBtn = document.getElementById('view-mode-btn');
const editSection = document.getElementById('edit-section');
const viewSection = document.getElementById('view-section');
const articleEditor = document.getElementById('article-editor');
const saveArticleBtn = document.getElementById('save-article-btn');
const editorStatus = document.getElementById('editor-status');
const articleContent = document.getElementById('article-content');
const generatorWordsEl = document.getElementById('generator-words');
const generatorTopicEl = document.getElementById('generator-topic');
const generateArticleBtn = document.getElementById('generate-article-btn');
const generatorStatusEl = document.getElementById('generator-status');
const startGradeBtn = document.getElementById('start-grade');
const syncServerBtn = document.getElementById('sync-server');
const syncStatusEl = document.getElementById('sync-status');
const serverScoresEl = document.getElementById('server-scores');
const scoreApiUrlInput = document.getElementById('score-api-url');
const practicedCountInput = document.getElementById('practiced-count');
const totalCountInput = document.getElementById('total-count');
const masteryThresholdInput = document.getElementById('mastery-threshold');
const autoFillWordsBtn = document.getElementById('auto-fill-words');

if (syncServerBtn && !syncServerBtn.dataset.originalText) {
  syncServerBtn.dataset.originalText = syncServerBtn.textContent;
}

renderServerScores([]);
setSyncStatus('', 'info');

const DEFAULT_ARTICLE_WORD_GOAL = 220;
const DEFAULT_ARTICLE_PARAGRAPH_COUNT = 3;
const SIMILARITY_THRESHOLD_STRICT = 0.85;
const SIMILARITY_THRESHOLD_PARTIAL = 0.6;

let LAST_GRADING_RESULTS = {};

// Build items
function makeId(term){
  return 'term-' + term.toLowerCase().replace(/[^a-z0-9]+/g,'-');
}

function jumpTo(term){
  // Try by dedicated anchor id first
  const byId = document.getElementById('t-' + term.toLowerCase().replace(/[^a-z0-9]+/g,'-'));
  if (byId) { byId.scrollIntoView({behavior:'smooth', block:'center'}); highlight(byId); return; }
  // Fallback: search first <strong> whose text includes the term case-insensitively
  const strongs = document.querySelectorAll('#article-content strong');
  const termLower = term.toLowerCase();
  for (const s of strongs){
    if (s.textContent.toLowerCase().includes(termLower)) { s.scrollIntoView({behavior:'smooth', block:'center'}); highlight(s); return; }
  }
  alert('在文章中未找到该词：' + term);
}

function highlight(el){
  el.style.outline = '2px solid var(--accent-2)';
  el.style.boxShadow = '0 0 0 4px rgba(137,220,235,.25)';
  setTimeout(()=>{ el.style.outline = ''; el.style.boxShadow=''; }, 1500);
}

function parseGeneratorWords(raw){
  if (!raw) return [];
  const parts = raw.split(/[\n,，、；;]+/);
  const seen = new Set();
  const words = [];
  for (const part of parts){
    const word = part.trim();
    if (word && !seen.has(word)){
      seen.add(word);
      words.push(word);
    }
  }
  return words;
}

function escapeRegExp(str){
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function makeTermRegex(term){
  const escaped = escapeRegExp(term.trim());
  if (!escaped) return null;
  if (/\s/.test(term)) {
    return new RegExp(escaped.replace(/\s+/g, '\\s+'), 'i');
  }
  return new RegExp(`\\b${escaped}\\b`, 'i');
}

function findMissingTerms(content, words){
  const text = content.replace(/\*\*/g, '');
  const missing = [];
  for (const word of words){
    const regex = makeTermRegex(word);
    if (!regex) continue;
    if (!regex.test(text)){
      missing.push(word);
    }
  }
  return missing;
}

function setGeneratorStatus(message, kind = 'info'){
  if (!generatorStatusEl) return;
  const palette = {
    info: 'var(--muted)',
    ok: 'var(--ok)',
    warn: 'var(--warn)'
  };
  generatorStatusEl.textContent = message || '';
  generatorStatusEl.style.color = palette[kind] || palette.info;
}

function setStartGradeButton(text, disabled){
  if (!startGradeBtn) return;
  if (typeof text === 'string') startGradeBtn.textContent = text;
  if (typeof disabled === 'boolean') startGradeBtn.disabled = disabled;
}

function resetStartGradeButton(){
  if (!startGradeBtn) return;
  startGradeBtn.disabled = false;
  startGradeBtn.textContent = startGradeBtn.dataset.originalText || '📝 开始判题';
}

function setSyncStatus(message, kind = 'info'){
  if (!syncStatusEl) return;
  syncStatusEl.classList.remove('ok', 'warn');
  if (kind === 'ok') syncStatusEl.classList.add('ok');
  if (kind === 'warn') syncStatusEl.classList.add('warn');
  if (kind !== 'ok' && kind !== 'warn') syncStatusEl.classList.remove('ok', 'warn');
  syncStatusEl.textContent = message || '';
}

function escapeHtml(str){
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderServerScores(scores){
  if (!serverScoresEl) return;
  if (!scores || !scores.length){
    serverScoresEl.innerHTML = '<div class="empty">服务器暂无词汇记录。</div>';
    return;
  }

  const rows = scores.map(({ term, score, submissions, last_submission: lastSubmission }) => {
    const safeTerm = escapeHtml(term);
    const val = Number(score);
    const displayScore = Number.isFinite(val) ? val.toFixed(2) : '0.00';
    const submissionCount = Number.isFinite(Number(submissions)) ? Number(submissions) : 0;
    let displayTime = '-';
    if (lastSubmission) {
      const date = new Date(lastSubmission);
      displayTime = Number.isNaN(date.getTime()) ? escapeHtml(lastSubmission) : date.toLocaleString();
    }
    return `<tr><td>${safeTerm}</td><td>${displayScore}</td><td>${submissionCount}</td><td>${escapeHtml(displayTime)}</td></tr>`;
  }).join('');

  serverScoresEl.innerHTML = `
    <h5>服务器词表得分</h5>
    <table>
      <thead><tr><th>词汇</th><th>累计分数</th><th>提交次数</th><th>最后提交时间</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function getScoreApiBase(){
  const inputVal = scoreApiUrlInput?.value?.trim();
  if (inputVal) return inputVal;
  const stored = localStorage.getItem('score-api-url');
  if (stored) return stored;
  return 'http://localhost:4000';
}

function collectSimilarityPayload(){
  const results = [];
  if (!LAST_GRADING_RESULTS) return results;
  for (const [term, data] of Object.entries(LAST_GRADING_RESULTS)){
    if (!data) continue;
    if (typeof data.similarity === 'number'){
      results.push({ term, similarity: data.similarity });
    }
  }
  return results;
}

function collectSuggestionCounts(){
  const practicedRaw = Number(practicedCountInput?.value ?? 0);
  const totalRaw = Number(totalCountInput?.value ?? 0);
  const thresholdRaw = Number(masteryThresholdInput?.value ?? 1);
  const practiced = Number.isFinite(practicedRaw) ? Math.max(0, Math.min(50, Math.round(practicedRaw))) : 0;
  const total = Number.isFinite(totalRaw) ? Math.max(0, Math.min(50, Math.round(totalRaw))) : 0;
  const masteryThreshold = Number.isFinite(thresholdRaw) ? thresholdRaw : 1;
  return { practiced, total, masteryThreshold };
}

async function fetchServerScores({ quiet = false } = {}) {
  try {
    const base = getScoreApiBase();
    const endpoint = base.replace(/\/$/, '') + '/api/word-scores';
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP ${response.status} ${response.statusText}: ${text}`);
    }
    const data = await response.json();
    if (Array.isArray(data.scores)) {
      renderServerScores(data.scores);
      if (!quiet) {
        setSyncStatus(`已获取服务器记录（${data.scores.length} 个词）`, 'ok');
      }
    } else if (!quiet) {
      setSyncStatus('服务器未返回有效数据', 'warn');
    }
  } catch (error) {
    if (!quiet) {
      setSyncStatus(`无法获取服务器分数：${error.message}`, 'warn');
    }
  }
}

async function handleAutoFillWords(){
  if (!autoFillWordsBtn) return;
  const { practiced, total, masteryThreshold } = collectSuggestionCounts();
  if (!total){
    setGeneratorStatus('请设置总词数（至少 1）', 'warn');
    return;
  }

  if (practiced > total){
    setGeneratorStatus('练习过的词数不能超过总词数', 'warn');
    return;
  }

  const base = getScoreApiBase();
  const endpoint = `${base.replace(/\/$/, '')}/api/word-suggestions?practiced=${practiced}&total=${total}&threshold=${encodeURIComponent(masteryThreshold)}`;

  autoFillWordsBtn.disabled = true;
  autoFillWordsBtn.textContent = '获取中…';
  setGeneratorStatus('正在向服务器请求推荐词汇…', 'info');

  try {
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP ${response.status} ${response.statusText}: ${text}`);
    }
    const data = await response.json();
    const practicedWords = Array.isArray(data.practiced) ? data.practiced.map(entry => entry.term).filter(Boolean) : [];
    const freshWords = Array.isArray(data.fresh) ? data.fresh.map(entry => entry.term).filter(Boolean) : [];

    if (!practicedWords.length && !freshWords.length) {
      setGeneratorStatus('未获取到符合条件的词汇，请调整参数。', 'warn');
      return;
    }

    const segments = [];
    if (practicedWords.length) segments.push(practicedWords.join(', '));
    if (freshWords.length) segments.push(freshWords.join(', '));

    generatorWordsEl.value = segments.join('\n\n');
    setGeneratorStatus(`已填入 ${practicedWords.length} 个练习词与 ${freshWords.length} 个新词`, 'ok');
    localStorage.setItem('score-api-url', base);
  } catch (error) {
    console.error('[Auto Fill Words] 获取失败:', error);
    setGeneratorStatus(`获取推荐词汇失败：${error.message}`, 'warn');
  } finally {
    autoFillWordsBtn.disabled = false;
    autoFillWordsBtn.textContent = '🎯 自动取词';
  }
}

function getSavedAIConfig(){
  const apiUrlInput = document.getElementById('api-url');
  const apiKeyInput = document.getElementById('api-key');
  const modelInput = document.getElementById('ai-model');
  const apiUrl = (localStorage.getItem('ai-api-url') || apiUrlInput?.value || '').trim();
  const apiKey = (localStorage.getItem('ai-api-key') || apiKeyInput?.value || '').trim();
  const model = (localStorage.getItem('ai-model') || modelInput?.value || 'gpt-3.5-turbo').trim() || 'gpt-3.5-turbo';
  return { apiUrl, apiKey, model };
}

function createArticlePrompt(words, topic){
  const wordGoal = DEFAULT_ARTICLE_WORD_GOAL;
  const paragraphCount = DEFAULT_ARTICLE_PARAGRAPH_COUNT;
  const bulletList = words.map((w, idx) => `${idx + 1}. ${w}`).join('\n');
  const topicLine = topic ? `主题提示：${topic}\n\n` : '';
  return `${topicLine}请写一篇面向地学学习者的英文短文，使用Markdown段落格式（不要添加标题、前缀说明或代码块）。要求：\n- 文章总长度约 ${wordGoal} 个英文单词，可上下浮动 10%。\n- 分成 ${paragraphCount} 个段落。\n- 下列每个词必须至少出现一次，并使用 Markdown 粗体 **word** 形式标注。（保持原始词形，必要时可稍微变化时态/单复数。）\n- 内容要自然流畅，信息准确，可适当加入背景、例子或解释。\n\n目标词汇：\n${bulletList}\n\n请直接输出文章正文，不要附加额外解释。`;
}

async function handleGenerateArticle(){
  if (!generateArticleBtn) return;
  const words = parseGeneratorWords(generatorWordsEl?.value || '');
  if (!words.length){
    setGeneratorStatus('请至少输入一个目标词汇', 'warn');
    generatorWordsEl?.focus();
    return;
  }

  const topic = (generatorTopicEl?.value || '').trim();
  const { apiUrl, apiKey, model } = getSavedAIConfig();

  if (!apiUrl || !apiKey){
    setGeneratorStatus('请先在右侧配置AI API地址与Key', 'warn');
    return;
  }

  const originalLabel = generateArticleBtn.dataset.originalText || generateArticleBtn.textContent;

  try {
    generateArticleBtn.disabled = true;
    generateArticleBtn.dataset.originalText = originalLabel;
    generateArticleBtn.textContent = '生成中…';
    setGeneratorStatus('正在请求AI生成文章…', 'info');

    const prompt = createArticlePrompt(words, topic);
    const body = {
      model,
      messages: [
        {
          role: 'system',
          content: 'You are an expert science writer who produces fluent, engaging English articles in Markdown without extra commentary.'
        },
        { role: 'user', content: prompt }
      ],
      temperature: 0.65,
      top_p: 0.9,
      max_tokens: Math.min(1200, Math.round(DEFAULT_ARTICLE_WORD_GOAL * 4.2))
    };

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(body)
    });

    if (!response.ok){
      const errorText = await response.text();
      throw new Error(`API请求失败: ${response.status} ${response.statusText} | ${errorText}`);
    }

    const result = await response.json();
    const content = result?.choices?.[0]?.message?.content?.trim();
    if (!content){
      throw new Error('AI未返回文章内容');
    }

    articleEditor.value = content;
    processArticleContent(content);
    switchToViewMode();
    const missingTerms = findMissingTerms(content, words);
    if (missingTerms.length){
      const message = `⚠️ 已生成文章，但缺少 ${missingTerms.length} 个词：${missingTerms.join('，')}`;
      setGeneratorStatus(message, 'warn');
      toast('生成完成，但存在缺失词汇，请手动补充。', 'warn');
    } else {
      setGeneratorStatus('AI文章生成完成，所有目标词汇均已覆盖 ✓', 'ok');
      toast('文章生成成功并包含全部目标词汇！', 'ok');
    }
  } catch (error) {
    console.error('[Article Generator] 生成文章失败:', error);
    setGeneratorStatus(`生成失败：${error.message}`, 'warn');
  } finally {
    generateArticleBtn.disabled = false;
    generateArticleBtn.textContent = generateArticleBtn.dataset.originalText || '✨ AI生成文章';
  }
}


// Process article content and extract vocabulary
function processArticleContent(content) {
  try {
    // Convert **markdown** to <strong> HTML tags and preserve paragraph structure
    const formattedContent = convertMarkdownToHtml(content);

    // Display the article content
    articleContent.innerHTML = formattedContent;

    // Extract vocabulary from ** marked words
    extractVocabulary(content);

    // Rebuild vocabulary list
    buildList();

    editorStatus.textContent = '文章保存成功！';
    editorStatus.style.color = 'var(--ok)';
  } catch (error) {
    editorStatus.textContent = '处理文章内容时出错: ' + error.message;
    editorStatus.style.color = 'var(--warn)';
  }
}

// Convert markdown **word** to <strong>word</strong> and preserve paragraph structure
function convertMarkdownToHtml(content) {
  // Split content into paragraphs (separated by double newlines)
  const paragraphs = content.split('\n\n');

  // Process each paragraph
  const htmlParagraphs = paragraphs.map(paragraph => {
    // Convert **word** to <strong>word</strong>
    let htmlParagraph = paragraph.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    // Wrap in <p> tag
    return `<p>${htmlParagraph}</p>`;
  });

  return htmlParagraphs.join('\n');
}

// Extract vocabulary from ** marked words
function extractVocabulary(content) {
  // Find all words enclosed in **
  const regex = /\*\*(.*?)\*\*/g;
  const matches = content.match(regex);

  if (matches) {
    // Use an array to preserve order and a set to track duplicates
    const vocabList = [];
    const vocabSet = new Set();
    matches.forEach(match => {
      // Remove ** and trim whitespace
      const word = match.replace(/\*\*/g, '').trim();
      if (word && !vocabSet.has(word)) {
        vocabSet.add(word);
        vocabList.push(word);
      }
    });

    // Assign ordered list to VOCABS
    VOCABS = vocabList;
  } else {
    VOCABS = [];
  }
}

// Function to find term by id fragment
function findTermByIdFragment(idFragment){
  for (const term of VOCABS) {
    const expectedId = term.toLowerCase().replace(/[^a-z0-9]+/g,'-');
    if (expectedId === idFragment) return term;
  }
  return null;
}

// Mode switching functions
function switchToEditMode() {
  editModeBtn.classList.add('active');
  viewModeBtn.classList.remove('active');
  editSection.style.display = 'block';
  viewSection.style.display = 'none';
}

function switchToViewMode() {
  editModeBtn.classList.remove('active');
  viewModeBtn.classList.add('active');
  editSection.style.display = 'none';
  viewSection.style.display = 'block';
}

// Mode switching event listeners
editModeBtn.addEventListener('click', switchToEditMode);
viewModeBtn.addEventListener('click', switchToViewMode);

// Save article event listener
saveArticleBtn.addEventListener('click', () => {
  const content = articleEditor.value;
  if (content.trim()) {
    processArticleContent(content);
    switchToViewMode();
  } else {
    editorStatus.textContent = '请输入文章内容';
    editorStatus.style.color = 'var(--warn)';
  }
});

if (generateArticleBtn){
  generateArticleBtn.addEventListener('click', handleGenerateArticle);
}

if (autoFillWordsBtn){
  autoFillWordsBtn.addEventListener('click', (e) => {
    e.preventDefault();
    handleAutoFillWords();
  });
}

if (syncServerBtn){
  syncServerBtn.addEventListener('click', async () => {
    const payload = collectSimilarityPayload();
    if (!payload.length){
      setSyncStatus('请先完成AI判题后再同步。', 'warn');
      toast('没有可同步的判题分数', 'warn');
      return;
    }

    const base = getScoreApiBase();
    const endpoint = base.replace(/\/$/, '') + '/api/word-scores';
    const originalLabel = syncServerBtn.dataset.originalText || syncServerBtn.textContent;
    syncServerBtn.dataset.originalText = originalLabel;
    syncServerBtn.disabled = true;
    syncServerBtn.textContent = '同步中…';
    setSyncStatus('正在同步判题结果到服务器…', 'info');

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ results: payload })
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`HTTP ${response.status} ${response.statusText}: ${text}`);
      }

      const data = await response.json();
      const scores = Array.isArray(data.scores) ? data.scores : [];
      renderServerScores(scores);
      const updatedCount = data.updated ?? payload.length;
      setSyncStatus(`同步成功，已更新 ${updatedCount} 个词汇`, 'ok');
      toast('服务器词表已更新 ✓', 'ok');
      localStorage.setItem('score-api-url', base);
    } catch (error) {
      console.error('[Sync Scores] 同步失败:', error);
      setSyncStatus(`同步失败：${error.message}`, 'warn');
      toast('同步失败：' + error.message, 'warn');
    } finally {
      syncServerBtn.disabled = false;
      syncServerBtn.textContent = syncServerBtn.dataset.originalText || '⬆️ 同步到服务器';
    }
  });
}

// Function to jump to and highlight input field
function jumpToInput(term){
  const inputEl = document.getElementById(makeId(term));
  if (inputEl) {
    inputEl.scrollIntoView({behavior:'smooth', block:'center'});
    inputEl.focus();
    // Highlight the input's parent item
    const itemEl = inputEl.closest('.item');
    if (itemEl) {
      itemEl.style.outline = '2px solid var(--accent-2)';
      itemEl.style.boxShadow = '0 0 0 4px rgba(137,220,235,.25)';
      setTimeout(()=>{
        itemEl.style.outline = '';
        itemEl.style.boxShadow='';
      }, 1500);
    }
  }
}

function buildList(){
  listEl.innerHTML = '';
  const q = filterEl.value?.trim().toLowerCase();
  for (const term of VOCABS){
    if (q && !term.toLowerCase().includes(q)) continue;
    const id = makeId(term);
    const div = document.createElement('div');
    div.className = 'item';
    div.innerHTML = `
      <div class="term" data-term="${term}">
        <span>${term}</span>
        <span class="jump" data-term="${term}">跳到文中</span>
      </div>
      <input aria-label="${term} 中文意思" placeholder="中文意思…" id="${id}" data-term="${term}" />
    `;
    listEl.appendChild(div);
  }
}

// Initialize
buildList();

// Theme toggle functionality
const themeToggle = document.getElementById('theme-toggle');
const html = document.documentElement;

// Load saved theme or default to dark
const savedTheme = localStorage.getItem('theme') || 'dark';
if (savedTheme === 'light') {
  html.classList.add('light');
  themeToggle.textContent = '☀️ 浅色';
} else {
  themeToggle.textContent = '🌙 深色';
}

themeToggle.addEventListener('click', () => {
  const isLight = html.classList.contains('light');
  if (isLight) {
    html.classList.remove('light');
    themeToggle.textContent = '🌙 深色';
    localStorage.setItem('theme', 'dark');
  } else {
    html.classList.add('light');
    themeToggle.textContent = '☀️ 浅色';
    localStorage.setItem('theme', 'light');
  }
});

// Delegated jump - both term and jump button work
listEl.addEventListener('click', (e)=>{
  const t = e.target;
  if (t.classList.contains('jump')){
    jumpTo(t.dataset.term);
  } else if (t.classList.contains('term') || t.parentElement.classList.contains('term')){
    const term = t.dataset.term || t.parentElement.dataset.term;
    if (term) jumpTo(term);
  }
});

filterEl.addEventListener('input', buildList);

// Add focus event listener for input fields
listEl.addEventListener('focus', (e)=>{
  if (e.target.tagName === 'INPUT' && e.target.dataset.term) {
    jumpTo(e.target.dataset.term);
  }
}, true);

// Add click handler for article words to jump to corresponding input
document.getElementById('article-content').addEventListener('click', (e)=>{
  if (e.target.tagName === 'STRONG') {
    // Extract term from text content
    const term = e.target.textContent.trim();
    if (term && VOCABS.includes(term)) {
      jumpToInput(term);
    }
  }
});

// Persistence helpers
const KEY = 'geo_vocab_answers_v1';

function gather(){
  const data = {};
  for (const term of VOCABS){
    const el = document.getElementById(makeId(term));
    data[term] = el ? (el.value || '') : '';
  }
  return data;
}

function fill(data){
  if (!data) return;
  for (const term of VOCABS){
    const el = document.getElementById(makeId(term));
    if (el && term in data) el.value = data[term] || '';
  }
}

// Auto-load if present
try {
  const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
  fill(saved);
} catch {}

// Button event listeners
document.getElementById('save').addEventListener('click', ()=>{
  const data = gather();
  localStorage.setItem(KEY, JSON.stringify(data));
  toast('已保存到本地 ✓', 'ok');
});

document.getElementById('load').addEventListener('click', ()=>{
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    fill(saved);
    toast('已从本地恢复 ✓', 'ok');
  } catch {
    toast('未找到本地数据', 'warn');
  }
});

document.getElementById('clear').addEventListener('click', ()=>{
  for (const term of VOCABS){
    const el = document.getElementById(makeId(term));
    if (el) el.value = '';
  }
  toast('已清空输入', 'warn');
});

document.getElementById('export').addEventListener('click', ()=>{
  const data = gather();
  // Create CSV with header
  const rows = [["English","Chinese","Similarity"]];
  for (const term of VOCABS){
    const answer = (data[term] || '').replaceAll('\n',' ').trim();
    const similarity = LAST_GRADING_RESULTS?.[term]?.similarity;
    const similarityFormatted = typeof similarity === 'number' ? similarity.toFixed(2) : '';
    rows.push([term, answer, similarityFormatted]);
  }
  const csv = toCSV(rows);
  // BOM for Excel UTF-8
  const blob = new Blob(['\uFEFF' + csv], {type: 'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'english-chinese-fill.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  toast('CSV 已生成并开始下载', 'ok');
});

// Helper functions
function toCSV(rows){
  return rows.map(r => r.map(cell => csvCell(cell)).join(',')).join('\n');
}

function csvCell(v){
  if (v == null) return '';
  const s = String(v);
  if (/[",\n]/.test(s)) return '"' + s.replaceAll('"','""') + '"';
  return s;
}

// Toast notification
function toast(msg, kind){
  const t = document.createElement('div');
  t.textContent = msg;
  t.style.position='fixed';
  t.style.right='18px';
  t.style.bottom='18px';
  t.style.background = 'rgba(10,15,30,.95)';
  t.style.border='1px solid rgba(122,162,247,.3)';
  t.style.color = kind==='ok' ? 'var(--ok)' : (kind==='warn'? 'var(--warn)' : 'var(--text)');
  t.style.padding = '10px 12px';
  t.style.borderRadius='10px';
  t.style.boxShadow='0 6px 18px var(--shadow)';
  document.body.appendChild(t);
  setTimeout(()=>t.remove(), 2200);
}

// AI Grading System
let gradingInProgress = false;
const aiConfigEl = document.getElementById('ai-config');
const aiResultsEl = document.getElementById('ai-results');
const aiProgressEl = document.getElementById('ai-progress');
const progressFillEl = document.getElementById('progress-fill');
const progressTextEl = document.getElementById('progress-text');
const scoreSummaryEl = document.getElementById('score-summary');
const aiIdentityCheckBtn = document.getElementById('ai-identity-check');

// AI Grading Event Listeners
document.getElementById('ai-grade').addEventListener('click', async () => {
  if (aiConfigEl.style.display === 'none') {
    aiConfigEl.style.display = 'block';
    setGeneratorStatus('');
    // Load saved API settings
    const savedApiUrl = localStorage.getItem('ai-api-url');
    const savedApiKey = localStorage.getItem('ai-api-key');
    const savedModel = localStorage.getItem('ai-model') || 'gpt-3.5-turbo';
    if (savedApiUrl) document.getElementById('api-url').value = savedApiUrl;
    if (savedApiKey) document.getElementById('api-key').value = savedApiKey;
    document.getElementById('ai-model').value = savedModel;
    const savedScoreApi = localStorage.getItem('score-api-url');
    if (scoreApiUrlInput) {
      scoreApiUrlInput.value = savedScoreApi || scoreApiUrlInput.value || 'http://localhost:4000';
    }
    renderServerScores([]);
    setSyncStatus('同步后将显示本次提交的词汇成绩', 'info');
  } else {
    aiConfigEl.style.display = 'none';
  }
});

// AI Identity Check Button
aiIdentityCheckBtn.addEventListener('click', async () => {
  const savedApiUrl = localStorage.getItem('ai-api-url');
  const savedApiKey = localStorage.getItem('ai-api-key');
  const savedModel = localStorage.getItem('ai-model') || 'gpt-3.5-turbo';

  if (!savedApiUrl || !savedApiKey) {
    alert('请先配置API地址和Key！\n\n点击"🤖 AI工具箱"按钮进行配置。');
    return;
  }

  aiIdentityCheckBtn.textContent = '🔍 检测中...';
  aiIdentityCheckBtn.disabled = true;

  try {
    const identity = await checkAIIdentityForDisplay(savedApiUrl, savedApiKey, savedModel);
    // Show result in alert
    alert(`AI身份信息：\n\n${identity}`);
  } catch (error) {
    alert(`AI身份检测失败：\n\n${error.message}`);
  } finally {
    aiIdentityCheckBtn.textContent = '🔍 检测AI身份';
    aiIdentityCheckBtn.disabled = false;
  }
});

document.getElementById('cancel-grade').addEventListener('click', () => {
  aiConfigEl.style.display = 'none';
  gradingInProgress = false;
});

if (startGradeBtn) {
  startGradeBtn.addEventListener('click', async () => {
    const apiUrl = document.getElementById('api-url').value.trim();
    const apiKey = document.getElementById('api-key').value.trim();
    const model = document.getElementById('ai-model').value.trim() || 'gpt-3.5-turbo';

    if (!apiUrl || !apiKey) {
      aiConfigEl.style.display = 'block';
      toast('请填写API地址和Key', 'warn');
      return;
    }

    // Save API settings
    localStorage.setItem('ai-api-url', apiUrl);
    localStorage.setItem('ai-api-key', apiKey);
    localStorage.setItem('ai-model', model);

    const originalLabel = startGradeBtn.dataset.originalText || startGradeBtn.textContent;
    startGradeBtn.dataset.originalText = originalLabel;
    setStartGradeButton('判题准备中…', true);

    try {
      await startAIGrading(apiUrl, apiKey, model);
    } finally {
      setTimeout(resetStartGradeButton, 600);
    }
  });
}

// Main AI grading function
async function startAIGrading(apiUrl, apiKey, model = 'gpt-3.5-turbo') {
  console.log('[Main Grading] 开始AI判题流程');
  console.log('[Main Grading] API URL:', apiUrl);
  console.log('[Main Grading] 模型:', model);
  console.log('[Main Grading] API Key 长度:', apiKey ? apiKey.length : 0);

  if (gradingInProgress) {
    console.warn('[Main Grading] 判题已在进行中，跳过');
    return;
  }

  gradingInProgress = true;
  aiProgressEl.style.display = 'block';
  aiResultsEl.style.display = 'none';

  // Clear previous results
  clearGradingResults();

  try {
    const data = gather();
    console.log('[Main Grading] 收集的数据:', data);

    const filledTerms = VOCABS.filter(term => data[term] && data[term].trim());
    console.log('[Main Grading] 已填写的词汇:', filledTerms);
    console.log('[Main Grading] 已填写词汇数量:', filledTerms.length);

    if (filledTerms.length === 0) {
      console.warn('[Main Grading] 没有填写的词汇');
      toast('请先填写一些答案', 'warn');
      gradingInProgress = false;
      aiProgressEl.style.display = 'none';
      return;
    }

    progressTextEl.textContent = `开始判题... (共${filledTerms.length}个词)`;
    if (startGradeBtn) {
      setStartGradeButton(`判题中 0/${filledTerms.length}`, true);
    }

    // Process in batches of 20
    const batchSize = 20;
    const batches = [];
    for (let i = 0; i < filledTerms.length; i += batchSize) {
      batches.push(filledTerms.slice(i, i + batchSize));
    }
    console.log('[Main Grading] 分批处理:', batches.length, '个批次');

    let totalProcessed = 0;
    const results = {};

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      console.log(`[Main Grading] 处理第${i+1}批:`, batch);
      progressTextEl.textContent = `正在处理第${i+1}/${batches.length}批 (${batch.length}个词)...`;

      try {
        const batchResults = await gradeBatch(batch, data, apiUrl, apiKey, model);
        console.log(`[Main Grading] 第${i+1}批结果:`, batchResults);
        Object.assign(results, batchResults);
        totalProcessed += batch.length;

        const progress = (totalProcessed / filledTerms.length) * 100;
        progressFillEl.style.width = progress + '%';
        console.log(`[Main Grading] 进度: ${progress}% (${totalProcessed}/${filledTerms.length})`);
        if (startGradeBtn) {
          const percentLabel = Math.round(progress);
          setStartGradeButton(`判题中 ${totalProcessed}/${filledTerms.length} (${percentLabel}%)`, true);
        }

        // Small delay between batches to avoid rate limiting
        if (i < batches.length - 1) {
          console.log(`[Main Grading] 等待1秒避免频率限制`);
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } catch (error) {
        console.error(`[Main Grading] 第${i+1}批处理失败:`, error);
        toast(`第${i+1}批处理失败: ${error.message}`, 'warn');
      }
    }

    console.log('[Main Grading] 所有批次处理完成，最终结果:', results);
    // Display results
    displayGradingResults(results, filledTerms.length);
    if (startGradeBtn) {
      setStartGradeButton('判题完成 ✓', true);
    }

  } catch (error) {
    console.error('[Main Grading] 判题过程错误:', error);
    toast('判题过程中出现错误: ' + error.message, 'warn');
    if (startGradeBtn) setStartGradeButton('判题失败', true);
  } finally {
    gradingInProgress = false;
    aiProgressEl.style.display = 'none';
    console.log('[Main Grading] 判题流程结束');
  }
}

// Grade a batch of words
async function gradeBatch(terms, data, apiUrl, apiKey, model = 'gpt-3.5-turbo') {
  console.log(`[Batch Grading] 开始处理批次:`, terms);
  console.log(`[Batch Grading] 使用模型:`, model);

  const prompt = createGradingPrompt(terms, data);
  console.log(`[Batch Grading] 生成的提示词:`, prompt);

  const requestBody = {
    model: model,
    messages: [{
      role: 'user',
      content: prompt
    }],
    temperature: 0.1
  };

  console.log(`[Batch Grading] 请求体:`, JSON.stringify(requestBody, null, 2));

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(requestBody)
  });

  console.log(`[Batch Grading] 响应状态:`, response.status, response.statusText);

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[Batch Grading] API错误响应:`, errorText);
    throw new Error(`API请求失败: ${response.status} ${response.statusText}: ${errorText}`);
  }

  const result = await response.json();
  console.log(`[Batch Grading] API响应:`, result);

  if (!result.choices || !result.choices[0] || !result.choices[0].message) {
    console.error(`[Batch Grading] 响应格式异常:`, result);
    throw new Error('API响应格式异常');
  }

  const aiResponse = result.choices[0].message.content;
  console.log(`[Batch Grading] AI回复内容:`, aiResponse);

  const parsedResults = parseGradingResponse(aiResponse, terms);
  console.log(`[Batch Grading] 解析结果:`, parsedResults);

  return parsedResults;
}

function clampSimilarity(value) {
  const num = typeof value === 'number' ? value : parseFloat(value);
  if (!Number.isFinite(num)) return null;
  const clamped = Math.min(Math.max(num, 0), 1);
  return Math.round(clamped * 1000) / 1000;
}

// Create grading prompt for AI
function createGradingPrompt(terms, data) {
  const termsList = terms.map(term => `- 英文词汇: ${term}\n  学生翻译: ${data[term] || '(空白)'}`).join('\n');

  return `你是一名精通地学的双语教师，需要判断学生给出的中文翻译与英文术语的语义相似度。语义评估要考虑术语在地学语境下的涵义、常见搭配及上下文含义，而不仅仅是字面匹配。

请对每个词汇：
1. 给出最标准、最常用的中文翻译（可包含多个词，确保含义准确）。
2. 评估学生答案与标准答案在语义上的相似度，相似度用 0~1 的小数表示：0 代表完全错误，1 代表完全一致。允许保留三位小数。
3. 如有需要，可给出简短说明（10~25个字），解释主要差异或匹配亮点。

务必只输出 JSON，不要解释。JSON 格式如下：
{
  "英文词汇": {
    "标准答案": "标准中文翻译",
    "相似度": 0.000,
    "说明": "可选，若无则留空字符串"
  }
}

待评估的词汇与学生答案：
${termsList}`;
}

// Parse AI grading response
function parseGradingResponse(aiResponse, terms) {
  console.log(`[Parse Response] 开始解析AI回复:`, aiResponse);
  console.log(`[Parse Response] 需要解析的词汇:`, terms);

  try {
    // Extract JSON from response
    const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
    console.log(`[Parse Response] JSON匹配结果:`, jsonMatch ? jsonMatch[0] : 'null');

    if (!jsonMatch) {
      console.warn(`[Parse Response] 未找到JSON格式，使用fallback解析`);
      throw new Error('无法解析AI回复格式');
    }

    const parsed = JSON.parse(jsonMatch[0]);
    console.log(`[Parse Response] JSON解析成功:`, parsed);

    const results = {};

    terms.forEach(term => {
      console.log(`[Parse Response] 处理词汇: ${term}`);

      const termData = parsed[term] || parsed[term.trim()] || null;
      if (termData && typeof termData === 'object') {
        const similarityRaw = termData['相似度'] ?? termData['similarity'] ?? termData['score'];
        const similarity = clampSimilarity(typeof similarityRaw === 'string' ? parseFloat(similarityRaw) : similarityRaw);
        const standardAnswer = (termData['标准答案'] ?? termData['正确答案'] ?? '').toString().trim();
        const explanation = (termData['说明'] ?? termData['解释'] ?? '').toString().trim();

        results[term] = {
          similarity: typeof similarity === 'number' ? similarity : null,
          standardAnswer: standardAnswer || null,
          explanation: explanation || null
        };

        console.log(`[Parse Response] ${term} 解析成功 - 相似度:`, results[term].similarity, '标准答案:', results[term].standardAnswer, '说明:', results[term].explanation);
      } else if (typeof termData === 'string') {
        // Backward compatibility (旧格式)
        const isCorrect = termData === '正确';
        results[term] = {
          similarity: isCorrect ? 1 : 0,
          standardAnswer: null,
          explanation: null
        };
        console.log(`[Parse Response] ${term} 使用旧格式字符串 - 相似度模拟:`, results[term].similarity);
      } else {
        console.log(`[Parse Response] ${term} 未在解析结果中找到，使用fallback`);
        results[term] = {
          similarity: null,
          standardAnswer: null,
          explanation: null
        };
      }
    });

    console.log(`[Parse Response] 最终解析结果:`, results);
    return results;

  } catch (error) {
    console.error(`[Parse Response] JSON解析失败:`, error);
    console.log(`[Parse Response] 使用fallback解析方法`);

    // Fallback parsing if JSON parsing fails
    const results = {};
    terms.forEach(term => {
      const termLower = term.toLowerCase();
      const responseLower = aiResponse.toLowerCase();
      results[term] = {
        similarity: responseLower.includes(termLower) ? 0.5 : null,
        standardAnswer: null,
        explanation: null
      };
      console.log(`[Parse Response] ${term} fallback结果 - 相似度: ${results[term].similarity}`);
    });

    console.log(`[Parse Response] Fallback最终结果:`, results);
    return results;
  }
}

// Display grading results
function displayGradingResults(results, totalCount) {
  LAST_GRADING_RESULTS = results || {};
  const scoreValues = Object.values(results)
    .map(r => (typeof r.similarity === 'number' ? r.similarity : null))
    .filter(v => v !== null);

  const avgSimilarity = scoreValues.length
    ? Math.round((scoreValues.reduce((sum, v) => sum + v, 0) / scoreValues.length) * 100) / 100
    : 0;

  const highMatches = scoreValues.filter(v => v >= SIMILARITY_THRESHOLD_STRICT).length;
  const mediumMatches = scoreValues.filter(v => v < SIMILARITY_THRESHOLD_STRICT && v >= SIMILARITY_THRESHOLD_PARTIAL).length;
  const strictLabel = SIMILARITY_THRESHOLD_STRICT.toFixed(2);
  const partialLabel = SIMILARITY_THRESHOLD_PARTIAL.toFixed(2);

  scoreSummaryEl.innerHTML = `
    <div>判题完成！</div>
    <div class="score-line">
      <span>平均相似度：<strong>${avgSimilarity.toFixed(2)}</strong></span>
      <span>高匹配(≥${strictLabel}): <strong>${highMatches}</strong></span>
      <span>中等匹配(≥${partialLabel}): <strong>${mediumMatches}</strong></span>
      <span>总词数: <strong>${totalCount}</strong></span>
    </div>
  `;

  Object.entries(results).forEach(([term, result]) => {
    const itemEl = document.querySelector(`[data-term="${term}"]`)?.closest('.item');
    if (!itemEl) return;

    itemEl.classList.remove('correct', 'incorrect', 'partial');

    const similarity = typeof result.similarity === 'number' ? result.similarity : null;
    let bucket = 'incorrect';
    if (similarity !== null) {
      if (similarity >= SIMILARITY_THRESHOLD_STRICT) {
        bucket = 'correct';
      } else if (similarity >= SIMILARITY_THRESHOLD_PARTIAL) {
        bucket = 'partial';
      }
    }
    itemEl.classList.add(bucket);

    const termEl = itemEl.querySelector('.term');
    if (!termEl) return;

    let indicator = termEl.querySelector('.grade-indicator');
    if (!indicator) {
      indicator = document.createElement('span');
      indicator.className = 'grade-indicator';
      termEl.appendChild(indicator);
    }
    indicator.className = `grade-indicator ${bucket}`;
    indicator.textContent = similarity !== null ? similarity.toFixed(2) : '—';
    indicator.title = '语义相似度 (0-1)';

    let detailsEl = itemEl.querySelector('.grading-details');
    if (!detailsEl) {
      detailsEl = document.createElement('div');
      detailsEl.className = 'grading-details';
      itemEl.appendChild(detailsEl);
    }

    detailsEl.innerHTML = '';

    if (similarity !== null) {
      const simRow = document.createElement('div');
      const simLabel = document.createElement('strong');
      simLabel.textContent = '相似度:';
      simRow.appendChild(simLabel);
      simRow.appendChild(document.createTextNode(' ' + similarity.toFixed(2)));
      detailsEl.appendChild(simRow);
    }

    if (result.standardAnswer) {
      const answerRow = document.createElement('div');
      const answerLabel = document.createElement('strong');
      answerLabel.textContent = '标准答案:';
      answerRow.appendChild(answerLabel);
      answerRow.appendChild(document.createTextNode(' ' + result.standardAnswer));
      detailsEl.appendChild(answerRow);
    }

    if (result.explanation) {
      const explainRow = document.createElement('div');
      const explainLabel = document.createElement('strong');
      explainLabel.textContent = '说明:';
      explainRow.appendChild(explainLabel);
      explainRow.appendChild(document.createTextNode(' ' + result.explanation));
      detailsEl.appendChild(explainRow);
    }

    if (!detailsEl.hasChildNodes()) {
      detailsEl.remove();
    }
  });

  aiResultsEl.style.display = 'block';
  aiConfigEl.style.display = 'none';

  toast(`判题完成！平均相似度 ${avgSimilarity.toFixed(2)}`, 'ok');
}

// Clear previous grading results
function clearGradingResults() {
  LAST_GRADING_RESULTS = {};
  document.querySelectorAll('.item').forEach(item => {
    item.classList.remove('correct', 'incorrect', 'partial');
    const indicator = item.querySelector('.grade-indicator');
    if (indicator) indicator.remove();
    const gradingDetails = item.querySelector('.grading-details');
    if (gradingDetails) gradingDetails.remove();
  });
}

// Check AI Identity for Display (returns result instead of updating UI)
async function checkAIIdentityForDisplay(apiUrl, apiKey, model = 'gpt-3.5-turbo') {
  console.log('[AI Identity] 开始检测AI身份');
  console.log('[AI Identity] API URL:', apiUrl);
  console.log('[AI Identity] 模型:', model);
  console.log('[AI Identity] API Key 长度:', apiKey ? apiKey.length : 0);

  const requestBody = {
    model: model,
    messages: [{
      role: 'user',
      content: '你好，请详细介绍一下你自己，包括你的名称、版本、主要功能和特色。'
    }],
    temperature: 0.1,
    max_tokens: 200
  };

  console.log('[AI Identity] 请求体:', JSON.stringify(requestBody, null, 2));

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(requestBody)
  });

  console.log('[AI Identity] 响应状态:', response.status, response.statusText);

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[AI Identity] API错误响应:', errorText);
    throw new Error(`${response.status} ${response.statusText}: ${errorText}`);
  }

  const result = await response.json();
  console.log('[AI Identity] API响应:', result);

  if (!result.choices || !result.choices[0] || !result.choices[0].message) {
    console.error('[AI Identity] 响应格式异常:', result);
    throw new Error('API响应格式异常');
  }

  const aiResponse = result.choices[0].message.content.trim();
  console.log('[AI Identity] AI回复:', aiResponse);

  return aiResponse;
}

// No auto-initialization needed for AI identity check
