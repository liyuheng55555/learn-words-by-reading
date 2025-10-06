import{e as l,f as F}from"./chunks/html.js";const R=localStorage.getItem("score-api-url")||"http://localhost:4000",p=document.getElementById("progress-status"),g=document.getElementById("progress-body"),P=document.getElementById("progress-search"),O=document.getElementById("score-filter"),D=document.getElementById("status-filter"),S=document.getElementById("refresh-progress"),N=document.querySelector(".progress-table thead"),$=document.getElementById("context-panel"),A=document.getElementById("context-title"),h=document.getElementById("context-list"),v=document.getElementById("context-empty"),k=document.getElementById("context-close"),H=document.getElementById("progress-summary");let m=[],x="order",y=!0;const b=new Map;let E="";function f(s,t="info"){p&&(p.classList.remove("ok","warn"),t==="ok"&&p.classList.add("ok"),t==="warn"&&p.classList.add("warn"),p.textContent=s||"")}function z(s){const t=Number(s);return Number.isFinite(t)?t===999?"999 (已掌握)":t.toFixed(2):"0.00"}function j(s){if(!s)return"-";const t=new Date(s);return Number.isNaN(t.getTime())?s:t.toLocaleString()}function L(s){const t=P.value.trim().toLowerCase(),n=Number(O.value),e=Number.isFinite(n),r=D.value,a=s.filter(o=>{const c=o.term||"",i=typeof o.meaning=="string"?o.meaning:"",u=Number(o.score)||0,d=Number(o.submissions)||0;return!(t&&!`${c} ${i}`.toLowerCase().includes(t)||e&&u>n||r==="fresh"&&d>0||r==="mastered"&&u!==999||r==="learning"&&(d===0||u>=999))});return G(a)}function G(s){const t=[...s],n=x,e=y?1:-1;return t.sort((r,a)=>{switch(n){case"term":return r.term.localeCompare(a.term,"en",{sensitivity:"base"})*e;case"meaning":{const o=typeof r.meaning=="string"?r.meaning:"",c=typeof a.meaning=="string"?a.meaning:"";return o.localeCompare(c,"zh",{sensitivity:"base"})*e}case"score":{const o=(Number(r.score)||0)-(Number(a.score)||0);return o===0?r.term.localeCompare(a.term)*e:o*e}case"submissions":{const o=(Number(r.submissions)||0)-(Number(a.submissions)||0);return o===0?r.term.localeCompare(a.term)*e:o*e}case"last_submission":{const o=M(r.last_submission),c=M(a.last_submission),i=o-c;return i===0?r.term.localeCompare(a.term)*e:i*e}case"order":default:{const o=(Number(r._order)||0)-(Number(a._order)||0);return o===0?r.term.localeCompare(a.term)*e:o*e}}}),t}function M(s){if(!s)return Number.NEGATIVE_INFINITY;const n=new Date(s).getTime();return Number.isNaN(n)?Number.NEGATIVE_INFINITY:n}function _(s){if(g){if(!s.length){g.innerHTML='<tr><td class="empty" colspan="7">未找到匹配的词汇。</td></tr>';return}g.innerHTML=s.map(t=>{const n=t.term||"",e=Number(t.score)||0,r=Number(t.submissions)||0,a=t.last_submission,o=Number(t._order),c=typeof t.meaning=="string"&&t.meaning.trim()?t.meaning.trim():"",d=(b.get(n)||[]).length>0?' <span class="context-indicator" title="查看最近语境">语境</span>':"",B=`<button type="button" class="term-context-btn" data-term="${l(n)}">${l(n)}${d}</button>`;return`
      <tr class="${e>=999?"status-mastered":r===0?"status-fresh":""}">
        <td>${Number.isFinite(o)?o+1:""}</td>
        <td>${B}</td>
        <td class="meaning-cell">${l(c||"—")}</td>
        <td>${z(e)}</td>
        <td>${r}</td>
        <td>${l(j(a))}</td>
        <td class="actions">
          <button data-term="${l(n)}" data-action="mastered" class="mark-btn mastered">标记已掌握</button>
          <button data-term="${l(n)}" data-action="reset" class="mark-btn reset">重置未练习</button>
        </td>
      </tr>
    `}).join("")}}function q(s){if(!H)return;const t=s.filter(c=>Number(c.submissions)>0),n=t.length,e=t.filter(c=>Number(c.score)<0).length,r=t.filter(c=>{const i=Number(c.score)||0;return i>=0&&i<2}).length,a=t.filter(c=>{const i=Number(c.score)||0;return i>=2&&i<999}).length,o=t.filter(c=>Number(c.score)>=999).length;H.innerHTML=`
    <div class="summary-item">
      <span class="summary-label">练习总数</span>
      <span class="summary-value">${n}</span>
    </div>
    <div class="summary-item">
      <span class="summary-label">分数 &lt; 0</span>
      <span class="summary-value">${e}</span>
    </div>
    <div class="summary-item">
      <span class="summary-label">0–2 分</span>
      <span class="summary-value">${r}</span>
    </div>
    <div class="summary-item">
      <span class="summary-label">≥ 2 分</span>
      <span class="summary-value">${a}</span>
    </div>
    <div class="summary-item">
      <span class="summary-label">已掌握</span>
      <span class="summary-value">${o}</span>
    </div>
  `}function C(s){const t=typeof s=="string"?s.trim():"";if(!t)return;const n=b.get(t)||[];if(!$||!A||!h){const r=n.length?n.map((a,o)=>`${o+1}. ${a.sentence}`).join(`
`):"暂无语境记录";alert(`「${t}」的最近语境：
${r}`);return}E=t,A.textContent=`「${t}」最近语境`,h.innerHTML="",v&&v.classList.add("hidden");const e=n.slice(0,3);if(!e.length)v?v.classList.remove("hidden"):h.innerHTML='<li class="empty">暂无语境记录</li>';else{const r=e.map((a,o)=>{const c=typeof a?.sentence=="string"?a.sentence:"",i=typeof a?.created_at=="string"?a.created_at:"",u=i?j(i):"",d=u?`<div class="context-meta">${l(u)}</div>`:"";return`
        <li>
          <div class="context-order">${o+1}.</div>
          <div class="context-sentence">${l(c)}</div>
          ${d}
        </li>
      `}).join("");h.innerHTML=r}$.classList.remove("hidden")}function J(){$&&($.classList.add("hidden"),E="")}async function I(){try{f("正在加载词汇数据…","info");const s=`${R.replace(/\/$/,"")}/api/word-scores`,t=await F(s),n=Array.isArray(t?.scores)?t.scores:[];b.clear(),n.forEach(e=>{if(!e||typeof e.term!="string")return;const r=e.term,a=Array.isArray(e.recent_contexts)?e.recent_contexts.slice(0,3):[];b.set(r,a)}),m=n.map((e,r)=>({...e,_order:r})),w(),_(L(m)),E&&C(E),f(`已加载 ${m.length} 个词汇`,"ok"),q(L(m))}catch(s){console.error("[Progress] 获取词汇失败",s),f(`加载失败：${s.message}`,"warn"),g.innerHTML='<tr><td class="empty" colspan="7">无法加载词汇数据。</td></tr>'}}async function V(s,t){try{f(`正在更新「${s}」…`,"info");const n=`${R.replace(/\/$/,"")}/api/word-status`,e=await F(n,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({term:s,action:t})});if(e?.record){const r=m.findIndex(o=>o.term===e.record.term);r>=0?m[r]={...e.record,_order:m[r]._order}:m.push({...e.record,_order:m.length});const a=Array.isArray(e.record.recent_contexts)?e.record.recent_contexts.slice(0,3):[];b.set(e.record.term,a),_(L(m)),E===e.record.term&&C(e.record.term),f(`已更新「${s}」`,"ok")}else await I()}catch(n){console.error("[Progress] 更新词汇失败",n),f(`更新失败：${n.message}`,"warn")}}function T(){const s=L(m);_(s),q(s)}P.addEventListener("input",T);O.addEventListener("keydown",s=>{s.key==="Enter"&&(s.preventDefault(),T())});D.addEventListener("change",T);N&&N.addEventListener("click",s=>{const t=s.target;if(!(t instanceof HTMLElement))return;const n=t.closest("th");if(!n)return;const e=n.dataset.sort;e&&(x===e?y=!y:(x=e,y=!0),w(),T())});function w(){if(!N)return;N.querySelectorAll("th").forEach(t=>{const n=t.dataset.sort;if(!n){t.classList.remove("sortable","active"),t.removeAttribute("data-indicator");return}t.classList.add("sortable"),n===x?(t.classList.add("active"),t.dataset.indicator=y?"↑":"↓"):(t.classList.remove("active"),t.dataset.indicator="")})}g.addEventListener("click",s=>{const t=s.target;if(!(t instanceof HTMLElement))return;const n=t.closest(".term-context-btn");if(n){const o=n.dataset.term;o&&C(o);return}const e=t.closest(".mark-btn");if(!e)return;const r=e.dataset.term,a=e.dataset.action;r&&a&&V(r,a)});S&&S.addEventListener("click",()=>{I()});k&&k.addEventListener("click",J);I();w();
