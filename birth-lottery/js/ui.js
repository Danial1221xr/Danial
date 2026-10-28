/* Интерфейс: экраны «Старт», «Жизнь», «Конец», модальные окна решений и пауз, горячие клавиши. */
(async function(){
const E=window.LR.engine;
const {COUNTRIES,BY,Life,simulateFull,avgLE,avgIncome,yrs,plural,money,survTo}=E;
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const REDUCE=()=>!!(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches);
async function loadJSON(p){const r=await fetch(p);if(!r.ok)throw new Error(p+": "+r.status);return r.json()}
try{
  const [cs,names,cal]=await Promise.all([loadJSON("data/countries.json"),loadJSON("data/names.json"),loadJSON("data/cal.json")]);
  // прогноз ООН по миру нужен только для новостей «Мир»: без него игра тоже работает
  try{E.setWorld(await loadJSON("data/world-timeline.json"))}catch(e){console.warn(e)}
  E.setData(cs.countries,names,cal);
}catch(e){
  console.error(e);
  $("#loadErr").hidden=false;$("#btnBorn").disabled=true;return;
}
const store={get(k,d){try{const v=localStorage.getItem(k);return v===null?d:JSON.parse(v)}catch(e){return d}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}};
const esc=s=>String(s).replace(/[&<>"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]));
const cap=s=>s[0].toUpperCase()+s.slice(1);
const HELP='Если вам сейчас тяжело, поговорите с близкими или найдите бесплатную линию поддержки на <a href="https://findahelpline.com" target="_blank" rel="noopener">findahelpline.com</a>. При угрозе жизни звоните 112.';

const S={mode:store.get('lr.mode','births'),dur:store.get('lr.dur','30'),real:store.get('lr.real',''),soft:store.get('lr.soft',false),theme:store.get('lr.theme','auto'),feed:store.get('lr.feed','all')};
const SPEEDS=[1,2,4,6,8,16];
const G={L:null,nbs:[],running:false,speed:SPEEDS.includes(+store.get('lr.speed',1))?+store.get('lr.speed',1):1,acc:0,yearDur:25,queue:[],modal:false,last:0,auto:false,quitArm:false,notes:[]};

/* ---------- screens ---------- */
/* экран появляется плавно: класс scr-in перезапускает анимацию */
function show(id){for(const s of ['scrStart','scrLife','scrEnd']){const el=$('#'+s);
    if(s!==id){el.hidden=true;continue}
    el.hidden=false;el.classList.remove('scr-in');void el.offsetWidth;el.classList.add('scr-in')}
  window.scrollTo({top:0,behavior:'instant'});if(G.map){if(id==='scrStart')G.map.resume();else G.map.stop()}}

/* ---------- start ---------- */
function segInit(sel,val,cb){const el=$(sel);el.querySelectorAll('button[data-v]').forEach(b=>{b.setAttribute('aria-pressed',String(b.dataset.v===String(val)));b.addEventListener('click',()=>{if(b.disabled)return;el.querySelectorAll('button[data-v]').forEach(x=>x.setAttribute('aria-pressed','false'));b.setAttribute('aria-pressed','true');cb(b.dataset.v)})})}
segInit('#segMode',S.mode,v=>{S.mode=v;store.set('lr.mode',v);modeHint()});
segInit('#segDur',S.dur,v=>{S.dur=v;store.set('lr.dur',v);durHint()});
function modeHint(){$('#modeHint').textContent=S.mode==='pop'?'Страна выпадает с вероятностью, равной её доле в населении мира. Жизнь всё равно начинается с нуля лет.':'Страна выпадает с вероятностью, равной её доле в рождениях за год.'}
function durHint(){const s=+S.dur*60/71;$('#durHint').textContent=`Год проходит примерно за ${s<10?s.toFixed(1).replace('.',','):Math.round(s)} секунд. Время можно ставить на паузу и ускорять.`}
modeHint();durHint();
const sel=$('#realCountry');[...COUNTRIES].sort((a,b)=>a.name.localeCompare(b.name,'ru')).forEach(c=>{const o=document.createElement('option');o.value=c.code;o.textContent=c.name;sel.appendChild(o)});
sel.value=S.real;sel.addEventListener('change',()=>{S.real=sel.value;store.set('lr.real',S.real)});
$('#soft').checked=!!S.soft;$('#soft').addEventListener('change',e=>{S.soft=e.target.checked;store.set('lr.soft',S.soft)});
$('#btnBorn').addEventListener('click',startLife);
/* состояние ИИ на старте: зелёная точка — работает, красная — что именно не так */
function aiShow(r){const ai=window.LR.ai;if(!ai||!ai.enabled())return;$('#aiStatus').hidden=false;
  $('#aiDot').className='ai-dot'+(r?(r.ok?' ok':' err'):'');
  $('#aiText').textContent=r?(r.ok?r.text:'ИИ не работает'):'ИИ подключён, нажмите «Проверить», если события от ИИ не появляются';
  $('#aiMore').hidden=!r||r.ok;$('#aiMore').textContent=r&&!r.ok?r.text:''}
aiShow(null);
$('#aiCheck').addEventListener('click',async e=>{const b=e.currentTarget;b.disabled=true;$('#aiText').textContent='Проверяем… (до 30 секунд)';
  aiShow(await LR.ai.check());b.disabled=false});
// если ИИ перестал отвечать посреди жизни — одна строка в ленте, без спама
if(window.LR.ai)LR.ai.onStatus(st=>{if(st.state==='err'&&G.L&&G.L.alive&&!G.aiWarned){G.aiWarned=true;addFeed(G.L.age,{k:'stat',t:`ИИ сейчас не отвечает: ${st.text}. События и выборы берутся из заготовок игры, через минуту ИИ попробует снова.`})}
  if(st.state==='ok')G.aiWarned=false});
/* тема: как в системе, светлая или тёмная; data-theme ставится ещё в <head>, чтобы не мигало */
function applyTheme(v){if(v==='light'||v==='dark')document.documentElement.dataset.theme=v;else delete document.documentElement.dataset.theme}
segInit('#segTheme',S.theme,v=>{S.theme=v;store.set('lr.theme',v);applyTheme(v)});applyTheme(S.theme);

/* ---------- карта мира на старте ---------- */
loadJSON('data/world.json').then(world=>{
  G.map=LR.map.start($('#map'),world,COUNTRIES,(b,d,recent)=>{
    $('#cBorn').textContent=b.toLocaleString('ru-RU');$('#cDied').textContent=d.toLocaleString('ru-RU');
    const t=recent.length?'Только что: '+recent.join(' · '):'';if($('#ticker').textContent!==t)$('#ticker').textContent=t});
  if($('#scrStart').hidden)G.map.stop();
}).catch(e=>console.error(e));

/* ---------- life ---------- */
function startLife(country){if(country instanceof Event)country=null;
  // один мир на всех, кто родился в эту секунду: те же кризисы, эпидемии и новости
  G.world=E.makeWorld(new Date().getFullYear(),Math.floor(Math.random()*4294967296));
  G.aiWarned=false;G.L=new Life({mode:S.mode,soft:S.soft,world:G.world,country:country||undefined});G.notes=[];G.aiMom={};G.aiUpTo=0;G.aiBusy=false;
  G.nbs=[0,1,2,3].map(()=>simulateFull(S.mode,S.soft,G.world));
  G.yearDur=(+S.dur*60)/avgLE(G.L.c);G.acc=0;G.queue=[];G.modal=false;G.quitArm=false;G.endShown=false;
  $('#feed').innerHTML='';$('#stats').innerHTML='';G.skillW={};G.genW=0;phase.fill(undefined);buildThread();G.stageKey=G.portraitKey=null;$('#sceneWrap').innerHTML=$('#ptWrap').innerHTML='';
  setFocus('study');
  const ev=G.L.init();ev.forEach((e,i)=>addFeed(0,e,i));
  renderAll();show('scrLife');
  G.running=true;syncSpeed();
  queueYear();G.last=performance.now();requestAnimationFrame(loop);
}
/* скорость: «Пауза» — тот же ряд кнопок, что и ×1…×16 */
function syncSpeed(){const v=G.running?String(G.speed):'0';document.querySelectorAll('#segSpeed button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.v===v)));$('.topbar').classList.toggle('paused',!G.running)}
function setSpeed(v){v=+v;if(!v)G.running=false;else{G.running=true;G.speed=v;store.set('lr.speed',v)}syncSpeed()}
segInit('#segSpeed',String(G.speed),setSpeed);
function toggleAuto(){G.auto=!G.auto;$('#btnAuto').setAttribute('aria-pressed',String(G.auto))}
$('#btnAuto').addEventListener('click',toggleAuto);
/* горячие клавиши: пробел — пауза, 1–6 — скорость, ←/→ — медленнее/быстрее, A — авто; в окне выбора цифры выбирают вариант */
document.addEventListener('keydown',e=>{if(e.ctrlKey||e.metaKey||e.altKey||e.repeat)return;
  const tg=e.target;if(tg&&/^(INPUT|TEXTAREA|SELECT)$/.test(tg.tagName))return;
  const n=/^Digit([1-9])$/.exec(e.code)||/^Numpad([1-9])$/.exec(e.code);
  if(G.modal){if(n){const b=$$('#sheet.open .opt, #sheet.open .chip')[+n[1]-1];if(b){e.preventDefault();b.click()}}return}
  if($('#scrLife').hidden||!G.L||!G.L.alive)return;
  if(e.code==='Space'){e.preventDefault();setSpeed(G.running?0:G.speed)}
  else if(n&&+n[1]<=SPEEDS.length){e.preventDefault();setSpeed(SPEEDS[+n[1]-1])}
  else if(e.code==='ArrowRight'||e.code==='ArrowLeft'){e.preventDefault();const i=SPEEDS.indexOf(G.speed)+(e.code==='ArrowRight'?1:-1);setSpeed(SPEEDS[Math.max(0,Math.min(SPEEDS.length-1,i))])}
  else if(e.code==='KeyA'){e.preventDefault();toggleAuto()}});
segInit('#segFeed',S.feed,v=>{S.feed=v;store.set('lr.feed',v);$('#feed').classList.toggle('imp',v==='imp')});$('#feed').classList.toggle('imp',S.feed==='imp');
$('#btnQuit').addEventListener('click',e=>{if(!G.quitArm){G.quitArm=true;e.currentTarget.textContent='Точно выйти?';setTimeout(()=>{G.quitArm=false;$('#btnQuit').textContent='В меню'},3000);return}G.L=null;G.running=false;closeSheet();show('scrStart')});
segInit('#segFocus','study',v=>setFocus(v));
const FOCUS_HINT={health:'Меньше риск умереть в этом году, медленнее растёт доход.',study:'Помогает дольше учиться и расти на работе.',family:'Больше шансов встретить человека и завести детей.',money:'Доход растёт быстрее, но здоровье страдает.'};
function setFocus(v){if(G.L)G.L.focus=v;document.querySelectorAll('#segFocus button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.v===v)));updFocusHint()}
function updFocusHint(){const L=G.L;const kid=L&&L.age<6;document.querySelectorAll('#segFocus button').forEach(b=>b.disabled=!!kid);$('#focusHint').textContent=kid?'Пока за вас решают взрослые.':FOCUS_HINT[L?L.focus:'study']}

function loop(ts){if(!G.L)return;const dt=Math.min(0.25,(ts-G.last)/1000);G.last=ts;
  if(G.running&&!G.modal&&G.L.alive){G.acc+=dt*G.speed;if(G.acc>=G.yearDur){G.acc-=G.yearDur;advanceYear()}}
  const cur=document.querySelector('.tick.cur i');if(cur)cur.style.width=(G.L.alive?Math.min(100,G.acc/G.yearDur*100):0)+'%';
  if(G.L&&G.L.alive)requestAnimationFrame(loop)}

function advanceYear(){const L=G.L,x=L.age;const m=G.aiMom[x];if(m&&m.events.length)L.aiCover.add(x);
  const ev=L.endYear();ev.forEach((e,i)=>addFeed(x,e,i));
  // события года от ИИ (если успели прийти): эффекты — только метки, силу задаёт движок
  if(m&&L.alive)for(const e of m.events){L.applyTags(e.tags);addFeed(x,{k:'info',t:e.text,ai:true},ev.length)}
  if(!L.alive){renderAll();G.running=false;setTimeout(()=>{if(G.L===L)endLife()},1600);return}
  renderAll();queueYear()}
const PAUSES=[5,15,30,50,70];
function queueYear(){const L=G.L;const m=G.aiMom[L.age];if(m&&m.choice)L.aiChoiceAges.add(L.age);
  const ds=L.beginYear();if(m&&m.choice&&L.alive)ds.push(L.buildAIChoice(m.choice));
  aiPrefetch(L);
  for(const d of ds){if(G.auto){const i=L.autoChoice(d);const r=L.resolve(d,i);addFeed(L.age,{k:'choice',t:`${d.title}: ${d.opts[i].label.toLowerCase()}. ${r}`})}else G.queue.push({type:'dec',d})}
  if(PAUSES.includes(L.age))G.queue.push({type:'pause'});
  nextSheet();updFocusHint()}

function decHtml(L,d){return `<div class="eyebrow">${yrs(L.age)} · ${esc(d.stage||'решение')}</div><h2 id="sheetTitle">${esc(d.title)}</h2><p>${esc(d.text)}</p><div class="opts">${d.opts.map((o,i)=>`<button class="opt" type="button" data-i="${i}"><b>${esc(o.label)}</b>${o.hint?`<span>${esc(o.hint)}</span>`:''}</button>`).join('')}</div>${d.src==='ai'?'<p class="ai-note">Текст развилки написал ИИ, шансы посчитала игра.</p>':''}`}
function showDec(L,d){const card=$('#sheetCard');card.innerHTML=decHtml(L,d);
  let picked=false;
  card.querySelectorAll('.opt').forEach((b,i)=>{if(i<9)b.insertAdjacentHTML('afterbegin',`<kbd class="kn" aria-hidden="true">${i+1}</kbd>`);b.addEventListener('click',()=>{if(picked)return;picked=true;const i=+b.dataset.i;const r=L.resolve(d,i);addFeed(L.age,{k:'choice',t:`${d.title}: ${r}`});closeSheet();renderAll();nextSheet()})});
  const fb=card.querySelector('button');if(fb)fb.focus({preventScroll:true})}
/* ИИ пишет обычную жизнь заранее, на несколько лет вперёд: на высокой скорости — большими кусками */
function aiPrefetch(L){const ai=window.LR.ai;if(!ai||!ai.available()||G.aiBusy||G.L!==L||!L.alive)return;
  if(G.aiUpTo>=L.age+2)return;
  const from=Math.max(L.age+1,G.aiUpTo+1),span=G.speed>=8?8:G.speed>=4?5:3,to=Math.min(from+span-1,110);
  const recent=[...document.querySelectorAll('#feed li .t')].slice(0,8).map(t=>t.textContent.slice(0,140));
  G.aiBusy=true;
  ai.moments(L,from,to,recent).then(r=>{G.aiBusy=false;if(G.L!==L||!r||!Array.isArray(r.events))return;G.aiUpTo=to;
    for(const e of r.events)(G.aiMom[e.age]=G.aiMom[e.age]||{events:[],choice:null}).events.push(e);
    for(const c of r.choices||[])(G.aiMom[c.age]=G.aiMom[c.age]||{events:[],choice:null}).choice=c})}
function nextSheet(){if(G.modal||!G.queue.length)return;const it=G.queue.shift();G.modal=true;const L=G.L;const card=$('#sheetCard');
  if(it.type==='dec'){const d=it.d;const ai=window.LR.ai;
    if(d.input)dreamSheet(L,d,card);
    else if(d.dreamFork&&ai&&ai.available()){
      // развилку пишет ИИ, но варианты и шансы собирает движок; при сбое остаётся шаблон
      card.innerHTML=`<div class="eyebrow">${yrs(L.age)} · мечта</div><h2 id="sheetTitle">Жизнь подкидывает выбор…</h2><p class="muted">ИИ придумывает развилку для этой жизни.</p>`;
      ai.writeFork(d.dreamFork,L).then(spec=>{if(G.L!==L)return;showDec(L,spec&&Array.isArray(spec.options)&&spec.options.length>=2?L.buildFork(d.dreamFork,Object.assign(spec,{src:'ai'})):d)})}
    else showDec(L,d)}
  else{const q=pauseQ(L);card.innerHTML=`<div class="eyebrow">Пауза · ${yrs(L.age)}</div><h2 id="sheetTitle">Время остановилось</h2><p>${esc(q)}</p><label for="pauseTxt" class="muted" style="font-size:13px">Одна строчка, если хотите</label><textarea id="pauseTxt" maxlength="280"></textarea><div class="row"><button class="btn ghost" type="button" id="pSkip">Пропустить</button><button class="btn primary" type="button" id="pGo">Дальше</button></div>`;
    const fin=save=>{const v=$('#pauseTxt').value.trim();if(save&&v){G.notes.push({age:L.age,q,a:v});addFeed(L.age,{k:'note',t:`Ваша запись: «${v}»`})}closeSheet();nextSheet()};
    $('#pSkip').addEventListener('click',()=>fin(false));$('#pGo').addEventListener('click',()=>fin(true));setTimeout(()=>{const t=$('#pauseTxt');if(t)t.focus()},50)}
  openSheet()}

/* ---------- мечта ---------- */
const AI_WHO={gemini:'Google (Gemini)',anthropic:'Anthropic (Claude)',deepseek:'DeepSeek'};
// грубый фильтр на случай, когда ИИ не подключён (тот же смысл, что и в Worker'е)
const BAD=/(^|[\s«"(-])(хуй|хуе|пизд|ебат|ебал|ебан|бляд|блят|порн|секс|проститу|убийц|убить|киллер|террор|наркоторгов|нацист|самоуб|суицид|fuck|porn|kill)/i;
function dreamSheet(L,d,card){const ai=window.LR.ai,useAI=!!(ai&&ai.available());
  const who=AI_WHO[ai&&ai.provider()]||'Google (Gemini)';
  card.innerHTML=`<div class="eyebrow">${yrs(L.age)} · мечта</div><h2 id="sheetTitle">${esc(d.title)}</h2><p>${esc(d.text)}</p>
    <label for="dreamTxt" class="muted" style="font-size:13px">Своими словами</label><textarea id="dreamTxt" maxlength="200" placeholder="Например: хочу лечить животных"></textarea>
    <p class="ai-note">${useAI?`Текст мечты отправится в ${esc(who)} через сервер игры, чтобы ИИ разобрал его. Не пишите имён, адресов и других личных данных.`:'ИИ не подключён: мечта будет разобрана простыми правилами, текст никуда не отправляется.'}</p>
    <p class="ai-err" id="dreamErr" role="alert" hidden></p>
    <div class="row"><button class="btn primary" type="button" id="dreamGo">Записать мечту</button></div>
    <div class="eyebrow">или выберите</div><div class="chips">${d.opts.map((o,i)=>`<button class="chip" type="button" data-i="${i}">${esc(o.label)}</button>`).join('')}</div>`;
  const done=(r,short)=>{if(G.L!==L)return;addFeed(L.age,{k:'mile',t:r+(short?' '+short:'')});closeSheet();renderAll();nextSheet()};
  const err=t=>{const e=$('#dreamErr');e.textContent=t;e.hidden=false};
  card.querySelectorAll('.chip').forEach(b=>b.addEventListener('click',()=>done(L.resolve(d,+b.dataset.i))));
  const go=$('#dreamGo');
  go.addEventListener('click',async()=>{const v=$('#dreamTxt').value.trim();
    if(!v){$('#dreamTxt').focus();return}
    if(BAD.test(' '+v)){err('Такую мечту записать нельзя. Попробуйте сформулировать иначе.');return}
    go.disabled=true;go.textContent=useAI?'ИИ разбирает мечту…':'Записываем…';
    let p=null;
    if(useAI){const r=await ai.classifyDream(v,L);if(G.L!==L)return;
      if(r&&r.error==='inappropriate'){go.disabled=false;go.textContent='Записать мечту';err('Такую мечту записать нельзя. Попробуйте сформулировать иначе.');return}
      if(r&&r.title)p=Object.assign(r,{text:v,src:'ai'})}
    if(!p)p=Object.assign(E.classifyDreamLocal(v),{text:v});
    const res=L.setDream(p);L.history.push({age:L.age,id:'dream',opt:-1,label:'мечта: '+L.dream.title});
    done(res,p.src==='ai'?p.short:'')});
  setTimeout(()=>{const t=$('#dreamTxt');if(t)t.focus()},50)}

/* окно выбора выезжает и гаснет; если следующее окно открывается сразу, меняется только содержимое */
let sheetT=0;
function openSheet(){const s=$('#sheet'),c=$('#sheetCard');clearTimeout(sheetT);
  if(s.hidden){s.hidden=false;void s.offsetWidth}
  s.classList.add('open');c.classList.remove('swap');void c.offsetWidth;c.classList.add('swap')}
function closeSheet(){const s=$('#sheet');G.modal=false;s.classList.remove('open');clearTimeout(sheetT);
  sheetT=setTimeout(()=>{if(!s.classList.contains('open'))s.hidden=true},REDUCE()?0:240)}
function pauseQ(L){const c=L.c;
  if(L.age===5)return 'Этому ребёнку пять лет. Что он уже знает о мире вокруг? А что вы помните о своих пяти годах?';
  if(L.age===15)return `Пятнадцать лет. ${L.eduDone?`За плечами ${L.eduDone} ${plural(L.eduDone,['класс','класса','классов'])}`:'Школы в этой жизни не было'}, сейчас: ${L.status()}. Что в этом возрасте определило вашу собственную дорогу?`;
  if(L.age===30)return 'Тридцать лет. Что в этой жизни сложилось само собой, а что человек выбрал сам?';
  if(L.age===50)return 'Полвека. Что бы вы сказали этому человеку, если бы могли с ним поговорить?';
  const p=Math.round(survTo(L.home,L.sex,70)*100);return `До семидесяти лет ${L.home.inName} доживают примерно ${p}% ${L.sex==='m'?'мужчин':'женщин'}. Что для вас значит долгая жизнь?`}

function addFeed(age,e,i){const li=document.createElement('li');li.className=(e.k||'info')+(e.ai?' ai':'');if(e.ai)li.title='Событие написал ИИ';
  if(i)li.style.animationDelay=Math.min(i,6)*70+'ms';// события одного года появляются по очереди
  li.innerHTML=`<span class="a">${age} ${plural(age,['год','года','лет'])}</span><div><div class="t">${e.k==='world'?'<span class="tag">Мир</span>':''}${esc(e.t)}</div>${e.help?`<div class="help">${HELP}</div>`:''}</div>`;
  const f=$('#feed');f.insertBefore(li,f.firstChild)}

function buildThread(){const th=$('#thread');th.innerHTML='';$('#marks').innerHTML='';$('#marks').dataset.n='';for(let i=0;i<100;i++){const t=document.createElement('div');t.className='tick';t.appendChild(document.createElement('i'));th.appendChild(t)}
  const m=document.createElement('div');m.className='le-mark';m.title='Средняя продолжительность жизни в стране';th.appendChild(m)}
const phase=new Array(130);
function renderThread(){const L=G.L;const ticks=[...document.querySelectorAll('#thread .tick')];
  if(L.alive)phase[L.age]=L.phase();
  ticks.forEach((t,i)=>{t.className='tick'+(i<L.age?' '+(phase[i]||'child'):'')+(i===L.age&&L.alive?' cur':'')+(i===L.age&&!L.alive?' dead':'');if(i!==L.age)t.firstChild.style.width='0'});
  const le=L.sex==='m'?L.home.leM:L.home.leF;const mk=document.querySelector('.le-mark');mk.style.left=`calc(${le}% - 1px)`;mk.title=`Средняя продолжительность жизни ${L.sex==='m'?'мужчин':'женщин'} ${L.home.inName}: ${le}`;
  renderMarks(L)}
/* иконки ключевых событий над нитью; близкие по возрасту расходятся по двум рядам */
const MARK_ICON={school:'i-book',grad:'i-cap',work:'i-case',ring:'i-ring',baby:'i-baby',move:'i-plane',ill:'i-plus',rest:'i-sun',end:'i-end',dream:'i-star',army:'i-shield',biz:'i-shop',win:'i-star'};
function renderMarks(L){const box=$('#marks');if(box.dataset.n===String(L.marks.length))return;box.dataset.n=L.marks.length;
  const gap=2400/Math.max(240,box.clientWidth||600);// ≈24 px в процентах ширины нити
  const rows=[[],[]],chips=[];
  for(const m of L.marks){const x=Math.min(99,m.age),text=`${m.age} ${plural(m.age,['год','года','лет'])}: ${m.label}`;
    const free=rows.findIndex(r=>!r.length||x-r[r.length-1].x>=gap);
    if(free>=0){const c={x,row:free,m,list:[text]};rows[free].push(c);chips.push(c)}
    else{const c=rows.flat().reduce((b,q)=>Math.abs(q.x-x)<Math.abs(b.x-x)?q:b);c.list.push(text);if(m.key==='end'||m.key==='dream')c.m=m}}
  box.innerHTML=chips.map(c=>`<span class="mk mk-${c.m.key} row${c.row}" style="left:${c.x}%" title="${esc(c.list.join('\n'))}"><svg aria-hidden="true"><use href="#${MARK_ICON[c.m.key]||'i-end'}"/></svg>${c.list.length>1?`<b class="more">+${c.list.length-1}</b>`:''}<span class="sr">${esc(c.list.join('; '))}</span></span>`).join('')}

function renderAll(){const L=G.L;if(!L)return;
  $('#lifeName').textContent=`${L.name} · ${L.c.name}${L.migrated?' (родом: '+L.home.name+')':''}`;
  const ag=$('#lifeAge');if(ag.textContent!==yrs(L.age)){ag.textContent=yrs(L.age);pulse(ag)}$('#lifeYear').textContent=String(L.born+L.age);
  const inc=L.income(),p=L.pctl();
  const rows=[['Где',`${L.rural?'Деревня':'Город'}, ${L.c.name}`],['Занятие',cap(L.status())],['Семья',cap(L.family())],
    [L.zp===null||L.homemaker?'Доход семьи':'Доход',`<span class="mono">${money(inc)}</span> в месяц <div class="pct">${p<50?`беднее ${100-p}% людей страны`:`богаче ${p}% людей страны`}</div>`],
    ['Учёба',L.degree?'высшее образование':L.eduDone?`${L.eduDone} ${plural(L.eduDone,['класс','класса','классов'])}`:(L.age<7?'ещё рано':'не учился')],
    ['Привычки',[L.smoker?'курит':'',L.drinker?'часто выпивает':'',L.active&&L.age>=7?'занимается спортом':'',L.ill?(L.illMult<1.5?'лечится: ':'болеет: ')+L.ill:''].filter(Boolean).join(', ')||'без вредных привычек и болезней']];
  const home={mortgage:`ипотека, осталось ${yrs(L.mortLeft)}`,build:'строит свой дом',rent:'снимает жильё',parents:'живёт с родителями',own:'своё жильё'}[L.housing];
  const money2=[home,L.debt>0?'выплачивает кредит':'',L.biz?'своё дело':''].filter(Boolean).join(', ');
  if(money2)rows.push(['Жильё и деньги',money2]);
  if(L.dream)rows.push(['Мечта',L.dream.title+(L.dreamGaveUp?' (отпущена)':'')]);
  if(!L.alive)rows[1]=['Итог',cap(L.status())+', '+L.cause];
  $('#nowDl').innerHTML=rows.map(r=>`<dt>${r[0]}</dt><dd>${r[0]==='Доход'||r[0]==='Доход семьи'?r[1]:esc(r[1])}</dd>`).join('');
  renderStats(L);renderGen(L);renderSkills(L);
  renderThread();renderNbs();renderFacts();renderStage(L);updFocusHint()}
/* плавность: перезапуск короткой анимации, счёт чисел и рост полосок от прежнего значения */
function pulse(el,cls='bump'){if(REDUCE())return;el.classList.remove(cls);void el.offsetWidth;el.classList.add(cls)}
function tweenNum(el,to){const from=parseFloat(el.dataset.v);el.dataset.v=to;cancelAnimationFrame(el._tw);
  if(isNaN(from)||from===to||REDUCE()){el.textContent=String(to);return}
  const t0=performance.now(),d=600;
  const step=ts=>{const k=Math.min(1,(ts-t0)/d),e=1-Math.pow(1-k,3);el.textContent=String(Math.round(from+(to-from)*e));if(k<1)el._tw=requestAnimationFrame(step)};
  el._tw=requestAnimationFrame(step)}
function growBars(box){requestAnimationFrame(()=>requestAnimationFrame(()=>box.querySelectorAll('i[data-w]').forEach(i=>{i.style.width=i.dataset.w+'%'})))}
/* показатели 0–100, как в паспорте жизни; строки создаются один раз, дальше меняются значения */
const STAT_LBL=[['health','Здоровье'],['know','Знания'],['happy','Счастье'],['rel','Отношения'],['wealth','Достаток']];
function renderStats(L){const st=L.stats(),box=$('#stats');
  if(!box.firstChild)box.innerHTML=STAT_LBL.map(([k,l])=>`<div class="stat st-${k}"><span class="sl">${l}</span><span class="bar" role="meter" aria-label="${l}" aria-valuemin="0" aria-valuemax="100"><i></i></span><span class="sv mono"></span></div>`).join('')+'<p class="stat-note"></p>';
  STAT_LBL.forEach(([k,l],i)=>{const row=box.children[i],v=st[k],sv=row.querySelector('.sv'),old=parseFloat(sv.dataset.v);
    row.title=`${l}: ${v} из 100`;row.querySelector('.bar').setAttribute('aria-valuenow',v);row.querySelector('i').style.width=v+'%';tweenNum(sv,v);
    // заметное изменение за год — короткая подсказка «+5» / «−4»
    if(!isNaN(old)&&Math.abs(v-old)>=3&&!REDUCE()){const d=document.createElement('b');d.className='delta '+(v>old?'up':'down');d.setAttribute('aria-hidden','true');d.textContent=(v>old?'+':'−')+Math.abs(v-old);row.appendChild(d);setTimeout(()=>d.remove(),1400)}});
  box.lastChild.textContent=`Достаток — место среди людей вашей страны. Среди всех людей мира вы богаче ${st.world}%.`}
/* навыки и увлечения */
function renderSkills(L){const S=E.SKILLS,top=Object.entries(L.skills).filter(([,v])=>v>=1).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const lvl=v=>v>=85?'мастер':v>=60?'умеет хорошо':v>=30?'уверенно':'новичок';
  $('#skills').innerHTML=(L.hobbies.length?`<div class="chips">${L.hobbies.map(k=>`<span class="chip static">${esc(S[k].hobby)}</span>`).join('')}</div>`:`<p class="muted" style="margin:0;font-size:13px">${L.age<5?'Пока вы только познаёте мир.':'Увлечений пока нет.'}</p>`)
    +(top.length?`<div class="stats" style="margin:10px 0 0">${top.map(([k,v])=>`<div class="stat st-skill" title="${esc(S[k].name)}: ${Math.round(v)} из 100 — ${lvl(v)}"><span class="sl">${esc(S[k].name)}</span><span class="bar"><i style="width:${G.skillW[k]||0}%" data-w="${v.toFixed(0)}"></i></span><span class="sv mono">${Math.round(v)}</span></div>`).join('')}</div>`:'');
  for(const [k,v] of top)G.skillW[k]=v.toFixed(0);
  growBars($('#skills'))}
/* поколение: все дети мира, родившиеся в один год с вами */
function renderGen(L){const born=E.worldBirths()/1000,a=L.age,alive=E.cohortSurvival(a+(L.alive?0:1));
  const f=v=>v>=10?Math.round(v):v.toFixed(1).replace('.',',');
  $('#gen').innerHTML=`<p>В ${L.born} году в мире родилось около <b class="mono">${f(born)} млн</b> детей. ${a?`До ${yrs(a)} дожили примерно <b class="mono">${Math.round(alive*100)}%</b> — около ${f(born*alive)} млн человек.`:'Все они начинают жизнь в одну и ту же секунду истории, но в очень разных местах.'}</p>
    <div class="genbar" aria-hidden="true"><i style="width:${G.genW}%" data-w="${(alive*100).toFixed(1)}"></i></div>
    <p class="muted" style="font-size:13px;margin:6px 0 0">${L.home.inName[0].toUpperCase()+L.home.inName.slice(1)} до этого возраста доживают ${Math.round(survTo(L.home,L.sex,a)*100)}% ${L.sex==='m'?'мальчиков':'девочек'}.</p>`;
  G.genW=(alive*100).toFixed(1);growBars($('#gen'))}
/* портрет и фон этапа жизни; смена — плавным наложением слоёв */
function swapLayer(box,html){const old=[...box.children];const el=document.createElement('div');el.className='layer';el.innerHTML=html;
  // на высокой скорости годы сменяются быстрее, чем идёт наплыв: тогда меняем сразу, без полупрозрачной каши
  const now=performance.now(),quick=now-(box._t||0)<800;box._t=now;
  if(quick||REDUCE()){el.classList.add('on','now');old.forEach(o=>o.remove());box.appendChild(el);return}
  box.appendChild(el);
  requestAnimationFrame(()=>requestAnimationFrame(()=>el.classList.add('on')));old.forEach(o=>{o.classList.remove('on');setTimeout(()=>o.remove(),700)})}
const STAGE_NAME={child:'Детство',school:'Учёба',work:'Работа',old:'Старость',dead:'Конец пути'};
function renderStage(L){const P=LR.portrait,st=L.phase();
  const key=st+(st==='work'&&L.rural?'-r':'');
  if(G.stageKey!==key){G.stageKey=key;swapLayer($('#sceneWrap'),P.scene(st,L.rural))}
  const pk=L.age+'|'+L.alive;if(G.portraitKey!==pk){G.portraitKey=pk;swapLayer($('#ptWrap'),P.svg(L))}
  const sn=$('#stageName');if(sn.textContent!==STAGE_NAME[st]){sn.textContent=STAGE_NAME[st];pulse(sn,'fade')}$('#stageSub').textContent=cap(L.status());$('#stagebox').dataset.stage=st}

function nbAt(n,age){const s=n.snaps;const i=Math.min(age,s.length-1);return s[i]}
function renderNbs(){const L=G.L;$('#nbs').innerHTML=G.nbs.map(n=>{const s=nbAt(n,L.age);const dead=!s.alive;
  return `<div class="nb${dead?' dead':''}"><b>${esc(n.L.name)}</b><span>${esc(n.L.home.name)}${n.L.migrated&&!dead?'':''}</span><div class="st">${dead?esc(s.status+(s.cause?': '+s.cause:'')):esc(cap(s.status))}</div></div>`}).join('')}

const SRC_NAME={wpp:'ООН, WPP 2024',wdi:'Всемирный банк',bl:'Barro–Lee',whr:'World Happiness Report',gapminder:'Gapminder',region:'среднее по региону',proto:'прототип'};
const num=(v,d)=>(d===undefined?String(v):v.toFixed(d)).replace('.',',');
function srcNote(c,f){const s=c.src&&c.src[f];if(!s)return '';return `${SRC_NAME[s.s]||s.s}${s.y?', '+s.y:''}${s.est?' · оценка':''}`}
function renderFacts(){const c=G.L.home;$('#factsTitle').textContent='Статистика: '+c.name;
  const r=[[['leM','leF'],'Продолжительность жизни, муж. / жен.',`${num(c.leM)} / ${num(c.leF)}`],['u5','Не доживают до 5 лет',`${num(c.u5/10,1)}%`],['gdp','ВВП на душу (ППС), $',c.gdp.toLocaleString('ru-RU')],['gini','Индекс Джини',num(c.gini)],['school','Средние годы учёбы взрослых',num(c.school)],['tert','Охват высшим образованием',c.tert+'%'],['agri','Занятость в сельском хозяйстве',num(c.agri)+'%'],['urb','Живут в городах',c.urb+'%'],['fert','Детей на женщину',num(c.fert)],['mmr','Материнская смертность на 100 000 родов',c.mmr],['hom','Убийств на 100 000',num(c.hom)],['smoke','Курят',num(c.smoke)+'%'],['elec','Есть электричество (город / деревня)',`${c.elecU}% / ${c.elecR}%`],['water','Чистая питьевая вода (город / деревня)',`${c.waterU}% / ${c.waterR}%`],['sanit','Нормальный туалет (город / деревня)',`${c.sanitU}% / ${c.sanitR}%`],['net','Пользуются интернетом',c.net+'%'],['sat','Удовлетворённость жизнью (0–10)',num(c.sat)]];
  $('#factsTbl').innerHTML=r.map(([f,label,val])=>{const fs=[].concat(f);const est=fs.some(k=>c.src&&c.src[k]&&c.src[k].est);const note=[...new Set(fs.map(k=>srcNote(c,k)))].join('; ');
    return `<tr><td>${label}${note?`<div class="src">${esc(note)}</div>`:''}</td><td>${est?'≈ ':''}${val}</td></tr>`}).join('')}

/* ---------- end ---------- */
/* итоги жизни по показателям */
function statsEnd(L){const lg=L.incomeLog.filter(x=>x.age>=1);if(!lg.length)return '';
  const avg=k=>Math.round(lg.reduce((s,x)=>s+x[k],0)/lg.length),best=lg.reduce((b,x)=>x.hap>b.hap?x:b,lg[0]);
  return `<div class="card"><div class="sect-h">Итоги жизни</div><div class="sum">
    <div><b>${avg('hap')}</b><span>счастье в среднем за жизнь</span></div>
    <div><b>${Math.max(...lg.map(x=>x.kn))}</b><span>знания на пике</span></div>
    <div><b>${avg('hl')}</b><span>здоровье в среднем</span></div>
    <div><b>${best.age}</b><span>самый счастливый возраст</span></div></div>${skillsEnd(L)}</div>`}
function skillsEnd(L){const top=Object.entries(L.skills).filter(([,v])=>v>=30).sort((a,b)=>b[1]-a[1]).slice(0,3);if(!top.length)return '';
  return `<p style="margin:12px 0 0;font-size:14px">Чему вы научились: ${top.map(([k,v])=>`${esc(E.SKILLS[k].name.toLowerCase())} (${Math.round(v)})`).join(', ')}.${L.hobbies.length?` Увлечения до конца жизни: ${L.hobbies.map(k=>esc(E.SKILLS[k].hobby)).join(', ')}.`:''}</p>`}
/* «параллельные жизни»: то же место в обществе — в других странах */
function parallelHtml(L){const z=L.zMean(),p=Math.round(E.ncdf(z)*100),le=c=>L.sex==='m'?c.leM:c.leF;
  const pool=['NO','US','CN','IN','NG','BR','DE','RU','KZ','NE'].filter(k=>BY[k]&&k!==L.home.code);
  const pickC=[];while(pickC.length<4&&pool.length)pickC.push(pool.splice(Math.floor(Math.random()*pool.length),1)[0]);
  const rows=[L.home.code,...pickC].map(k=>{const c=BY[k];return `<tr${k===L.home.code?' class="you"':''}><td>${esc(c.name)}</td><td class="mono">${money(E.incomeIn(c,z))}</td><td class="mono">${le(c).toFixed(1).replace('.',',')}</td></tr>`}).join('');
  return `<div class="card parallel"><div class="sect-h">Параллельные жизни</div><p class="muted" style="margin:0 0 8px;font-size:14px">Вы были богаче ${p}% людей своей страны. Вот как жил бы человек на том же месте в обществе, родись он в другой стране.</p>
    <table><tr><th>Страна</th><th>Доход в месяц</th><th>Живут в среднем</th></tr>${rows}</table></div>`}
function endLife(){const L=G.L;if(!L||G.endShown)return;G.endShown=true;closeSheet();G.queue=[];
  const kidsAlive=L.kids.filter(k=>k.alive).length;
  const heavy=['hom','sui'].includes(L.causeKey);
  const le=L.sex==='m'?L.home.leM:L.home.leF;
  const dO=L.dreamOutcome();
  const dreamHtml=dO?`<div class="card dream-end"><div class="sect-h">Мечта в 10 лет: ${esc(L.dream.title)}</div><p class="dream-res ${dO.key}"><b>${esc(dO.title)}</b></p><p id="dreamEpi" style="margin:0">${esc(dO.text)}</p><p class="ai-note" id="dreamEpiNote" hidden>Текст написал ИИ.</p></div>`:'';
  const nbHtml=G.nbs.map(n=>{const d=n.L;return `<li><b>${esc(d.name)}</b>, ${esc(d.home.name)}${d.migrated?' → '+esc(d.c.name):''}: ${d.sex==='m'?'прожил':'прожила'} ${yrs(d.age)}${d.cause?' ('+esc(d.cause)+')':''}${d.degree?', высшее образование':''}${d.kids.length?`, ${d.kids.length} ${plural(d.kids.length,['ребёнок','ребёнка','детей'])}`:''}.</li>`}).join('');
  let cmp='';if(S.real&&BY[S.real]){const r=BY[S.real];const rl=L.sex==='m'?r.leM:r.leF;
    cmp=`<div class="card cmp"><div class="sect-h">Сравнение с вашей страной</div><p style="margin:0">${cap(r.inName)} ${L.sex==='m'?'мужчины':'женщины'} живут в среднем ${yrs(rl)}, а ${L.home.inName} — ${yrs(le)}. Средний доход ${r.inName} примерно ${money(avgIncome(r))} в месяц на человека, ${L.home.inName} — ${money(avgIncome(L.home))}. До пяти лет не доживает ${(r.u5/10).toFixed(1).replace('.',',')}% детей против ${(L.home.u5/10).toFixed(1).replace('.',',')}%.</p></div>`}
  $('#endBox').innerHTML=`
    <div class="eyebrow">${esc(L.home.name)}${L.migrated?' → '+esc(L.c.name):''}</div>
    <h1>${esc(L.name)}</h1>
    <div class="span">${L.born} — ${L.born+L.age} · ${L.age===0?'меньше года':yrs(L.age)}</div>
    <p style="margin:0;font-size:18px">Эта жизнь закончилась ${L.age===0?'в первый год':'в '+yrs(L.age)}. Причина: ${esc(L.cause)}. ${L.age<le?`Это на ${yrs(Math.round(le-L.age))} меньше средней продолжительности жизни ${L.home.inName}.`:`Это дольше, чем в среднем живут ${L.home.inName}.`}</p>
    ${heavy?`<p class="help" style="margin:0">${HELP}</p>`:''}
    <div class="sum">
      <div><b>${L.degree?'высшее':L.eduDone?L.eduDone+' кл.':'нет'}</b><span>образование</span></div>
      <div><b>${L.job?esc(L.job):'—'}</b><span>работа</span></div>
      <div><b>${L.peak?money(L.peak):'—'}</b><span>самый высокий доход в месяц</span></div>
      <div><b>${L.kids.length}${L.lostKids?' / −'+L.lostKids:''}</b><span>детей${L.lostKids?' / умерли в детстве':''}</span></div>
    </div>
    ${dreamHtml}
    ${statsEnd(L)}
    ${parallelHtml(L)}
    ${G.notes.length?`<div class="card"><div class="sect-h">Ваши записи</div>${G.notes.map(n=>`<p style="margin:0 0 8px"><span class="mono muted">${n.age}</span> «${esc(n.a)}»</p>`).join('')}</div>`:''}
    <div class="card"><div class="sect-h">Доход за жизнь</div><p class="muted" style="margin:0 0 8px;font-size:13px">В месяц, по паритету покупательной способности. До первой работы — доход семьи на человека.</p><div id="incChart"></div></div>
    <div class="card"><div class="sect-h">Линии жизни: вы и родившиеся в ту же секунду</div><div id="lifeLines"></div><ul style="margin:0;padding-left:18px;display:flex;flex-direction:column;gap:6px">${nbHtml}</ul></div>
    ${cmp}
    <div class="row end-acts"><button class="btn-born" type="button" id="again">Родиться снова</button><button class="btn" type="button" id="againHere">Ещё раз ${esc(L.home.inName)}</button><button class="btn" type="button" id="copySum">Скопировать итог</button><button class="btn ghost" type="button" id="toStart">На главную</button><span class="muted copied" id="copied" role="status"></span></div>`;
  if(dO&&window.LR.ai&&LR.ai.available()){
    const hl=L.history.filter(h=>h.id!=='dream').slice(-6).map(h=>`${h.age} лет: ${h.label}`);
    if(L.kids.length)hl.push(`детей: ${L.kids.length}`);if(L.migrated)hl.push(`переезд: ${L.c.name}`);
    LR.ai.writeEpilogue(L,dO.key,hl).then(r=>{if(r&&r.text&&G.L===L&&$('#dreamEpi')){$('#dreamEpi').textContent=r.text;$('#dreamEpiNote').hidden=false}})}
  $('#again').addEventListener('click',startLife);$('#againHere').addEventListener('click',()=>startLife(L.home));$('#toStart').addEventListener('click',()=>show('scrStart'));
  $('#copySum').addEventListener('click',()=>copyText(summaryText(L,dO)).then(ok=>{const c=$('#copied');c.textContent=ok?'Скопировано':'Не получилось скопировать';pulse(c,'fade')}));
  show('scrEnd');
  // графики строятся после показа экрана: им нужна настоящая ширина контейнера
  LR.charts.income($('#incChart'),L.incomeLog);
  LR.charts.lifeLines($('#lifeLines'),[{name:L.name,sub:`вы · ${L.home.name} · ${yrs(L.age)}`,phases:L.incomeLog.map(x=>x.ph).filter(p=>p!=='dead'),age:L.age,you:true},
    ...G.nbs.map(n=>({name:n.L.name,sub:`${n.L.home.name} · ${yrs(n.L.age)}`,phases:n.snaps.slice(0,-1).map(x=>x.ph).filter(p=>p!=='dead'),age:n.L.age}))])}

/* итог жизни простым текстом — чтобы поделиться */
function summaryText(L,dO){const he=L.sex==='m';
  const lines=[`${L.name}, ${L.home.name}${L.migrated?' → '+L.c.name:''}, ${L.born}–${L.born+L.age}`,
    `${he?'Прожил':'Прожила'} ${L.age===0?'меньше года':yrs(L.age)}. Причина: ${L.cause}.`,
    `Образование: ${L.degree?'высшее':L.eduDone?L.eduDone+' '+plural(L.eduDone,['класс','класса','классов']):'нет'}. Работа: ${L.job||'—'}. Детей: ${L.kids.length}.`];
  if(dO)lines.push(`Мечта в 10 лет: ${L.dream.title} — ${dO.title.toLowerCase().replace(/\.$/,'')}.`);
  lines.push('','Лотерея рождения — симуляция жизни по реальной статистике 172 стран.');
  return lines.join('\n')}
async function copyText(t){try{await navigator.clipboard.writeText(t);return true}catch(e){
  const ta=document.createElement('textarea');ta.value=t;ta.setAttribute('readonly','');ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();
  let ok=false;try{ok=document.execCommand('copy')}catch(e2){}ta.remove();return ok}}
})();
