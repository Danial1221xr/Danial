/* Карта мира на стартовом экране: контуры стран (Natural Earth, data/world.json) и вспышки рождений.
   Страна каждой вспышки выбирается с вероятностью, равной её доле в рождениях за год (≈4,2 рождения в секунду),
   угасающие точки — смерти (≈2 в секунду). При prefers-reduced-motion карта неподвижна. */
(function(){
window.LR=window.LR||{};
const reduce=()=>window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function svg(world,countries){
  const share=Object.fromEntries(countries.map(c=>[c.code,c]));
  const total=countries.reduce((s,c)=>s+c.births,0);
  const pct=c=>{const p=c.births/total*100;return (p>=1?p.toFixed(1):p.toFixed(2)).replace('.',',')};
  const land=Object.entries(world.paths).map(([k,d])=>{const c=share[k];return `<path d="${d}"><title>${c?`${c.name}: ${pct(c)}% рождений в мире`:''}</title></path>`}).join('');
  const tiny=Object.keys(world.pts).filter(k=>!world.paths[k]).map(k=>{const [x,y]=world.pts[k][0],c=share[k];return `<circle cx="${x}" cy="${y}" r="2.2"><title>${c?`${c.name}: ${pct(c)}% рождений в мире`:''}</title></circle>`}).join('');
  return `<svg class="world" viewBox="0 0 ${world.w} ${world.h}" role="img" aria-label="Карта мира: вспышки показывают, где прямо сейчас рождаются дети"><path class="sea" d="${world.sphere}"/><path class="rest" d="${world.rest}"/><g class="land">${land}</g><g class="land tiny">${tiny}</g></svg>`;
}

function start(box,world,countries,onTick){
  box.innerHTML=svg(world,countries)+'<canvas aria-hidden="true"></canvas>';
  const cv=box.querySelector('canvas'),cx=cv.getContext('2d');
  const pool=countries.map(c=>[c,c.births]),sum=pool.reduce((s,p)=>s+p[1],0);
  const pickC=()=>{let r=Math.random()*sum;for(const [c,w] of pool){r-=w;if(r<=0)return c}return pool[0][0]};
  const dots=[];let col={a:'#B9620F',m:'#5A6573'},colT=-1e9,lastB=0,lastD=0,T0=performance.now(),running=true,recent=[];
  // при неподвижной карте после смены размера холст нужно перерисовать
  const size=()=>{const r=cv.getBoundingClientRect(),d=window.devicePixelRatio||1;cv.width=Math.max(1,r.width*d);cv.height=Math.max(1,r.height*d);if(reduce()&&dots.length)draw(0)};
  size();const ro=window.ResizeObserver?new ResizeObserver(size):null;if(ro)ro.observe(cv);
  const place=c=>{const list=world.pts[c.code]||[[world.w/2,world.h/2]];const [x,y]=list[Math.floor(Math.random()*list.length)];return {x:(x+(Math.random()-0.5)*3)/world.w,y:(y+(Math.random()-0.5)*3)/world.h}};
  function colors(ts){if(ts-colT<800)return;const cs=getComputedStyle(document.documentElement);col.a=cs.getPropertyValue('--accent').trim()||col.a;col.m=cs.getPropertyValue('--muted').trim()||col.m;colT=ts}
  function draw(ts){
    const W=cv.width,H=cv.height,dp=window.devicePixelRatio||1;cx.clearRect(0,0,W,H);
    for(let i=dots.length-1;i>=0;i--){const o=dots[i],age=ts-o.t;let r=1.8*dp,a=0.75,c=col.a;
      if(o.dead){const f=(ts-o.dead)/1800;if(f>=1){dots.splice(i,1);continue}a=0.55*(1-f);c=col.m}
      else if(age<1400&&!reduce()){const f=age/1400;r=(1.8+7*(1-f))*dp;a=0.2+0.55*f}
      cx.globalAlpha=a;cx.fillStyle=c;cx.beginPath();cx.arc(o.x*W,o.y*H,r,0,Math.PI*2);cx.fill()}
    cx.globalAlpha=1}
  if(reduce()){ // неподвижная картина: 300 точек по долям рождений
    colors(0);for(let i=0;i<300;i++){const c=pickC();dots.push({...place(c),t:-1e9,dead:0})}draw(0);
  }
  function frame(ts){if(!running)return;colors(ts);const el=(ts-T0)/1000;
    const b=Math.floor(el*4.2),d=Math.floor(el*2.0);
    while(lastB<b){const c=pickC();dots.push({...place(c),t:ts,dead:0});recent.unshift(c.name);recent.length=Math.min(recent.length,3);lastB++;if(dots.length>500)dots.shift()}
    while(lastD<d){const al=dots.filter(o=>!o.dead&&ts-o.t>2500);if(al.length)al[Math.floor(Math.random()*al.length)].dead=ts;lastD++}
    if(onTick)onTick(b,d,recent);
    if(!reduce())draw(ts);
    requestAnimationFrame(frame)}
  requestAnimationFrame(frame);
  return {stop(){running=false;if(ro)ro.disconnect()},resume(){if(!running){running=true;requestAnimationFrame(frame)}}};
}

LR.map={svg,start};
})();
