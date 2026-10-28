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
    :`<circle cx="${hx-es}" cy="${ey}" r="${eyeR}" fill="var(--face-ink)"/><circle cx="${hx+es}" cy="${ey}" r="${eyeR}" fill="var(--face-ink)"/><circle cx="${hx-es+0.8}" cy="${ey-0.8}" r="0.7" fill="#fff" opacity=".85"/><circle cx="${hx+es+0.8}" cy="${ey-0.8}" r="0.7" fill="#fff" opacity=".85"/>`;
  const nose=baby?'':`<path d="M${hx} ${ey+3} q-2 4 0.5 5.5" fill="none" stroke="var(--face-ink)" stroke-width="1.1" stroke-linecap="round" opacity=".35"/>`;
  const ears=`<ellipse cx="${hx-rx+0.5}" cy="${hy+3}" rx="4" ry="5.5" fill="${skin}"/><ellipse cx="${hx+rx-0.5}" cy="${hy+3}" rx="4" ry="5.5" fill="${skin}"/>`;
  const mouth=`<path d="M${hx-5} ${hy+13} q5 ${dead?0:(opt.sad?-2:3)} 10 0" fill="none" stroke="var(--face-ink)" stroke-width="1.6" stroke-linecap="round"/>`;
  const wrinkles=wr>0?`<g stroke="var(--face-ink)" stroke-width="0.9" fill="none" opacity="${(0.15+wr*0.35).toFixed(2)}" stroke-linecap="round"><path d="M${hx-9} ${hy-11} q9 -3 18 0"/><path d="M${hx-es-6} ${ey+5} q2 2 4 1 M${hx+es+2} ${ey+6} q2 -1 4 -1"/>${wr>0.5?`<path d="M${hx-8} ${hy-15} q8 -3 16 0"/>`:''}</g>`:'';
  // борода повторяет линию челюсти и оставляет открытым рот
  const beard=t.beard&&a>=20?`<path d="M${hx-rx+0.5} ${hy+2} Q${hx-rx+2} ${hy+ry} ${hx} ${hy+ry+3} Q${hx+rx-2} ${hy+ry} ${hx+rx-0.5} ${hy+2} Q${hx+rx-6} ${hy+16} ${hx+8} ${hy+17} Q${hx} ${hy+10} ${hx-8} ${hy+17} Q${hx-rx+6} ${hy+16} ${hx-rx+0.5} ${hy+2}Z" fill="${hairCol}" opacity="0.85"/>`:'';
  const glasses=t.glasses&&a>=45?`<g fill="none" stroke="var(--face-ink)" stroke-width="1.4"><circle cx="${hx-es}" cy="${ey}" r="5.5"/><circle cx="${hx+es}" cy="${ey}" r="5.5"/><path d="M${hx-es+5.5} ${ey} h${2*es-11}"/></g>`:'';
  const cheeks=!dead?`<circle cx="${hx-rx*0.6}" cy="${hy+8}" r="3.5" fill="var(--blush)" opacity="${a<12?0.4:0.22}"/><circle cx="${hx+rx*0.6}" cy="${hy+8}" r="3.5" fill="var(--blush)" opacity="${a<12?0.4:0.22}"/>`:'';
  const body=baby?`<ellipse cx="60" cy="122" rx="28" ry="22" fill="${cloth}"/>`
    :`<path d="M${60-(teen?30:34)} 140 Q${60-(teen?28:32)} 100 60 98 Q${60+(teen?28:32)} 100 ${60+(teen?30:34)} 140Z" fill="${cloth}"/><rect x="54" y="${hy+ry-6}" width="12" height="14" rx="4" fill="${skin}"/><path d="M52 ${hy+ry+5} L60 ${hy+ry+13} L68 ${hy+ry+5}" fill="none" stroke="var(--face-ink)" stroke-width="1.2" stroke-linejoin="round" opacity=".18"/>`;
  return `<svg class="portrait${dead?' is-dead':''}" viewBox="0 0 120 140" role="img" aria-label="Портрет: ${L.sex==='m'?'мужчина':'женщина'}, ${a} лет">
    <g class="pg" style="transform:translate(60px,140px) scale(${g.toFixed(3)}) translate(-60px,-140px)">
      <ellipse cx="60" cy="140" rx="46" ry="8" fill="var(--face-ink)" opacity=".12"/>
      ${body}
      ${back}${ears}
      <ellipse cx="${hx}" cy="${hy}" rx="${rx.toFixed(1)}" ry="${ry.toFixed(1)}" fill="${skin}"/>
      ${cheeks}${wrinkles}${beard}${eyes}${nose}${mouth}${glasses}${hair}
    </g></svg>`;
}

/* этап жизни для фона и нити */
function stage(L){if(!L.alive)return 'dead';const a=L.age;if(a<6)return 'child';if(L.inSchool||L.uni||L.college||a<15)return 'school';if(L.retired||a>=65)return 'old';return 'work'}

/* фон этапа: тихие пейзажи из слоёв — небо с градиентом, дальние и ближние холмы, облака,
   в тёмной теме — звёзды и тёплый свет в окнах. Детство — дом и дерево, учёба — школа,
   работа — город или поле, старость — сад со скамейкой. Цвета — токены --scene-*. */
let sceneN=0;
function scene(st,rural){
  const id='sc'+(++sceneN);
  const sky=`<defs><linearGradient id="${id}s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--scene-sky-top)"/><stop offset="1" style="stop-color:var(--scene-sky)"/></linearGradient>
    <radialGradient id="${id}h"><stop offset="0" style="stop-color:var(--scene-sun);stop-opacity:.55"/><stop offset="1" style="stop-color:var(--scene-sun);stop-opacity:0"/></radialGradient></defs>
    <rect width="400" height="160" fill="url(#${id}s)"/>`;
  const stars=`<g class="stars" fill="var(--scene-star)">${[[30,18],[72,40],[118,14],[160,30],[236,20],[280,44],[322,16],[364,34],[200,52],[96,62],[344,62]].map(([x,y],i)=>`<circle cx="${x}" cy="${y}" r="${i%3?0.9:1.3}" style="animation-delay:${(i*0.7).toFixed(1)}s"/>`).join('')}</g>`;
  const sun=(x,y,r)=>`<circle cx="${x}" cy="${y}" r="${r*2.6}" fill="url(#${id}h)"/><circle cx="${x}" cy="${y}" r="${r}" fill="var(--scene-sun)"/>`;
  const cloud=(x,y,k,c)=>`<g transform="translate(${x} ${y}) scale(${k})"><g class="cloud ${c||''}" fill="var(--scene-cloud)" opacity=".8"><ellipse cx="0" cy="0" rx="22" ry="8"/><ellipse cx="-10" cy="-5" rx="11" ry="8"/><ellipse cx="8" cy="-7" rx="13" ry="10"/></g></g>`;
  const far=`<path d="M0 104 Q50 78 110 92 T230 86 T340 90 T400 84 V160 H0Z" fill="var(--scene-far)"/>`;
  const mid=`<path d="M0 118 Q70 96 150 110 T290 104 T400 108 V160 H0Z" fill="var(--scene-mid)"/>`;
  const near=`<path d="M0 132 Q90 118 200 128 T400 124 V160 H0Z" fill="var(--scene-ground)"/>`;
  const tree=(x,y,k)=>`<g transform="translate(${x} ${y}) scale(${k})"><rect x="-2.5" y="-4" width="5" height="22" rx="2" fill="var(--scene-trunk)"/><circle cx="0" cy="-14" r="15" fill="var(--scene-accent)"/><circle cx="-9" cy="-6" r="10" fill="var(--scene-accent)"/><circle cx="9" cy="-7" r="10" fill="var(--scene-accent)"/></g>`;
  const pine=(x,y,k)=>`<g transform="translate(${x} ${y}) scale(${k})" fill="var(--scene-accent)"><path d="M0 -30 L12 -8 H-12Z M0 -20 L15 4 H-15Z"/><rect x="-2" y="4" width="4" height="7" fill="var(--scene-trunk)"/></g>`;
  const win=(x,y,w,h)=>`<rect class="win" x="${x}" y="${y}" width="${w}" height="${h}" rx="1.5" fill="var(--scene-glow)"/>`;
  const house=(x,y)=>`<g transform="translate(${x} ${y})"><rect x="0" y="0" width="46" height="32" rx="3" fill="var(--scene-build)"/><path d="M-6 2 L23 -20 L52 2Z" fill="var(--scene-roof)"/><rect x="31" y="-16" width="6" height="12" fill="var(--scene-roof)"/>${win(7,9,11,10)}${win(28,9,11,10)}</g>`;
  const S={
    child:`${stars}${sun(196,30,12)}${cloud(90,40,1)}${cloud(250,26,.7,'slow')}${far}${mid}${house(150,92)}${tree(240,116,1)}${tree(262,122,.7)}${near}`,
    school:`${stars}${sun(168,26,10)}${cloud(70,30,.9)}${cloud(220,46,.6,'slow')}${far}${mid}
      <g transform="translate(150 78)"><rect x="0" y="0" width="100" height="44" rx="3" fill="var(--scene-build)"/><path d="M-6 2 L50 -18 L106 2Z" fill="var(--scene-roof)"/><circle cx="50" cy="-6" r="5" fill="var(--scene-glow)" opacity=".85"/>
      ${[8,26,62,80].map(x=>win(x,10,12,10)).join('')}<rect x="42" y="22" width="16" height="22" rx="2" fill="var(--scene-roof)"/><path d="M106 2 v-30" stroke="var(--scene-roof)" stroke-width="1.5"/><path d="M106 -28 l14 5 -14 5Z" fill="var(--scene-glow)"/></g>
      ${pine(110,124,.9)}${pine(290,124,1)}${pine(310,128,.7)}${near}`,
    work:rural
      ?`${stars}${sun(196,30,12)}${cloud(260,40,.8)}${cloud(340,48,.6,'slow')}${far}${mid}
        <g stroke="var(--scene-accent)" stroke-width="2.4" stroke-linecap="round" opacity=".9">${[...Array(10)].map((_,i)=>`<path d="M${30+i*20} 134 q4 -12 0 -18"/>`).join('')}</g>
        <g transform="translate(286 92)"><rect x="0" y="0" width="54" height="30" rx="2" fill="var(--scene-build)"/><path d="M-5 2 L27 -18 L59 2Z" fill="var(--scene-roof)"/>${win(8,9,10,9)}<rect x="30" y="12" width="14" height="18" fill="var(--scene-roof)"/></g>${tree(360,118,.8)}${near}`
      :`${stars}<circle cx="200" cy="26" r="9" fill="var(--scene-sun)"/>${cloud(120,28,.8,'slow')}
        <g fill="var(--scene-far)">${[[10,50],[52,72],[96,44],[140,86],[190,60],[236,78],[282,52],[326,70],[366,58]].map(([x,h])=>`<rect x="${x}" y="${128-h}" width="36" height="${h+40}" rx="2"/>`).join('')}</g>
        <g fill="var(--scene-build)">${[[0,34],[40,52],[86,40],[126,62],[178,46],[222,58],[268,38],[312,54],[356,44]].map(([x,h])=>`<rect x="${x}" y="${132-h}" width="40" height="${h+30}" rx="2"/>`).join('')}</g>
        <g>${[[8,104],[52,88],[60,100],[96,98],[134,76],[142,92],[186,94],[230,82],[238,100],[276,100],[320,86],[364,96]].map(([x,y],i)=>`<rect class="win${i%3===0?' late':''}" x="${x}" y="${y}" width="6" height="7" rx="1" fill="var(--scene-glow)"/>`).join('')}</g>
        <path d="M0 132 H400 V160 H0Z" fill="var(--scene-ground)"/>`,
    old:`${stars}${sun(196,32,12)}${cloud(260,30,.8,'slow')}${far}${mid}${tree(70,118,1.3)}
      <g transform="translate(220 110)" fill="var(--scene-roof)"><rect x="0" y="0" width="56" height="5" rx="2"/><rect x="0" y="-12" width="56" height="4" rx="2"/><rect x="4" y="5" width="4" height="12"/><rect x="48" y="5" width="4" height="12"/></g>
      <g transform="translate(300 84)"><rect x="-1.5" y="0" width="3" height="40" fill="var(--scene-roof)"/><circle cx="0" cy="-2" r="11" fill="url(#${id}h)"/><circle cx="0" cy="-2" r="4.5" fill="var(--scene-glow)"/></g>
      <g fill="var(--scene-flower)">${[150,162,176,340,352,366].map((x,i)=>`<circle cx="${x}" cy="${128+(i%2)*3}" r="2.4"/>`).join('')}</g>${near}`,
    dead:`${stars}<circle cx="200" cy="32" r="10" fill="var(--scene-sun)" opacity=".5"/>${far}${mid}${tree(200,122,.9)}${near}<rect width="400" height="160" fill="var(--scene-sky)" opacity=".35"/>`
  };
  return `<svg class="scene" viewBox="0 0 400 160" preserveAspectRatio="xMidYMax slice" aria-hidden="true">${sky}${S[st]||S.child}</svg>`;
}

LR.portrait={svg,stage,scene,traits};
})();
