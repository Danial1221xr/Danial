/* Процедурный портрет и фон этапа жизни. Никаких фото: только простые фигуры.
   Внешность задаётся зерном жизни (имя, год, страна), возраст меняет пропорции, причёску, седину и морщины.
   Все цвета — токены из :root (--skin-*, --hair-*, --cloth-*, --scene-*). */
(function(){
window.LR=window.LR||{};

function hash(s){let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return h>>>0}
function rng(seed){let x=seed||1;return()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return (x>>>0)/4294967296}}
const pickW=(r,list)=>{let s=0;for(const [,w] of list)s+=w;let v=r()*s;for(const [k,w] of list){v-=w;if(v<=0)return k}return list[0][0]};

/* оттенки кожи и волос по регионам — широкие смеси, без «типичного лица» страны */
const SKIN={SSA:[[5,3],[6,5],[4,1]],SA:[[3,2],[4,4],[5,2]],EA:[[2,4],[3,3],[1,1]],ME:[[2,2],[3,4],[4,2]],LA:[[2,2],[3,3],[4,3],[5,1]],
  EE:[[1,5],[2,3],[3,1]],CA:[[2,3],[3,3],[1,1]],HI:[[1,4],[2,3],[3,2],[4,1],[5,1]]};
const HAIR={SSA:[['black',9],['brown',1]],SA:[['black',9],['brown',1]],EA:[['black',9],['brown',1]],ME:[['black',7],['brown',3]],LA:[['black',6],['brown',4]],
  EE:[['brown',5],['blond',3],['black',1],['red',1]],CA:[['black',7],['brown',3]],HI:[['brown',5],['blond',2],['black',2],['red',1]]};

/* черты лица, неизменные всю жизнь */
function traits(L){
  const r=rng(hash(`${L.name}|${L.born}|${L.home.code}|${L.sex}`));
  const reg=L.home.region;
  return {skin:pickW(r,SKIN[reg]||SKIN.HI),hair:pickW(r,HAIR[reg]||HAIR.HI),curly:reg==='SSA'?r()<0.8:r()<0.2,
    style:L.sex==='f'?pickW(r,[['long',5],['bun',2],['short',2]]):pickW(r,[['short',6],['crop',3],['long',1]]),
    beard:L.sex==='m'&&r()<({ME:0.6,SA:0.45,CA:0.35}[reg]||0.25),bald:L.sex==='m'&&r()<0.35,glasses:r()<0.45,
    cloth:1+Math.floor(r()*4),eyes:0.9+r()*0.25,face:0.95+r()*0.1}
}

function svg(L,opt={}){
  const t=L._traits||(L._traits=traits(L));
  const a=Math.min(L.age,100),dead=!L.alive;
  // рост: младенец маленький и с крупной головой, к 18 — взрослые пропорции
  const g=Math.min(1,0.45+a/18*0.55),head=a<3?1.25:a<10?1.12:1;
  const gray=a<40?0:Math.min(1,(a-40)/35),wr=a<50?0:Math.min(1,(a-50)/30);
  const hairCol=`color-mix(in srgb, var(--hair-${t.hair}) ${Math.round((1-gray)*100)}%, var(--hair-gray))`;
  const skin=`var(--skin-${t.skin})`,cloth=`var(--cloth-${t.cloth})`;
  const hx=60,hy=58,rx=22*t.face*head,ry=25*head;
  const baby=a<2,teen=a>=12&&a<20;
  let hair='',back='';
  if(baby)hair=`<path d="M${hx-10} ${hy-ry+4} q10 -8 20 0" fill="none" stroke="${hairCol}" stroke-width="3" stroke-linecap="round"/>`;
  else if(t.bald&&a>45)hair=`<path d="M${hx-rx} ${hy-4} q-2 -10 4 -14 M${hx+rx} ${hy-4} q2 -10 -4 -14" fill="none" stroke="${hairCol}" stroke-width="4" stroke-linecap="round"/>`;
  else{
    const top=`M${hx-rx-1} ${hy-2} Q${hx-rx} ${hy-ry-8} ${hx} ${hy-ry-7} Q${hx+rx} ${hy-ry-8} ${hx+rx+1} ${hy-2} Q${hx+rx-4} ${hy-ry+6} ${hx} ${hy-ry+5} Q${hx-rx+4} ${hy-ry+6} ${hx-rx-1} ${hy-2}Z`;
    hair=`<path d="${top}" fill="${hairCol}"/>`;
    if(t.curly)for(let i=-2;i<=2;i++)hair+=`<circle cx="${hx+i*rx*0.42}" cy="${hy-ry+2-Math.abs(i)*-1.5}" r="${6.5}" fill="${hairCol}"/>`;
    if(t.style==='long'&&a>=4)back=`<path d="M${hx-rx-1} ${hy-4} Q${hx-rx-6} ${hy+22} ${hx-rx+2} ${hy+34} L${hx-rx+7} ${hy+6}Z M${hx+rx+1} ${hy-4} Q${hx+rx+6} ${hy+22} ${hx+rx-2} ${hy+34} L${hx+rx-7} ${hy+6}Z" fill="${hairCol}"/>`;
    if(t.style==='bun'&&a>=6)hair+=`<circle cx="${hx}" cy="${hy-ry-10}" r="8" fill="${hairCol}"/>`;
  }
  const ey=hy+2,es=6.5*t.eyes,eyeR=baby?2.6:2.1;
  const eyes=dead?`<path d="M${hx-es-3} ${ey} h6 M${hx+es-3} ${ey} h6" stroke="var(--face-ink)" stroke-width="1.6" stroke-linecap="round"/>`
    :`<circle cx="${hx-es}" cy="${ey}" r="${eyeR}" fill="var(--face-ink)"/><circle cx="${hx+es}" cy="${ey}" r="${eyeR}" fill="var(--face-ink)"/>`;
  const mouth=`<path d="M${hx-5} ${hy+13} q5 ${dead?0:(opt.sad?-2:3)} 10 0" fill="none" stroke="var(--face-ink)" stroke-width="1.6" stroke-linecap="round"/>`;
  const wrinkles=wr>0?`<g stroke="var(--face-ink)" stroke-width="0.9" fill="none" opacity="${(0.15+wr*0.35).toFixed(2)}" stroke-linecap="round"><path d="M${hx-9} ${hy-11} q9 -3 18 0"/><path d="M${hx-es-6} ${ey+5} q2 2 4 1 M${hx+es+2} ${ey+6} q2 -1 4 -1"/>${wr>0.5?`<path d="M${hx-8} ${hy-15} q8 -3 16 0"/>`:''}</g>`:'';
  // борода повторяет линию челюсти и оставляет открытым рот
  const beard=t.beard&&a>=20?`<path d="M${hx-rx+0.5} ${hy+2} Q${hx-rx+2} ${hy+ry} ${hx} ${hy+ry+3} Q${hx+rx-2} ${hy+ry} ${hx+rx-0.5} ${hy+2} Q${hx+rx-6} ${hy+16} ${hx+8} ${hy+17} Q${hx} ${hy+10} ${hx-8} ${hy+17} Q${hx-rx+6} ${hy+16} ${hx-rx+0.5} ${hy+2}Z" fill="${hairCol}" opacity="0.85"/>`:'';
  const glasses=t.glasses&&a>=45?`<g fill="none" stroke="var(--face-ink)" stroke-width="1.4"><circle cx="${hx-es}" cy="${ey}" r="5.5"/><circle cx="${hx+es}" cy="${ey}" r="5.5"/><path d="M${hx-es+5.5} ${ey} h${2*es-11}"/></g>`:'';
  const cheeks=a<12&&!dead?`<circle cx="${hx-rx*0.6}" cy="${hy+8}" r="3.5" fill="var(--accent)" opacity="0.18"/><circle cx="${hx+rx*0.6}" cy="${hy+8}" r="3.5" fill="var(--accent)" opacity="0.18"/>`:'';
  const body=baby?`<ellipse cx="60" cy="122" rx="28" ry="22" fill="${cloth}"/>`
    :`<path d="M${60-(teen?30:34)} 140 Q${60-(teen?28:32)} 100 60 98 Q${60+(teen?28:32)} 100 ${60+(teen?30:34)} 140Z" fill="${cloth}"/><rect x="54" y="${hy+ry-6}" width="12" height="14" rx="4" fill="${skin}"/>`;
  return `<svg class="portrait${dead?' is-dead':''}" viewBox="0 0 120 140" role="img" aria-label="Портрет: ${L.sex==='m'?'мужчина':'женщина'}, ${a} лет">
    <g class="pg" style="transform:translate(60px,140px) scale(${g.toFixed(3)}) translate(-60px,-140px)">
      ${body}
      ${back}
      <ellipse cx="${hx}" cy="${hy}" rx="${rx.toFixed(1)}" ry="${ry.toFixed(1)}" fill="${skin}"/>
      ${cheeks}${wrinkles}${beard}${eyes}${mouth}${glasses}${hair}
    </g></svg>`;
}

/* этап жизни для фона и нити */
function stage(L){if(!L.alive)return 'dead';const a=L.age;if(a<6)return 'child';if(L.inSchool||L.uni||L.college||a<15)return 'school';if(L.retired||a>=65)return 'old';return 'work'}

/* фон этапа: простые сцены из фигур (детство — солнце и холмы, учёба — книги, работа — город или поле, старость — сад) */
function scene(st,rural){
  const hills=`<path d="M0 120 Q60 92 130 110 T260 104 T400 112 V160 H0Z" fill="var(--scene-ground)"/>`;
  const S={
    child:`<circle cx="190" cy="38" r="20" fill="var(--scene-sun)"/>${hills}<g fill="var(--scene-accent)"><rect x="70" y="96" width="16" height="16" rx="3"/><circle cx="110" cy="104" r="8"/></g>`,
    school:`<circle cx="190" cy="38" r="16" fill="var(--scene-sun)"/>${hills}<g fill="var(--scene-accent)"><rect x="40" y="70" width="70" height="44" rx="2"/><path d="M34 72 L75 50 L116 72Z"/></g><g fill="var(--scene-far)"><rect x="250" y="94" width="10" height="20" rx="2"/><rect x="264" y="98" width="10" height="16" rx="2"/></g>`,
    work:rural?`<circle cx="190" cy="38" r="18" fill="var(--scene-sun)"/>${hills}<g stroke="var(--scene-accent)" stroke-width="3">${[...Array(9)].map((_,i)=>`<path d="M${40+i*22} 128 v-14"/>`).join('')}</g><path d="M290 100 h40 v16 h-40Z M286 101 L310 84 L334 101Z" fill="var(--scene-far)"/>`
      :`<circle cx="190" cy="34" r="14" fill="var(--scene-sun)"/><g fill="var(--scene-far)">${[[20,60],[60,40],[100,70],[150,30],[200,55],[250,45],[300,65],[350,50]].map(([x,h])=>`<rect x="${x}" y="${120-h}" width="34" height="${h+40}"/>`).join('')}</g><path d="M0 124 H400 V160 H0Z" fill="var(--scene-ground)"/>`,
    old:`<circle cx="190" cy="44" r="18" fill="var(--scene-sun)" opacity="0.8"/>${hills}<g fill="var(--scene-accent)"><rect x="60" y="76" width="8" height="40"/><circle cx="64" cy="70" r="22"/></g><path d="M250 104 h60 v4 h-60Z M256 108 v10 M304 108 v10" stroke="var(--scene-far)" stroke-width="4" fill="var(--scene-far)"/>`,
    dead:`<circle cx="190" cy="40" r="14" fill="var(--scene-sun)" opacity="0.4"/>${hills}`
  };
  return `<svg class="scene" viewBox="0 0 400 160" preserveAspectRatio="xMidYMax slice" aria-hidden="true">${S[st]||S.child}</svg>`;
}

LR.portrait={svg,stage,scene,traits};
})();
