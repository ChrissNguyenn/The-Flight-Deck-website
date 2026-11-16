import{w as m}from"./excel-BXKsL7fN.js";const h="\uFEFF";function p(e){return e==null?null:typeof e=="number"||typeof e=="boolean"||typeof e=="string"?e:Array.isArray(e)?e.join(", "):JSON.stringify(e)}const c=e=>e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");function y(e,t){const a=new Set(e.columns.filter(o=>e.rows.length>0&&e.rows.every(r=>r[o.key]===null||r[o.key]===void 0||typeof r[o.key]=="number")).map(o=>o.key)),n=(o,r)=>{const i=r==null?"":typeof r=="number"?r.toLocaleString("vi-VN"):String(p(r));return`<td${a.has(o.key)?' class="n"':""}>${c(i)}</td>`};return`<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>${c(e.title)}</title><style>
@page { size: A4 landscape; margin: 12mm 10mm 14mm; }
body { font: 9pt "Be Vietnam Pro", "Segoe UI", Arial, sans-serif; color: #1B2531; margin: 0; }
h1 { font: 600 15pt Georgia, "Times New Roman", serif; color: #0D2440; margin: 0 0 2pt; }
.sub { color: #5E6D7E; margin: 0 0 8pt; }
table { width: 100%; border-collapse: collapse; }
thead { display: table-header-group; }
th { background: #F1ECE0; color: #0D2440; text-align: left; font-weight: 600; }
th, td { border: 0.5pt solid #D5CEBE; padding: 3pt 4pt; vertical-align: top; }
td.n { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
tr { page-break-inside: avoid; }
footer { margin-top: 6pt; color: #5E6D7E; font-size: 8pt; }
</style></head><body>
<h1>${c(e.title)}</h1><p class="sub">${c(e.subtitle)} · ${e.rows.length} dòng</p>
<table><thead><tr>${e.columns.map(o=>`<th>${c(o.label)}</th>`).join("")}</tr></thead>
<tbody>${e.rows.map(o=>`<tr>${e.columns.map(r=>n(r,o[r.key])).join("")}</tr>`).join(`
`)}</tbody></table>
<footer>The Flight Deck · xuất từ App Admin lúc ${c(t)}</footer>
</body></html>`}function b(e){const t=document.createElement("iframe");t.setAttribute("aria-hidden","true"),t.style.cssText="position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden",t.srcdoc=e,t.onload=()=>{t.contentWindow?.focus(),t.contentWindow?.print(),setTimeout(()=>t.remove(),6e4)},document.body.appendChild(t)}function w(e,t){const a=URL.createObjectURL(t),n=document.createElement("a");n.href=a,n.download=e,document.body.appendChild(n),n.click(),n.remove(),setTimeout(()=>URL.revokeObjectURL(a),2e3)}const f=e=>{if(e==null)return"";const t=e instanceof Date?e.toISOString():String(e);return/[",\r\n]/.test(t)||/^[=+\-@]/.test(t)?`"${(/^[=+\-@]/.test(t)?`'${t}`:t).replace(/"/g,'""')}"`:t};function k(e,t){const a=[e.map(n=>f(n.label)).join(",")];for(const n of t)a.push(e.map(o=>f(p(n[o.key]))).join(","));return`\uFEFF${a.join(`\r
`)}\r
`}async function E(e,t,a,n){const o=a.map(i=>({value:i.label,fontWeight:"bold",backgroundColor:"#F1ECE0"})),r=n.map(i=>a.map(d=>({value:p(i[d.key])??void 0})));await m([o,...r],{sheet:t.slice(0,31),stickyRowsCount:1,columns:a.map(i=>({width:Math.min(40,Math.max(10,i.label.length+2))})),fontFamily:"Arial"}).toFile(e)}function u(e){return typeof e.arrayBuffer=="function"?e.arrayBuffer():new Promise((t,a)=>{const n=new FileReader;n.onload=()=>t(n.result),n.onerror=()=>a(n.error??new Error("read failed")),n.readAsArrayBuffer(e)})}const $=async e=>new TextDecoder("utf-8").decode(await u(e));async function A(e){const t=await crypto.subtle.digest("SHA-256",await u(e));return Array.from(new Uint8Array(t),a=>a.toString(16).padStart(2,"0")).join("")}function S(e){const t=e.startsWith(h)?e.slice(1):e,a=t.split(/\r?\n/,1)[0]??"",n=[",",";","	"].map(s=>({d:s,n:a.split(s).length})).sort((s,l)=>l.n-s.n)[0]?.d??",",o=[];let r=[],i="",d=!1;for(let s=0;s<t.length;s+=1){const l=t[s];d?l==='"'?t[s+1]==='"'?(i+='"',s+=1):d=!1:i+=l:l==='"'&&i===""?d=!0:l===n?(r.push(i),i=""):l===`
`||l==="\r"?(l==="\r"&&t[s+1]===`
`&&(s+=1),r.push(i),o.push(r),r=[],i=""):i+=l}return(i!==""||r.length>0)&&(r.push(i),o.push(r)),o.filter(s=>s.some(l=>l.trim()!==""))}export{b as a,y as b,w as d,E as e,S as p,$ as r,A as s,k as t};
