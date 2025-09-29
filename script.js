// --- Vocabulary source list (unique, in requested order) ---
// This will be dynamically populated based on uploaded article
let VOCABS = [];
const VARIANT_TO_ORIGINAL = new Map();
const ORIGINAL_TO_VARIANT = new Map();
const TERM_CONTEXTS = new Map();
let CURRENT_ARTICLE_MARKDOWN = '';

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
const generateArticleBtn = document.getElementById('generate-article-btn');
const generatorStatusEl = document.getElementById('generator-status');
const startGradeBtn = document.getElementById('start-grade');
const syncServerBtn = document.getElementById('sync-server');
const syncStatusEl = document.getElementById('sync-status');
const serverScoresEl = document.getElementById('server-scores');
const scoreApiUrlInput = document.getElementById('score-api-url');
const apiUrlInput = document.getElementById('api-url');
const apiKeyInput = document.getElementById('api-key');
const aiModelInput = document.getElementById('ai-model');
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

function registerVariantMapping(original, used) {
  const originalTrim = typeof original === 'string' ? original.trim() : '';
  if (!originalTrim) return;
  const usedTrim = typeof used === 'string' && used.trim() ? used.trim() : originalTrim;
  VARIANT_TO_ORIGINAL.set(usedTrim.toLowerCase(), originalTrim);
  VARIANT_TO_ORIGINAL.set(originalTrim.toLowerCase(), originalTrim);
  ORIGINAL_TO_VARIANT.set(originalTrim, usedTrim);
}

function resetVariantMappings(pairs = []) {
  VARIANT_TO_ORIGINAL.clear();
  ORIGINAL_TO_VARIANT.clear();
  if (!Array.isArray(pairs)) return;
  for (const entry of pairs) {
    if (!entry || typeof entry !== 'object') continue;
    registerVariantMapping(entry.original, entry.used);
  }
}

function getOriginalFromVariant(variant) {
  if (!variant) return null;
  const key = variant.trim().toLowerCase();
  if (VARIANT_TO_ORIGINAL.has(key)) return VARIANT_TO_ORIGINAL.get(key);
  const fallback = VOCABS.find(term => term.toLowerCase() === key);
  return fallback || null;
}

function getVariantForOriginal(original) {
  if (!original) return null;
  const originalTrim = original.trim();
  return ORIGINAL_TO_VARIANT.get(originalTrim) || originalTrim;
}

function jumpTo(term){
  const variant = getVariantForOriginal(term) || term;
  const anchorId = 't-' + variant.toLowerCase().replace(/[^a-z0-9]+/g,'-');
  const byId = document.getElementById(anchorId);
  if (byId) { byId.scrollIntoView({behavior:'smooth', block:'center'}); highlight(byId); return; }
  const strongs = document.querySelectorAll('#article-content strong');
  const targetLower = variant.toLowerCase();
  for (const s of strongs){
    const text = s.textContent.trim().toLowerCase();
    if (text === targetLower || text.includes(targetLower)) { s.scrollIntoView({behavior:'smooth', block:'center'}); highlight(s); return; }
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

function extractMessageText(message){
  if (!message) return '';
  const { content, text, tool_calls: toolCalls } = message;

  const normalizePart = (part) => {
    if (!part) return '';
    if (typeof part === 'string') return part;
    if (typeof part === 'number' || typeof part === 'boolean') return String(part);
    if (typeof part === 'object') {
      if (typeof part.text === 'string') return part.text;
      if (Array.isArray(part.text)) return part.text.map(normalizePart).join('');
      if (part.type === 'text' && typeof part.value === 'string') return part.value;
      if (part.type === 'text' && typeof part.data === 'string') return part.data;
      if (part.type === 'tool_call' && part.function?.arguments) {
        return '';
      }
      return '';
    }
    return '';
  };

  let chunks = [];

  if (typeof content === 'string') {
    chunks.push(content);
  } else if (Array.isArray(content)) {
    chunks.push(content.map(normalizePart).join(''));
  } else if (content && typeof content === 'object') {
    if (typeof content.text === 'string') {
      chunks.push(content.text);
    } else if (Array.isArray(content.text)) {
      chunks.push(content.text.map(normalizePart).join(''));
    }
  }

  if (typeof text === 'string') {
    chunks.push(text);
  } else if (Array.isArray(text)) {
    chunks.push(text.map(normalizePart).join(''));
  }

  if ((!chunks.length || chunks.join('').trim() === '') && Array.isArray(toolCalls)) {
    for (const call of toolCalls) {
      if (call?.function?.result && typeof call.function.result === 'string') {
        chunks.push(call.function.result);
      }
    }
  }

  const combined = chunks.join('\n').trim();
  return combined;
}

function makeTermRegex(term){
  const escaped = escapeRegExp(term.trim());
  if (!escaped) return null;
  if (/\s/.test(term)) {
    return new RegExp(escaped.replace(/\s+/g, '\\s+'), 'i');
  }
  return new RegExp(`\\b${escaped}\\b`, 'i');
}

function persistInputToStorage(element, key, { trim = true } = {}) {
  if (!element) return;
  const handler = () => {
    const raw = trim ? element.value.trim() : element.value;
    if (raw) {
      localStorage.setItem(key, raw);
    } else {
      localStorage.removeItem(key);
    }
  };
  element.addEventListener('change', handler);
  element.addEventListener('blur', handler);
}

function findMissingTerms(content, words, variantPairs = []){
  const text = content.replace(/\*\*/g, '');
  const usedVariants = new Set();
  const variantRegex = /\*\*(.*?)\*\*/g;
  let match;
  while ((match = variantRegex.exec(content)) !== null) {
    const used = match[1]?.trim().toLowerCase();
    if (used) usedVariants.add(used);
  }

  const variantMap = new Map();
  if (Array.isArray(variantPairs)) {
    for (const entry of variantPairs) {
      if (!entry || typeof entry !== 'object') continue;
      const original = typeof entry.original === 'string' ? entry.original.trim().toLowerCase() : '';
      const used = typeof entry.used === 'string' ? entry.used.trim().toLowerCase() : '';
      if (original && used) variantMap.set(original, used);
      if (original && !used) variantMap.set(original, original);
    }
  }

  const missing = [];
  for (const word of words){
    const originalLower = typeof word === 'string' ? word.trim().toLowerCase() : '';
    if (!originalLower) continue;
    if (usedVariants.has(originalLower)) continue;
    const mappedVariant = variantMap.get(originalLower);
    if (mappedVariant && usedVariants.has(mappedVariant)) continue;
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

persistInputToStorage(apiUrlInput, 'ai-api-url');
persistInputToStorage(apiKeyInput, 'ai-api-key');
persistInputToStorage(aiModelInput, 'ai-model');
persistInputToStorage(scoreApiUrlInput, 'score-api-url');

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
      const context = TERM_CONTEXTS.get(term) || '';
      results.push({
        term,
        similarity: data.similarity,
        context: context || null
      });
    }
  }
  return results;
}

function getCurrentArticleMarkdown(){
  if (typeof CURRENT_ARTICLE_MARKDOWN === 'string' && CURRENT_ARTICLE_MARKDOWN.trim()) {
    return CURRENT_ARTICLE_MARKDOWN.trim();
  }
  const editorValue = typeof articleEditor?.value === 'string' ? articleEditor.value.trim() : '';
  return editorValue;
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
  const rawUrl = apiUrlInput?.value?.trim();
  const rawKey = apiKeyInput?.value?.trim();
  const rawModel = aiModelInput?.value?.trim();

  const storedUrl = localStorage.getItem('ai-api-url');
  const storedKey = localStorage.getItem('ai-api-key');
  const storedModel = localStorage.getItem('ai-model');

  const apiUrl = (rawUrl || storedUrl || '').trim();
  const apiKey = (rawKey || storedKey || '').trim();
  const model = (rawModel || storedModel || 'gpt-3.5-turbo').trim() || 'gpt-3.5-turbo';

  if (rawUrl !== undefined) {
    if (rawUrl) {
      localStorage.setItem('ai-api-url', rawUrl);
    } else {
      localStorage.removeItem('ai-api-url');
    }
  }

  if (rawKey !== undefined) {
    if (rawKey) {
      localStorage.setItem('ai-api-key', rawKey);
    } else {
      localStorage.removeItem('ai-api-key');
    }
  }

  if (rawModel !== undefined) {
    if (rawModel) {
      localStorage.setItem('ai-model', rawModel);
    } else {
      localStorage.removeItem('ai-model');
    }
  }

  return { apiUrl, apiKey, model };
}

function shuffleWords(list){
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function createArticlePrompt(words){
  const wordGoal = DEFAULT_ARTICLE_WORD_GOAL;
  const paragraphCount = DEFAULT_ARTICLE_PARAGRAPH_COUNT;
  const bulletList = words.map((w, idx) => `${idx + 1}. ${w}`).join('\n');
  return `请写一篇面向英语学习者的英文短文，使用 Markdown 段落格式（不要添加标题、前缀说明或代码块）。要求：\n- 分成 ${paragraphCount} 个段落，总字数约 ${wordGoal} 词。\n- 下列词汇顺序已随机排列，你可以按任意顺序安排内容，但每个词至少出现一次，并使用 Markdown 粗体 **word** 形式标注。（可根据语境调整大小写、时态或语态。）\n- 文章需自然流畅，可加入背景、例子或解释，确保所有词汇融入语义。\n\n请仅输出文章正文，保留 Markdown 标记，不要额外添加说明或JSON。\n\n目标词汇（顺序随机）：\n${bulletList}`;
}

function createVariantMappingPrompt(article, words){
  const list = words.map((w, idx) => `${idx + 1}. ${w}`).join('\n');
  return `请阅读下方的英文文章，并根据提供的目标词汇列表，指出文章中每个词汇的实际写法。\n\n输出一个 JSON 对象，格式如下：\n{\n  "pairs": [\n    {"original": "目标词汇", "used": "文章中的实际写法（去掉**，若未出现则留空字符串）"}\n  ]\n}\n\n要求：\n- original 必须与提供的目标词汇完全一致；\n- used 为文章中出现的具体形式（保留大小写/单复数等变化，但去掉任何 Markdown ** 标记）；\n- 如果某个词未在文章中出现，将 used 设为空字符串。\n\n英文文章：\n"""\n${article}\n"""\n\n目标词汇列表：\n${list}`;
}

function cleanVariantValue(value){
  if (typeof value !== 'string') return '';
  return value.replace(/\*\*/g, '').trim();
}

function parseVariantMappingResponse(rawText, originalWords){
  const fallback = (originalWords || []).map(word => ({ original: word, used: word }));
  if (!rawText) return fallback;
  let text = rawText.trim();
  if (!text) return fallback;

  let jsonText = null;
  const fenced = text.match(/```(?:json)?([\s\S]*?)```/i);
  if (fenced) {
    jsonText = fenced[1].trim();
  } else {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      jsonText = match[0];
    }
  }

  let pairs = [];
  if (jsonText) {
    try {
      const parsed = JSON.parse(jsonText);
      const array = Array.isArray(parsed?.pairs) ? parsed.pairs : Array.isArray(parsed) ? parsed : [];
      pairs = array
        .map(entry => {
          if (!entry || typeof entry !== 'object') return null;
          const original = typeof entry.original === 'string' ? entry.original.trim() : '';
          const used = cleanVariantValue(entry.used ?? '');
          if (!original) return null;
          return { original, used: used || '' };
        })
        .filter(Boolean);
    } catch (error) {
      console.warn('[Variant Mapping] JSON解析失败，尝试解析纯文本格式', error);
      pairs = [];
    }
  }

  if (!pairs.length) {
    const lines = text.split(/\n+/).map(line => line.trim()).filter(Boolean);
    for (const line of lines) {
      const match = line.match(/^(.+?)\s*(?:=>|->|：|:|=)\s*(.+)$/);
      if (!match) continue;
      const original = match[1].trim();
      const used = cleanVariantValue(match[2]);
      if (original) {
        pairs.push({ original, used });
      }
    }
  }

  const normalized = new Map();
  for (const pair of pairs) {
    const original = typeof pair.original === 'string' ? pair.original.trim() : '';
    if (!original) continue;
    const key = original.toLowerCase();
    const used = cleanVariantValue(pair.used || original);
    if (!normalized.has(key)) {
      normalized.set(key, { original, used: used || original });
    }
  }

  const result = [];
  for (const original of originalWords || []) {
    const key = original.trim().toLowerCase();
    const mapped = normalized.get(key);
    const used = mapped ? mapped.used : original;
    result.push({ original, used });
  }

  return result;
}

async function requestVariantMappings(apiUrl, apiKey, model, article, words){
  const prompt = createVariantMappingPrompt(article, words);
  const body = {
    model,
    messages: [
      {
        role: 'system',
        content: 'You are an assistant that extracts vocabulary mappings and responds with concise JSON.'
      },
      { role: 'user', content: prompt }
    ],
    temperature: 0,
    max_tokens: 3000
  };

  console.log('[Variant Mapping] 请求体:', JSON.stringify(body, null, 2));

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(body)
  });

  console.log('[Variant Mapping] 响应状态:', response.status, response.statusText);
  if (!response.ok) {
    const errorText = await response.text();
    console.error('[Variant Mapping] API错误响应:', errorText);
    throw new Error(`词形映射请求失败: ${response.status} ${response.statusText}: ${errorText}`);
  }

  const result = await response.json();
  console.log('[Variant Mapping] API响应:', result);
  const message = result?.choices?.[0]?.message;
  if (!message) {
    throw new Error('词形映射响应格式异常');
  }
  const text = extractMessageText(message);
  console.log('[Variant Mapping] AI回复:', text);
  return parseVariantMappingResponse(text, words);
}

async function handleGenerateArticle(){
  if (!generateArticleBtn) return;
  const words = parseGeneratorWords(generatorWordsEl?.value || '');
  if (!words.length){
    setGeneratorStatus('请至少输入一个目标词汇', 'warn');
    generatorWordsEl?.focus();
    return;
  }

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

    const shuffledWords = shuffleWords(words);
    const prompt = createArticlePrompt(shuffledWords);
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

    console.log('[Article Generator] 请求体:', JSON.stringify(body, null, 2));

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
    console.log('[Article Generator] API响应:', result);
    const message = result?.choices?.[0]?.message;
    if (!message) {
      throw new Error('AI未返回文章内容');
    }
    const article = extractMessageText(message);
    if (!article) {
      throw new Error('AI未返回文章内容');
    }

    articleEditor.value = article.trim();

    let variants;
    let mappingFailed = false;
    try {
      setGeneratorStatus('文章生成成功，正在分析词形映射…', 'info');
      variants = await requestVariantMappings(apiUrl, apiKey, model, article, words);
      if (!Array.isArray(variants) || !variants.length) {
        throw new Error('未获得有效的词形映射');
      }
    } catch (mappingError) {
      console.error('[Article Generator] 词形映射失败:', mappingError);
      variants = words.map(original => ({ original, used: original }));
      setGeneratorStatus('文章生成完成，但词形映射失败，已使用原始词汇。', 'warn');
      toast('词形映射失败，已使用原始词汇', 'warn');
      mappingFailed = true;
    }

    console.log('[Article Generator] 最终词形映射:', variants);

    processArticleContent(article, variants);
    switchToViewMode();
    const missingTerms = findMissingTerms(article, words, variants);
    if (missingTerms.length){
      const message = `⚠️ 已生成文章，但缺少 ${missingTerms.length} 个词：${missingTerms.join('，')}`;
      setGeneratorStatus(message, 'warn');
      toast('生成完成，但存在缺失词汇，请手动补充。', 'warn');
    } else if (!mappingFailed) {
      setGeneratorStatus('AI文章生成完成，词汇与词形均已覆盖 ✓', 'ok');
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
function processArticleContent(content, variantPairs = []) {
  try {
    CURRENT_ARTICLE_MARKDOWN = typeof content === 'string' ? content : '';
    resetVariantMappings(variantPairs);
    // Convert **markdown** to <strong> HTML tags and preserve paragraph structure
    const formattedContent = convertMarkdownToHtml(content);

    // Display the article content
    articleContent.innerHTML = formattedContent;

    // Extract vocabulary from ** marked words
    extractVocabulary(content);
    updateTermContextsFromArticle();

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
  const vocabList = [];
  const vocabSet = new Set();
  let match;
  while ((match = regex.exec(content)) !== null) {
    const used = match[1]?.trim();
    if (!used) continue;
    const original = getOriginalFromVariant(used) || used;
    registerVariantMapping(original, used);
    if (!vocabSet.has(original)) {
      vocabSet.add(original);
      vocabList.push(original);
    }
  }

  VOCABS = vocabList;
}

function updateTermContextsFromArticle() {
  TERM_CONTEXTS.clear();
  if (!articleContent) return;

  const paragraphs = articleContent.querySelectorAll('p');
  paragraphs.forEach(paragraph => {
    const paragraphText = paragraph.textContent
      ? paragraph.textContent.replace(/\s+/g, ' ').trim()
      : '';
    if (!paragraphText) return;

    const strongElements = paragraph.querySelectorAll('strong');
    strongElements.forEach(strong => {
      const variant = strong.textContent ? strong.textContent.trim() : '';
      if (!variant) return;
      const originalTerm = getOriginalFromVariant(variant) || variant;
      if (!originalTerm || TERM_CONTEXTS.has(originalTerm)) return;
      const sentence = extractSentenceFromContext(paragraphText, variant) || paragraphText;
      TERM_CONTEXTS.set(originalTerm, sentence);
    });
  });
}

function extractSentenceFromContext(paragraphText, variant) {
  if (!paragraphText || !variant) return '';
  const normalizedParagraph = paragraphText.replace(/\s+/g, ' ').trim();
  const lowerVariant = variant.trim().toLowerCase();

  const sentenceMatches = normalizedParagraph.match(/[^。！？!?\.]+[。！？!?\.]?/g) || [normalizedParagraph];
  for (const sentence of sentenceMatches) {
    if (sentence.toLowerCase().includes(lowerVariant)) {
      return sentence.trim();
    }
  }

  return normalizedParagraph;
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
    const articleMarkdown = getCurrentArticleMarkdown();
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
        body: JSON.stringify({ results: payload, article: articleMarkdown })
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
    const variant = e.target.textContent.trim();
    const originalTerm = getOriginalFromVariant(variant);
    if (originalTerm && VOCABS.includes(originalTerm)) {
      jumpToInput(originalTerm);
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

function persistAnswers(){
  try {
    const data = gather();
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch (error) {
    console.warn('[Persist Answers] 保存失败:', error);
  }
}

let answerSaveTimer = null;
function schedulePersistAnswers(){
  if (answerSaveTimer) clearTimeout(answerSaveTimer);
  answerSaveTimer = setTimeout(() => {
    answerSaveTimer = null;
    persistAnswers();
  }, 300);
}

// Auto-load if present
try {
  const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
  fill(saved);
} catch {}

listEl.addEventListener('input', (event) => {
  const target = event.target;
  if (target instanceof HTMLInputElement && target.dataset.term) {
    schedulePersistAnswers();
  }
});

document.getElementById('clear').addEventListener('click', ()=>{
  for (const term of VOCABS){
    const el = document.getElementById(makeId(term));
    if (el) el.value = '';
  }
  persistAnswers();
  toast('已清空输入', 'warn');
});


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
  const { apiUrl, apiKey, model } = getSavedAIConfig();

  if (!apiUrl || !apiKey) {
    alert('请先配置API地址和Key！\n\n点击"🤖 AI工具箱"按钮进行配置。');
    return;
  }

  aiIdentityCheckBtn.textContent = '🔍 检测中...';
  aiIdentityCheckBtn.disabled = true;

  try {
    const identity = await checkAIIdentityForDisplay(apiUrl, apiKey, model);
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
    const { apiUrl, apiKey, model } = getSavedAIConfig();

    if (!apiUrl || !apiKey) {
      aiConfigEl.style.display = 'block';
      toast('请填写API地址和Key', 'warn');
      return;
    }

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

    // Process in batches of 50
    const batchSize = 50;
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

  const message = result?.choices?.[0]?.message;
  if (!message) {
    console.error(`[Batch Grading] 响应格式异常:`, result);
    throw new Error('API响应格式异常');
  }

  const aiResponse = extractMessageText(message);
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
  const termsList = terms.map(term => {
    const contextRaw = TERM_CONTEXTS.get(term) || '（原文未提供语境）';
    const context = contextRaw.replace(/\s+/g, ' ').trim();
    const answer = data[term] && data[term].trim() ? data[term].trim() : '(空白)';
    return `- 英文词汇: ${term}\n  原文语境: ${context}\n  学生翻译: ${answer}`;
  }).join('\n');

  return `你是一名精通中英文术语的教师，需要判断学生给出的中文翻译与英文术语的语义相似度。请聚焦词义本身，不要贴合特定学科背景或冷僻知识。

请对每个词汇：
1. 给出最标准、最常用的中文翻译（可包含多个词，确保含义准确）。
2. 评估学生答案与标准答案在语义上的相似度，相似度用 0~1 的小数表示：0 代表完全错误，1 代表完全一致。允许保留三位小数。
   - 若学生答案涵盖了主要含义或提供了常见近义词，即使未列出全部释义，也应给予较高分（例如 ≥0.7）。
3. 如有需要，可给出简短说明（10~25个字），解释主要差异或匹配亮点。

在评估时请结合提供的原文语境理解术语的含义，以该语境为准判断学生翻译的准确度。

评分基准示例：
- 学生答案「极点」，标准答案「杆；极点；电极」→ 1.0 分（核心含义完全对应）
- 学生答案「烟」，标准答案「烟雾」→ 0.7 分（传达主要概念，细节略缺）
- 学生答案「平坦的」，标准答案「平原」→ 0.5 分（相关但偏向形容词，需要指出语义差异）

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

  const message = result?.choices?.[0]?.message;
  if (!message) {
    console.error('[AI Identity] 响应格式异常:', result);
    throw new Error('API响应格式异常');
  }

  const aiResponse = extractMessageText(message);
  if (!aiResponse) {
    console.error('[AI Identity] 未获得文本回复:', message);
    throw new Error('AI未返回文本信息');
  }
  console.log('[AI Identity] AI回复:', aiResponse);

  return aiResponse;
}

// No auto-initialization needed for AI identity check
