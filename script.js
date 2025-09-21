// --- Vocabulary source list (unique, in requested order) ---
// This will be dynamically populated based on uploaded article
let VOCABS = [];

const listEl = document.getElementById('list');
const filterEl = document.getElementById('filter');

// File upload elements
const fileInput = document.getElementById('article-file');
const uploadBtn = document.getElementById('upload-btn');
const uploadStatus = document.getElementById('upload-status');
const articleContent = document.getElementById('article-content');
const uploadSection = document.getElementById('upload-section');

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

// File upload handling
function handleFileUpload(file) {
  if (!file) {
    uploadStatus.textContent = '请选择一个文件';
    return;
  }

  const reader = new FileReader();
  reader.onload = function(e) {
    const content = e.target.result;
    processArticleContent(content);
  };
  reader.onerror = function() {
    uploadStatus.textContent = '文件读取失败';
  };
  reader.readAsText(file, 'UTF-8');
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

    // Show article content and hide upload section
    uploadSection.style.display = 'none';
    articleContent.style.display = 'block';

    // Rebuild vocabulary list
    buildList();

    uploadStatus.textContent = '文章上传成功！';
    uploadStatus.style.color = 'var(--ok)';
  } catch (error) {
    uploadStatus.textContent = '处理文章内容时出错: ' + error.message;
    uploadStatus.style.color = 'var(--warn)';
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
    const vocabSet = new Set();
    matches.forEach(match => {
      // Remove ** and trim whitespace
      const word = match.replace(/\*\*/g, '').trim();
      if (word) {
        vocabSet.add(word);
      }
    });

    // Convert set to array and sort
    VOCABS = Array.from(vocabSet).sort();
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

// Event listeners for file upload
uploadBtn.addEventListener('click', () => {
  handleFileUpload(fileInput.files[0]);
});

fileInput.addEventListener('change', () => {
  if (fileInput.files.length > 0) {
    uploadStatus.textContent = '已选择文件: ' + fileInput.files[0].name;
    uploadStatus.style.color = 'var(--text)';
  }
});

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
  const rows = [["English","Chinese"]];
  for (const term of VOCABS){
    rows.push([term, (data[term] || '').replaceAll('\n',' ').trim()]);
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
    // Load saved API settings
    const savedApiUrl = localStorage.getItem('ai-api-url');
    const savedApiKey = localStorage.getItem('ai-api-key');
    const savedModel = localStorage.getItem('ai-model') || 'gpt-3.5-turbo';
    if (savedApiUrl) document.getElementById('api-url').value = savedApiUrl;
    if (savedApiKey) document.getElementById('api-key').value = savedApiKey;
    document.getElementById('ai-model').value = savedModel;
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
    alert('请先配置API地址和Key！\n\n点击"🤖 AI判题"按钮进行配置。');
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

document.getElementById('start-grade').addEventListener('click', async () => {
  const apiUrl = document.getElementById('api-url').value.trim();
  const apiKey = document.getElementById('api-key').value.trim();
  const model = document.getElementById('ai-model').value.trim() || 'gpt-3.5-turbo';

  if (!apiUrl || !apiKey) {
    toast('请填写API地址和Key', 'warn');
    return;
  }

  // Save API settings
  localStorage.setItem('ai-api-url', apiUrl);
  localStorage.setItem('ai-api-key', apiKey);
  localStorage.setItem('ai-model', model);

  await startAIGrading(apiUrl, apiKey, model);
});

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

  } catch (error) {
    console.error('[Main Grading] 判题过程错误:', error);
    toast('判题过程中出现错误: ' + error.message, 'warn');
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

// Create grading prompt for AI
function createGradingPrompt(terms, data) {
  const termsList = terms.map(term => `${term}: ${data[term]}`).join('\n');

  return `请判断以下英文地学词汇的中文翻译是否正确，并提供正确答案。对于每个词汇，如果翻译基本正确（意思对，允许轻微的用词差异），请回答"正确"；如果翻译明显错误或不相关，请回答"错误"。

无论正确与否，都请提供标准的中文翻译。

词汇列表：
${termsList}

请严格按照以下JSON格式回答，不要添加任何其他内容：
{
  "词汇1": {
    "判断": "正确",
    "正确答案": "标准中文翻译"
  },
  "词汇2": {
    "判断": "错误",
    "正确答案": "标准中文翻译"
  },
  ...
}`;
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

      if (parsed[term]) {
        const termData = parsed[term];
        console.log(`[Parse Response] ${term} 的数据:`, termData);

        if (typeof termData === 'object') {
          // New format with correct answer
          const isCorrect = termData['判断'] === '正确';
          const correctAnswer = termData['正确答案'];
          results[term] = {
            isCorrect: isCorrect,
            correctAnswer: correctAnswer
          };
          console.log(`[Parse Response] ${term} 新格式解析 - 正确性: ${isCorrect}, 答案: ${correctAnswer}`);
        } else {
          // Old format - just boolean
          const isCorrect = termData === '正确';
          results[term] = {
            isCorrect: isCorrect,
            correctAnswer: null
          };
          console.log(`[Parse Response] ${term} 旧格式解析 - 正确性: ${isCorrect}`);
        }
      } else {
        console.log(`[Parse Response] ${term} 未在解析结果中找到，使用fallback`);
        // Fallback: check if the response contains the term and result
        const termResult = aiResponse.toLowerCase().includes(term.toLowerCase()) &&
                          aiResponse.toLowerCase().includes('正确');
        results[term] = {
          isCorrect: termResult,
          correctAnswer: null
        };
        console.log(`[Parse Response] ${term} fallback解析 - 正确性: ${termResult}`);
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
      const isCorrect = responseLower.includes(termLower) && responseLower.includes('正确');
      results[term] = {
        isCorrect: isCorrect,
        correctAnswer: null
      };
      console.log(`[Parse Response] ${term} fallback结果 - 正确性: ${isCorrect}`);
    });

    console.log(`[Parse Response] Fallback最终结果:`, results);
    return results;
  }
}

// Display grading results
function displayGradingResults(results, totalCount) {
  const correctCount = Object.values(results).filter(r => r.isCorrect).length;

  // Update score summary
  scoreSummaryEl.innerHTML = `
    <div>判题完成！</div>
    <div style="margin-top: 8px; font-size: 20px;">
      正确: <span style="color: var(--ok)">${correctCount}</span> /
      总数: <span style="color: var(--text)">${totalCount}</span>
      <span style="color: var(--accent); margin-left: 12px;">
        (${Math.round(correctCount / totalCount * 100)}%)
      </span>
    </div>
  `;

  // Update individual items
  Object.entries(results).forEach(([term, result]) => {
    const itemEl = document.querySelector(`[data-term="${term}"]`)?.closest('.item');
    if (itemEl) {
      itemEl.classList.remove('correct', 'incorrect');
      itemEl.classList.add(result.isCorrect ? 'correct' : 'incorrect');

      // Add grade indicator
      const termEl = itemEl.querySelector('.term');
      let indicator = termEl.querySelector('.grade-indicator');
      if (!indicator) {
        indicator = document.createElement('span');
        indicator.className = 'grade-indicator';
        termEl.appendChild(indicator);
      }
      indicator.className = `grade-indicator ${result.isCorrect ? 'correct' : 'incorrect'}`;
      indicator.textContent = result.isCorrect ? '✓' : '✗';

      // Add correct answer if available
      let correctAnswerEl = itemEl.querySelector('.correct-answer');
      if (result.correctAnswer) {
        if (!correctAnswerEl) {
          correctAnswerEl = document.createElement('div');
          correctAnswerEl.className = 'correct-answer';
          itemEl.appendChild(correctAnswerEl);
        }
        correctAnswerEl.innerHTML = `<strong>正确答案:</strong> ${result.correctAnswer}`;
      } else if (correctAnswerEl) {
        correctAnswerEl.remove();
      }
    }
  });

  aiResultsEl.style.display = 'block';
  aiConfigEl.style.display = 'none';

  toast(`判题完成！正确率: ${Math.round(correctCount / totalCount * 100)}%`, 'ok');
}

// Clear previous grading results
function clearGradingResults() {
  document.querySelectorAll('.item').forEach(item => {
    item.classList.remove('correct', 'incorrect');
    const indicator = item.querySelector('.grade-indicator');
    if (indicator) indicator.remove();
    const correctAnswer = item.querySelector('.correct-answer');
    if (correctAnswer) correctAnswer.remove();
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