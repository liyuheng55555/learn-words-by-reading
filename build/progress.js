import{e as m,f as D}from"./chunks/html.js";const j=localStorage.getItem("score-api-url")||"http://localhost:4000",y=document.getElementById("progress-status"),b=document.getElementById("progress-body"),G=document.getElementById("progress-search"),V=document.getElementById("score-filter"),W=document.getElementById("status-filter"),M=document.getElementById("refresh-progress"),x=document.querySelector(".progress-table thead"),C=document.getElementById("context-panel"),F=document.getElementById("context-title"),N=document.getElementById("context-list"),T=document.getElementById("context-empty"),R=document.getElementById("context-close"),O=document.getElementById("progress-summary"),u=document.getElementById("toggle-meaning"),P=document.querySelector(".progress-table"),$=document.querySelector(".progress-table table");let l=[],I="order",E=!0;const h=new Map;let v="",f=!0;function p(s,t="info"){y&&(y.classList.remove("ok","warn"),t==="ok"&&y.classList.add("ok"),t==="warn"&&y.classList.add("warn"),y.textContent=s||"")}function Y(s){const t=Number(s);return Number.isFinite(t)?t===999?"999 (已掌握)":t.toFixed(2):"0.00"}function z(s){if(!s)return"-";const t=new Date(s);return Number.isNaN(t.getTime())?s:t.toLocaleString()}function _(s){const t=G.value.trim().toLowerCase(),n=Number(V.value),e=Number.isFinite(n),r=W.value,a=s.filter(o=>{const c=o.term||"",i=typeof o.meaning=="string"?o.meaning:"",d=Number(o.score)||0,g=Number(o.submissions)||0;return!(t&&!`${c} ${i}`.toLowerCase().includes(t)||e&&d>n||r==="fresh"&&g>0||r==="mastered"&&d!==999||r==="learning"&&(g===0||d>=999))});return K(a)}function K(s){const t=[...s],n=I,e=E?1:-1;return t.sort((r,a)=>{switch(n){case"term":return r.term.localeCompare(a.term,"en",{sensitivity:"base"})*e;case"meaning":{const o=typeof r.meaning=="string"?r.meaning:"",c=typeof a.meaning=="string"?a.meaning:"";return o.localeCompare(c,"zh",{sensitivity:"base"})*e}case"score":{const o=(Number(r.score)||0)-(Number(a.score)||0);return o===0?r.term.localeCompare(a.term)*e:o*e}case"submissions":{const o=(Number(r.submissions)||0)-(Number(a.submissions)||0);return o===0?r.term.localeCompare(a.term)*e:o*e}case"last_submission":{const o=q(r.last_submission),c=q(a.last_submission),i=o-c;return i===0?r.term.localeCompare(a.term)*e:i*e}case"order":default:{const o=(Number(r._order)||0)-(Number(a._order)||0);return o===0?r.term.localeCompare(a.term)*e:o*e}}}),t}function q(s){if(!s)return Number.NEGATIVE_INFINITY;const n=new Date(s).getTime();return Number.isNaN(n)?Number.NEGATIVE_INFINITY:n}function S(){const s=!f;if(P&&P.classList.toggle("hide-meaning",s),$){$.classList.toggle("hide-meaning",s);const t=$.querySelector("th.meaning-col");t instanceof HTMLElement&&(t.style.display=s?"none":""),$.querySelectorAll("td.meaning-cell").forEach(e=>{e instanceof HTMLElement&&(e.style.display=s?"none":"")})}u&&u.checked!==f&&(u.checked=f)}function B(s){if(b){if(!s.length){b.innerHTML='<tr><td class="empty" colspan="7">未找到匹配的词汇。</td></tr>',S();return}b.innerHTML=s.map(t=>{const n=t.term||"",e=Number(t.score)||0,r=Number(t.submissions)||0,a=t.last_submission,o=Number(t._order),c=typeof t.meaning=="string"&&t.meaning.trim()?t.meaning.trim():"",g=(h.get(n)||[]).length>0?' <span class="context-indicator" title="查看最近语境">语境</span>':"",H=`<button type="button" class="term-context-btn" data-term="${m(n)}">${m(n)}${g}</button>`,X=f?m(c||"—"):"";return`
      <tr class="${e>=999?"status-mastered":r===0?"status-fresh":""}">
        <td>${Number.isFinite(o)?o+1:""}</td>
        <td>${H}</td>
        <td class="meaning-cell"${f?"":' style="display:none"'}>${X}</td>
        <td>${Y(e)}</td>
        <td>${r}</td>
        <td>${m(z(a))}</td>
        <td class="actions">
          <button data-term="${m(n)}" data-action="mastered" class="mark-btn mastered">标记已掌握</button>
          <button data-term="${m(n)}" data-action="reset" class="mark-btn reset">重置未练习</button>
        </td>
      </tr>
    `}).join(""),S()}}function J(s){if(!O)return;const t=s.filter(c=>Number(c.submissions)>0),n=t.length,e=t.filter(c=>Number(c.score)<0).length,r=t.filter(c=>{const i=Number(c.score)||0;return i>=0&&i<2}).length,a=t.filter(c=>{const i=Number(c.score)||0;return i>=2&&i<999}).length,o=t.filter(c=>Number(c.score)>=999).length;O.innerHTML=`
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
  `}function k(s){const t=typeof s=="string"?s.trim():"";if(!t)return;const n=h.get(t)||[];if(!C||!F||!N){const r=n.length?n.map((a,o)=>`${o+1}. ${a.sentence}`).join(`
`):"暂无语境记录";alert(`「${t}」的最近语境：
${r}`);return}v=t,F.textContent=`「${t}」最近语境`,N.innerHTML="",T&&T.classList.add("hidden");const e=n.slice(0,3);if(!e.length)T?T.classList.remove("hidden"):N.innerHTML='<li class="empty">暂无语境记录</li>';else{const r=e.map((a,o)=>{const c=typeof a?.sentence=="string"?a.sentence:"",i=typeof a?.created_at=="string"?a.created_at:"",d=i?z(i):"",g=d?`<div class="context-meta">${m(d)}</div>`:"";return`
        <li>
          <div class="context-order">${o+1}.</div>
          <div class="context-sentence">${m(c)}</div>
          ${g}
        </li>
      `}).join("");N.innerHTML=r}C.classList.remove("hidden")}function U(){C&&(C.classList.add("hidden"),v="")}async function w(){try{p("正在加载词汇数据…","info");const s=`${j.replace(/\/$/,"")}/api/word-scores`,t=await D(s),n=Array.isArray(t?.scores)?t.scores:[];h.clear(),n.forEach(e=>{if(!e||typeof e.term!="string")return;const r=e.term,a=Array.isArray(e.recent_contexts)?e.recent_contexts.slice(0,3):[];h.set(r,a)}),l=n.map((e,r)=>({...e,_order:r})),A(),B(_(l)),v&&k(v),p(`已加载 ${l.length} 个词汇`,"ok"),J(_(l))}catch(s){console.error("[Progress] 获取词汇失败",s),p(`加载失败：${s.message}`,"warn"),b.innerHTML='<tr><td class="empty" colspan="7">无法加载词汇数据。</td></tr>'}}async function Z(s,t){try{p(`正在更新「${s}」…`,"info");const n=`${j.replace(/\/$/,"")}/api/word-status`,e=await D(n,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({term:s,action:t})});if(e?.record){const r=l.findIndex(o=>o.term===e.record.term);r>=0?l[r]={...e.record,_order:l[r]._order}:l.push({...e.record,_order:l.length});const a=Array.isArray(e.record.recent_contexts)?e.record.recent_contexts.slice(0,3):[];h.set(e.record.term,a),B(_(l)),v===e.record.term&&k(e.record.term),p(`已更新「${s}」`,"ok")}else await w()}catch(n){console.error("[Progress] 更新词汇失败",n),p(`更新失败：${n.message}`,"warn")}}function L(){const s=_(l);B(s),J(s)}u&&(f=!!u.checked,S(),u.addEventListener("change",()=>{f=u.checked,S(),L()}));G.addEventListener("input",L);V.addEventListener("keydown",s=>{s.key==="Enter"&&(s.preventDefault(),L())});W.addEventListener("change",L);x&&x.addEventListener("click",s=>{const t=s.target;if(!(t instanceof HTMLElement))return;const n=t.closest("th");if(!n)return;const e=n.dataset.sort;e&&(I===e?E=!E:(I=e,E=!0),A(),L())});function A(){if(!x)return;x.querySelectorAll("th").forEach(t=>{const n=t.dataset.sort;if(!n){t.classList.remove("sortable","active"),t.removeAttribute("data-indicator");return}t.classList.add("sortable"),n===I?(t.classList.add("active"),t.dataset.indicator=E?"↑":"↓"):(t.classList.remove("active"),t.dataset.indicator="")})}b.addEventListener("click",s=>{const t=s.target;if(!(t instanceof HTMLElement))return;const n=t.closest(".term-context-btn");if(n){const o=n.dataset.term;o&&k(o);return}const e=t.closest(".mark-btn");if(!e)return;const r=e.dataset.term,a=e.dataset.action;r&&a&&Z(r,a)});M&&M.addEventListener("click",()=>{w()});R&&R.addEventListener("click",U);w();A();
