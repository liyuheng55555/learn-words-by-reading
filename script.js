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