/**
 * Ready-made tiles for the "+ New tile" picker: pick one and it lands on the
 * board in one click, no AI call and no Claude Code. They ride the custom lane
 * (custom-<slug>, lib/tiles/customTiles.ts) and save the shape summarize()
 * already reads for custom tiles, { unit, entries: [{ at, value }] }, so the
 * board face, the `today` connector tool and the coach all understand them.
 *
 * One template, two kinds:
 *   count  a daily total with − / + buttons (one entry per day, its total)
 *   value  a reading you type in (one entry per reading, newest wins)
 */

export interface ReadyTile {
  id: string // custom-<slug>
  name: string
  unit: string
  kind: 'count' | 'value'
  /** count: what one tap adds */
  step?: number
  /** count: the daily target ("goal") or ceiling ("limit") */
  target?: { n: number; type: 'goal' | 'limit' }
  /** One line for the picker and the open tile's header. */
  tracks: string
  group: 'Body' | 'Mind' | 'Work' | 'Money'
}

export const READY_TILES: ReadyTile[] = [
  { id: 'custom-weight', name: 'Body weight', unit: 'kg', kind: 'value', tracks: 'Your weight, one reading at a time.', group: 'Body' },
  { id: 'custom-calories', name: 'Calories', unit: 'kcal', kind: 'count', step: 100, target: { n: 2400, type: 'goal' }, tracks: 'What you ate today, in kcal.', group: 'Body' },
  { id: 'custom-protein', name: 'Protein', unit: 'g', kind: 'count', step: 10, target: { n: 150, type: 'goal' }, tracks: 'Grams of protein today.', group: 'Body' },
  { id: 'custom-pushups', name: 'Push-ups', unit: 'reps', kind: 'count', step: 10, target: { n: 100, type: 'goal' }, tracks: 'Push-ups done today.', group: 'Body' },
  { id: 'custom-caffeine', name: 'Caffeine', unit: 'cups', kind: 'count', step: 1, target: { n: 3, type: 'limit' }, tracks: 'Cups of coffee or tea today.', group: 'Body' },
  { id: 'custom-mood', name: 'Mood', unit: '/10', kind: 'value', tracks: 'How you feel, 1 to 10.', group: 'Mind' },
  { id: 'custom-meditation', name: 'Meditation', unit: 'min', kind: 'count', step: 5, target: { n: 10, type: 'goal' }, tracks: 'Minutes of meditation today.', group: 'Mind' },
  { id: 'custom-reading', name: 'Reading', unit: 'pages', kind: 'count', step: 10, target: { n: 30, type: 'goal' }, tracks: 'Pages read today.', group: 'Mind' },
  { id: 'custom-screen-time', name: 'Screen time', unit: 'h', kind: 'count', step: 0.5, target: { n: 3, type: 'limit' }, tracks: 'Hours on your phone today.', group: 'Mind' },
  { id: 'custom-deep-work', name: 'Deep work', unit: 'h', kind: 'count', step: 0.5, target: { n: 4, type: 'goal' }, tracks: 'Focused hours today.', group: 'Work' },
  { id: 'custom-posts', name: 'Posts published', unit: 'posts', kind: 'count', step: 1, target: { n: 1, type: 'goal' }, tracks: 'Videos and posts you shipped today.', group: 'Work' },
  { id: 'custom-savings', name: 'Savings', unit: 'kr', kind: 'value', tracks: 'What you have saved, updated when it changes.', group: 'Money' },
]

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

/** The sealed HTML for one ready tile. Passes checkTileHtml (see readyTiles.test.mjs). */
export function readyTileHtml(t: ReadyTile): string {
  const cfg = JSON.stringify({ unit: t.unit, kind: t.kind, step: t.step ?? 1, target: t.target ?? null }).replace(/</g, '\\u003c')
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(t.name)}</title>
<style>
  body{margin:0;font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--pulse-text,#16233B);background:var(--pulse-surface,#fff)}
  .shell{max-width:520px;margin:0 auto;text-align:center}
  .big{font-size:64px;line-height:1;font-weight:700;letter-spacing:-.02em;margin-top:8px}
  .big small{font-size:18px;font-weight:500;color:var(--pulse-muted,#4F5B6D);margin-left:6px}
  .note{color:var(--pulse-muted,#4F5B6D);margin-top:8px;min-height:1.5em}
  .row{display:flex;gap:10px;justify-content:center;align-items:center;margin-top:22px}
  button,input{font:inherit;border-radius:10px;min-height:44px}
  button{border:1px solid var(--pulse-line,#C3CCD8);background:var(--pulse-surface,#fff);color:inherit;padding:0 18px;cursor:pointer}
  button.main{background:var(--pulse-accent,#C2271D);color:var(--pulse-accent-ink,#fff);border-color:transparent;font-weight:600}
  button:focus-visible,input:focus-visible{outline:2px solid var(--pulse-text,#16233B);outline-offset:2px}
  input{width:120px;padding:0 12px;border:1px solid var(--pulse-line,#C3CCD8);background:transparent;color:inherit;text-align:center}
  .bar{height:8px;border-radius:99px;background:var(--pulse-line,#C3CCD8);margin:18px auto 0;max-width:320px;overflow:hidden}
  .bar i{display:block;height:100%;background:var(--pulse-accent,#C2271D)}
  ol{list-style:none;padding:0;margin:30px 0 0;border-top:1px solid var(--pulse-line,#C3CCD8);text-align:left}
  li{display:flex;justify-content:space-between;padding:10px 4px;border-bottom:1px solid var(--pulse-line,#C3CCD8)}
  li span{color:var(--pulse-muted,#4F5B6D)}
  .err{color:var(--pulse-accent,#C2271D)}
</style></head>
<body><div class="shell" id="app"></div>
<script>
const C=${cfg};
let store={unit:C.unit,entries:[]};
const app=document.getElementById('app');
const dayOf=(iso)=>{const d=new Date(iso);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
const today=()=>dayOf(new Date().toISOString());
const fmt=(n)=>String(Math.round(n*10)/10);
const label=(iso)=>{const k=dayOf(iso);if(k===today())return 'Today';return new Date(iso).toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'})};
let msg='';
async function save(){try{await window.Pulse.save(store);msg=''}catch(e){msg='Could not save: '+(e&&e.message||e)}render()}
function todayEntry(){return store.entries.find((e)=>dayOf(e.at)===today())}
function add(n){let e=todayEntry();if(!e){e={at:new Date().toISOString(),value:0};store.entries.push(e)}e.value=Math.max(0,Math.round((e.value+n)*10)/10);e.at=new Date().toISOString();save()}
function record(){const v=parseFloat(String(document.getElementById('v').value).replace(',','.'));if(!isFinite(v)){msg='Type a number first.';render();return}store.entries.push({at:new Date().toISOString(),value:v});save()}
function render(){
  const list=store.entries.filter((e)=>e&&typeof e.value==='number');
  const last=list[list.length-1];
  let html='';
  if(C.kind==='count'){
    const n=(todayEntry()||{value:0}).value;
    html+='<div class="big">'+fmt(n)+'<small>'+C.unit+'</small></div>';
    if(C.target){const pct=Math.min(100,Math.round(n/C.target.n*100));html+='<div class="note">'+(C.target.type==='goal'?'Goal ':'Limit ')+fmt(C.target.n)+' '+C.unit+' today'+(C.target.type==='limit'&&n>C.target.n?' · over':'')+'</div><div class="bar"><i style="width:'+pct+'%"></i></div>'}
    html+='<div class="row"><button id="minus" aria-label="Take away '+fmt(C.step)+'">−</button><button class="main" id="plus">+ '+fmt(C.step)+' '+C.unit+'</button></div>';
  }else{
    html+='<div class="big">'+(last?fmt(last.value):'—')+'<small>'+C.unit+'</small></div>';
    html+='<div class="note">'+(last?'Last logged '+label(last.at).toLowerCase():'Nothing logged yet')+'</div>';
    html+='<div class="row"><input id="v" inputmode="decimal" aria-label="New reading in '+C.unit+'" placeholder="'+C.unit+'"><button class="main" id="rec">Log it</button></div>';
  }
  if(msg)html+='<p class="note err" role="alert">'+msg+'</p>';
  const recent=list.slice(-7).reverse();
  if(recent.length)html+='<ol>'+recent.map((e)=>'<li><span>'+label(e.at)+'</span><b>'+fmt(e.value)+' '+C.unit+'</b></li>').join('')+'</ol>';
  app.innerHTML=html;
  const b=(id,f)=>{const el=document.getElementById(id);if(el)el.onclick=f};
  b('plus',()=>add(C.step));b('minus',()=>add(-C.step));b('rec',record);
  const v=document.getElementById('v');if(v)v.onkeydown=(e)=>{if(e.key==='Enter')record()};
}
(async()=>{try{const d=await window.Pulse.load();if(d&&!Array.isArray(d)&&Array.isArray(d.entries))store={unit:C.unit,entries:d.entries}}catch(e){msg='Could not load: '+(e&&e.message||e)}render()})();
</script></body></html>`
}
