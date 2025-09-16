// --- Vocabulary source list (unique, in requested order) ---
const VOCABS = [
  "atmosphere","hydrosphere","lithosphere","oxygen","oxide","carbon dioxide","hydrogen","core","crust","mantle","longitude","latitude","horizon","altitude","disaster","mishap","catastrophic","calamity","endanger","jeopardise/jeopardize","destructive","El Nino","greenhouse","phenomenon","pebble","magnet","ore","mineral","marble","quartz","granite","gust","breeze","monsoon","gale","hurricane","tornado","typhoon","volcano","erupt","magma","thermodynamic","smog","fume","mist","tsunami","drought","flooding","torrent"
];

const listEl = document.getElementById('list');
const filterEl = document.getElementById('filter');

// Build items
function makeId(term){
  return 'term-' + term.toLowerCase().replace(/[^a-z0-9]+/g,'-');
}

function jumpTo(term){
  // Try by dedicated anchor id first
  const byId = document.getElementById('t-' + term.toLowerCase().replace(/[^a-z0-9]+/g,'-'));
  if (byId) { byId.scrollIntoView({behavior:'smooth', block:'center'}); highlight(byId); return; }
  // Fallback: search first <strong> whose text includes the term case-insensitively
  const strongs = document.querySelectorAll('#article strong');
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

// Function to find term by id fragment
function findTermByIdFragment(idFragment){
  for (const term of VOCABS) {
    const expectedId = term.toLowerCase().replace(/[^a-z0-9]+/g,'-');
    if (expectedId === idFragment) return term;
  }
  return null;
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
document.getElementById('article').addEventListener('click', (e)=>{
  if (e.target.tagName === 'STRONG' && e.target.id) {
    // Extract term from id (remove 't-' prefix and convert back)
    const termId = e.target.id.replace(/^t-/, '');
    const term = findTermByIdFragment(termId);
    if (term) {
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

// AI Grading Event Listeners
document.getElementById('ai-grade').addEventListener('click', () => {
  if (aiConfigEl.style.display === 'none') {
    aiConfigEl.style.display = 'block';
    // Load saved API settings
    const savedApiUrl = localStorage.getItem('ai-api-url');
    const savedApiKey = localStorage.getItem('ai-api-key');
    if (savedApiUrl) document.getElementById('api-url').value = savedApiUrl;
    if (savedApiKey) document.getElementById('api-key').value = savedApiKey;
  } else {
    aiConfigEl.style.display = 'none';
  }
});

document.getElementById('cancel-grade').addEventListener('click', () => {
  aiConfigEl.style.display = 'none';
  gradingInProgress = false;
});

document.getElementById('start-grade').addEventListener('click', async () => {
  const apiUrl = document.getElementById('api-url').value.trim();
  const apiKey = document.getElementById('api-key').value.trim();

  if (!apiUrl || !apiKey) {
    toast('请填写API地址和Key', 'warn');
    return;
  }

  // Save API settings
  localStorage.setItem('ai-api-url', apiUrl);
  localStorage.setItem('ai-api-key', apiKey);

  await startAIGrading(apiUrl, apiKey);
});

// Main AI grading function
async function startAIGrading(apiUrl, apiKey) {
  if (gradingInProgress) return;

  gradingInProgress = true;
  aiProgressEl.style.display = 'block';
  aiResultsEl.style.display = 'none';

  // Clear previous results
  clearGradingResults();

  try {
    const data = gather();
    const filledTerms = VOCABS.filter(term => data[term] && data[term].trim());

    if (filledTerms.length === 0) {
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

    let totalProcessed = 0;
    const results = {};

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      progressTextEl.textContent = `正在处理第${i+1}/${batches.length}批 (${batch.length}个词)...`;

      try {
        const batchResults = await gradeBatch(batch, data, apiUrl, apiKey);
        Object.assign(results, batchResults);
        totalProcessed += batch.length;

        const progress = (totalProcessed / filledTerms.length) * 100;
        progressFillEl.style.width = progress + '%';

        // Small delay between batches to avoid rate limiting
        if (i < batches.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } catch (error) {
        toast(`第${i+1}批处理失败: ${error.message}`, 'warn');
      }
    }

    // Display results
    displayGradingResults(results, filledTerms.length);

  } catch (error) {
    toast('判题过程中出现错误: ' + error.message, 'warn');
  } finally {
    gradingInProgress = false;
    aiProgressEl.style.display = 'none';
  }
}

// Grade a batch of words
async function gradeBatch(terms, data, apiUrl, apiKey) {
  const prompt = createGradingPrompt(terms, data);

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-3.5-turbo',
      messages: [{
        role: 'user',
        content: prompt
      }],
      temperature: 0.1
    })
  });

  if (!response.ok) {
    throw new Error(`API请求失败: ${response.status} ${response.statusText}`);
  }

  const result = await response.json();
  const aiResponse = result.choices[0].message.content;

  return parseGradingResponse(aiResponse, terms);
}

// Create grading prompt for AI
function createGradingPrompt(terms, data) {
  const termsList = terms.map(term => `${term}: ${data[term]}`).join('\n');

  return `请判断以下英文地学词汇的中文翻译是否正确。对于每个词汇，如果翻译基本正确（意思对，允许轻微的用词差异），请回答"正确"；如果翻译明显错误或不相关，请回答"错误"。

词汇列表：
${termsList}

请严格按照以下JSON格式回答，不要添加任何其他内容：
{
  "词汇1": "正确",
  "词汇2": "错误",
  ...
}`;
}

// Parse AI grading response
function parseGradingResponse(aiResponse, terms) {
  try {
    // Extract JSON from response
    const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('无法解析AI回复格式');
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const results = {};

    terms.forEach(term => {
      if (parsed[term]) {
        results[term] = parsed[term] === '正确';
      } else {
        // Fallback: check if the response contains the term and result
        const termResult = aiResponse.toLowerCase().includes(term.toLowerCase()) &&
                          aiResponse.toLowerCase().includes('正确');
        results[term] = termResult;
      }
    });

    return results;
  } catch (error) {
    // Fallback parsing if JSON parsing fails
    const results = {};
    terms.forEach(term => {
      const termLower = term.toLowerCase();
      const responseLower = aiResponse.toLowerCase();
      const isCorrect = responseLower.includes(termLower) && responseLower.includes('正确');
      results[term] = isCorrect;
    });
    return results;
  }
}

// Display grading results
function displayGradingResults(results, totalCount) {
  const correctCount = Object.values(results).filter(Boolean).length;

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
  Object.entries(results).forEach(([term, isCorrect]) => {
    const itemEl = document.querySelector(`[data-term="${term}"]`)?.closest('.item');
    if (itemEl) {
      itemEl.classList.remove('correct', 'incorrect');
      itemEl.classList.add(isCorrect ? 'correct' : 'incorrect');

      // Add grade indicator
      const termEl = itemEl.querySelector('.term');
      let indicator = termEl.querySelector('.grade-indicator');
      if (!indicator) {
        indicator = document.createElement('span');
        indicator.className = 'grade-indicator';
        termEl.appendChild(indicator);
      }
      indicator.className = `grade-indicator ${isCorrect ? 'correct' : 'incorrect'}`;
      indicator.textContent = isCorrect ? '✓' : '✗';
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
  });
}