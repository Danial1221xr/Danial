/* Клиент ИИ. Ходит только к своему Worker'у (адрес — LR.config.AI_ENDPOINT), ключей здесь нет.
   Любая ошибка, таймаут или лимит → null, и игра берёт заготовленные шаблоны.
   Отправляется только текст мечты и обобщённые данные игры (страна, достаток в процентилях,
   образование, занятие, подписи прошлых решений) — ничего о самом игроке. */
(function(){
window.LR=window.LR||{};
// новые модели Gemini «думают» перед ответом: на события нескольких лет нужно до 20–25 секунд
const TIMEOUT={'/dream':15000,'/fork':20000,'/moments':28000,'/epilogue':20000};
let pausedUntil=0;   // после лимита или сбоя ИИ на время выключается, чтобы не ждать каждый раз
let lastError='',fails=0;

// Тот же принцип, что и в Worker'е: в мягком режиме не показываем текст ИИ со словами о смерти и насилии.
const SOFT=/(^|[\s«"(-])(убий|убит|смерт|умер|умир|гибел|погиб|насил|войн|оружи|самоуб|суицид)/i;
const GRAPHIC=/(^|[\s«"(-])(труп|кровав|кровопрол|расчлен|пытк|изнасил)/i;
function safe(obj,soft){const t=JSON.stringify(obj||'');return !GRAPHIC.test(t)&&!(soft&&SOFT.test(t))}

function endpoint(){return String((LR.config&&LR.config.AI_ENDPOINT)||'').trim().replace(/\/+$/,'')}

async function call(path,body){
  const base=endpoint();
  if(!base||Date.now()<pausedUntil)return null;
  const ctl=new AbortController();const t=setTimeout(()=>ctl.abort(),TIMEOUT[path]||20000);
  // пауза растёт с числом сбоев подряд: 20 с, 40 с, 80 с … до 5 минут
  const pause=ms=>{fails++;pausedUntil=Date.now()+Math.min(5*60000,ms*Math.pow(2,Math.min(fails-1,4)))};
  try{
    const r=await fetch(base+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:ctl.signal});
    if(r.status===422){lastError='inappropriate';return {error:'inappropriate'}}
    if(!r.ok){let code='';try{code=(await r.json()).error||''}catch(e){}
      lastError=code||('http_'+r.status);
      if(r.status===403)lastError='origin';
      pause(r.status===429?30000:code==='not_configured'?300000:20000);report();return null}
    const v=await r.json();
    if(!safe(v,body.soft)){lastError='unsafe';return null}
    lastError='';fails=0;report();return v;
  }catch(e){lastError=e.name==='AbortError'?'timeout':'network';pause(20000);report();return null}
  finally{clearTimeout(t)}
}

/* Обобщённый контекст жизни для промпта. */
function contextOf(L){
  const c=L.c,econ=c.gdp<5000?'бедная страна':c.gdp<20000?'страна со средним доходом':'богатая страна';
  return {country:c.name,econ,sex:L.sex,income:L.pctl(),soft:!!L.soft,
    education:L.degree?'высшее образование':L.flags.collegeDone?'колледж':L.eduDone?L.eduDone+' классов школы':'не учился',
    status:L.status(),history:L.history.filter(h=>h.id!=='dream').slice(-8).map(h=>`${h.age} лет: ${h.label}`)};
}

/* семья и дом одной строкой — только то, что видно в игре */
function familyOf(L){const a=L.age,p=[];
  if(L.mom)p.push(`мама ${L.momAge+a} лет`);else p.push('мамы нет в живых');
  if(L.dad)p.push(L.flags.dadAway?`папа ${L.dadAge+a} лет, на заработках далеко`:`папа ${L.dadAge+a} лет`);else p.push('папы нет в живых');
  if(L.sibs)p.push(`старших братьев и сестёр: ${L.sibs}`);if(L.young)p.push(`младших: ${L.young}`);
  if(L.married)p.push(`в браке с ${L.spouse}`);else if(L.everMarried)p.push(L.widowed?'вдов'+(L.sex==='m'?'ец':'а'):'в разводе');
  const k=L.kids.filter(k=>k.alive).map(k=>`${k.name} (${a-k.born})`);if(k.length)p.push('дети: '+k.join(', '));
  if(L.grandkids)p.push(`внуков: ${L.grandkids}`);if(L.flags.pet)p.push('есть питомец');if(L.hobbies&&L.hobbies.length)p.push('увлечения: '+L.hobbies.map(k=>LR.engine.SKILLS[k].hobby).join(', '));if(L.flags.bf)p.push(`лучший друг: ${L.flags.bf}`);
  return p.join('; ')}
function homeOf(L){const h=L.home2;if(!h)return '';
  return [h.elec?'есть электричество':'нет электричества',h.water?'есть чистая вода':'воду носят издалека',h.toilet?'есть туалет':'туалета нет',h.cook?'готовят на газе или электричестве':'готовят на дровах',h.net?'есть интернет':'интернета нет'].join(', ')}

/* какой ИИ стоит за Worker'ом — чтобы честно написать игроку, куда уйдёт текст */
let provider='gemini';
if(endpoint())fetch(endpoint()+'/health').then(r=>r.ok?r.json():null).then(v=>{if(v&&v.provider)provider=v.provider}).catch(()=>{});

/* понятное объяснение ошибки для игрока */
const WHY={timeout:'ИИ отвечал слишком долго',network:'нет связи с Worker\'ом (адрес в js/config.js или сеть)',origin:'Worker не принимает запросы с этого адреса — откройте игру на http://localhost:8000 или впишите адрес в ALLOWED_ORIGINS',
  rate_limit:'слишком много запросов, ИИ отдыхает',quota:'закончился бесплатный лимит Gemini на сегодня или в минуту',not_configured:'в Worker\'е не задан ключ (npx wrangler secret put GEMINI_API_KEY)',
  upstream:'Google вернул ошибку',bad_output:'ИИ ответил не по формату',unsafe:'ответ ИИ не прошёл фильтр',unsafe_output:'ответ ИИ не прошёл фильтр',internal:'ошибка внутри Worker\'а'};
function explain(code,detail){const base=WHY[code]||('ошибка '+code);
  if(code==='upstream'&&/API key not valid|API_KEY_INVALID/i.test(detail||''))return 'ключ Gemini недействителен — создайте новый и задайте его заново';
  if(code==='upstream'&&/not found|no longer available/i.test(detail||''))return 'модель Gemini отключена — обновите Worker (npx wrangler deploy)';
  return base}
const listeners=[];
function report(){for(const f of listeners)try{f(status())}catch(e){}}
function status(){if(!endpoint())return {state:'off',text:'ИИ не подключён: работают заготовки'};
  if(!lastError)return {state:'ok',text:''};
  return {state:'err',code:lastError,text:explain(lastError)}}
/* настоящая проверка: Worker делает короткий запрос к ИИ */
async function check(){const base=endpoint();if(!base)return {ok:false,text:'Адрес Worker\'а не указан в js/config.js'};
  try{const ctl=new AbortController();const t=setTimeout(()=>ctl.abort(),30000);
    const r=await fetch(base+'/health?test=1',{signal:ctl.signal});clearTimeout(t);
    const v=await r.json();
    const here=location.origin,list=String(v.origins||'').split(',').map(x=>x.trim());
    if(v.origins&&!list.includes(here))return {ok:false,text:`ИИ на сервере работает, но Worker не принимает запросы с адреса ${here}. Откройте игру по одному из адресов: ${list.join(', ')} — или добавьте этот адрес в ALLOWED_ORIGINS в worker/wrangler.toml и выполните npx wrangler deploy.`};
    if(v.ok){lastError='';fails=0;pausedUntil=0;if(v.provider)provider=v.provider;report();return {ok:true,text:`ИИ работает: ${v.provider}, модель ${v.model}`}}
    return {ok:false,text:explain(v.error,v.detail)+(v.detail?` (${String(v.detail).slice(0,140)})`:'')}}
  catch(e){return {ok:false,text:e.name==='AbortError'?'Worker не ответил за 30 секунд':'Нет связи с Worker\'ом: проверьте адрес в js/config.js и что Worker задеплоен'}}}

LR.ai={
  enabled:()=>!!endpoint(),
  provider:()=>provider,
  available:()=>!!endpoint()&&Date.now()>=pausedUntil,
  lastError:()=>lastError,
  status,check,onStatus:f=>listeners.push(f),
  contextOf,
  /* мечта → {sphere,title,edu,needUni,needMove,difficulty,short} | {error:'inappropriate'} | null */
  classifyDream:(text,L)=>call('/dream',{...contextOf(L),text}),
  /* развилка → {title,text,options:[{label,hint,kind}]} | null */
  writeFork:(stage,L)=>call('/fork',{...contextOf(L),stage,age:L.age,dream:{title:L.dream.title,sphere:L.dream.sphere,short:L.dream.short}}),
  /* обычные события и бытовой выбор на возраст from..to → {events:[{age,text,tags}], choices:[...]} | null */
  moments:(L,from,to,recent)=>call('/moments',{...contextOf(L),ageFrom:from,ageTo:to,place:`${L.rural?'деревня':'город'}, ${L.c.name}`,family:familyOf(L),home:homeOf(L),recent}),
  /* итог → {text} | null */
  writeEpilogue:(L,outcome,highlights)=>call('/epilogue',{...contextOf(L),dream:{title:L.dream.title,sphere:L.dream.sphere,short:L.dream.short},outcome,age:L.age,job:L.job||'',highlights}),
  safe
};
})();
