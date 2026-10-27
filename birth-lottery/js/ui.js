/* Интерфейс: экраны «Старт», «Жизнь», «Конец», «Мемориалы», модальные окна решений и пауз. */
(async function(){
const E=window.LR.engine;
const {COUNTRIES,BY,Life,simulateFull,avgLE,avgIncome,yrs,plural,money,survTo}=E;
const $=s=>document.querySelector(s);
async function loadJSON(p){const r=await fetch(p);if(!r.ok)throw new Error(p+": "+r.status);return r.json()}
try{
  const [cs,names,cal]=await Promise.all([loadJSON("data/countries.json"),loadJSON("data/names.json"),loadJSON("data/cal.json")]);
  E.setData(cs.countries,names,cal);
}catch(e){
  console.error(e);
  $("#loadErr").hidden=false;$("#btnBorn").disabled=true;return;
}
const store={get(k,d){try{const v=localStorage.getItem(k);return v===null?d:JSON.parse(v)}catch(e){return d}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}};
const esc=s=>String(s).replace(/[&<>"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]));
const cap=s=>s[0].toUpperCase()+s.slice(1);
const HELP='Если вам сейчас тяжело, поговорите с близкими или найдите бесплатную линию поддержки на <a href="https://findahelpline.com" target="_blank" rel="noopener">findahelpline.com</a>. При угрозе жизни звоните 112.';

const S={mode:store.get('lr.mode','births'),dur:store.get('lr.dur','30'),real:store.get('lr.real',''),soft:store.get('lr.soft',false)};
const G={L:null,nbs:[],running:false,speed:1,acc:0,yearDur:25,queue:[],modal:false,last:0,auto:false,quitArm:false,notes:[]};

/* ---------- screens ---------- */
function show(id){for(const s of ['scrStart','scrLife','scrEnd','scrMem'])$('#'+s).hidden=s!==id;window.scrollTo(0,0);heroOn=id==='scrStart';if(heroOn)requestAnimationFrame(heroFrame)}

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
$('#btnMem').addEventListener('click',()=>{renderMem();show('scrMem')});
function memCount(){const n=store.get('lr.mem',[]).length;$('#memCount').textContent=n?'· '+n:''}
memCount();

/* ---------- hero sky ---------- */
let heroOn=true;const cv=$('#sky'),cx=cv.getContext('2d');const dots=[];let lastB=0,lastD=0;const T0=performance.now();let col={a:'#B9620F',m:'#5A6573'},colT=0;
const reduce=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
function sizeCv(){const r=cv.getBoundingClientRect(),d=window.devicePixelRatio||1;cv.width=Math.max(1,r.width*d);cv.height=Math.max(1,r.height*d)}
sizeCv();if(window.ResizeObserver)new ResizeObserver(sizeCv).observe(cv);
for(let i=0;i<60;i++)dots.push({x:Math.random(),y:Math.random(),t:-1e5,dead:0});
function heroFrame(ts){if(!heroOn)return;const el=(ts-T0)/1000;
  if(ts-colT>600){const cs=getComputedStyle(document.documentElement);col.a=cs.getPropertyValue('--accent').trim()||col.a;col.m=cs.getPropertyValue('--muted').trim()||col.m;colT=ts}
  const b=Math.floor(el*4.3),d=Math.floor(el*2.0);
  while(lastB<b){dots.push({x:Math.random(),y:Math.random(),t:ts,dead:0});lastB++;if(dots.length>420)dots.shift()}
  while(lastD<d){const al=dots.filter(o=>!o.dead&&ts-o.t>2500);if(al.length)al[Math.floor(Math.random()*al.length)].dead=ts;lastD++}
  $('#cBorn').textContent=b.toLocaleString('ru-RU');$('#cDied').textContent=d.toLocaleString('ru-RU');
  const W=cv.width,H=cv.height,dp=window.devicePixelRatio||1;cx.clearRect(0,0,W,H);
  for(let i=dots.length-1;i>=0;i--){const o=dots[i],age=ts-o.t;let r=2*dp,a=0.7,c=col.a;
    if(o.dead){const f=(ts-o.dead)/1600;if(f>=1){dots.splice(i,1);continue}a=0.6*(1-f);c=col.m;r=2*dp}
    else if(age<1400&&!reduce){const f=age/1400;r=(2+7*(1-f))*dp;a=0.25+0.75*f}
    cx.globalAlpha=a;cx.fillStyle=c;cx.beginPath();cx.arc(o.x*W,o.y*H,r,0,Math.PI*2);cx.fill()}
  cx.globalAlpha=1;requestAnimationFrame(heroFrame)}
requestAnimationFrame(heroFrame);

/* ---------- life ---------- */
function startLife(){
  G.L=new Life({mode:S.mode,soft:S.soft});G.notes=[];
  G.nbs=[0,1,2,3].map(()=>simulateFull(S.mode,S.soft));
  G.yearDur=(+S.dur*60)/avgLE(G.L.c);G.acc=0;G.queue=[];G.modal=false;G.quitArm=false;G.endShown=false;
  $('#feed').innerHTML='';phase.fill(undefined);buildThread();
  setFocus('study');
  const ev=G.L.init();ev.forEach(e=>addFeed(0,e));
  renderAll();show('scrLife');
  G.running=true;setPauseLabel();
  queueYear();G.last=performance.now();requestAnimationFrame(loop);
}
function setPauseLabel(){$('#btnPause').textContent=G.running?'Пауза':'Продолжить'}
$('#btnPause').addEventListener('click',()=>{G.running=!G.running;setPauseLabel()});
segInit('#segSpeed','1',v=>{G.speed=+v});
$('#btnAuto').addEventListener('click',e=>{G.auto=!G.auto;e.currentTarget.setAttribute('aria-pressed',String(G.auto))});
$('#btnQuit').addEventListener('click',e=>{if(!G.quitArm){G.quitArm=true;e.currentTarget.textContent='Точно выйти?';setTimeout(()=>{G.quitArm=false;$('#btnQuit').textContent='В меню'},3000);return}G.L=null;G.running=false;closeSheet();memCount();show('scrStart')});
segInit('#segFocus','study',v=>setFocus(v));
const FOCUS_HINT={health:'Меньше риск умереть в этом году, медленнее растёт доход.',study:'Помогает дольше учиться и расти на работе.',family:'Больше шансов встретить человека и завести детей.',money:'Доход растёт быстрее, но здоровье страдает.'};
function setFocus(v){if(G.L)G.L.focus=v;document.querySelectorAll('#segFocus button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.v===v)));updFocusHint()}
function updFocusHint(){const L=G.L;const kid=L&&L.age<6;document.querySelectorAll('#segFocus button').forEach(b=>b.disabled=!!kid);$('#focusHint').textContent=kid?'Пока за вас решают взрослые.':FOCUS_HINT[L?L.focus:'study']}

function loop(ts){if(!G.L)return;const dt=Math.min(0.25,(ts-G.last)/1000);G.last=ts;
  if(G.running&&!G.modal&&G.L.alive){G.acc+=dt*G.speed;if(G.acc>=G.yearDur){G.acc-=G.yearDur;advanceYear()}}
  const cur=document.querySelector('.tick.cur i');if(cur)cur.style.width=(G.L.alive?Math.min(100,G.acc/G.yearDur*100):0)+'%';
  if(G.L&&G.L.alive)requestAnimationFrame(loop)}

function advanceYear(){const L=G.L,x=L.age;const ev=L.endYear();ev.forEach(e=>addFeed(x,e));
  if(!L.alive){renderAll();G.running=false;setTimeout(()=>{if(G.L===L)endLife()},1600);return}
  renderAll();queueYear()}
const PAUSES=[5,15,30,50,70];
function queueYear(){const L=G.L;const ds=L.beginYear();
  for(const d of ds){if(G.auto){const i=L.autoChoice(d);const r=L.resolve(d,i);addFeed(L.age,{k:'choice',t:`${d.title}: ${d.opts[i].label.toLowerCase()}. ${r}`})}else G.queue.push({type:'dec',d})}
  if(PAUSES.includes(L.age))G.queue.push({type:'pause'});
  nextSheet();updFocusHint()}

function decHtml(L,d){return `<div class="eyebrow">${yrs(L.age)} · ${esc(d.stage||'решение')}</div><h2 id="sheetTitle">${esc(d.title)}</h2><p>${esc(d.text)}</p><div class="opts">${d.opts.map((o,i)=>`<button class="opt" type="button" data-i="${i}"><b>${esc(o.label)}</b>${o.hint?`<span>${esc(o.hint)}</span>`:''}</button>`).join('')}</div>${d.src==='ai'?'<p class="ai-note">Текст развилки написал ИИ, шансы посчитала игра.</p>':''}`}
function showDec(L,d){const card=$('#sheetCard');card.innerHTML=decHtml(L,d);
  card.querySelectorAll('.opt').forEach(b=>b.addEventListener('click',()=>{const i=+b.dataset.i;const r=L.resolve(d,i);addFeed(L.age,{k:'choice',t:`${d.title}: ${r}`});closeSheet();renderAll();nextSheet()}));
  const fb=card.querySelector('button');if(fb)fb.focus()}
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
  $('#sheet').hidden=false}

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

function closeSheet(){$('#sheet').hidden=true;G.modal=false}
function pauseQ(L){const c=L.c;
  if(L.age===5)return 'Этому ребёнку пять лет. Что он уже знает о мире вокруг? А что вы помните о своих пяти годах?';
  if(L.age===15)return `Пятнадцать лет. ${L.eduDone?`За плечами ${L.eduDone} ${plural(L.eduDone,['класс','класса','классов'])}`:'Школы в этой жизни не было'}, сейчас: ${L.status()}. Что в этом возрасте определило вашу собственную дорогу?`;
  if(L.age===30)return 'Тридцать лет. Что в этой жизни сложилось само собой, а что человек выбрал сам?';
  if(L.age===50)return 'Полвека. Что бы вы сказали этому человеку, если бы могли с ним поговорить?';
  const p=Math.round(survTo(L.home,L.sex,70)*100);return `До семидесяти лет ${L.home.inName} доживают примерно ${p}% ${L.sex==='m'?'мужчин':'женщин'}. Что для вас значит долгая жизнь?`}

function addFeed(age,e){const li=document.createElement('li');li.className=e.k||'info';
  li.innerHTML=`<span class="a">${age} ${plural(age,['год','года','лет'])}</span><div><div class="t">${esc(e.t)}</div>${e.help?`<div class="help">${HELP}</div>`:''}</div>`;
  const f=$('#feed');f.insertBefore(li,f.firstChild)}

function buildThread(){const th=$('#thread');th.innerHTML='';for(let i=0;i<100;i++){const t=document.createElement('div');t.className='tick';t.appendChild(document.createElement('i'));th.appendChild(t)}
  const m=document.createElement('div');m.className='le-mark';m.title='Средняя продолжительность жизни в стране';th.appendChild(m)}
const phase=new Array(130);
function renderThread(){const L=G.L;const ticks=[...document.querySelectorAll('#thread .tick')];
  const ph=!L.alive?'dead':L.age<6?'child':(L.inSchool||L.uni)?'school':L.retired||L.age>=65?'old':(L.working||L.homemaker)?'work':'child';
  if(L.alive)phase[L.age]=ph;
  ticks.forEach((t,i)=>{t.className='tick'+(i<L.age?' '+(phase[i]||'child'):'')+(i===L.age&&L.alive?' cur':'')+(i===L.age&&!L.alive?' dead':'');if(i!==L.age)t.firstChild.style.width='0'});
  const le=L.sex==='m'?L.home.leM:L.home.leF;const mk=document.querySelector('.le-mark');mk.style.left=`calc(${le}% - 1px)`;mk.title=`Средняя продолжительность жизни ${L.sex==='m'?'мужчин':'женщин'} ${L.home.inName}: ${le}`}

function renderAll(){const L=G.L;if(!L)return;
  $('#lifeName').textContent=`${L.name} · ${L.c.name}${L.migrated?' (родом: '+L.home.name+')':''}`;
  $('#lifeAge').textContent=yrs(L.age);$('#lifeYear').textContent=String(L.born+L.age);
  const inc=L.income(),p=L.pctl();
  const rows=[['Где',`${L.rural?'Деревня':'Город'}, ${L.c.name}`],['Занятие',cap(L.status())],['Семья',cap(L.family())],
    [L.zp===null||L.homemaker?'Доход семьи':'Доход',`<span class="mono">${money(inc)}</span> в месяц <div class="pct">${p<50?`беднее ${100-p}% людей страны`:`богаче ${p}% людей страны`}</div>`],
    ['Учёба',L.degree?'высшее образование':L.eduDone?`${L.eduDone} ${plural(L.eduDone,['класс','класса','классов'])}`:(L.age<7?'ещё рано':'не учился')],
    ['Здоровье',[L.smoker?'курит':'',L.drinker?'часто выпивает':'',L.active&&L.age>=7?'занимается спортом':'',L.ill?(L.illMult<1.5?'лечится: ':'болеет: ')+L.ill:''].filter(Boolean).join(', ')||'без серьёзных проблем']];
  const home={mortgage:`ипотека, осталось ${yrs(L.mortLeft)}`,build:'строит свой дом',rent:'снимает жильё',parents:'живёт с родителями',own:'своё жильё'}[L.housing];
  const money2=[home,L.debt>0?'выплачивает кредит':'',L.biz?'своё дело':''].filter(Boolean).join(', ');
  if(money2)rows.push(['Жильё и деньги',money2]);
  if(L.dream)rows.push(['Мечта',L.dream.title+(L.dreamGaveUp?' (отпущена)':'')]);
  if(!L.alive)rows[1]=['Итог',cap(L.status())+', '+L.cause];
  $('#nowDl').innerHTML=rows.map(r=>`<dt>${r[0]}</dt><dd>${r[0]==='Доход'||r[0]==='Доход семьи'?r[1]:esc(r[1])}</dd>`).join('');
  renderThread();renderNbs();renderFacts();updFocusHint()}

function nbAt(n,age){const s=n.snaps;const i=Math.min(age,s.length-1);return s[i]}
function renderNbs(){const L=G.L;$('#nbs').innerHTML=G.nbs.map(n=>{const s=nbAt(n,L.age);const dead=!s.alive;
  return `<div class="nb${dead?' dead':''}"><b>${esc(n.L.name)}</b><span>${esc(n.L.home.name)}${n.L.migrated&&!dead?'':''}</span><div class="st">${dead?esc(s.status+(s.cause?': '+s.cause:'')):esc(cap(s.status))}</div></div>`}).join('')}

const SRC_NAME={wpp:'ООН, WPP 2024',wdi:'Всемирный банк',bl:'Barro–Lee',whr:'World Happiness Report',gapminder:'Gapminder',region:'среднее по региону',proto:'прототип'};
const num=(v,d)=>(d===undefined?String(v):v.toFixed(d)).replace('.',',');
function srcNote(c,f){const s=c.src&&c.src[f];if(!s)return '';return `${SRC_NAME[s.s]||s.s}${s.y?', '+s.y:''}${s.est?' · оценка':''}`}
function renderFacts(){const c=G.L.home;$('#factsTitle').textContent='Статистика: '+c.name;
  const r=[[['leM','leF'],'Продолжительность жизни, муж. / жен.',`${num(c.leM)} / ${num(c.leF)}`],['u5','Не доживают до 5 лет',`${num(c.u5/10,1)}%`],['gdp','ВВП на душу (ППС), $',c.gdp.toLocaleString('ru-RU')],['gini','Индекс Джини',num(c.gini)],['school','Средние годы учёбы взрослых',num(c.school)],['tert','Охват высшим образованием',c.tert+'%'],['agri','Занятость в сельском хозяйстве',num(c.agri)+'%'],['urb','Живут в городах',c.urb+'%'],['fert','Детей на женщину',num(c.fert)],['mmr','Материнская смертность на 100 000 родов',c.mmr],['hom','Убийств на 100 000',num(c.hom)],['smoke','Курят',num(c.smoke)+'%'],['sat','Удовлетворённость жизнью (0–10)',num(c.sat)]];
  $('#factsTbl').innerHTML=r.map(([f,label,val])=>{const fs=[].concat(f);const est=fs.some(k=>c.src&&c.src[k]&&c.src[k].est);const note=[...new Set(fs.map(k=>srcNote(c,k)))].join('; ');
    return `<tr><td>${label}${note?`<div class="src">${esc(note)}</div>`:''}</td><td>${est?'≈ ':''}${val}</td></tr>`}).join('')}

/* ---------- end ---------- */
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
    ${G.notes.length?`<div class="card"><div class="sect-h">Ваши записи</div>${G.notes.map(n=>`<p style="margin:0 0 8px"><span class="mono muted">${n.age}</span> «${esc(n.a)}»</p>`).join('')}</div>`:''}
    <div class="card"><div class="sect-h">Родившиеся в ту же секунду</div><ul style="margin:0;padding-left:18px;display:flex;flex-direction:column;gap:6px">${nbHtml}</ul></div>
    ${cmp}
    <div class="card" style="display:flex;flex-direction:column;gap:10px"><label for="epi" class="sect-h" style="margin:0">Несколько слов этому человеку</label><textarea id="epi" maxlength="400"></textarea><div class="row" style="justify-content:flex-start"><button class="btn primary" type="button" id="saveMem">Сохранить в мемориалы</button><span id="saved" class="muted" style="align-self:center"></span></div></div>
    <div class="row" style="justify-content:flex-start"><button class="btn-born" type="button" id="again" style="width:auto">Родиться снова</button><button class="btn" type="button" id="toMem">Мои мемориалы</button><button class="btn ghost" type="button" id="toStart">На главную</button></div>`;
  if(dO&&window.LR.ai&&LR.ai.available()){
    const hl=L.history.filter(h=>h.id!=='dream').slice(-6).map(h=>`${h.age} лет: ${h.label}`);
    if(L.kids.length)hl.push(`детей: ${L.kids.length}`);if(L.migrated)hl.push(`переезд: ${L.c.name}`);
    LR.ai.writeEpilogue(L,dO.key,hl).then(r=>{if(r&&r.text&&G.L===L&&$('#dreamEpi')){$('#dreamEpi').textContent=r.text;$('#dreamEpiNote').hidden=false}})}
  $('#saveMem').addEventListener('click',()=>{if(G.savedId)return;const list=store.get('lr.mem',[]);const id=Date.now();G.savedId=id;
    list.unshift({id,name:L.name,home:L.home.name,now:L.c.name,born:L.born,age:L.age,cause:L.cause,job:L.job,kids:L.kids.length,dream:L.dream?L.dream.title:null,dreamRes:dO?dO.title:null,epi:$('#epi').value.trim(),notes:G.notes});store.set('lr.mem',list.slice(0,200));$('#saved').textContent='Сохранено';$('#saveMem').disabled=true;memCount()});
  G.savedId=null;
  $('#again').addEventListener('click',startLife);$('#toMem').addEventListener('click',()=>{renderMem();show('scrMem')});$('#toStart').addEventListener('click',()=>{memCount();show('scrStart')});
  show('scrEnd')}

/* ---------- memorials ---------- */
function renderMem(){const list=store.get('lr.mem',[]);
  $('#memList').innerHTML=list.length?list.map(m=>`<div class="mem"><h3>${esc(m.name)}</h3><p class="mono muted" style="font-size:13px">${m.born} — ${m.born+m.age} · ${esc(m.home)}${m.now!==m.home?' → '+esc(m.now):''}</p><p>${m.age===0?'Меньше года':cap(yrs(m.age))}. ${esc(cap(m.cause||''))}.${m.job?' Работа: '+esc(m.job)+'.':''}${m.kids?' Детей: '+m.kids+'.':''}${m.dream?' Мечта: '+esc(m.dream)+(m.dreamRes?' — '+esc(m.dreamRes.toLowerCase()):'')+'':''}</p>${m.epi?`<p class="ep">«${esc(m.epi)}»</p>`:''}</div>`).join(''):'<p class="muted">Пока пусто. Проживите жизнь и сохраните её в конце.</p>';
  $('#memClear').textContent='Стереть все записи';G.clearArm=false}
$('#memBack').addEventListener('click',()=>{memCount();show('scrStart')});
$('#memClear').addEventListener('click',e=>{if(!G.clearArm){G.clearArm=true;e.currentTarget.textContent='Нажмите ещё раз, чтобы стереть';return}store.set('lr.mem',[]);renderMem();memCount()});
})();
