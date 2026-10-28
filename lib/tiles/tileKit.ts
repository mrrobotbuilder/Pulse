/**
 * The tile kit: one design system every open tile shares, injected by
 * withBridge (tileBridge.ts) next to the bridge shim, so the built-in tiles,
 * the ready-made tiles and AI-written tiles all look like one app.
 *
 * Look: Apple Fitness / Health (clean cards, rings, big numbers, week charts)
 * painted in the board's own theme (the --pulse-* tokens) and type (the board's
 * fonts, handed in as data: URLs by tileFonts.ts, since a sealed tile has no
 * network). Classes are prefixed `k-`; a tile that uses none of them only gets
 * the body font and the page frame.
 *
 * window.PulseKit (alias window.Kit) holds the drawing helpers: ring, rings,
 * bars, line, icon, sheet, toast, esc, dayKey, fmt. They return HTML strings
 * (sheet and toast act directly). See public/tiles/README.md for the contract.
 */

const CSS = `
:root{
  --k-surface:var(--pulse-surface,#FFFFFF);
  --k-bg:var(--pulse-bg,#EEF1F4);
  --k-text:var(--pulse-text,#16233B);
  --k-muted:var(--pulse-muted,#4F5B6D);
  --k-line:var(--pulse-line,#C3CCD8);
  --k-accent:var(--pulse-accent,#C2271D);
  --k-ink:var(--pulse-accent-ink,#FFFFFF);
  --k-gold:var(--pulse-gold,#855600);
  --k-signal:var(--pulse-signal,#08734A);
  --k-tint:var(--k-accent);
  --k-card:color-mix(in srgb,var(--k-bg) 62%,var(--k-surface));
  --k-hair:color-mix(in srgb,var(--k-line) 70%,transparent);
  --k-display:"Pulse Display",ui-rounded,system-ui,-apple-system,"Segoe UI",sans-serif;
  --k-body:"Pulse Body",system-ui,-apple-system,"Segoe UI",sans-serif;
  --k-mono:"Pulse Mono",ui-monospace,"SF Mono",Menlo,Consolas,monospace;
  --k-r:16px;
}
/* Category hues, Apple Health style. Mixed with the theme's text colour, so they
   darken on paper themes (white text on them stays readable) and lighten on dark ones. */
.k-hue-red{--k-tint:var(--k-accent)}
.k-hue-blue{--k-tint:color-mix(in srgb,#1E6FD9 76%,var(--k-text))}
.k-hue-indigo{--k-tint:color-mix(in srgb,#5550E0 78%,var(--k-text))}
.k-hue-teal{--k-tint:color-mix(in srgb,#0E8A8A 78%,var(--k-text))}
.k-hue-magenta{--k-tint:color-mix(in srgb,#D02A6A 78%,var(--k-text))}
.k-hue-orange{--k-tint:color-mix(in srgb,#D9590F 76%,var(--k-text))}
.k-hue-green{--k-tint:var(--k-signal)}
.k-hue-gold{--k-tint:var(--k-gold)}
*,*::before,*::after{box-sizing:border-box}
html,body{background:transparent!important;height:auto!important;min-height:0!important}
body{margin:0!important;padding:0!important;font:16px/1.5 var(--k-body);color:var(--k-text);-webkit-font-smoothing:antialiased;-webkit-text-size-adjust:100%}
button,input,select,textarea{font:inherit;color:inherit}
button{cursor:pointer}
:focus-visible{outline:2px solid var(--k-text);outline-offset:2px}
.starterTag,.shell>h1,.shell>h1+.sub{display:none!important}
body::before,body::after{display:none!important}
.shell{max-width:720px!important;margin:0 auto!important;padding:20px 20px 48px!important}

.k-page{max-width:720px;margin:0 auto;padding:18px 18px 56px;display:grid;gap:14px}
.k-label{font:500 11.5px/1.3 var(--k-mono);letter-spacing:.07em;text-transform:uppercase;color:var(--k-muted)}
.k-title{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin:14px 2px 0;font:700 21px/1.15 var(--k-display);letter-spacing:-.01em}
.k-title .k-label{font-size:11px}
.k-title button{border:0;background:none;color:var(--k-tint);font:600 14px var(--k-body);padding:6px 2px;min-height:36px}
.k-card{background:var(--k-card);border:1px solid var(--k-hair);border-radius:var(--k-r);padding:16px}
.k-card.k-plain{background:var(--k-surface);border-color:var(--k-line)}
.k-card.k-tap{cursor:pointer;transition:transform .15s}
.k-card.k-tap:active{transform:scale(.99)}
.k-head{display:flex;align-items:center;gap:8px;margin-bottom:8px}
.k-head .k-cat{display:inline-flex;align-items:center;gap:6px;color:var(--k-tint);font:700 14px var(--k-body)}
.k-head .k-cat svg{width:17px;height:17px}
.k-head .k-time{margin-left:auto;font:500 12px var(--k-mono);color:var(--k-muted)}
.k-big{font:700 clamp(44px,11vw,68px)/.95 var(--k-display);font-variation-settings:"wdth" 80;letter-spacing:-.025em;font-variant-numeric:tabular-nums}
.k-big small,.k-mid small{font:500 .3em var(--k-body);letter-spacing:0;color:var(--k-muted);margin-left:.18em}
.k-mid{font:700 30px/1 var(--k-display);font-variation-settings:"wdth" 85;letter-spacing:-.015em;font-variant-numeric:tabular-nums}
.k-mid small{font-size:.5em}
.k-sub{color:var(--k-muted);font-size:14px;line-height:1.4}
.k-hero{display:grid;justify-items:center;text-align:center;gap:6px;padding:6px 0 4px}
.k-ringbox{position:relative;display:grid;place-items:center}
.k-ringbox>svg{display:block}
.k-ringbox .k-in{position:absolute;inset:0;display:grid;place-content:center;text-align:center;gap:2px}
.k-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px}
.k-grid.k-2{grid-template-columns:1fr 1fr}
.k-grid.k-3{grid-template-columns:repeat(3,1fr)}
.k-stat{background:var(--k-card);border:1px solid var(--k-hair);border-radius:14px;padding:12px 14px;min-width:0}
.k-stat .k-mid{margin-top:4px;font-size:26px}
.k-stat .k-sub{margin-top:2px;font-size:13px}
.k-up{color:var(--k-signal)}.k-down{color:var(--k-accent)}
/* Apple Fitness touches (checked against the Fitness app's Summary, 2026-10-28):
   stat values in the metric's colour, and one bold sentence under the hero ring. */
.k-stat .k-mid{color:var(--k-tint)}
.k-stat .k-mid small{color:var(--k-muted)}
.k-hero>.k-sub,.k-hero>p.k-sub{font:700 18px/1.3 var(--k-display);letter-spacing:-.01em;color:var(--k-text);max-width:34ch;text-wrap:balance}
.k-hero>.k-sub svg{width:18px;height:18px}
.k-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:50px;padding:0 22px;border:0;border-radius:14px;background:var(--k-tint);color:var(--k-ink);font:700 16px var(--k-body);text-decoration:none;transition:transform .12s,opacity .12s;-webkit-user-select:none;user-select:none}
.k-btn:active{transform:scale(.97)}
.k-btn:disabled{opacity:.42;cursor:not-allowed;transform:none}
.k-btn svg{width:18px;height:18px}
.k-btn.k-ghost{background:var(--k-surface);color:var(--k-text);border:1px solid var(--k-line)}
.k-btn.k-soft{background:color-mix(in srgb,var(--k-tint) 13%,var(--k-surface));color:var(--k-tint)}
.k-btn.k-wide{width:100%}
.k-btn.k-sm{min-height:40px;padding:0 14px;font-size:14px;border-radius:11px}
.k-btn.k-danger{background:transparent;color:var(--k-accent);border:1px solid color-mix(in srgb,var(--k-accent) 45%,transparent)}
.k-row-btns{display:flex;gap:10px;flex-wrap:wrap}
.k-row-btns>.k-btn{flex:1 1 0}
.k-round{width:52px;height:52px;flex:none;display:grid;place-items:center;border-radius:50%;border:1px solid var(--k-line);background:var(--k-surface);color:var(--k-text);font:400 26px/1 var(--k-body);transition:transform .12s}
.k-round:active{transform:scale(.93)}
.k-round svg{width:22px;height:22px}
.k-round.k-fill{background:var(--k-tint);border-color:var(--k-tint);color:var(--k-ink)}
.k-x{width:36px;height:36px;flex:none;display:grid;place-items:center;border-radius:50%;border:0;background:color-mix(in srgb,var(--k-text) 8%,transparent);color:var(--k-muted)}
.k-x svg{width:16px;height:16px}
.k-chips{display:flex;flex-wrap:wrap;gap:8px}
.k-chips.k-scroll{flex-wrap:nowrap;overflow-x:auto;padding-bottom:4px;scrollbar-width:none}
.k-chips.k-scroll::-webkit-scrollbar{display:none}
.k-chip{flex:none;min-height:40px;padding:0 15px;display:inline-flex;align-items:center;gap:6px;border-radius:999px;border:1px solid var(--k-line);background:var(--k-surface);color:var(--k-text);font:600 14px var(--k-body);white-space:nowrap}
.k-chip[aria-pressed=true],.k-chip[aria-selected=true]{background:var(--k-text);border-color:var(--k-text);color:var(--k-surface)}
.k-seg{display:flex;gap:3px;padding:3px;border-radius:13px;background:color-mix(in srgb,var(--k-text) 7%,transparent)}
.k-seg button{flex:1 1 0;min-height:40px;padding:0 10px;border:0;border-radius:10px;background:transparent;color:var(--k-muted);font:600 14px var(--k-body);white-space:nowrap}
.k-seg button[aria-selected=true]{background:var(--k-surface);color:var(--k-text);box-shadow:0 1px 3px color-mix(in srgb,var(--k-text) 18%,transparent)}
.k-list{background:var(--k-card);border:1px solid var(--k-hair);border-radius:var(--k-r);overflow:hidden}
.k-row{display:flex;align-items:center;gap:12px;min-height:58px;padding:10px 14px;border:0;border-bottom:1px solid var(--k-hair);background:transparent;width:100%;text-align:left;color:inherit}
.k-row:last-child{border-bottom:0}
button.k-row:active{background:color-mix(in srgb,var(--k-text) 5%,transparent)}
.k-row .k-main{flex:1;min-width:0}
.k-row .k-main b{display:block;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.k-row .k-main span{display:block;color:var(--k-muted);font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.k-row .k-end{flex:none;text-align:right;font:700 16px var(--k-display);font-variant-numeric:tabular-nums}
.k-row .k-end small{display:block;font:500 12px var(--k-body);color:var(--k-muted)}
.k-row .k-chev{flex:none;width:16px;height:16px;color:var(--k-muted)}
.k-ico{width:40px;height:40px;flex:none;display:grid;place-items:center;border-radius:12px;background:color-mix(in srgb,var(--k-tint) 14%,var(--k-surface));color:var(--k-tint)}
.k-ico svg{width:22px;height:22px}
.k-ico.k-lg{width:56px;height:56px;border-radius:16px}
.k-ico.k-lg svg{width:40px;height:40px}
.k-field{display:grid;gap:6px}
.k-field>span{font:500 11.5px var(--k-mono);letter-spacing:.07em;text-transform:uppercase;color:var(--k-muted)}
.k-input{width:100%;min-height:48px;padding:0 14px;border-radius:12px;border:1px solid var(--k-line);background:var(--k-surface);color:var(--k-text);font:400 16px var(--k-body)}
select.k-input{appearance:auto}
textarea.k-input{padding:12px 14px;min-height:88px;resize:vertical}
.k-input::placeholder{color:var(--k-muted);opacity:.8}
.k-search{position:relative}
.k-search svg{position:absolute;left:13px;top:50%;width:18px;height:18px;transform:translateY(-50%);color:var(--k-muted)}
.k-search .k-input{padding-left:40px;border-radius:12px;background:color-mix(in srgb,var(--k-text) 6%,transparent);border-color:transparent}
.k-stepper{display:flex;align-items:center;justify-content:center;gap:18px}
.k-stepper .k-val{min-width:120px;text-align:center}
.k-bar{height:10px;border-radius:99px;background:color-mix(in srgb,var(--k-tint) 16%,transparent);overflow:hidden}
.k-bar>i{display:block;height:100%;border-radius:99px;background:var(--k-tint);transition:width .4s cubic-bezier(.2,.8,.2,1)}
.k-tag{display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:99px;background:color-mix(in srgb,var(--k-tint) 14%,transparent);color:var(--k-tint);font:600 12px var(--k-body);white-space:nowrap}
.k-tag.k-neutral{background:color-mix(in srgb,var(--k-text) 8%,transparent);color:var(--k-muted)}
.k-empty{display:grid;justify-items:center;gap:8px;text-align:center;padding:22px 12px;color:var(--k-muted)}
.k-empty svg{width:34px;height:34px;color:var(--k-tint)}
.k-empty b{color:var(--k-text);font:700 17px var(--k-display)}
.k-err{color:var(--k-accent);font-weight:600}
.k-sub svg,.k-note svg,.k-tag svg,.k-label svg{width:1.15em;height:1.15em;flex:none;vertical-align:-.2em}
.k-note{font-size:13px;color:var(--k-muted);text-align:center}
.k-chart{display:block;width:100%;overflow:visible}
.k-bars{position:relative;display:flex;align-items:stretch;gap:6px}
.k-bcol{flex:1 1 0;display:flex;flex-direction:column;align-items:center;gap:6px;min-width:0}
.k-btrack{position:relative;flex:1;width:min(28px,70%);border-radius:99px;background:color-mix(in srgb,var(--k-tint) 10%,transparent);overflow:hidden}
.k-btrack i{position:absolute;left:0;right:0;bottom:0;border-radius:99px;background:var(--k-tint);transition:height .45s cubic-bezier(.2,.8,.2,1)}
.k-bcol span{font:500 11px var(--k-mono);color:var(--k-muted);white-space:nowrap;line-height:16px}
.k-bcol span.k-now{color:var(--k-text);font-weight:700}
.k-bgoal{position:absolute;left:0;right:0;border-top:1.5px dashed color-mix(in srgb,var(--k-text) 45%,transparent);pointer-events:none}
.k-xl{display:flex;justify-content:space-between;margin-top:4px;font:500 11px var(--k-mono);color:var(--k-muted)}
.k-chart text{font:500 10.5px var(--k-mono);fill:var(--k-muted)}
.k-chart .k-now{fill:var(--k-text);font-weight:700}
.k-veil{position:fixed;inset:0;z-index:50;display:flex;align-items:flex-end;justify-content:center;background:color-mix(in srgb,var(--k-text) 32%,transparent);animation:k-fade .18s ease-out}
.k-sheet{width:min(680px,100%);max-height:90vh;overflow:auto;background:var(--k-surface);border-radius:22px 22px 0 0;padding:0 18px 28px;box-shadow:0 -10px 40px color-mix(in srgb,var(--k-text) 20%,transparent);animation:k-up .26s cubic-bezier(.2,.8,.2,1)}
.k-sheet-head{position:sticky;top:0;z-index:1;display:flex;align-items:center;gap:10px;padding:14px 0 12px;background:var(--k-surface)}
.k-sheet-head h2{flex:1;margin:0;font:700 20px var(--k-display)}
.k-sheet-body{display:grid;gap:14px}
@media (min-width:700px){.k-veil{align-items:center}.k-sheet{border-radius:22px}}
.k-toast{position:fixed;left:50%;bottom:18px;z-index:60;transform:translateX(-50%);max-width:calc(100% - 32px);padding:11px 16px;border-radius:14px;background:var(--k-text);color:var(--k-surface);font:600 14px var(--k-body);box-shadow:0 6px 24px color-mix(in srgb,var(--k-text) 30%,transparent);animation:k-up .22s cubic-bezier(.2,.8,.2,1)}
.k-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
@keyframes k-fade{from{opacity:0}}
@keyframes k-up{from{transform:translateY(24px);opacity:0}}
.k-toast{animation-name:k-toastin}
@keyframes k-toastin{from{transform:translate(-50%,16px);opacity:0}}
@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}}
@media (max-width:480px){.k-page{padding:14px 14px 48px}.k-grid.k-3{grid-template-columns:1fr 1fr}}
`

// The helpers. Plain ES5-style JS (no template literals) so it can sit inside this TS string.
const JS = `
(function(){
  function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return '&#'+c.charCodeAt(0)+';'})}
  function pad(n){return n<10?'0'+n:''+n}
  function dayKey(d){d=d||new Date();return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())}
  function fmt(n,dp){if(n==null||!isFinite(n))return '—';var p=Math.pow(10,dp==null?1:dp);var v=Math.round(n*p)/p;return v.toLocaleString('en-US',{maximumFractionDigits:dp==null?1:dp})}
  var P={
    dumbbell:'<path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11"/>',
    drop:'<path d="M12 3.5s-6 6.6-6 11a6 6 0 0 0 12 0c0-4.4-6-11-6-11z"/>',
    moon:'<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
    heart:'<path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z"/>',
    pulse:'<path d="M3 12h4l2-5 4 10 2-5h6"/>',
    chart:'<path d="M4 19V5M4 19h16M8 15l3.5-4 3 2.5L20 7"/>',
    wallet:'<rect x="3" y="6" width="18" height="13" rx="3"/><path d="M3 10h18M16 14.5h2"/>',
    coins:'<ellipse cx="9" cy="7" rx="5.5" ry="2.5"/><path d="M3.5 7v5c0 1.4 2.5 2.5 5.5 2.5M3.5 12v5c0 1.4 2.5 2.5 5.5 2.5"/><ellipse cx="15" cy="13" rx="5.5" ry="2.5"/><path d="M9.5 13v5c0 1.4 2.5 2.5 5.5 2.5s5.5-1.1 5.5-2.5v-5"/>',
    play:'<rect x="3" y="5.5" width="18" height="13" rx="4"/><path d="M10.5 9.5v5l4.5-2.5z"/>',
    walk:'<circle cx="13" cy="4.5" r="1.8"/><path d="M10 21l2-6 3 3v3M9 11l3-3 3 3 3 1M12 8l-1 7"/>',
    plus:'<path d="M12 5v14M5 12h14"/>',
    minus:'<path d="M5 12h14"/>',
    check:'<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    trash:'<path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13"/>',
    chev:'<path d="M9 5l7 7-7 7"/>',
    back:'<path d="M15 5l-7 7 7 7"/>',
    close:'<path d="M6 6l12 12M18 6L6 18"/>',
    search:'<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
    flame:'<path d="M12 21c-3.9 0-6.5-2.6-6.5-6.2 0-4.3 4.3-6.4 4.3-10.8 3.3 1.6 5.3 4.4 5.6 7.4.8-.6 1.3-1.6 1.4-2.6 1.3 1.5 1.7 3.4 1.7 5 0 4.3-2.7 7.2-6.5 7.2z"/>',
    clock:'<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    star:'<path d="M12 3.8l2.5 5.2 5.7.7-4.2 3.9 1.1 5.6L12 16.4l-5.1 2.8L8 13.6 3.8 9.7l5.7-.7z"/>',
    trophy:'<path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H4.5a3.5 3.5 0 0 0 3.7 3.8M16 6h3.5a3.5 3.5 0 0 1-3.7 3.8M12 13v4M8.5 20h7M10 17h4v3h-4z"/>',
    up:'<path d="M12 19V5M6 11l6-6 6 6"/>',
    down:'<path d="M12 5v14M6 13l6 6 6-6"/>',
    edit:'<path d="M15 5l4 4L8.5 19.5H4.5v-4z"/>',
    calendar:'<rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    bolt:'<path d="M13 3L5 13.5h6L10 21l8-10.5h-6z"/>',
    timer:'<circle cx="12" cy="13.5" r="7"/><path d="M12 10v3.5l2 1.5M10 3h4M12 3v3.5"/>',
    list:'<path d="M9 6.5h11M9 12h11M9 17.5h11M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01"/>',
    target:'<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r=".8"/>',
    sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/>',
    bed:'<path d="M3 18.5V7M3 14h18v4.5M21 14v-2.5A3.5 3.5 0 0 0 17.5 8H11v6"/><circle cx="7" cy="11" r="1.7"/>',
    leaf:'<path d="M5 19c0-8 5-13 14-14-1 9-6 14-14 14zM5 19l7-7"/>',
    book:'<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5zM4 20.5A2.5 2.5 0 0 0 6.5 23"/>',
    cup:'<path d="M5 8h11v6a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5zM16 10h1.5a2.5 2.5 0 0 1 0 5H16M8 3.5v2M11 3.5v2"/>',
    phone:'<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/>',
    brain:'<path d="M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 6 1V5a3 3 0 0 0-3-1zM15 4a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-6 1"/>',
    scale:'<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><path d="M8.5 9a5 5 0 0 1 7 0l-2.5 2.5"/>',
    smile:'<circle cx="12" cy="12" r="8.5"/><path d="M8.5 14a4.5 4.5 0 0 0 7 0M9 9.5h.01M15 9.5h.01"/>',
    send:'<path d="M4 12l16-8-6 16-2.5-6.5z"/>',
    piggy:'<path d="M5 11a6 5 0 0 1 11-2.5h2l-.5 2.5 2 1v3l-2 .5-1.5 2.5V20h-2.5v-1.5h-4V20H7v-2.5A5 5 0 0 1 5 11z"/><path d="M10 6.5V5"/>',
    globe:'<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.6 2.5 14.4 0 17M12 3.5c-2.5 2.6-2.5 14.4 0 17"/>'
  };
  function icon(name,cls){return '<svg'+(cls?' class="'+cls+'"':'')+' viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(P[name]||P.target)+'</svg>'}

  /* One Apple-style ring: track, arc with a round cap, and a second lap past 100%. */
  function arc(cx,r,frac,color,w,op){
    var C=2*Math.PI*r,f=Math.max(0,Math.min(1,frac));
    return '<circle cx="'+cx+'" cy="'+cx+'" r="'+r+'" fill="none" stroke="'+color+'" stroke-width="'+w+'" stroke-linecap="round" stroke-dasharray="'+(C*f).toFixed(2)+' '+C.toFixed(2)+'" transform="rotate(-90 '+cx+' '+cx+')"'+(op?' opacity="'+op+'"':'')+(f<=0?' stroke-opacity="0"':'')+'/>';
  }
  function rings(list,o){
    o=o||{};var S=o.size||220,w=o.stroke||Math.max(12,Math.round(S/7.5)),gap=o.gap==null?3:o.gap,cx=S/2,out='';
    for(var i=0;i<list.length;i++){
      var it=list[i],r=cx-w/2-i*(w+gap),col=it.color||'var(--k-tint)',v=it.value||0;
      out+='<circle cx="'+cx+'" cy="'+cx+'" r="'+r+'" fill="none" stroke="'+col+'" stroke-opacity=".16" stroke-width="'+w+'"/>';
      out+=arc(cx,r,v,col,w);
      if(v>1)out+=arc(cx,r,v-1,'color-mix(in srgb, '+col+' 70%, #000)',w);
    }
    return '<svg width="'+S+'" height="'+S+'" viewBox="0 0 '+S+' '+S+'" role="img" aria-label="'+esc(o.label||'')+'">'+out+'</svg>';
  }
  function ring(value,o){o=o||{};return rings([{value:value,color:o.color}],o)}

  /* Week-style bars, as HTML so labels stay crisp. o: labels, goal (dashed line), max, height, color, now (index to stress), fmt */
  function bars(vals,o){
    o=o||{};var n=vals.length,H=o.height||140;
    var max=o.max||Math.max.apply(null,vals.concat([o.goal||0,1])),out='';
    for(var i=0;i<n;i++){
      var v=vals[i]||0,pc=Math.max(v>0?3:0,Math.min(100,(v/max)*100)),isNow=o.now===i,dim=o.now!=null&&!isNow;
      out+='<div class="k-bcol" title="'+esc((o.labels&&o.labels[i]||'')+': '+(o.fmt?o.fmt(v):fmt(v)))+'"><div class="k-btrack"><i style="height:'+pc.toFixed(1)+'%'+(o.color?';background:'+o.color:'')+(dim?';opacity:.55':'')+'"></i></div>'+(o.labels?'<span'+(isNow?' class="k-now"':'')+'>'+esc(o.labels[i])+'</span>':'')+'</div>';
    }
    var goal=o.goal?'<div class="k-bgoal" style="bottom:calc(var(--k-bh) * '+Math.min(1,o.goal/max).toFixed(3)+' + '+(o.labels?22:0)+'px)"></div>':'';
    return '<div class="k-bars" role="img" aria-label="'+esc(o.label||'Chart')+'" style="--k-bh:'+(H-(o.labels?22:0))+'px;height:'+H+'px">'+out+goal+'</div>';
  }

  /* A smooth line with a soft area under it. o: labels (first/last shown), height, color, min, max, dots, goal */
  function line(vals,o){
    o=o||{};var pts=[];for(var i=0;i<vals.length;i++)if(vals[i]!=null&&isFinite(vals[i]))pts.push([i,vals[i]]);
    var H=o.height||150,W=600,top=12,ch=H-top-(o.labels?22:8),col=o.color||'var(--k-tint)';
    if(pts.length<2)return '<div class="k-empty" style="padding:12px">'+esc(o.empty||'Log two days to see a trend line.')+'</div>';
    var ys=pts.map(function(p){return p[1]}),mn=o.min!=null?o.min:Math.min.apply(null,ys),mx=o.max!=null?o.max:Math.max.apply(null,ys);
    if(o.goal!=null){mn=Math.min(mn,o.goal);mx=Math.max(mx,o.goal)}
    if(mx===mn){mx+=1;mn-=1}var pad=(mx-mn)*.12;mn-=pad;mx+=pad;
    var X=function(i){return vals.length<2?W/2:(i/(vals.length-1))*W},Y=function(v){return top+(1-(v-mn)/(mx-mn))*ch};
    var p=pts.map(function(q){return [X(q[0]),Y(q[1])]}),d='M'+p[0][0].toFixed(1)+' '+p[0][1].toFixed(1);
    for(var k=0;k<p.length-1;k++){var a=p[k-1]||p[k],b=p[k],c=p[k+1],e=p[k+2]||c;
      d+=' C'+(b[0]+(c[0]-a[0])/6).toFixed(1)+' '+(b[1]+(c[1]-a[1])/6).toFixed(1)+','+(c[0]-(e[0]-b[0])/6).toFixed(1)+' '+(c[1]-(e[1]-b[1])/6).toFixed(1)+','+c[0].toFixed(1)+' '+c[1].toFixed(1)}
    var gid='g'+Math.random().toString(36).slice(2,7),out='<defs><linearGradient id="'+gid+'" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="'+col+'" stop-opacity=".28"/><stop offset="1" stop-color="'+col+'" stop-opacity="0"/></linearGradient></defs>';
    out+='<path d="'+d+' L'+p[p.length-1][0].toFixed(1)+' '+(top+ch)+' L'+p[0][0].toFixed(1)+' '+(top+ch)+'Z" fill="url(#'+gid+')"/>';
    if(o.goal!=null){var gy=Y(o.goal);out+='<line x1="0" x2="'+W+'" y1="'+gy.toFixed(1)+'" y2="'+gy.toFixed(1)+'" stroke="var(--k-text)" stroke-opacity=".4" stroke-dasharray="5 5" vector-effect="non-scaling-stroke"/>'}
    out+='<path d="'+d+'" fill="none" stroke="'+col+'" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>';
    var L=p[p.length-1];out+='<circle cx="'+L[0].toFixed(1)+'" cy="'+L[1].toFixed(1)+'" r="4.5" fill="var(--k-surface)" stroke="'+col+'" stroke-width="2.5" vector-effect="non-scaling-stroke"/>';
    var svg='<svg class="k-chart" viewBox="0 0 '+W+' '+(top+ch)+'" preserveAspectRatio="none" style="height:'+(top+ch)+'px" role="img" aria-label="'+esc(o.label||'Trend')+'">'+out+'</svg>';
    return o.labels?svg+'<div class="k-xl"><span>'+esc(o.labels[0]||'')+'</span><span>'+esc(o.labels[o.labels.length-1]||'')+'</span></div>':svg;
  }

  /* A bottom sheet. Returns close(). The body is HTML; mount(el, close) wires it up. */
  function sheet(title,body,mount){
    var prev=document.activeElement,veil=document.createElement('div');
    veil.className='k-veil';
    veil.innerHTML='<div class="k-sheet" role="dialog" aria-modal="true" aria-label="'+esc(title)+'"><div class="k-sheet-head"><h2>'+esc(title)+'</h2><button type="button" class="k-x" data-k-close aria-label="Close">'+icon('close')+'</button></div><div class="k-sheet-body">'+body+'</div></div>';
    function close(){document.removeEventListener('keydown',onKey);veil.remove();if(prev&&prev.focus)try{prev.focus()}catch(e){}}
    function onKey(e){if(e.key==='Escape')close()}
    veil.addEventListener('mousedown',function(e){if(e.target===veil)close()});
    veil.addEventListener('click',function(e){if(e.target.closest('[data-k-close]'))close()});
    document.addEventListener('keydown',onKey);
    document.body.appendChild(veil);
    var f=veil.querySelector('input,select,textarea')||veil.querySelector('[data-k-close]');if(f)try{f.focus()}catch(e){}
    if(mount)mount(veil.querySelector('.k-sheet'),close);
    return close;
  }
  var toastT;
  function toast(msg){var old=document.querySelector('.k-toast');if(old)old.remove();var t=document.createElement('div');t.className='k-toast';t.setAttribute('role','status');t.textContent=msg;document.body.appendChild(t);clearTimeout(toastT);toastT=setTimeout(function(){t.remove()},2400)}

  /* A failure inside a click handler is otherwise invisible: say it on screen. */
  window.addEventListener('error',function(e){toast('Something broke: '+(e.message||'unknown error'))});
  window.addEventListener('unhandledrejection',function(e){var r=e.reason;toast('Could not finish: '+(r&&r.message||r||'unknown error'))});

  /* Esc inside the tile closes the tile on the board, unless a sheet is open (then it closes the sheet). Registered before any sheet, so it runs first. */
  document.addEventListener('keydown',function(e){if(e.key==='Escape'&&!document.querySelector('.k-veil'))parent.postMessage({source:'vitality-tile',type:'escape'},'*')});

  window.PulseKit=window.Kit={esc:esc,dayKey:dayKey,fmt:fmt,icon:icon,ring:ring,rings:rings,bars:bars,line:line,sheet:sheet,toast:toast};
})();
`

export const TILE_KIT = `<style>${CSS}</style><script>${JS}</script>`

/** What withBridge puts in an open tile's head: the board's fonts (tileFonts.ts) and the kit. */
export function kitHead(fontCss = ''): string {
  // Only ever @font-face rules with data: URLs; anything else is dropped.
  const fonts = /^@font-face\{[^<]*$/.test(fontCss) ? `<style>${fontCss}</style>` : ''
  return fonts + TILE_KIT
}
