/* Клиент ИИ. Ходит только к своему Worker'у (адрес — LR.config.AI_ENDPOINT), ключей здесь нет.
   Любая ошибка, таймаут или лимит → null, и игра берёт заготовленные шаблоны.
   Отправляется только текст мечты и обобщённые данные игры (страна, достаток в процентилях,
   образование, занятие, подписи прошлых решений) — ничего о самом игроке. */
(function(){
window.LR=window.LR||{};
const TIMEOUT=8000;
let pausedUntil=0;   // после лимита или сбоя ИИ на время выключается, чтобы не ждать каждый раз
let lastError='';

// Тот же принцип, что и в Worker'е: в мягком режиме не показываем текст ИИ со словами о смерти и насилии.
const SOFT=/(^|[\s«"(-])(убий|убит|смерт|умер|умир|гибел|погиб|насил|войн|оружи|самоуб|суицид)/i;
const GRAPHIC=/(^|[\s«"(-])(труп|кровав|кровопрол|расчлен|пытк|изнасил)/i;
function safe(obj,soft){const t=JSON.stringify(obj||'');return !GRAPHIC.test(t)&&!(soft&&SOFT.test(t))}

function endpoint(){return String((LR.config&&LR.config.AI_ENDPOINT)||'').trim().replace(/\/+$/,'')}

async function call(path,body){
  const base=endpoint();
  if(!base||Date.now()<pausedUntil)return null;
  const ctl=new AbortController();const t=setTimeout(()=>ctl.abort(),TIMEOUT);
  try{
    const r=await fetch(base+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:ctl.signal});
    if(r.status===422){lastError='inappropriate';return {error:'inappropriate'}}
    if(r.status===429||r.status===503){lastError='limit';pausedUntil=Date.now()+10*60*1000;return null}
    if(!r.ok){lastError='error';pausedUntil=Date.now()+60*1000;return null}
    const v=await r.json();
    if(!safe(v,body.soft)){lastError='unsafe';return null}
    lastError='';return v;
  }catch(e){lastError=e.name==='AbortError'?'timeout':'network';pausedUntil=Date.now()+60*1000;return null}
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
  if(L.grandkids)p.push(`внуков: ${L.grandkids}`);if(L.flags.pet)p.push('есть питомец');if(L.flags.bf)p.push(`лучший друг: ${L.flags.bf}`);
  return p.join('; ')}
function homeOf(L){const h=L.home2;if(!h)return '';
  return [h.elec?'есть электричество':'нет электричества',h.water?'есть чистая вода':'воду носят издалека',h.toilet?'есть туалет':'туалета нет',h.cook?'готовят на газе или электричестве':'готовят на дровах',h.net?'есть интернет':'интернета нет'].join(', ')}

/* какой ИИ стоит за Worker'ом — чтобы честно написать игроку, куда уйдёт текст */
let provider='gemini';
if(endpoint())fetch(endpoint()+'/health').then(r=>r.ok?r.json():null).then(v=>{if(v&&v.provider)provider=v.provider}).catch(()=>{});

LR.ai={
  enabled:()=>!!endpoint(),
  provider:()=>provider,
  available:()=>!!endpoint()&&Date.now()>=pausedUntil,
  lastError:()=>lastError,
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
