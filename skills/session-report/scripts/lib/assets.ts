/** Inline CSS and vanilla-JS for the self-contained report (no external libs). */

export const CSS = `
:root{
  /* palette — adopted from the personal design system (OKLCH, teal primary) */
  --bg:oklch(0.1457 0 0); --panel:oklch(0.205 0.006 224); --panel2:oklch(0.262 0.009 224);
  --line:oklch(0.7869 0.1165 192.26 / 0.16); --line2:oklch(0.7869 0.1165 192.26 / 0.30);
  --tx:oklch(0.92 0 0); --mut:oklch(0.71 0.013 220); --mut2:oklch(0.58 0.018 214);
  --primary:oklch(0.7869 0.1165 192.26); --blue:var(--primary);
  --green:oklch(0.76 0.16 156); --amber:oklch(0.82 0.15 78); --red:oklch(0.704 0.191 22.216);
  --c-system_tools:#6e7681; --c-listings:#58a6ff; --c-memory:#bc8cff; --c-files:#39c5cf;
  --c-prompts:#3fb950; --c-tool_results:#f0883e; --c-assistant_text:#d29922;
  --c-thinking:#db61a2; --c-other:#8a929e; --c-unattributed:#484f58;
  /* radius scale (base 1rem) and elevation */
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
.hdr .sub #session-id{cursor:pointer;color:var(--primary)}
.gauge{width:100%}
.gauge-track{height:16px;background:var(--panel2);border:1px solid var(--line);border-radius:999px;position:relative;overflow:hidden}
.gauge-fill{height:100%;border-radius:999px;transition:width .35s ease,background .35s ease;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.25)}
.gauge-dz{position:absolute;top:-3px;bottom:-3px;width:2px;background:var(--red);opacity:.75}
.gauge-lab{font-size:11px;color:var(--mut);margin-top:5px;display:flex;justify-content:space-between;font-family:var(--mono)}
.chips{display:flex;gap:7px;flex-wrap:wrap;justify-content:flex-start}
.chip{position:relative;font-size:10px;font-family:var(--mono);padding:4px 10px;border-radius:999px;border:1px solid var(--line2);
  background:color-mix(in srgb,var(--panel) 70%,transparent);color:var(--tx);cursor:default;white-space:nowrap;
  transition:border-color .15s,background .15s,transform .1s}
.chip[data-jump]{cursor:pointer}
.chip[data-tip]:not([data-jump]){cursor:help}
.chip:hover{border-color:var(--primary);transform:translateY(-1px)}
.chip[data-tip]::after{content:attr(data-tip);position:absolute;left:0;top:calc(100% + 8px);z-index:60;
  width:max-content;max-width:300px;background:var(--panel2);color:var(--tx);border:1px solid var(--line2);
  border-radius:var(--r-sm);box-shadow:var(--shadow);padding:8px 11px;font-family:var(--sans);font-size:11.5px;
  font-weight:400;line-height:1.55;white-space:normal;text-align:left;
  opacity:0;visibility:hidden;transform:translateY(-3px);transition:opacity .14s,transform .14s,visibility .14s;
  pointer-events:none}
.chip[data-tip]::before{content:"";position:absolute;left:14px;top:calc(100% + 3px);z-index:61;width:9px;height:9px;
  background:var(--panel2);border-left:1px solid var(--line2);border-top:1px solid var(--line2);transform:rotate(45deg);
  opacity:0;visibility:hidden;transition:opacity .14s,visibility .14s;pointer-events:none}
.chip[data-tip]:hover::after{opacity:1;visibility:visible;transform:translateY(0)}
.chip[data-tip]:hover::before{opacity:1;visibility:visible}
.chip.ok{border-color:oklch(from var(--green) l c h / 0.5);color:var(--green);background:oklch(from var(--green) l c h / 0.1)}
.chip.warn{border-color:oklch(from var(--amber) l c h / 0.5);color:var(--amber);background:oklch(from var(--amber) l c h / 0.1)}
.chip.bad{border-color:oklch(from var(--red) l c h / 0.5);color:var(--red);background:oklch(from var(--red) l c h / 0.1)}
.controls{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.controls select,.controls button{background:var(--panel);color:var(--tx);border:1px solid var(--line2);
  border-radius:var(--r-sm);padding:5px 10px;font-size:12px;font-family:var(--sans);cursor:pointer;
  transition:border-color .15s,background .15s}
.controls select:hover,.controls button:hover{border-color:var(--primary)}

/* sections */
section{background:var(--panel);border:1px solid var(--line);border-radius:var(--r-lg);padding:24px 26px;
  box-shadow:var(--shadow)}
section>h2{font-size:19px;margin-bottom:5px}
section>.lead{color:var(--mut);font-size:13px;margin-bottom:18px;max-width:78ch;line-height:1.5}
/* full history: no card chrome — its event rows are already cards, so nesting looks odd */
#history{background:none;border:none;box-shadow:none;padding:0}
.prose{font-size:13.5px;line-height:1.65;max-width:82ch;color:var(--tx)}
.prose p{margin:0 0 12px}
.prose p:last-child{margin-bottom:0}
.prose strong{font-weight:680}
.prose code{font-size:.9em}
.flash{animation:flash 1.4s ease-out}
@keyframes flash{0%{box-shadow:0 0 0 2px var(--amber)}100%{box-shadow:0 0 0 0 transparent}}

/* metadata grid */
.metagrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:1px;background:var(--line);
  border:1px solid var(--line);border-radius:var(--r-md);overflow:hidden}
.metacell{background:var(--panel);padding:13px 16px;transition:background .15s}
.metacell:hover{background:var(--panel2)}
.metacell .k{font-size:10.5px;color:var(--mut);text-transform:uppercase;letter-spacing:.06em;font-weight:600}
.metacell .v{font-size:20px;font-family:var(--mono);font-variant-numeric:tabular-nums;margin-top:5px;letter-spacing:-0.01em}
.metacell .v small{font-size:12px;color:var(--mut);font-family:var(--sans);letter-spacing:0}
.dotted{border-bottom:1px dotted var(--mut);cursor:help}

/* budget bar */
.budgetbar{display:flex;height:64px;border-radius:var(--r-md);overflow:hidden;border:1px solid var(--line);
  margin:8px 0 6px;box-shadow:var(--shadow-sm)}
.budgetbar .seg{position:relative;min-width:0;transition:filter .15s}
.budgetbar .seg:hover{filter:brightness(1.18)}
.budgetbar .seg .segt{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
  font-size:10.5px;font-family:var(--mono);color:#0b0d10;font-weight:650;overflow:hidden;white-space:nowrap}
.budgetbar .free{background:var(--panel2)}
.bzmark{position:relative;height:14px;margin-bottom:10px}
.bzmark .l{position:absolute;top:0;bottom:0;width:2px;background:var(--red)}
.bzmark .t{position:absolute;font-size:10.5px;color:var(--red);font-family:var(--mono);top:0;transform:translateX(4px)}

/* tables */
table{width:100%;border-collapse:collapse;font-size:13px}
th,td{text-align:left;padding:9px 12px;border-bottom:1px solid var(--line)}
tbody tr:last-child td{border-bottom:none}
th{color:var(--mut);font-weight:650;font-size:11px;text-transform:uppercase;letter-spacing:.05em;cursor:pointer;
  user-select:none;position:sticky}
th[data-sort]:hover{color:var(--tx)}
tbody tr{transition:background .12s}
tr:hover>td{background:var(--panel2)}
.sw{display:inline-block;width:11px;height:11px;border-radius:3px;margin-right:8px;vertical-align:middle;
  box-shadow:0 0 0 1px rgba(0,0,0,.18) inset}
.microbar{height:6px;background:var(--panel2);border-radius:999px;overflow:hidden;margin-top:3px}
.microbar>span{display:block;height:100%;border-radius:999px}
.tag{font-size:10.5px;font-family:var(--mono);padding:1.5px 7px;border-radius:999px;background:var(--panel2);border:1px solid var(--line2)}
.tag.err{color:var(--red);border-color:var(--red)}
.warnflag{color:var(--amber);font-size:11px}

/* history */
.callout{background:var(--panel2);border:1px solid var(--line);border-left:3px solid var(--amber);
  border-radius:var(--r-sm);padding:11px 14px;margin:8px 0;font-size:13px;line-height:1.5}
.callout.bad{border-left-color:var(--red)}
.callout.ok{border-left-color:var(--green)}
details.evt{border:1px solid var(--line);border-radius:var(--r-sm);margin:6px 0;background:var(--panel2);
  overflow:hidden;transition:border-color .15s}
details.evt[open]{border-color:var(--line2)}
details.evt[data-sidechain=true]{margin-left:18px;border-left:3px solid var(--c-listings)}
details.evt summary{list-style:none;cursor:pointer;padding:9px 13px;display:grid;
  grid-template-columns:46px 116px 1fr auto;gap:11px;align-items:center}
details.evt summary::-webkit-details-marker{display:none}
details.evt summary:hover{background:var(--panel)}
details.evt .turn{font-family:var(--mono);font-size:11px;color:var(--mut)}
details.evt .prev{color:var(--mut);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12.5px}
details.evt[data-err=true]{border-left:3px solid var(--red)}
details.evt pre{margin:0;padding:14px;background:var(--bg);border-top:1px solid var(--line);
  overflow:auto;max-height:560px;font-family:var(--mono);font-size:12px;line-height:1.55;white-space:pre-wrap;word-break:break-word}
.evt-kind{font-family:var(--mono);font-size:11px;padding:3px 8px;border-radius:999px;text-align:center;font-weight:600}
.k-tool-call{background:rgba(88,166,255,.16);color:var(--blue)}
.k-tool-result{background:rgba(240,136,62,.16);color:var(--c-tool_results)}
.k-assistant-text{background:rgba(210,153,34,.16);color:var(--amber)}
.k-assistant-thinking{background:rgba(219,97,162,.16);color:var(--c-thinking)}
.k-user-prompt{background:rgba(63,185,80,.16);color:var(--green)}
.k-attachment{background:rgba(188,140,255,.16);color:var(--c-memory)}
.k-compaction,.k-summary,.k-system{background:var(--panel);color:var(--mut)}
.dzrule{display:flex;align-items:center;gap:10px;margin:16px 0;color:var(--red);font-size:12.5px;font-family:var(--mono)}
.dzrule::before,.dzrule::after{content:"";flex:1;height:1px;background:var(--red);opacity:.5}
.copybtn{font-size:11px;padding:3px 10px;border:1px solid var(--line2);border-radius:var(--r-xs);background:var(--panel);
  color:var(--mut);cursor:pointer;float:right;margin:9px;transition:border-color .15s,color .15s}
.copybtn:hover{border-color:var(--primary);color:var(--tx)}
.filterbar{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;align-items:center}
.filterbar input[type=search],.filterbar select,.filterbar button,.filterbar input[type=number]{
  background:var(--panel);color:var(--tx);border:1px solid var(--line2);border-radius:var(--r-sm);
  padding:7px 12px;font-size:13px;font-family:var(--sans);line-height:1.2;transition:border-color .15s,background .15s}
.filterbar input[type=search]{flex:1;min-width:180px;background:var(--panel2)}
.filterbar input[type=number]{width:88px}
.filterbar select,.filterbar button{cursor:pointer}
.filterbar button[data-expand-all]{font-weight:600}
.filterbar input:hover,.filterbar select:hover,.filterbar button:hover{border-color:var(--primary)}
.filterbar label.muted{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--mut)}
.controls select,.filterbar select{appearance:none;-webkit-appearance:none;
  background-image:url("data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='12'%20height='12'%20viewBox='0%200%2024%2024'%20fill='none'%20stroke='%238a929e'%20stroke-width='2.5'%20stroke-linecap='round'%20stroke-linejoin='round'%3E%3Cpath%20d='M6%209l6%206%206-6'/%3E%3C/svg%3E");
  background-repeat:no-repeat;background-position:right 11px center;background-size:11px;padding-right:32px}

/* timeline */
.timeline{width:100%;height:auto;background:var(--panel2);border:1px solid var(--line);border-radius:var(--r-md)}
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
.legend{display:flex;gap:14px;flex-wrap:wrap;margin-top:14px;font-size:11.5px;font-family:var(--mono);color:var(--mut)}
.legend span{display:inline-flex;align-items:center;gap:6px}
.hidden{display:none!important}
footer{color:var(--mut);font-size:12px;text-align:center;margin-top:10px;font-family:var(--mono)}
@media(max-width:640px){
  .wrap{padding:0 14px 72px;gap:14px}
  section{padding:18px 16px}
  .hdr{gap:12px}
  details.evt summary{grid-template-columns:38px 92px 1fr auto;gap:8px}
}
`;

export const JS = String.raw`
(function(){
  "use strict";
  var D = window.__CTX__ || {};
  function $(s,r){return (r||document).querySelector(s)}
  function $$(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s))}
  function fmt(n){return Math.round(n).toLocaleString("en-US")}
  function fmtK(n){if(n<1000)return String(Math.round(n));if(n<1e6)return (n/1000).toFixed(n<1e4?1:0)+"k";return (n/1e6).toFixed(2)+"M";}
  function esc(s){return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");}
  function zone(frac){return frac<D.dumbFraction?"ok":frac<0.75?"warn":"bad"}
  function zoneColor(frac){return frac<D.dumbFraction?"var(--green)":frac<0.75?"var(--amber)":"var(--red)"}

  // Redraw the context-growth timeline for a new window (port of lib/svg.ts).
  // Geometry constants, stack order and per-turn slices come from D.tl.
  function drawTimeline(win){
    var G=D.tl, svg=$("#timeline-svg"); if(!G||!svg) return;
    var W=G.W,H=G.H,L=G.L,R=G.R,T=G.T,B=G.B,plotW=W-L-R,plotH=H-T-B;
    var snaps=G.snaps,n=snaps.length; if(!n) return;
    function x(i){return n<=1?L+plotW/2:L+(i/(n-1))*plotW;}
    function y(t){var v=t<0?0:(t>win?win:t);return T+plotH-(v/win)*plotH;}
    function px(v){return v.toFixed(1);}
    function ap(up,lo){var d="M "+up.map(function(v,i){return px(x(i))+" "+px(y(v));}).join(" L ");for(var i=n-1;i>=0;i--)d+=" L "+px(x(i))+" "+px(y(lo[i]));return d+" Z";}
    var running=[],i;for(i=0;i<n;i++)running.push(0);
    var areas="";
    for(var c=0;c<G.cats.length;c++){
      var cat=G.cats[c],lower=running.slice();
      var upper=running.map(function(lo,j){return lo+(snaps[j].sl[c]||0);});
      var fill=cat.hatch?"url(#hatch-"+c+")":cat.color;
      areas+='<path d="'+ap(upper,lower)+'" fill="'+fill+'" fill-opacity="'+(cat.hatch?"1":"0.82")+'" stroke="none"><title>'+esc(cat.label)+'</title></path>';
      running=upper;
    }
    var sil="M "+snaps.map(function(s,j){return px(x(j))+" "+px(y(s.ctx));}).join(" L ");
    var grid="";[0,0.25,0.5,0.75,1].forEach(function(f){var yy=y(f*win);grid+='<line x1="'+L+'" y1="'+px(yy)+'" x2="'+(W-R)+'" y2="'+px(yy)+'" class="tl-grid"/><text x="'+(L-8)+'" y="'+px(yy+4)+'" class="tl-ylab">'+fmtK(f*win)+'</text>';});
    var dzY=y(D.dumbFraction*win);
    var band='<rect x="'+L+'" y="'+px(T)+'" width="'+plotW+'" height="'+px(dzY-T)+'" fill="rgba(248,81,73,0.09)"/><line x1="'+L+'" y1="'+px(dzY)+'" x2="'+(W-R)+'" y2="'+px(dzY)+'" class="tl-dz"/><text x="'+(W-R)+'" y="'+px(dzY-6)+'" class="tl-dzlab">DUMB ZONE · '+Math.round(D.dumbFraction*100)+'% = '+fmtK(D.dumbFraction*win)+'</text>';
    var ghost=win>2e5?('<line x1="'+L+'" y1="'+px(y(2e5))+'" x2="'+(W-R)+'" y2="'+px(y(2e5))+'" class="tl-ghost"/><text x="'+(L+4)+'" y="'+px(y(2e5)-5)+'" class="tl-ghostlab">200K-model ceiling</text>'):"";
    var step=Math.max(1,Math.ceil(n/10)),ticks="";
    for(i=0;i<n;i+=step)ticks+='<line x1="'+px(x(i))+'" y1="'+px(T+plotH)+'" x2="'+px(x(i))+'" y2="'+px(T+plotH+4)+'" class="tl-grid"/><text x="'+px(x(i))+'" y="'+px(T+plotH+18)+'" class="tl-xlab">'+(i+1)+'</text>';
    var comp=(G.compactions||[]).map(function(ti){return '<line x1="'+px(x(ti))+'" y1="'+px(T)+'" x2="'+px(x(ti))+'" y2="'+px(T+plotH)+'" class="tl-compact"/><text x="'+px(x(ti))+'" y="'+px(T+10)+'" class="tl-compactlab">✂ compaction</text>';}).join("");
    var dzTok=D.dumbFraction*win,ct=-1;for(i=0;i<n;i++){if(snaps[i].ctx>=dzTok){ct=i;break;}}
    var cross=ct>=0?('<line x1="'+px(x(ct))+'" y1="'+px(T)+'" x2="'+px(x(ct))+'" y2="'+px(T+plotH)+'" class="tl-cross"/><circle cx="'+px(x(ct))+'" cy="'+px(y(snaps[ct].ctx))+'" r="4" class="tl-crossdot"/><text x="'+px(x(ct)+5)+'" y="'+px(T+plotH-6)+'" class="tl-crosslab">entered @ turn '+(ct+1)+'</text>'):"";
    var pX=x(G.peakIdx),pY=y(G.peak);
    var peak='<path d="M '+px(pX)+' '+px(pY-6)+' L '+px(pX+6)+' '+px(pY)+' L '+px(pX)+' '+px(pY+6)+' L '+px(pX-6)+' '+px(pY)+' Z" class="tl-peak"/><text x="'+px(pX)+'" y="'+px(pY-10)+'" class="tl-peaklab" text-anchor="middle">peak '+fmtK(G.peak)+'</text>';
    var dots=snaps.map(function(s,j){return '<circle cx="'+px(x(j))+'" cy="'+px(y(s.ctx))+'" r="'+Math.min(4,1+s.out/6000).toFixed(1)+'" class="tl-dot"/>';}).join("");
    var defs='<defs>'+G.cats.map(function(cat,j){return cat.hatch?('<pattern id="hatch-'+j+'" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="'+cat.color+'" fill-opacity="0.5"/><line x1="0" y1="0" x2="0" y2="6" stroke="rgba(0,0,0,0.45)" stroke-width="2"/></pattern>'):"";}).join("")+'</defs>';
    svg.innerHTML=defs+band+ghost+grid+areas+'<path d="'+sil+'" class="tl-silhouette"/>'+dots+comp+cross+peak+ticks;
  }

  // theme toggle
  var tt=$("#theme-toggle");
  if(tt) tt.addEventListener("click",function(){
    var cur=document.documentElement.getAttribute("data-theme")==="light"?"dark":"light";
    document.documentElement.setAttribute("data-theme",cur);
    tt.textContent=cur==="light"?"☾ dark":"☀ light";
  });

  // window-size override -> recompute %s, gauge, verdict, and redraw the timeline
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
    drawTimeline(win);
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
