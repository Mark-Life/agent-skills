/** Inline CSS and vanilla-JS for the self-contained report (no external libs). */

export const CSS = `
:root{
  --bg:#0d0f12; --panel:#15181d; --panel2:#1b1f26; --line:#262b33; --line2:#323845;
  --tx:#d8dde3; --mut:#8a929e; --mut2:#6b7280;
  --green:#3fb950; --amber:#d29922; --red:#f85149; --blue:#58a6ff;
  --c-system_tools:#6e7681; --c-listings:#58a6ff; --c-memory:#bc8cff; --c-files:#39c5cf;
  --c-prompts:#3fb950; --c-tool_results:#f0883e; --c-assistant_text:#d29922;
  --c-thinking:#db61a2; --c-other:#8a929e; --c-unattributed:#484f58;
  --mono:ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,monospace;
  --sans:-apple-system,BlinkMacSystemFont,"Inter","Segoe UI",sans-serif;
}
[data-theme=light]{
  --bg:#fbfcfe; --panel:#fff; --panel2:#f3f5f8; --line:#e2e6ec; --line2:#d0d6df;
  --tx:#1b2128; --mut:#5a626d; --mut2:#8a929e;
}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;background:var(--bg);color:var(--tx);font-family:var(--sans);font-size:14px;line-height:1.5}
.wrap{max-width:1200px;margin:0 auto;padding:0 20px 80px}
h1,h2,h3{font-weight:650;margin:0}
a{color:var(--blue);text-decoration:none}
a:hover{text-decoration:underline}
.muted{color:var(--mut)}
.mono,.num{font-family:var(--mono);font-variant-numeric:tabular-nums}
.num{text-align:right}
code{font-family:var(--mono);background:var(--panel2);padding:1px 5px;border-radius:4px}

/* sticky header */
header.sticky{position:sticky;top:0;z-index:50;background:color-mix(in srgb,var(--bg) 86%,transparent);
  backdrop-filter:blur(10px);border-bottom:1px solid var(--line);padding:10px 0;margin-bottom:18px}
.hdr{max-width:1200px;margin:0 auto;padding:0 20px;display:flex;gap:18px;align-items:center;flex-wrap:wrap}
.hdr .title{font-size:16px;font-weight:650}
.hdr .sub{color:var(--mut);font-size:12px;font-family:var(--mono)}
.gauge{flex:1;min-width:200px;max-width:340px}
.gauge-track{height:14px;background:var(--panel2);border:1px solid var(--line);border-radius:7px;position:relative;overflow:hidden}
.gauge-fill{height:100%;border-radius:7px 0 0 7px;transition:width .3s,background .3s}
.gauge-dz{position:absolute;top:-3px;bottom:-3px;width:2px;background:var(--red);opacity:.7}
.gauge-lab{font-size:11px;color:var(--mut);margin-top:3px;display:flex;justify-content:space-between}
.chips{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;flex:2;min-width:240px}
.chip{font-size:11.5px;font-family:var(--mono);padding:3px 9px;border-radius:20px;border:1px solid var(--line2);
  background:var(--panel);color:var(--tx);cursor:pointer;white-space:nowrap}
.chip:hover{border-color:var(--blue)}
.chip.ok{border-color:var(--green);color:var(--green)}
.chip.warn{border-color:var(--amber);color:var(--amber)}
.chip.bad{border-color:var(--red);color:var(--red)}
.controls{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.controls select,.controls button{background:var(--panel);color:var(--tx);border:1px solid var(--line2);
  border-radius:6px;padding:4px 8px;font-size:12px;font-family:var(--sans);cursor:pointer}

/* sections */
section{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:18px 20px;margin:16px 0}
section>h2{font-size:18px;margin-bottom:4px}
section>.lead{color:var(--mut);font-size:12.5px;margin-bottom:14px}
.flash{animation:flash 1.4s ease-out}
@keyframes flash{0%{box-shadow:0 0 0 2px var(--amber)}100%{box-shadow:0 0 0 0 transparent}}

/* metadata grid */
.metagrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:1px;background:var(--line);
  border:1px solid var(--line);border-radius:10px;overflow:hidden}
.metacell{background:var(--panel);padding:10px 12px}
.metacell .k{font-size:11px;color:var(--mut);text-transform:uppercase;letter-spacing:.04em}
.metacell .v{font-size:18px;font-family:var(--mono);font-variant-numeric:tabular-nums;margin-top:3px}
.metacell .v small{font-size:12px;color:var(--mut)}
.dotted{border-bottom:1px dotted var(--mut);cursor:help}

/* budget bar */
.budgetbar{display:flex;height:62px;border-radius:8px;overflow:hidden;border:1px solid var(--line);margin:6px 0 4px}
.budgetbar .seg{position:relative;min-width:0;transition:filter .15s}
.budgetbar .seg:hover{filter:brightness(1.25)}
.budgetbar .seg .segt{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
  font-size:10.5px;font-family:var(--mono);color:#0b0d10;font-weight:600;overflow:hidden;white-space:nowrap}
.budgetbar .free{background:var(--panel2)}
.bzmark{position:relative;height:14px;margin-bottom:10px}
.bzmark .l{position:absolute;top:0;bottom:0;width:2px;background:var(--red)}
.bzmark .t{position:absolute;font-size:10.5px;color:var(--red);font-family:var(--mono);top:0;transform:translateX(4px)}

/* tables */
table{width:100%;border-collapse:collapse;font-size:13px}
th,td{text-align:left;padding:7px 10px;border-bottom:1px solid var(--line)}
th{color:var(--mut);font-weight:600;font-size:11.5px;text-transform:uppercase;letter-spacing:.03em;cursor:pointer;user-select:none;position:sticky}
th[data-sort]:hover{color:var(--tx)}
tr:hover>td{background:var(--panel2)}
.sw{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:7px;vertical-align:middle}
.microbar{height:6px;background:var(--panel2);border-radius:3px;overflow:hidden;margin-top:3px}
.microbar>span{display:block;height:100%}
.tag{font-size:10.5px;font-family:var(--mono);padding:1px 6px;border-radius:4px;background:var(--panel2);border:1px solid var(--line2)}
.tag.err{color:var(--red);border-color:var(--red)}
.warnflag{color:var(--amber);font-size:11px}

/* history */
.callout{background:var(--panel2);border:1px solid var(--line2);border-left:3px solid var(--amber);
  border-radius:7px;padding:9px 12px;margin:8px 0;font-size:13px}
.callout.bad{border-left-color:var(--red)}
.callout.ok{border-left-color:var(--green)}
details.evt{border:1px solid var(--line);border-radius:8px;margin:5px 0;background:var(--panel2)}
details.evt[data-sidechain=true]{margin-left:18px;border-left:3px solid var(--c-listings)}
details.evt summary{list-style:none;cursor:pointer;padding:7px 12px;display:grid;
  grid-template-columns:46px 110px 1fr auto;gap:10px;align-items:center}
details.evt summary::-webkit-details-marker{display:none}
details.evt summary:hover{background:var(--panel)}
details.evt .turn{font-family:var(--mono);font-size:11px;color:var(--mut)}
details.evt .prev{color:var(--mut);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12.5px}
details.evt[data-err=true]{border-left:3px solid var(--red)}
details.evt pre{margin:0;padding:12px;background:var(--bg);border-top:1px solid var(--line);
  overflow:auto;max-height:560px;font-family:var(--mono);font-size:12px;white-space:pre-wrap;word-break:break-word}
.evt-kind{font-family:var(--mono);font-size:11px;padding:2px 7px;border-radius:4px;text-align:center}
.k-tool-call{background:rgba(88,166,255,.16);color:var(--blue)}
.k-tool-result{background:rgba(240,136,62,.16);color:var(--c-tool_results)}
.k-assistant-text{background:rgba(210,153,34,.16);color:var(--amber)}
.k-assistant-thinking{background:rgba(219,97,162,.16);color:var(--c-thinking)}
.k-user-prompt{background:rgba(63,185,80,.16);color:var(--green)}
.k-attachment{background:rgba(188,140,255,.16);color:var(--c-memory)}
.k-compaction,.k-summary,.k-system{background:var(--panel);color:var(--mut)}
.dzrule{display:flex;align-items:center;gap:10px;margin:14px 0;color:var(--red);font-size:12.5px;font-family:var(--mono)}
.dzrule::before,.dzrule::after{content:"";flex:1;height:1px;background:var(--red);opacity:.5}
.copybtn{font-size:11px;padding:2px 8px;border:1px solid var(--line2);border-radius:5px;background:var(--panel);
  color:var(--mut);cursor:pointer;float:right;margin:8px}
.filterbar{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;align-items:center}
.filterbar input[type=search]{flex:1;min-width:180px;background:var(--panel2);border:1px solid var(--line2);
  border-radius:6px;padding:6px 10px;color:var(--tx);font-size:13px}

/* timeline */
.timeline{width:100%;height:auto;background:var(--panel2);border:1px solid var(--line);border-radius:10px}
.tl-grid{stroke:var(--line);stroke-width:1}
.tl-ylab{fill:var(--mut);font-size:11px;font-family:var(--mono);text-anchor:end}
.tl-xlab{fill:var(--mut);font-size:10px;font-family:var(--mono);text-anchor:middle}
.tl-dz{stroke:var(--red);stroke-width:1.2;stroke-dasharray:5 4;opacity:.8}
.tl-dzlab{fill:var(--red);font-size:10.5px;font-family:var(--mono);text-anchor:end}
.tl-ghost{stroke:var(--mut);stroke-width:1;stroke-dasharray:2 3;opacity:.6}
.tl-ghostlab{fill:var(--mut);font-size:10px;font-family:var(--mono)}
.tl-silhouette{fill:none;stroke:var(--tx);stroke-width:1.8;opacity:.85}
.tl-dot{fill:var(--tx);opacity:.5}
.tl-compact{stroke:var(--c-memory);stroke-width:1.2;stroke-dasharray:3 3}
.tl-compactlab{fill:var(--c-memory);font-size:10px;font-family:var(--mono);text-anchor:middle}
.tl-cross{stroke:var(--red);stroke-width:1;stroke-dasharray:2 2;opacity:.7}
.tl-crossdot{fill:var(--red)}
.tl-crosslab{fill:var(--red);font-size:10px;font-family:var(--mono)}
.tl-peak{fill:var(--tx)}
.tl-peaklab{fill:var(--tx);font-size:10.5px;font-family:var(--mono)}
.legend{display:flex;gap:12px;flex-wrap:wrap;margin-top:10px;font-size:11.5px;font-family:var(--mono);color:var(--mut)}
.legend span{display:inline-flex;align-items:center;gap:5px}
.hidden{display:none!important}
footer{color:var(--mut);font-size:12px;text-align:center;margin-top:30px}
`;

export const JS = String.raw`
(function(){
  "use strict";
  var D = window.__CTX__ || {};
  function $(s,r){return (r||document).querySelector(s)}
  function $$(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s))}
  function fmt(n){return Math.round(n).toLocaleString("en-US")}
  function zone(frac){return frac<D.dumbFraction?"ok":frac<0.75?"warn":"bad"}
  function zoneColor(frac){return frac<D.dumbFraction?"var(--green)":frac<0.75?"var(--amber)":"var(--red)"}

  // theme toggle
  var tt=$("#theme-toggle");
  if(tt) tt.addEventListener("click",function(){
    var cur=document.documentElement.getAttribute("data-theme")==="light"?"dark":"light";
    document.documentElement.setAttribute("data-theme",cur);
    tt.textContent=cur==="light"?"☾ dark":"☀ light";
  });

  // window-size override -> recompute %s, gauge, verdict (timeline keeps generation window; note in footer)
  function recompute(win){
    var peak=D.peak;
    var frac=peak/win;
    var gf=$("#gauge-fill");
    if(gf){gf.style.width=Math.min(100,frac*100)+"%";gf.style.background=zoneColor(frac);}
    var gp=$("#gauge-pct"); if(gp) gp.textContent=(frac*100).toFixed(1)+"% of "+fmt(win);
    var dz=$("#gauge-dz"); if(dz) dz.style.left=(D.dumbFraction*100)+"%";
    var hw=$("#health-word"); if(hw){var z=zone(frac);hw.textContent=z==="ok"?"Healthy":z==="warn"?"Degrading":"Rotting";hw.className="chip "+z;}
    $$("[data-winpct]").forEach(function(el){
      var tok=parseFloat(el.getAttribute("data-winpct"));
      el.textContent=(100*tok/win).toFixed(tok/win<0.01?2:1)+"%";
    });
    var fs=$("#bar-free");
    if(fs){var used=D.peak;fs.style.flex=Math.max(0,(win-used))+"";
      $$(".budgetbar .seg[data-tok]").forEach(function(s){s.style.flex=parseFloat(s.getAttribute("data-tok"))+"";});}
  }
  var ws=$("#window-select");
  if(ws) ws.addEventListener("change",function(){
    var v=ws.value==="custom"?parseInt(prompt("Context window (tokens):",D.window)||D.window,10):parseInt(ws.value,10);
    if(v>0) recompute(v);
  });

  // expand / collapse all
  $$("[data-expand-all]").forEach(function(b){b.addEventListener("click",function(){
    var sel=b.getAttribute("data-expand-all");var open=b.getAttribute("data-open")!=="1";
    $$(sel+" details.evt").forEach(function(d){if(!d.classList.contains("hidden"))d.open=open});
    b.setAttribute("data-open",open?"1":"0");b.textContent=(open?"Collapse":"Expand")+" "+b.getAttribute("data-label");
  })});

  // table sorting
  $$("table[data-sortable]").forEach(function(t){
    $$("th[data-sort]",t).forEach(function(th,ci){
      th.addEventListener("click",function(){
        var tb=$("tbody",t);var rows=$$("tr",tb);
        var asc=th.getAttribute("data-dir")!=="asc";
        var type=th.getAttribute("data-sort");
        rows.sort(function(a,b){
          var x=a.children[ci].getAttribute("data-v")||a.children[ci].textContent;
          var y=b.children[ci].getAttribute("data-v")||b.children[ci].textContent;
          if(type==="num"){x=parseFloat(x)||0;y=parseFloat(y)||0;return asc?x-y:y-x;}
          return asc?(""+x).localeCompare(y):(""+y).localeCompare(x);
        });
        rows.forEach(function(r){tb.appendChild(r)});
        $$("th[data-sort]",t).forEach(function(o){o.removeAttribute("data-dir")});
        th.setAttribute("data-dir",asc?"asc":"desc");
      });
    });
  });

  // history search + filter
  var search=$("#hist-search"),roleSel=$("#hist-role"),minTok=$("#hist-min");
  function applyFilter(){
    var q=(search&&search.value||"").toLowerCase();
    var role=roleSel&&roleSel.value||"";
    var mn=parseInt(minTok&&minTok.value||"0",10)||0;
    $$("#history details.evt").forEach(function(d){
      var hay=(d.getAttribute("data-search")||"").toLowerCase();
      var k=d.getAttribute("data-kind")||"";
      var tk=parseInt(d.getAttribute("data-tok")||"0",10);
      var ok=(!q||hay.indexOf(q)>=0)&&(!role||k===role)&&tk>=mn;
      d.classList.toggle("hidden",!ok);
    });
  }
  [search,roleSel,minTok].forEach(function(el){if(el)el.addEventListener("input",applyFilter)});

  // jump + flash
  $$("[data-jump]").forEach(function(el){el.addEventListener("click",function(e){
    e.preventDefault();var t=$("#"+el.getAttribute("data-jump"));
    if(t){t.scrollIntoView({behavior:"smooth",block:"center"});
      var d=t.closest("details.evt");if(d)d.open=true;
      t.classList.remove("flash");void t.offsetWidth;t.classList.add("flash");}
  })});

  // copy buttons (lazy, delegated)
  document.addEventListener("click",function(e){
    var b=e.target.closest&&e.target.closest(".copybtn");if(!b)return;
    var pre=b.parentElement.querySelector("pre");if(!pre)return;
    navigator.clipboard&&navigator.clipboard.writeText(pre.textContent);
    var o=b.textContent;b.textContent="copied";setTimeout(function(){b.textContent=o},1200);
  });

  // click session id to copy
  var sid=$("#session-id");
  if(sid) sid.addEventListener("click",function(){
    navigator.clipboard&&navigator.clipboard.writeText(sid.getAttribute("data-full"));
    var o=sid.textContent;sid.textContent="copied!";setTimeout(function(){sid.textContent=o},1000);
  });
})();
`;
