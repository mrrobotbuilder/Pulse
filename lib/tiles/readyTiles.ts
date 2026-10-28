/**
 * Ready-made tiles for the "+ New tile" picker: pick one and it lands on the
 * board in one click, no AI call and no Claude Code. They ride the custom lane
 * (custom-<slug>, lib/tiles/customTiles.ts) and save the shape summarize()
 * already reads for custom tiles, { unit, entries: [{ at, value }] }, so the
 * board face, the `today` connector tool and the coach all understand them.
 * A changed daily target is kept next to them as `target`.
 *
 * One template, three kinds, drawn with the tile kit (lib/tiles/tileKit.ts):
 *   count  a daily total with quick-add buttons (one entry per day, its total)
 *   value  a reading you type in (one entry per reading, newest wins)
 *   check  a daily yes/no habit with a streak (one entry per day: 1 kept, 0 missed)
 */

export interface ReadyTile {
  id: string // custom-<slug>
  name: string
  unit: string
  kind: 'count' | 'value' | 'check'
  /** count: what one tap adds */
  step?: number
  /** count: the daily target ("goal") or ceiling ("limit") */
  target?: { n: number; type: 'goal' | 'limit' }
  /** value: the smallest change the − / + buttons make, and the scale's ends when it has them */
  inc?: number
  min?: number
  max?: number
  /** value: whether a rising number is good news (savings) or not (weight is your call, so neutral) */
  better?: 'up' | 'down'
  /** One line for the picker and the open tile's header. */
  tracks: string
  /** One useful line shown in the open tile. */
  tip: string
  /** A tile-kit icon name and hue (k-hue-*). */
  icon: string
  hue: string
  group: 'Body' | 'Mind' | 'Work' | 'Money'
}

export const READY_TILES: ReadyTile[] = [
  { id: 'custom-weight', name: 'Body weight', unit: 'kg', kind: 'value', inc: 0.1, tracks: 'Your weight, one reading at a time.', tip: 'Weigh in the morning, after the bathroom, before eating. Watch the weekly trend, not single days.', icon: 'scale', hue: 'teal', group: 'Body' },
  { id: 'custom-calories', name: 'Calories', unit: 'kcal', kind: 'count', step: 100, target: { n: 2400, type: 'goal' }, tracks: 'What you ate today, in kcal.', tip: 'A rough log beats a perfect one you stop doing. Round to the nearest 100.', icon: 'flame', hue: 'orange', group: 'Body' },
  { id: 'custom-protein', name: 'Protein', unit: 'g', kind: 'count', step: 10, target: { n: 150, type: 'goal' }, tracks: 'Grams of protein today.', tip: 'Building muscle? About 1.6 g per kg of body weight a day, spread over 3 to 5 meals.', icon: 'leaf', hue: 'red', group: 'Body' },
  { id: 'custom-pushups', name: 'Push-ups', unit: 'reps', kind: 'count', step: 10, target: { n: 100, type: 'goal' }, tracks: 'Push-ups done today.', tip: 'Spread them through the day: 10 every hour adds up fast and never feels hard.', icon: 'dumbbell', hue: 'red', group: 'Body' },
  { id: 'custom-caffeine', name: 'Caffeine', unit: 'cups', kind: 'count', step: 1, target: { n: 3, type: 'limit' }, tracks: 'Cups of coffee or tea today.', tip: 'Caffeine has a half-life of about 5 hours. The last cup before 14:00 protects your sleep.', icon: 'cup', hue: 'gold', group: 'Body' },
  { id: 'custom-mood', name: 'Mood', unit: '/10', kind: 'value', inc: 1, min: 1, max: 10, better: 'up', tracks: 'How you feel, 1 to 10.', tip: 'Log at the same time each day. After two weeks the line tells you what lifts you.', icon: 'smile', hue: 'indigo', group: 'Mind' },
  { id: 'custom-meditation', name: 'Meditation', unit: 'min', kind: 'count', step: 5, target: { n: 10, type: 'goal' }, tracks: 'Minutes of meditation today.', tip: 'Five minutes every day beats an hour on Sunday.', icon: 'leaf', hue: 'teal', group: 'Mind' },
  { id: 'custom-reading', name: 'Reading', unit: 'pages', kind: 'count', step: 10, target: { n: 30, type: 'goal' }, tracks: 'Pages read today.', tip: '30 pages a day is about a book a week and fifty a year.', icon: 'book', hue: 'indigo', group: 'Mind' },
  { id: 'custom-screen-time', name: 'Screen time', unit: 'h', kind: 'count', step: 0.5, target: { n: 3, type: 'limit' }, tracks: 'Hours on your phone today.', tip: 'Your phone counts this for you: check Screen Time or Digital Wellbeing at night and copy it here.', icon: 'phone', hue: 'magenta', group: 'Mind' },
  { id: 'custom-deep-work', name: 'Deep work', unit: 'h', kind: 'count', step: 0.5, target: { n: 4, type: 'goal' }, tracks: 'Focused hours today.', tip: 'Count only time with notifications off and one task open. Four real hours is a great day.', icon: 'brain', hue: 'gold', group: 'Work' },
  { id: 'custom-posts', name: 'Posts published', unit: 'posts', kind: 'count', step: 1, target: { n: 1, type: 'goal' }, tracks: 'Videos and posts you shipped today.', tip: 'Shipped beats perfect. The count only goes up when it is public.', icon: 'send', hue: 'magenta', group: 'Work' },
  { id: 'custom-no-sugar', name: 'No sugar', unit: 'days', kind: 'check', tracks: 'Days without added sugar, one tap a day.', tip: 'Cravings fade after about two weeks. Fruit is fine; it is the added sugar you are counting.', icon: 'leaf', hue: 'green', group: 'Body' },
  { id: 'custom-no-alcohol', name: 'No alcohol', unit: 'days', kind: 'check', tracks: 'Alcohol-free days in a row.', tip: 'Watch your Vitals: most people see deeper sleep and better recovery within a week.', icon: 'cup', hue: 'teal', group: 'Body' },
  { id: 'custom-cold-shower', name: 'Cold shower', unit: 'days', kind: 'check', tracks: 'Did you take a cold shower today?', tip: 'Thirty seconds of cold at the end of a normal shower counts.', icon: 'drop', hue: 'blue', group: 'Body' },
  { id: 'custom-journal', name: 'Journal', unit: 'days', kind: 'check', tracks: 'Did you write today?', tip: 'Three lines is enough: what happened, what you felt, what you learned.', icon: 'edit', hue: 'indigo', group: 'Mind' },
  { id: 'custom-savings', name: 'Savings', unit: 'kr', kind: 'value', inc: 100, better: 'up', tracks: 'What you have saved, updated when it changes.', tip: 'Pay yourself first: move the money on payday, before it can be spent.', icon: 'piggy', hue: 'green', group: 'Money' },
]

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

/** The sealed HTML for one ready tile. Passes checkTileHtml (see readyTiles.test.mjs). */
export function readyTileHtml(t: ReadyTile): string {
  const cfg = JSON.stringify({
    name: t.name,
    unit: t.unit,
    kind: t.kind,
    step: t.step ?? 1,
    target: t.target ?? null,
    inc: t.inc ?? 1,
    min: t.min ?? null,
    max: t.max ?? null,
    better: t.better ?? null,
    tip: t.tip,
    icon: t.icon,
  }).replace(/</g, '\\u003c')
  const hue = /^[a-z]+$/.test(t.hue) ? t.hue : 'red'
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(t.name)}</title>
<style>
  .quick{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
  .quick .k-btn{flex-direction:column;gap:2px;min-height:68px;padding:6px}
  .quick .k-btn small{font:500 12px var(--k-body);opacity:.85}
  .scale{display:grid;grid-template-columns:repeat(5,1fr);gap:6px}
  .scale button{min-height:48px;border-radius:12px;border:1px solid var(--k-line);background:var(--k-surface);font:700 17px var(--k-display);color:var(--k-text)}
  .scale button[aria-pressed=true]{background:var(--k-tint);border-color:var(--k-tint);color:var(--k-ink)}
  .over{color:var(--k-accent)}
</style></head>
<body class="k-hue-${hue}"><main class="k-page" id="app"></main>
<script>
var K=window.PulseKit,C=${cfg};
var store={unit:C.unit,entries:[]},view=7;
var DAYS=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
function dayOf(iso){return K.dayKey(new Date(iso))}
function list(){return store.entries.filter(function(e){return e&&typeof e.value==='number'&&typeof e.at==='string'&&!isNaN(Date.parse(e.at))})}
function target(){return typeof store.target==='number'&&store.target>0?store.target:C.target?C.target.n:null}
function fmt(n){return K.fmt(n,C.unit==='kr'?0:1)}
function persist(){if(C.kind==='check')store.kind='check';return Promise.resolve(window.Pulse.save(store)).catch(function(e){K.toast('Could not save: '+(e&&e.message||e))})}
function onDay(k){var e=list().filter(function(x){return dayOf(x.at)===k});return e.length?e[e.length-1]:null}
function ago(n){var d=new Date();d.setDate(d.getDate()-n);return d}
function hit(v){var t=target();if(t==null)return v>0;return C.target.type==='limit'?v<=t:v>=t}

function addToday(n){var k=K.dayKey(),e=onDay(k);if(!e){e={at:new Date().toISOString(),value:0};store.entries.push(e)}var before=e.value;e.value=Math.max(0,Math.round((e.value+n)*10)/10);e.at=new Date().toISOString();persist();render();var t=target();if(t&&C.target.type==='goal'&&before<t&&e.value>=t)K.toast('Daily goal reached.');if(t&&C.target.type==='limit'&&before<=t&&e.value>t)K.toast('Over your limit of '+fmt(t)+' '+C.unit+'.')}
function record(v){if(!isFinite(v)){K.toast('Type a number first.');return}if(C.min!=null)v=Math.max(C.min,v);if(C.max!=null)v=Math.min(C.max,v);store.entries.push({at:new Date().toISOString(),value:Math.round(v*100)/100});persist();render()}

function countView(){
  var t=target(),k=K.dayKey(),e=onDay(k),n=e?e.value:0,lim=C.target&&C.target.type==='limit';
  var vals=[],labels=[];for(var i=view-1;i>=0;i--){var x=onDay(K.dayKey(ago(i)));vals.push(x?x.value:0);labels.push(view===7?(i===0?'Today':DAYS[ago(i).getDay()]):(i%7===0?(ago(i).getMonth()+1)+'/'+ago(i).getDate():''))}
  var logged=vals.filter(function(v){return v>0}),avg=logged.length?logged.reduce(function(a,b){return a+b},0)/logged.length:0,hits=vals.filter(hit).length;
  var streak=0;for(var d=hit(n)?0:1;d<400;d++){var y=onDay(K.dayKey(ago(d)));if(y&&hit(y.value))streak++;else break}
  return '<section class="k-card k-hero"><div class="k-head" style="width:100%"><span class="k-cat">'+K.icon(C.icon)+K.esc(C.name)+'</span><span class="k-time">'+(e?'updated '+new Date(e.at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}):'nothing yet today')+'</span></div>'
    +(t?'<div class="k-ringbox">'+K.ring(n/t,{size:210,color:lim&&n>t?'var(--k-accent)':null,label:fmt(n)+' of '+fmt(t)+' '+C.unit})+'<div class="k-in"><div class="k-big'+(lim&&n>t?' over':'')+'">'+fmt(n)+'</div><div class="k-sub">'+(lim?'limit ':'of ')+fmt(t)+' '+K.esc(C.unit)+'</div></div></div>':'<div class="k-big">'+fmt(n)+'<small>'+K.esc(C.unit)+'</small></div>')
    +'<p class="k-sub" style="margin:0">'+(t?(lim?(n>t?'Over by '+fmt(n-t)+' '+C.unit+'.':fmt(t-n)+' '+C.unit+' left under your limit.'):(n>=t?'Goal reached. Nice.':fmt(t-n)+' '+C.unit+' to go.')):'Today so far.')+'</p></section>'
    +'<div class="quick"><button class="k-btn" data-add="'+C.step+'">'+K.icon('plus')+fmt(C.step)+'<small>'+K.esc(C.unit)+'</small></button><button class="k-btn k-soft" data-add="'+C.step*2+'">'+K.icon('plus')+fmt(C.step*2)+'<small>'+K.esc(C.unit)+'</small></button><button class="k-btn k-ghost" data-exact>'+K.icon('edit')+'Exact<small>type it</small></button></div>'
    +(n?'<button class="k-btn k-ghost k-sm" data-add="'+(-C.step)+'" style="justify-self:center">'+K.icon('minus')+'Take away '+fmt(C.step)+'</button>':'')
    +'<h2 class="k-title">History<span></span></h2><div class="k-seg" role="tablist" aria-label="Range"><button role="tab" data-view="7" aria-selected="'+(view===7)+'">7 days</button><button role="tab" data-view="30" aria-selected="'+(view===30)+'">30 days</button></div>'
    +'<section class="k-card">'+K.bars(vals,{labels:labels,goal:t||0,now:view-1,height:150,label:C.name+' per day'})+'</section>'
    +'<div class="k-grid k-3"><div class="k-stat"><div class="k-label">Average</div><div class="k-mid">'+fmt(avg)+'</div><div class="k-sub">'+K.esc(C.unit)+' on days you logged</div></div><div class="k-stat"><div class="k-label">'+(lim?'Under limit':'Goal days')+'</div><div class="k-mid">'+hits+'<small>/'+view+'</small></div><div class="k-sub">days</div></div><div class="k-stat"><div class="k-label">Streak</div><div class="k-mid">'+streak+'</div><div class="k-sub">days in a row</div></div></div>'
    +days()
    +(C.target?'<div class="k-list"><button class="k-row" data-target><span class="k-ico">'+K.icon('target')+'</span><span class="k-main"><b>Daily '+(lim?'limit':'goal')+'</b><span>Change it any time</span></span><span class="k-end">'+fmt(t)+'<small>'+K.esc(C.unit)+'</small></span>'+K.icon('chev','k-chev')+'</button></div>':'');
}

function valueView(){
  var l=list(),last=l[l.length-1],prev=l[l.length-2],m30=null;
  for(var i=l.length-1;i>=0;i--){if(Date.now()-Date.parse(l[i].at)>=30*864e5){m30=l[i];break}}
  var series=l.slice(-30).map(function(e){return e.value});
  var arrow=function(d){if(d==null||!d)return '';var good=C.better?(C.better==='up'?d>0:d<0):null;return '<span class="'+(good==null?'':good?'k-up':'k-down')+'">'+(d>0?'▲ +':'▼ ')+fmt(Math.abs(d))+'</span>'};
  var scale=C.min!=null&&C.max!=null&&C.max-C.min<=10;
  return '<section class="k-card"><div class="k-head"><span class="k-cat">'+K.icon(C.icon)+K.esc(C.name)+'</span><span class="k-time">'+(last?new Date(last.at).toLocaleDateString(undefined,{month:'short',day:'numeric'}):'no reading yet')+'</span></div>'
    +'<div class="k-big">'+(last?fmt(last.value):'—')+'<small>'+K.esc(C.unit)+'</small></div>'
    +'<div class="k-sub" style="margin-top:6px">'+(prev?arrow(last.value-prev.value)+' since last time':'')+(m30?' · '+arrow(last.value-m30.value)+' in 30 days':'')+'</div>'
    +'<div style="margin-top:12px">'+K.line(series,{height:140,min:C.min,max:C.max,label:C.name+' trend',labels:l.length>1?[new Date(l[Math.max(0,l.length-30)].at).toLocaleDateString(undefined,{month:'short',day:'numeric'}),'Latest']:null,empty:'Log two readings to draw your trend.'})+'</div></section>'
    +'<h2 class="k-title">New reading</h2>'
    +(scale?'<div class="scale">'+Array.from({length:C.max-C.min+1},function(_,i){var v=C.min+i;return '<button data-rec="'+v+'" aria-pressed="'+(last&&dayOf(last.at)===K.dayKey()&&last.value===v)+'">'+v+'</button>'}).join('')+'</div>'
      :'<section class="k-card k-plain"><div class="k-stepper"><button class="k-round" data-inc="-1" aria-label="Less">−</button><div class="k-val"><input class="k-input" id="v" inputmode="decimal" aria-label="New reading in '+K.esc(C.unit)+'" value="'+(last?last.value:'')+'" placeholder="'+K.esc(C.unit)+'" style="font:700 28px var(--k-display);text-align:center;min-height:60px"></div><button class="k-round" data-inc="1" aria-label="More">+</button></div><button class="k-btn k-wide" data-rec style="margin-top:12px">'+K.icon('check')+'Log it</button></section>')
    +(l.length>1?'<div class="k-grid k-3"><div class="k-stat"><div class="k-label">Lowest</div><div class="k-mid">'+fmt(Math.min.apply(null,l.map(function(e){return e.value})))+'</div></div><div class="k-stat"><div class="k-label">Highest</div><div class="k-mid">'+fmt(Math.max.apply(null,l.map(function(e){return e.value})))+'</div></div><div class="k-stat"><div class="k-label">Readings</div><div class="k-mid">'+l.length+'</div></div></div>':'')
    +days();
}

function checkView(){
  var k=K.dayKey(),e=onDay(k),kept=function(d){var x=onDay(K.dayKey(ago(d)));return x?x.value>0:null};
  var streak=0;for(var d=kept(0)?0:1;d<1000;d++){if(kept(d))streak++;else break}
  var best=0,run=0;list().slice().sort(function(a,b){return Date.parse(a.at)-Date.parse(b.at)}).forEach(function(x,i,arr){var prev=arr[i-1];var gap=prev?Math.round((new Date(dayOf(x.at)+'T12:00')-new Date(dayOf(prev.at)+'T12:00'))/864e5):1;run=x.value>0?(gap===1?run+1:1):0;best=Math.max(best,run)});
  var cells='';for(var i=27;i>=0;i--){var v=kept(i);cells+='<i title="'+K.dayKey(ago(i))+'" style="aspect-ratio:1;border-radius:50%;display:block;background:'+(v?'var(--k-tint)':v===false?'color-mix(in srgb,var(--k-accent) 30%,transparent)':'color-mix(in srgb,var(--k-text) 8%,transparent)')+'"></i>'}
  var month=0;for(var j=0;j<30;j++)if(kept(j))month++;
  return '<section class="k-card k-hero"><div class="k-head" style="width:100%"><span class="k-cat">'+K.icon(C.icon)+K.esc(C.name)+'</span><span class="k-time">'+(e?(e.value>0?'kept today':'missed today'):'not marked today')+'</span></div>'
    +'<div class="k-ringbox">'+K.ring(Math.min(1,streak/30),{size:200,label:streak+' day streak'})+'<div class="k-in"><div class="k-big">'+streak+'</div><div class="k-sub">day'+(streak===1?'':'s')+' in a row</div></div></div>'
    +'<p class="k-sub" style="margin:0">'+(streak>=best&&streak>0?'Your longest streak yet.':best?'Your best: '+best+' days.':'Day one starts with a tap.')+' The ring fills at 30 days.</p></section>'
    +'<div class="k-row-btns"><button class="k-btn" data-check="1" aria-pressed="'+!!(e&&e.value>0)+'">'+K.icon('check')+'I did it today</button><button class="k-btn k-ghost" data-check="0" aria-pressed="'+!!(e&&!(e.value>0))+'">'+K.icon('close')+'Not today</button></div>'
    +'<h2 class="k-title">Last four weeks<span class="k-label">'+month+' of 30 days kept</span></h2><section class="k-card"><div style="display:grid;grid-template-columns:repeat(7,1fr);gap:6px">'+cells+'</div></section>'
    +'<div class="k-grid k-3"><div class="k-stat"><div class="k-label">Streak</div><div class="k-mid">'+streak+'</div></div><div class="k-stat"><div class="k-label">Best</div><div class="k-mid">'+best+'</div></div><div class="k-stat"><div class="k-label">This month</div><div class="k-mid">'+Math.round(month/30*100)+'<small>%</small></div></div></div>'
    +'<p class="k-note">'+K.esc(C.tip)+' Missed a day? Mark it honestly; the streak restarts, your history stays.</p>';
}

function mark(v){var k=K.dayKey(),e=onDay(k);if(!e){e={at:'',value:0};store.entries.push(e)}e.value=v;e.at=new Date().toISOString();persist();render();if(v)K.toast('Marked. Keep it going.')}

function days(){
  var l=list().slice().reverse().slice(0,14);
  if(!l.length)return '<div class="k-card k-empty">'+K.icon(C.icon)+'<b>Nothing logged yet</b><span>'+K.esc(C.tip)+'</span></div>';
  return '<h2 class="k-title">Log</h2><div class="k-list">'+l.map(function(e){var i=store.entries.indexOf(e),d=new Date(e.at);return '<div class="k-row"><span class="k-main"><b>'+(dayOf(e.at)===K.dayKey()?'Today':DAYS[d.getDay()]+' '+(d.getMonth()+1)+'/'+d.getDate())+'</b><span>'+d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})+'</span></span><span class="k-end">'+fmt(e.value)+'<small>'+K.esc(C.unit)+'</small></span><button class="k-x" data-del="'+i+'" aria-label="Delete this entry">'+K.icon('trash')+'</button></div>'}).join('')+'</div>'
    +'<p class="k-note">'+K.esc(C.tip)+'</p>';
}

function render(){document.getElementById('app').innerHTML=C.kind==='count'?countView():C.kind==='check'?checkView():valueView()}

document.addEventListener('click',function(ev){
  var b=ev.target.closest('button');if(!b||b.closest('.k-sheet'))return;var a=function(n){return b.getAttribute(n)};
  if(a('data-add')!=null){addToday(Number(a('data-add')));return}
  if(a('data-check')!=null){mark(Number(a('data-check')));return}
  if(a('data-view')!=null){view=Number(a('data-view'));render();return}
  if(a('data-inc')!=null){var i=document.getElementById('v'),cur=parseFloat(String(i.value).replace(',','.'));i.value=String(Math.round(((isFinite(cur)?cur:0)+Number(a('data-inc'))*C.inc)*100)/100);return}
  if(a('data-rec')!=null){var v=a('data-rec')?Number(a('data-rec')):parseFloat(String(document.getElementById('v').value).replace(',','.'));record(v);return}
  if(a('data-del')!=null){var idx=Number(a('data-del'));K.sheet('Delete this entry?','<p style="margin:0">'+fmt(store.entries[idx].value)+' '+K.esc(C.unit)+' is removed from your log.</p><div class="k-row-btns"><button class="k-btn k-ghost" data-k-close>Keep it</button><button class="k-btn" data-yes>Delete</button></div>',function(el,close){el.querySelector('[data-yes]').onclick=function(){store.entries.splice(idx,1);persist();close();render()}});return}
  if(b.hasAttribute('data-exact')){var e=onDay(K.dayKey());K.sheet('Today’s total','<input class="k-input" id="ex" inputmode="decimal" value="'+(e?e.value:'')+'" style="font:700 32px var(--k-display);text-align:center;min-height:64px" aria-label="Today in '+K.esc(C.unit)+'"><p class="k-note">In '+K.esc(C.unit)+'. Replaces today’s total.</p><button class="k-btn k-wide" data-yes>Save</button>',function(el,close){el.querySelector('[data-yes]').onclick=function(){var v=parseFloat(String(el.querySelector('#ex').value).replace(',','.'));if(!(v>=0)){el.querySelector('#ex').focus();return}var x=onDay(K.dayKey());if(!x){x={at:'',value:0};store.entries.push(x)}x.value=Math.round(v*10)/10;x.at=new Date().toISOString();persist();close();render()}});return}
  if(b.hasAttribute('data-target')){K.sheet('Daily '+(C.target.type==='limit'?'limit':'goal'),'<input class="k-input" id="tg" inputmode="decimal" value="'+target()+'" style="font:700 32px var(--k-display);text-align:center;min-height:64px" aria-label="Daily target in '+K.esc(C.unit)+'"><p class="k-note">In '+K.esc(C.unit)+' a day.</p><button class="k-btn k-wide" data-yes>Save</button>',function(el,close){el.querySelector('[data-yes]').onclick=function(){var v=parseFloat(String(el.querySelector('#tg').value).replace(',','.'));if(!(v>0)){el.querySelector('#tg').focus();return}store.target=v;persist();close();render()}});return}
});
document.addEventListener('keydown',function(e){if(e.key==='Enter'&&e.target.id==='v')record(parseFloat(String(e.target.value).replace(',','.')))});

(async function(){
  try{var d=await window.Pulse.load();if(d&&!Array.isArray(d)&&Array.isArray(d.entries)){store={unit:C.unit,entries:d.entries};if(typeof d.target==='number')store.target=d.target}}
  catch(e){K.toast('Could not load: '+(e&&e.message||e))}
  render();
})();
</script></body></html>`
}
