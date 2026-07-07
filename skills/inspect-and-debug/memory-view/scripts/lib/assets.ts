/** Inline CSS and vanilla-JS for the self-contained memory-view report (no external libs). */

export const CSS = `
:root{
  --bg:oklch(0.1457 0 0); --panel:oklch(0.205 0.006 224); --panel2:oklch(0.262 0.009 224);
  --line:oklch(0.7869 0.1165 192.26 / 0.16); --line2:oklch(0.7869 0.1165 192.26 / 0.30);
  --tx:oklch(0.92 0 0); --mut:oklch(0.71 0.013 220); --mut2:oklch(0.58 0.018 214);
  --primary:oklch(0.7869 0.1165 192.26); --blue:var(--primary);
  --green:oklch(0.76 0.16 156); --amber:oklch(0.82 0.15 78); --red:oklch(0.704 0.191 22.216);
  --c-listings:#58a6ff; --c-memory:#bc8cff; --c-unattributed:#6e7681;
  --r-xs:6px; --r-sm:8px; --r-md:12px; --r-lg:16px; --r-xl:22px;
  --ring:oklch(0.7869 0.1165 192.26 / 0.55);
  --shadow:0 1px 2px rgba(0,0,0,.45),0 12px 32px -16px rgba(0,0,0,.6);
  --shadow-sm:0 1px 2px rgba(0,0,0,.35);
  --mono:"Geist Mono","SF Mono",ui-monospace,SFMono-Regular,Menlo,Consolas,"Liberation Mono",monospace;
  --sans:"Geist","Inter var","Inter",system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
}
[data-theme=light]{
  --bg:oklch(0.9696 0 0); --panel:oklch(1 0 0); --panel2:oklch(0.962 0.004 210);
  --line:oklch(0.5311 0.1062 234.34 / 0.18); --line2:oklch(0.5311 0.1062 234.34 / 0.32);
  --tx:oklch(0.205 0.006 229); --mut:oklch(0.52 0.02 214); --mut2:oklch(0.62 0.02 213);
  --primary:oklch(0.5311 0.1062 234.34);
  --green:oklch(0.6 0.16 152); --amber:oklch(0.7 0.16 70); --red:oklch(0.577 0.245 27.325);
  --ring:oklch(0.5311 0.1062 234.34 / 0.45);
  --shadow:0 1px 2px rgba(16,24,40,.06),0 16px 36px -20px rgba(16,24,40,.22);
  --shadow-sm:0 1px 2px rgba(16,24,40,.06);
}
*{box-sizing:border-box}
html{scroll-behavior:smooth;-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--tx);font-family:var(--sans);font-size:14px;line-height:1.55;
  letter-spacing:-0.003em;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
::selection{background:oklch(from var(--primary) l c h / 0.28)}
.wrap{max-width:1180px;margin:0 auto;padding:0 22px 96px;display:flex;flex-direction:column;gap:20px}
h1,h2,h3{font-weight:680;margin:0;letter-spacing:-0.014em}
a{color:var(--primary);text-decoration:none;text-underline-offset:2px}
a:hover{text-decoration:underline}
.muted{color:var(--mut)}
.mono,.num{font-family:var(--mono);font-variant-numeric:tabular-nums}
.num{text-align:right}
code{font-family:var(--mono);font-size:.92em;background:var(--panel2);padding:1.5px 6px;border-radius:var(--r-xs);
  border:1px solid var(--line)}
:focus-visible{outline:2px solid var(--ring);outline-offset:2px;border-radius:var(--r-xs)}

/* sticky header */
header.sticky{position:sticky;top:0;z-index:50;background:color-mix(in srgb,var(--bg) 82%,transparent);
  backdrop-filter:blur(14px) saturate(140%);border-bottom:1px solid var(--line);
  box-shadow:var(--shadow-sm);padding:12px 0;margin-bottom:8px}
.hdr{max-width:1180px;margin:0 auto;padding:0 22px;display:flex;flex-direction:column;gap:11px}
.hdr-top{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap}
.hdr-id{min-width:0}
.hdr .title{font-size:16px;font-weight:680;letter-spacing:-0.014em}
.hdr .sub{color:var(--mut);font-size:12px;font-family:var(--mono);margin-top:3px;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.hdr .sub .path{cursor:pointer}
.hdr .sub .path:hover{color:var(--primary)}
.totals{display:flex;gap:16px;flex-wrap:wrap;font-family:var(--mono);font-size:12px;color:var(--mut)}
.totals b{color:var(--tx);font-weight:650}
.sev-counts{display:inline-flex;gap:9px}
.sev-counts .sc{display:inline-flex;align-items:center;gap:4px}
.sev-dot{display:inline-block;width:9px;height:9px;border-radius:3px}
.sev-critical{color:var(--red)} .sev-high{color:var(--red)} .sev-med{color:var(--amber)} .sev-low{color:var(--mut)}
.bg-critical{background:var(--red)} .bg-high{background:var(--red)} .bg-med{background:var(--amber)} .bg-low{background:var(--mut)}
.chips{display:flex;gap:7px;flex-wrap:wrap}
.chip{position:relative;font-size:10px;font-family:var(--mono);padding:4px 10px;border-radius:999px;border:1px solid var(--line2);
  background:color-mix(in srgb,var(--panel) 70%,transparent);color:var(--tx);cursor:default;white-space:nowrap;
  transition:border-color .15s,background .15s,transform .1s}
.chip[data-jump]{cursor:pointer}
.chip:hover{border-color:var(--primary);transform:translateY(-1px)}
.chip.ok{border-color:oklch(from var(--green) l c h / 0.5);color:var(--green);background:oklch(from var(--green) l c h / 0.1)}
.chip.warn{border-color:oklch(from var(--amber) l c h / 0.5);color:var(--amber);background:oklch(from var(--amber) l c h / 0.1)}
.chip.bad{border-color:oklch(from var(--red) l c h / 0.5);color:var(--red);background:oklch(from var(--red) l c h / 0.1)}
.controls{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.controls button{background:var(--panel);color:var(--tx);border:1px solid var(--line2);
  border-radius:999px;padding:5px 12px;font-size:12px;font-family:var(--sans);cursor:pointer;transition:border-color .15s}
.controls button:hover{border-color:var(--primary)}

/* sections */
section{background:var(--panel);border:1px solid var(--line);border-radius:var(--r-lg);padding:24px 26px;box-shadow:var(--shadow)}
section>h2{font-size:19px;margin-bottom:5px}
section>.lead{color:var(--mut);font-size:13px;margin-bottom:18px;max-width:80ch;line-height:1.5}
/* the cross-project memories section is a plain container — it already holds one card per project, no card-in-card */
#memories{background:none;border:none;box-shadow:none;padding:0}
.prose{font-size:13.5px;line-height:1.65;max-width:82ch;color:var(--tx)}
.prose p{margin:0 0 12px}.prose p:last-child{margin-bottom:0}.prose strong{font-weight:680}
.flash{animation:flash 1.4s ease-out}
@keyframes flash{0%{box-shadow:0 0 0 2px var(--amber)}100%{box-shadow:0 0 0 0 transparent}}

/* dead-end panel */
.deadend{border-left:3px solid var(--amber);background:var(--panel2);border-radius:var(--r-sm);padding:16px 18px;margin-bottom:6px}
.deadend h3{font-size:15px;margin-bottom:6px}
.deadend p{margin:0;color:var(--mut);font-size:13px;line-height:1.5}

/* svg visuals */
.mg-gauge{width:100%;height:auto;background:var(--panel2);border:1px solid var(--line);border-radius:var(--r-md)}
.gz-track{fill:var(--panel);stroke:var(--line2)}
.gz-track.gz-empty{fill:none;stroke-dasharray:4 4}
.gz-fill{filter:drop-shadow(0 1px 1px rgba(0,0,0,.3))}
.gz-over{fill:var(--c-unattributed);fill-opacity:.45}
.gz-overLab{fill:var(--red);font-size:11px;font-family:var(--mono);font-weight:650;letter-spacing:.04em}
.gz-cliff{stroke:var(--red);stroke-width:2;stroke-dasharray:4 3}
.gz-cliffLab{fill:var(--red);font-size:11px;font-family:var(--mono)}
.gz-title{fill:var(--tx);font-size:14px;font-family:var(--mono);font-weight:650}
.gz-note{fill:var(--mut);font-size:12px;font-family:var(--sans)}
.gz-note.gz-bad{fill:var(--red)}
.gz-monoLab{fill:var(--amber);font-size:13px;font-family:var(--mono);font-weight:600}
.mg-donut{width:180px;height:180px}
.dn-total{fill:var(--tx);font-size:34px;font-family:var(--mono);font-weight:680}
.dn-sub{fill:var(--mut);font-size:11px;font-family:var(--mono)}
.dn-zero{fill:var(--mut);font-size:16px;font-family:var(--mono)}
.donut-wrap{display:flex;gap:26px;align-items:center;flex-wrap:wrap}
.donut-legend{display:flex;flex-direction:column;gap:6px;font-size:13px}
.donut-legend .le{display:inline-flex;align-items:center;gap:8px}
.mg-arc{width:100%;height:auto;background:var(--panel2);border:1px solid var(--line);border-radius:var(--r-md)}
.arc-base{stroke:var(--line2);stroke-width:1}
.arc-edge{fill:none;stroke:var(--primary);stroke-width:1.5;stroke-opacity:.6}
.arc-broken{stroke:var(--red);stroke-width:1.5}
.arc-brokenDot{fill:var(--red)}
.arc-lab{fill:var(--mut);font-size:9.5px;font-family:var(--mono)}
.arc-gutterLine{stroke:var(--line);stroke-width:1;stroke-dasharray:3 3}
.arc-gutterLab{fill:var(--mut);font-size:11px;font-family:var(--mono)}

/* metadata grid */
.metagrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:1px;background:var(--line);
  border:1px solid var(--line);border-radius:var(--r-md);overflow:hidden}
.metacell{background:var(--panel);padding:13px 16px}
.metacell .k{font-size:10.5px;color:var(--mut);text-transform:uppercase;letter-spacing:.06em;font-weight:600}
.metacell .v{font-size:20px;font-family:var(--mono);font-variant-numeric:tabular-nums;margin-top:5px}
.metacell .v small{font-size:12px;color:var(--mut);font-family:var(--sans)}

/* tables */
table{width:100%;border-collapse:collapse;font-size:13px}
/* fixed layout so expanding a row's inline detail never reflows column widths;
   cell content wraps within its locked column instead of spilling over */
.mem-table,#browse-table{table-layout:fixed}
.mem-table tr.mrow td,#browse-table tr.mrow td{overflow-wrap:break-word;word-break:break-word}
th,td{text-align:left;padding:9px 12px;border-bottom:1px solid var(--line);vertical-align:top}
tbody tr:last-child td{border-bottom:none}
th{color:var(--mut);font-weight:650;font-size:11px;text-transform:uppercase;letter-spacing:.05em;user-select:none}
th[data-sort]{cursor:pointer}
th[data-sort]:hover{color:var(--tx)}
tr:hover>td{background:var(--panel2)}
.tag{font-size:10.5px;font-family:var(--mono);padding:1.5px 7px;border-radius:999px;background:var(--panel2);border:1px solid var(--line2);white-space:nowrap}
.tchip{font-size:10.5px;font-family:var(--mono);padding:1.5px 8px;border-radius:999px;color:#0b0d10;font-weight:600;white-space:nowrap}
.ibadge{font-size:10.5px;font-family:var(--mono);padding:1.5px 8px;border-radius:999px;font-weight:650;white-space:nowrap;
  border:1px solid currentColor}
.ibadge.none{color:var(--mut);border-color:var(--line2);font-weight:400}
.diffcols{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.diffcols h3{font-size:13px;color:var(--mut);text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px}
.difflist{list-style:none;margin:0;padding:0;font-size:12.5px;font-family:var(--mono)}
.difflist li{padding:6px 9px;border:1px solid var(--line);border-radius:var(--r-xs);margin-bottom:5px;background:var(--panel2);
  display:flex;justify-content:space-between;gap:8px;align-items:baseline}
.difflist li.bad{border-left:3px solid var(--red)}
.difflist li.warn{border-left:3px solid var(--amber)}
.difflist li.ok{border-left:3px solid var(--green)}
.difflist .dnote{color:var(--mut);font-size:11px}

/* findings */
.fgroup{margin-bottom:10px}
.fgroup>summary{cursor:pointer;font-weight:650;font-size:14px;padding:8px 0;list-style:none}
.fgroup>summary::-webkit-details-marker{display:none}
.fgroup>summary::before{content:"▸";margin-right:8px;color:var(--mut)}
.fgroup[open]>summary::before{content:"▾"}
.finding{border:1px solid var(--line);border-left-width:3px;border-radius:var(--r-sm);padding:11px 14px;margin:7px 0;background:var(--panel2)}
.finding.sev-critical,.finding.sev-high{border-left-color:var(--red)}
.finding.sev-med{border-left-color:var(--amber)}
.finding.sev-low{border-left-color:var(--mut)}
.finding .fhead{display:flex;gap:9px;align-items:baseline;flex-wrap:wrap;margin-bottom:4px}
.finding .fid{font-family:var(--mono);font-size:11px;color:var(--mut)}
.finding .fname{font-weight:650;font-size:13px}
.finding .fmsg{font-size:13px;line-height:1.5}
.finding .fmeta{font-size:11.5px;color:var(--mut);font-family:var(--mono);margin-top:5px}
.finding .fx{font-size:12px;margin-top:6px;color:var(--mut)}
.finding .fx b{color:var(--tx);font-weight:600}
.finding pre.ev{margin:6px 0 0;padding:8px 11px;background:var(--bg);border:1px solid var(--line);border-radius:var(--r-xs);
  font-family:var(--mono);font-size:11.5px;white-space:pre-wrap;word-break:break-word;max-height:200px;overflow:auto}
.sev-pill{font-size:10px;font-family:var(--mono);padding:1.5px 7px;border-radius:999px;font-weight:650;text-transform:uppercase}
.sev-pill.sev-critical,.sev-pill.sev-high{background:oklch(from var(--red) l c h / 0.16);color:var(--red)}
.sev-pill.sev-med{background:oklch(from var(--amber) l c h / 0.16);color:var(--amber)}
.sev-pill.sev-low{background:var(--panel);color:var(--mut)}

/* expandable memory rows (summary <tr class=mrow> + inline detail <tr class=mdetail>) */
tr.mrow{cursor:pointer}
tr.mrow>td{transition:background .12s}
tr.mrow:hover>td,tr.mrow.open>td{background:var(--panel2)}
tr.mrow.open>td{border-bottom-color:transparent}
tr.mrow:focus-visible{outline:2px solid var(--ring);outline-offset:-2px}
td.mtitle-cell{font-weight:650;font-size:13.5px;max-width:300px}
td.mtitle-cell .caret{display:inline-block;width:1.05em;color:var(--mut);font-size:10px;transition:color .12s}
tr.mrow.open td.mtitle-cell .caret{color:var(--primary)}
.mtitle{overflow:hidden;text-overflow:ellipsis}
td.mdesc{max-width:360px;color:var(--mut)}
td.msize{font-size:11.5px}
td.msize small{font-size:10px}
tr.mdetail>td{padding:0 14px 16px;background:var(--panel2)}
tr.mdetail.hidden{display:none}
.mem-body{padding:0}
.mem-body pre{margin:8px 0 0;padding:13px;background:var(--bg);border:1px solid var(--line);border-radius:var(--r-xs);
  overflow:auto;max-height:520px;font-family:var(--mono);font-size:12px;line-height:1.55;white-space:pre-wrap;word-break:break-word}
.mem-links{display:flex;gap:18px;flex-wrap:wrap;font-size:12.5px;margin-top:10px}
.mem-links ul{list-style:none;margin:4px 0 0;padding:0}
.mem-links li{font-family:var(--mono);font-size:12px}
.linkbroken{color:var(--red)}
.rawbtn,.copybtn{font-size:11px;padding:3px 12px;border:1px solid var(--line2);border-radius:999px;background:var(--panel);
  color:var(--mut);cursor:pointer;transition:border-color .15s,color .15s;margin-right:6px}
.rawbtn:hover,.copybtn:hover{border-color:var(--primary);color:var(--tx)}
.fmtable{margin-top:6px}.fmtable td{font-family:var(--mono);font-size:12px;padding:5px 10px}
.fmtable td.k{color:var(--mut);width:160px}

/* filter bar */
.filterbar{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;align-items:center}
.filterbar input[type=search],.filterbar button{background:var(--panel);color:var(--tx);border:1px solid var(--line2);
  border-radius:999px;height:32px;padding:0 16px;font-size:13px;font-family:var(--sans);line-height:1.2;transition:border-color .15s}
.filterbar input[type=search]{flex:1;min-width:200px;background:var(--panel2)}
.filterbar button{cursor:pointer}
.filterbar input:hover,.filterbar button:hover{border-color:var(--primary)}
.filterbar .mut-note{color:var(--mut);font-size:12px;margin-right:auto}
.facets{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.facet{font-size:10.5px;font-family:var(--mono);height:32px;line-height:30px;padding:0 12px;display:inline-block;border-radius:999px;border:1px solid var(--line2);
  background:var(--panel2);color:var(--mut);cursor:pointer;user-select:none;transition:all .12s}
.facet[data-active=true]{color:#0b0d10;font-weight:650;border-color:transparent}
.facet.issues[data-active=true]{background:var(--red);color:#fff}
.hidden{display:none!important}
.swatch{display:inline-block;width:11px;height:11px;border-radius:3px;vertical-align:middle}

/* cross-project groups (--all explorer) */
details.proj{border:1px solid var(--line2);border-radius:var(--r-md);margin:10px 0;background:var(--panel);overflow:hidden}
details.proj>summary{list-style:none;cursor:pointer;padding:13px 16px;display:flex;gap:12px;align-items:baseline;flex-wrap:wrap}
details.proj>summary::-webkit-details-marker{display:none}
details.proj>summary::before{content:"▸";color:var(--mut);align-self:center}
details.proj[open]>summary::before{content:"▾"}
details.proj>summary:hover{background:var(--panel2)}
.proj-name{font-weight:680;font-size:15px}
.proj-slug{font-size:11px}
.proj-stats{display:inline-flex;gap:12px;align-items:baseline;font-family:var(--mono);font-size:12px;color:var(--mut);margin-left:auto}
.proj-stats .hot{color:var(--red)}
.proj-count{font-family:var(--mono);font-size:11px;color:var(--mut)}
.proj-body{padding:6px 16px 16px}
.proj-body .mem-table{margin-bottom:12px}
.proj-empty{border-left:3px solid var(--amber);background:var(--panel2);border-radius:var(--r-sm);padding:12px 14px}
.proj-empty h4{font-size:13px;margin:0 0 4px;text-transform:capitalize}
.proj-empty p{margin:0;color:var(--mut);font-size:12.5px}
.mfacet{font-size:10.5px;font-family:var(--mono);height:32px;line-height:30px;padding:0 12px;display:inline-block;border-radius:999px;border:1px solid var(--line2);
  background:var(--panel2);color:var(--mut);cursor:pointer;user-select:none;transition:all .12s}
.mfacet[data-active=true]{color:#0b0d10;font-weight:650;border-color:transparent;background:var(--primary)}
.mfacet.issues[data-active=true]{background:var(--red);color:#fff}
footer{color:var(--mut);font-size:12px;text-align:center;margin-top:10px;font-family:var(--mono)}
@media(max-width:680px){
  .wrap{padding:0 14px 72px;gap:14px}
  section{padding:18px 16px}
  .diffcols{grid-template-columns:1fr}
  td.mtitle-cell,td.mdesc{max-width:none}
}
`;

export const JS = String.raw`
(function(){
  "use strict";
  function $(s,r){return (r||document).querySelector(s)}
  function $$(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s))}
  function esc(s){return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");}

  // expand/collapse one memory summary row, revealing/hiding its inline detail row
  function setRowOpen(r,open){
    var d=r.nextElementSibling;
    if(!d||!d.classList.contains("mdetail"))return;
    r.classList.toggle("open",open);
    r.setAttribute("aria-expanded",open?"true":"false");
    d.classList.toggle("hidden",!open);
    var c=r.querySelector(".caret");if(c)c.textContent=open?"▾":"▸";
  }

  // theme toggle
  var tt=$("#theme-toggle");
  if(tt) tt.addEventListener("click",function(){
    var cur=document.documentElement.getAttribute("data-theme")==="light"?"dark":"light";
    document.documentElement.setAttribute("data-theme",cur);
    tt.textContent=cur==="light"?"☾ dark":"☀ light";
  });

  // table sorting — each expandable row carries its inline detail row along, and
  // only direct tbody rows are considered (skip the nested frontmatter tables).
  $$("table[data-sortable]").forEach(function(t){
    $$("th[data-sort]",t).forEach(function(th,ci){
      th.addEventListener("click",function(){
        var tb=$("tbody",t);
        var items=[];
        $$(":scope>tr",tb).forEach(function(r){
          if(r.classList.contains("mdetail"))return;
          var d=r.nextElementSibling;
          items.push({r:r,d:(d&&d.classList.contains("mdetail"))?d:null});
        });
        var asc=th.getAttribute("data-dir")!=="asc";
        var type=th.getAttribute("data-sort");
        items.sort(function(a,b){
          var x=a.r.children[ci].getAttribute("data-v")||a.r.children[ci].textContent;
          var y=b.r.children[ci].getAttribute("data-v")||b.r.children[ci].textContent;
          if(type==="num"){x=parseFloat(x)||0;y=parseFloat(y)||0;return asc?x-y:y-x;}
          return asc?(""+x).localeCompare(y):(""+y).localeCompare(x);
        });
        items.forEach(function(it){tb.appendChild(it.r);if(it.d)tb.appendChild(it.d);});
        $$("th[data-sort]",t).forEach(function(o){o.removeAttribute("data-dir")});
        th.setAttribute("data-dir",asc?"asc":"desc");
      });
    });
  });

  // browse search + type facets + has-issues toggle
  var bsearch=$("#browse-search");
  var activeTypes={};
  function applyBrowse(){
    var q=(bsearch&&bsearch.value||"").toLowerCase();
    var onlyIssues=($(".facet.issues")||{}).getAttribute&&$(".facet.issues").getAttribute("data-active")==="true";
    var anyType=Object.keys(activeTypes).some(function(k){return activeTypes[k]});
    $$("#browse-table tbody tr.mrow").forEach(function(tr){
      var hay=(tr.getAttribute("data-search")||"").toLowerCase();
      var ty=tr.getAttribute("data-type")||"";
      var iss=parseInt(tr.getAttribute("data-issues")||"0",10);
      var ok=(!q||hay.indexOf(q)>=0)&&(!anyType||activeTypes[ty])&&(!onlyIssues||iss>0);
      tr.classList.toggle("hidden",!ok);
      var d=tr.nextElementSibling;
      if(d&&d.classList.contains("mdetail")) d.classList.toggle("hidden",!ok||!tr.classList.contains("open"));
    });
  }
  if(bsearch) bsearch.addEventListener("input",applyBrowse);
  $$(".facet[data-type]").forEach(function(f){f.addEventListener("click",function(){
    var t=f.getAttribute("data-type");activeTypes[t]=!activeTypes[t];
    f.setAttribute("data-active",activeTypes[t]?"true":"false");applyBrowse();
  })});
  var issuesFacet=$(".facet.issues");
  if(issuesFacet) issuesFacet.addEventListener("click",function(){
    var on=issuesFacet.getAttribute("data-active")==="true";
    issuesFacet.setAttribute("data-active",on?"false":"true");applyBrowse();
  });

  // expand / collapse all rows under a table/group
  $$("[data-expand-all]").forEach(function(b){b.addEventListener("click",function(){
    var sel=b.getAttribute("data-expand-all");var open=b.getAttribute("data-open")!=="1";
    var label=b.getAttribute("data-label")||"all";
    $$(sel+" tr.mrow").forEach(function(r){if(!r.classList.contains("hidden"))setRowOpen(r,open)});
    b.setAttribute("data-open",open?"1":"0");b.textContent=(open?"Collapse ":"Expand ")+label;
  })});

  // click / keyboard expand of a memory summary row → reveals its inline detail row.
  // Clicks on real interactive descendants (links, buttons, inputs) are left alone.
  document.addEventListener("click",function(e){
    if(e.target.closest&&e.target.closest("a,button,input,select,textarea,label"))return;
    var row=e.target.closest&&e.target.closest("tr.mrow");
    if(!row)return;
    setRowOpen(row,!row.classList.contains("open"));
  });
  document.addEventListener("keydown",function(e){
    if(e.key!=="Enter"&&e.key!==" ")return;
    var row=e.target.closest&&e.target.closest("tr.mrow");
    if(!row||row!==e.target)return;
    e.preventDefault();
    setRowOpen(row,!row.classList.contains("open"));
  });

  // cross-project grouped memory filter (--all explorer): search + type facets + has-issues,
  // hiding rows/panels and collapsing projects with no remaining matches.
  var msearch=$("#mem-search");
  var memTypes={};
  function applyMem(){
    var q=(msearch&&msearch.value||"").toLowerCase();
    var issEl=$(".mfacet.issues");
    var onlyIssues=!!issEl&&issEl.getAttribute("data-active")==="true";
    var anyType=Object.keys(memTypes).some(function(k){return memTypes[k]});
    var active=!!q||anyType||onlyIssues;
    $$("[data-mem]").forEach(function(el){
      var hay=(el.getAttribute("data-search")||"").toLowerCase();
      var ty=el.getAttribute("data-type")||"";
      var iss=parseInt(el.getAttribute("data-issues")||"0",10);
      var ok=(!q||hay.indexOf(q)>=0)&&(!anyType||memTypes[ty])&&(!onlyIssues||iss>0);
      el.classList.toggle("hidden",!ok);
      var d=el.nextElementSibling;
      if(d&&d.classList.contains("mdetail")) d.classList.toggle("hidden",!ok||!el.classList.contains("open"));
    });
    $$(".proj").forEach(function(p){
      var rows=$$("tbody tr[data-mem]",p);
      var shown=rows.filter(function(r){return !r.classList.contains("hidden")}).length;
      var cnt=$(".proj-count",p);
      if(cnt) cnt.textContent=active?(shown+" / "+rows.length+" shown"):"";
      if(active){p.classList.toggle("hidden",rows.length>0&&shown===0);if(shown>0)p.open=true;}
      else p.classList.remove("hidden");
    });
  }
  if(msearch) msearch.addEventListener("input",applyMem);
  $$(".mfacet[data-type]").forEach(function(f){f.addEventListener("click",function(){
    var t=f.getAttribute("data-type");memTypes[t]=!memTypes[t];
    f.setAttribute("data-active",memTypes[t]?"true":"false");applyMem();
  })});
  var mIssues=$(".mfacet.issues");
  if(mIssues) mIssues.addEventListener("click",function(){
    var on=mIssues.getAttribute("data-active")==="true";
    mIssues.setAttribute("data-active",on?"false":"true");applyMem();
  });
  $$("[data-toggle-proj]").forEach(function(b){b.addEventListener("click",function(){
    var open=b.getAttribute("data-open")!=="1";
    $$(".proj").forEach(function(p){if(!p.classList.contains("hidden"))p.open=open});
    b.setAttribute("data-open",open?"1":"0");b.textContent=(open?"Collapse":"Expand")+" all projects";
  })});

  // raw-markdown toggle inside detail panels
  document.addEventListener("click",function(e){
    var rb=e.target.closest&&e.target.closest(".rawbtn");if(!rb)return;
    var box=rb.closest(".mem-body");if(!box)return;
    var rendered=box.querySelector(".body-rendered"),raw=box.querySelector(".body-raw");
    if(!rendered||!raw)return;
    var showRaw=raw.classList.contains("hidden");
    raw.classList.toggle("hidden",!showRaw);rendered.classList.toggle("hidden",showRaw);
    rb.textContent=showRaw?"rendered":"raw markdown";
  });

  // copy buttons (sibling pre) — delegated
  document.addEventListener("click",function(e){
    var b=e.target.closest&&e.target.closest(".copybtn");if(!b)return;
    var box=b.closest(".mem-body")||b.parentElement;
    var pre=box.querySelector("pre:not(.hidden)")||box.querySelector("pre");if(!pre)return;
    navigator.clipboard&&navigator.clipboard.writeText(pre.textContent);
    var o=b.textContent;b.textContent="copied";setTimeout(function(){b.textContent=o},1200);
  });

  // click-to-copy any element carrying data-copy (paths, ids)
  document.addEventListener("click",function(e){
    var el=e.target.closest&&e.target.closest("[data-copy]");if(!el)return;
    navigator.clipboard&&navigator.clipboard.writeText(el.getAttribute("data-copy"));
    var o=el.getAttribute("data-label")||el.textContent;
    var prev=el.textContent;el.textContent="copied!";setTimeout(function(){el.textContent=o||prev},1000);
  });

  // jump + flash — open the target and every ancestor <details> so nested
  // (project → memory) targets are revealed even when their group is collapsed.
  $$("[data-jump]").forEach(function(el){el.addEventListener("click",function(e){
    e.preventDefault();var t=document.getElementById(el.getAttribute("data-jump"));
    if(!t)return;
    var p=t;while(p){if(p.tagName==="DETAILS")p.open=true;p=p.parentElement;}
    t.classList.remove("hidden");
    if(t.classList.contains("mrow"))setRowOpen(t,true);
    t.scrollIntoView({behavior:"smooth",block:"center"});
    t.classList.remove("flash");void t.offsetWidth;t.classList.add("flash");
  })});
})();
`;
