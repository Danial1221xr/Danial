/* Графики экрана конца: доход за жизнь против среднего по стране и линии жизни соседей по секунде.
   Чистый SVG, цвета — токены из :root (линии 2px, сетка 1px, подсказка при наведении, таблица для чтения без графика). */
(function(){
window.LR=window.LR||{};
const esc=s=>String(s).replace(/[&<>"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]));
const fmt=v=>{v=Math.max(0,v);return '$'+(v>=10000?Math.round(v/1000)+'K':v>=1000?(v/1000).toFixed(1).replace('.',',').replace(',0','')+'K':Math.round(v))};
const full=v=>'$'+Math.round(Math.max(0,v)).toLocaleString('ru-RU');
function niceMax(v){const p=Math.pow(10,Math.floor(Math.log10(v||1)));for(const m of [1,1.5,2,2.5,3,4,5,6,8,10])if(m*p>=v)return m*p;return 10*p}
const yrsW=n=>{const a=Math.abs(n)%100,b=a%10;return n+' '+(a>10&&a<20?'лет':b===1?'год':b>1&&b<5?'года':'лет')};

/* points: [{age, inc, avg}] — доход в месяц (до начала работы — на человека в семье) и средний по стране */
function income(box,points){
  if(!points||points.length<2){box.innerHTML='';return}
  // ширина в настоящих пикселях контейнера: подписи остаются читаемыми и на телефоне
  const W=Math.max(280,Math.round(box.clientWidth||600)),H=W<480?200:230,ml=44,mr=12,mt=12,mb=24,iw=W-ml-mr,ih=H-mt-mb;
  const maxA=Math.max(points[points.length-1].age,5),xstep=W<480?(maxA>60?25:10):0,ymax=niceMax(Math.max(...points.map(p=>Math.max(p.inc,p.avg)))*1.08);
  const X=a=>ml+a/maxA*iw,Y=v=>mt+ih-Math.min(v,ymax)/ymax*ih;
  const line=k=>points.map((p,i)=>`${i?'L':'M'}${X(p.age).toFixed(1)} ${Y(p[k]).toFixed(1)}`).join('');
  const area=line('inc')+`L${X(points[points.length-1].age).toFixed(1)} ${Y(0)}L${X(points[0].age).toFixed(1)} ${Y(0)}Z`;
  const yt=[0,0.25,0.5,0.75,1].map(f=>f*ymax),step=xstep||(maxA>60?20:maxA>30?10:5),xt=[];for(let a=0;a<=maxA;a+=step)xt.push(a);
  const last=points[points.length-1];
  box.innerHTML=`<div class="legend"><span><i class="key key-you"></i>Ваш доход в месяц</span><span><i class="key key-avg"></i>Средний по стране</span></div>
  <div class="chart-wrap"><svg class="chart" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="График дохода по годам жизни: максимум ${full(Math.max(...points.map(p=>p.inc)))} в месяц, средний по стране ${full(points[0].avg)}">
    <g class="grid">${yt.map(v=>`<line x1="${ml}" x2="${W-mr}" y1="${Y(v)}" y2="${Y(v)}"/>`).join('')}</g>
    <g class="ticks">${yt.map(v=>`<text x="${ml-6}" y="${Y(v)+4}" text-anchor="end">${fmt(v)}</text>`).join('')}${xt.map(a=>`<text x="${X(a)}" y="${H-6}" text-anchor="middle">${a}</text>`).join('')}</g>
    <path class="area-you" d="${area}"/><path class="line-avg" d="${line('avg')}"/><path class="line-you" d="${line('inc')}"/>
    <circle class="end-you" cx="${X(last.age)}" cy="${Y(last.inc)}" r="4"/>
    <g class="hover" hidden><line class="cross" y1="${mt}" y2="${mt+ih}"/><circle class="hdot" r="4"/></g>
    <rect class="hit" x="${ml}" y="${mt}" width="${iw}" height="${ih}"/>
  </svg><div class="tip" hidden></div></div>
  <details class="tbl"><summary>Таблица</summary><table><tr><th>Возраст</th><th>Доход в месяц</th><th>Средний по стране</th></tr>${points.filter((p,i)=>p.age%5===0||i===points.length-1).map(p=>`<tr><td>${p.age}</td><td>${full(p.inc)}</td><td>${full(p.avg)}</td></tr>`).join('')}</table></details>`;
  const svg=box.querySelector('svg'),hit=box.querySelector('.hit'),hov=box.querySelector('.hover'),tip=box.querySelector('.tip');
  const move=e=>{const r=svg.getBoundingClientRect(),x=(e.clientX-r.left)/r.width*W;const a=Math.round((x-ml)/iw*maxA);
    const p=points.reduce((b,q)=>Math.abs(q.age-a)<Math.abs(b.age-a)?q:b,points[0]);
    hov.hidden=false;hov.querySelector('.cross').setAttribute('x1',X(p.age));hov.querySelector('.cross').setAttribute('x2',X(p.age));
    const d=hov.querySelector('.hdot');d.setAttribute('cx',X(p.age));d.setAttribute('cy',Y(p.inc));
    tip.hidden=false;tip.innerHTML=`<b>${yrsW(p.age)}</b><span><i class="key key-you"></i>${full(p.inc)}</span><span><i class="key key-avg"></i>${full(p.avg)}</span>`;
    const px=X(p.age)/W*r.width;tip.style.left=Math.min(Math.max(px,60),r.width-60)+'px'};
  hit.addEventListener('pointermove',move);hit.addEventListener('pointerdown',move);
  hit.addEventListener('pointerleave',()=>{hov.hidden=true;tip.hidden=true});
}

const PH={child:'детство',school:'учёба',work:'работа',old:'старость'};
/* rows: [{name, sub, phases:['child','school',...по годам], age, you}] */
function lifeLines(box,rows){
  const maxA=Math.max(100,...rows.map(r=>r.age+1));
  const W=600,H=14;
  const seg=r=>{const out=[];let s=0;for(let i=1;i<=r.phases.length;i++){if(i===r.phases.length||r.phases[i]!==r.phases[s]){out.push([s,i,r.phases[s]]);s=i}}return out};
  box.innerHTML=`<div class="legend">${Object.entries(PH).map(([k,v])=>`<span><i class="sw ph-${k}"></i>${v}</span>`).join('')}</div>
  ${rows.map(r=>`<div class="ll${r.you?' you':''}"><div class="ll-lbl"><b>${esc(r.name)}</b> <span>${esc(r.sub)}</span></div>
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${esc(r.name)}: прожито ${yrsW(r.age)}">
      <rect class="track" x="0" y="0" width="${W}" height="${H}" rx="3"/>
      ${seg(r).map(([a,b,ph])=>`<rect class="ph-${ph}" x="${(a/maxA*W+(a?1:0)).toFixed(1)}" y="0" width="${Math.max(1,(b-a)/maxA*W-(a?2:1)).toFixed(1)}" height="${H}" rx="3"><title>${PH[ph]||ph}: ${a}–${b} лет</title></rect>`).join('')}
    </svg></div>`).join('')}
  <div class="ll-axis"><span>0</span><span>25</span><span>50</span><span>75</span><span>${maxA>100?maxA:100}</span></div>
  <details class="tbl"><summary>Таблица</summary><table><tr><th>Кто</th><th>Прожито</th>${Object.values(PH).map(v=>`<th>${v}</th>`).join('')}</tr>
  ${rows.map(r=>`<tr><td>${esc(r.name)}</td><td>${r.age}</td>${Object.keys(PH).map(k=>`<td>${r.phases.filter(p=>p===k).length}</td>`).join('')}</tr>`).join('')}</table></details>`;
}

LR.charts={income,lifeLines};
})();
