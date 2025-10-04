const F=localStorage.getItem("score-api-url")||"http://localhost:4000",p=document.getElementById("progress-status"),g=document.getElementById("progress-body"),P=document.getElementById("progress-search"),R=document.getElementById("score-filter"),j=document.getElementById("status-filter"),S=document.getElementById("refresh-progress"),x=document.querySelector(".progress-table thead"),v=document.getElementById("context-panel"),k=document.getElementById("context-title"),h=document.getElementById("context-list"),$=document.getElementById("context-empty"),A=document.getElementById("context-close"),H=document.getElementById("progress-summary");let m=[],N="order",y=!0;const b=new Map;let E="";function f(s,t="info"){p&&(p.classList.remove("ok","warn"),t==="ok"&&p.classList.add("ok"),t==="warn"&&p.classList.add("warn"),p.textContent=s||"")}function q(s){const t=Number(s);return Number.isFinite(t)?t===999?"999 (已掌握)":t.toFixed(2):"0.00"}function O(s){if(!s)return"-";const t=new Date(s);return Number.isNaN(t.getTime())?s:t.toLocaleString()}function T(s){const t=P.value.trim().toLowerCase(),o=Number(R.value),n=Number.isFinite(o),e=j.value,r=s.filter(a=>{const c=a.term||"",i=typeof a.meaning=="string"?a.meaning:"",u=Number(a.score)||0,d=Number(a.submissions)||0;return!(t&&!`${c} ${i}`.toLowerCase().includes(t)||n&&u>o||e==="fresh"&&d>0||e==="mastered"&&u!==999||e==="learning"&&(d===0||u>=999))});return z(r)}function z(s){const t=[...s],o=N,n=y?1:-1;return t.sort((e,r)=>{switch(o){case"term":return e.term.localeCompare(r.term,"en",{sensitivity:"base"})*n;case"meaning":{const a=typeof e.meaning=="string"?e.meaning:"",c=typeof r.meaning=="string"?r.meaning:"";return a.localeCompare(c,"zh",{sensitivity:"base"})*n}case"score":{const a=(Number(e.score)||0)-(Number(r.score)||0);return a===0?e.term.localeCompare(r.term)*n:a*n}case"submissions":{const a=(Number(e.submissions)||0)-(Number(r.submissions)||0);return a===0?e.term.localeCompare(r.term)*n:a*n}case"last_submission":{const a=M(e.last_submission),c=M(r.last_submission),i=a-c;return i===0?e.term.localeCompare(r.term)*n:i*n}case"order":default:{const a=(Number(e._order)||0)-(Number(r._order)||0);return a===0?e.term.localeCompare(r.term)*n:a*n}}}),t}function M(s){if(!s)return Number.NEGATIVE_INFINITY;const o=new Date(s).getTime();return Number.isNaN(o)?Number.NEGATIVE_INFINITY:o}function w(s){if(g){if(!s.length){g.innerHTML='<tr><td class="empty" colspan="7">未找到匹配的词汇。</td></tr>';return}g.innerHTML=s.map(t=>{const o=t.term||"",n=Number(t.score)||0,e=Number(t.submissions)||0,r=t.last_submission,a=Number(t._order),c=typeof t.meaning=="string"&&t.meaning.trim()?t.meaning.trim():"",d=(b.get(o)||[]).length>0?' <span class="context-indicator" title="查看最近语境">语境</span>':"",B=`<button type="button" class="term-context-btn" data-term="${l(o)}">${l(o)}${d}</button>`;return`
      <tr class="${n>=999?"status-mastered":e===0?"status-fresh":""}">
        <td>${Number.isFinite(a)?a+1:""}</td>
        <td>${B}</td>
        <td class="meaning-cell">${l(c||"—")}</td>
        <td>${q(n)}</td>
        <td>${e}</td>
        <td>${l(O(r))}</td>
        <td class="actions">
          <button data-term="${l(o)}" data-action="mastered" class="mark-btn mastered">标记已掌握</button>
          <button data-term="${l(o)}" data-action="reset" class="mark-btn reset">重置未练习</button>
        </td>
      </tr>
    `}).join("")}}function D(s){if(!H)return;const t=s.filter(c=>Number(c.submissions)>0),o=t.length,n=t.filter(c=>Number(c.score)<0).length,e=t.filter(c=>{const i=Number(c.score)||0;return i>=0&&i<2}).length,r=t.filter(c=>{const i=Number(c.score)||0;return i>=2&&i<999}).length,a=t.filter(c=>Number(c.score)>=999).length;H.innerHTML=`
    <div class="summary-item">
      <span class="summary-label">练习总数</span>
      <span class="summary-value">${o}</span>
    </div>
    <div class="summary-item">
      <span class="summary-label">分数 &lt; 0</span>
      <span class="summary-value">${n}</span>
    </div>
    <div class="summary-item">
      <span class="summary-label">0–2 分</span>
      <span class="summary-value">${e}</span>
    </div>
    <div class="summary-item">
      <span class="summary-label">≥ 2 分</span>
      <span class="summary-value">${r}</span>
    </div>
    <div class="summary-item">
      <span class="summary-label">已掌握</span>
      <span class="summary-value">${a}</span>
    </div>
  `}function l(s){return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}function _(s){const t=typeof s=="string"?s.trim():"";if(!t)return;const o=b.get(t)||[];if(!v||!k||!h){const e=o.length?o.map((r,a)=>`${a+1}. ${r.sentence}`).join(`
`):"暂无语境记录";alert(`「${t}」的最近语境：
${e}`);return}E=t,k.textContent=`「${t}」最近语境`,h.innerHTML="",$&&$.classList.add("hidden");const n=o.slice(0,3);if(!n.length)$?$.classList.remove("hidden"):h.innerHTML='<li class="empty">暂无语境记录</li>';else{const e=n.map((r,a)=>{const c=typeof r?.sentence=="string"?r.sentence:"",i=typeof r?.created_at=="string"?r.created_at:"",u=i?O(i):"",d=u?`<div class="context-meta">${l(u)}</div>`:"";return`
        <li>
          <div class="context-order">${a+1}.</div>
          <div class="context-sentence">${l(c)}</div>
          ${d}
        </li>
      `}).join("");h.innerHTML=e}v.classList.remove("hidden")}function G(){v&&(v.classList.add("hidden"),E="")}async function C(){try{f("正在加载词汇数据…","info");const s=`${F.replace(/\/$/,"")}/api/word-scores`,t=await fetch(s,{headers:{Accept:"application/json"}});if(!t.ok){const e=await t.text();throw new Error(`HTTP ${t.status} ${t.statusText}: ${e}`)}const o=await t.json(),n=Array.isArray(o.scores)?o.scores:[];b.clear(),n.forEach(e=>{if(!e||typeof e.term!="string")return;const r=e.term,a=Array.isArray(e.recent_contexts)?e.recent_contexts.slice(0,3):[];b.set(r,a)}),m=n.map((e,r)=>({...e,_order:r})),I(),w(T(m)),E&&_(E),f(`已加载 ${m.length} 个词汇`,"ok"),D(T(m))}catch(s){console.error("[Progress] 获取词汇失败",s),f(`加载失败：${s.message}`,"warn"),g.innerHTML='<tr><td class="empty" colspan="7">无法加载词汇数据。</td></tr>'}}async function V(s,t){try{f(`正在更新「${s}」…`,"info");const o=`${F.replace(/\/$/,"")}/api/word-status`,n=await fetch(o,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({term:s,action:t})});if(!n.ok){const r=await n.text();throw new Error(`HTTP ${n.status} ${n.statusText}: ${r}`)}const e=await n.json();if(e.record){const r=m.findIndex(c=>c.term===e.record.term);r>=0?m[r]={...e.record,_order:m[r]._order}:m.push({...e.record,_order:m.length});const a=Array.isArray(e.record.recent_contexts)?e.record.recent_contexts.slice(0,3):[];b.set(e.record.term,a),w(T(m)),E===e.record.term&&_(e.record.term),f(`已更新「${s}」`,"ok")}else await C()}catch(o){console.error("[Progress] 更新词汇失败",o),f(`更新失败：${o.message}`,"warn")}}function L(){const s=T(m);w(s),D(s)}P.addEventListener("input",L);R.addEventListener("keydown",s=>{s.key==="Enter"&&(s.preventDefault(),L())});j.addEventListener("change",L);x&&x.addEventListener("click",s=>{const t=s.target;if(!(t instanceof HTMLElement))return;const o=t.closest("th");if(!o)return;const n=o.dataset.sort;n&&(N===n?y=!y:(N=n,y=!0),I(),L())});function I(){if(!x)return;x.querySelectorAll("th").forEach(t=>{const o=t.dataset.sort;if(!o){t.classList.remove("sortable","active"),t.removeAttribute("data-indicator");return}t.classList.add("sortable"),o===N?(t.classList.add("active"),t.dataset.indicator=y?"↑":"↓"):(t.classList.remove("active"),t.dataset.indicator="")})}g.addEventListener("click",s=>{const t=s.target;if(!(t instanceof HTMLElement))return;const o=t.closest(".term-context-btn");if(o){const a=o.dataset.term;a&&_(a);return}const n=t.closest(".mark-btn");if(!n)return;const e=n.dataset.term,r=n.dataset.action;e&&r&&V(e,r)});S&&S.addEventListener("click",()=>{C()});A&&A.addEventListener("click",G);C();I();
