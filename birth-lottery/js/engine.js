/* Движок «Лотереи рождения». Не трогает DOM: работает и в браузере (window.LR.engine), и в Node (module.exports).
   Данные стран, имена и поправки калибровки подключаются через setData(). */
(function(root,factory){const E=factory();if(typeof module!=="undefined"&&module.exports)module.exports=E;else(root.LR=root.LR||{}).engine=E;})(typeof self!=="undefined"?self:this,function(){
"use strict";
/* ===== data (data/countries.json, data/names.json, data/cal.json) ===== */
let COUNTRIES=[],BY={},NAMES={},CAL={};
function setData(countries,names,cal){
  COUNTRIES.length=0;for(const c of countries)COUNTRIES.push(c);
  for(const k in BY)delete BY[k];for(const c of COUNTRIES)BY[c.code]=c;
  for(const k in NAMES)delete NAMES[k];Object.assign(NAMES,names||{});
  CAL=cal||{};for(const k in TBL)delete TBL[k];
}

const DEST={
 CA:[['RU',5],['KZ',2],['KR',1],['DE',1],['TR',1],['AE',1]],
 SA:[['AE',3],['SA',3],['US',2],['GB',2],['CA',1],['AU',1],['QA',1]],
 ME:[['DE',2],['TR',2],['SA',2],['AE',2],['FR',1],['GB',1],['US',1],['SE',1]],
 SSA:[['ZA',2],['FR',2],['GB',2],['US',2],['SA',1],['DE',1],['IT',1],['BE',1]],
 LA:[['US',6],['ES',2],['AR',1],['CL',1],['CA',1]],
 EA:[['US',3],['JP',2],['KR',2],['AU',2],['SG',1],['TW',1],['SA',1]],
 EE:[['DE',3],['PL',2],['IT',1],['CZ',1],['GB',1],['US',1],['RU',1]],
 HI:[['US',2],['GB',1],['CA',1],['AU',1],['DE',1],['CH',1]]
};

/* ===== math ===== */
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
function gauss(){let u=0,v=0;while(!u)u=Math.random();while(!v)v=Math.random();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);}
function ndtri(p){const a=[-39.69683028665376,220.9460984245205,-275.9285104469687,138.3577518672690,-30.66479806614716,2.506628277459239],b=[-54.47609879822406,161.5858368580409,-155.6989798598866,66.80131188771972,-13.28068155288572],c=[-0.007784894002430293,-0.3223964580411365,-2.400758277161838,-2.549732539343734,4.374664141464968,2.938163982698783],d=[0.007784695709041462,0.3224671290700398,2.445134137142996,3.754408661907416];const pl=0.02425;let q,r;if(p<pl){q=Math.sqrt(-2*Math.log(p));return(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5])/((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1)}if(p<=1-pl){q=p-0.5;r=q*q;return(((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q/(((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1)}q=Math.sqrt(-2*Math.log(1-p));return-(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5])/((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1)}
function ncdf(x){const t=1/(1+0.2316419*Math.abs(x));const d=0.3989423*Math.exp(-x*x/2);const p=d*t*(0.3193815+t*(-0.3565638+t*(1.781478+t*(-1.821256+t*1.330274))));return x>0?1-p:p}
function poisson(l){const L=Math.exp(-l);let k=0,p=1;do{k++;p*=Math.random()}while(p>L&&k<20);return k-1}
const pick=a=>a[Math.floor(Math.random()*a.length)];
function wpick(items){let s=0;for(const it of items)s+=it[1];let r=Math.random()*s;for(const it of items){r-=it[1];if(r<=0)return it[0]}return items[items.length-1][0]}
function plural(n,f){n=Math.abs(n)%100;const n1=n%10;if(n>10&&n<20)return f[2];if(n1>1&&n1<5)return f[1];if(n1===1)return f[0];return f[2]}
const yrs=n=>n+' '+plural(n,['год','года','лет']);
function money(v){v=Math.max(0,v);const r=v<100?Math.round(v):v<1000?Math.round(v/5)*5:Math.round(v/10)*10;return '$'+r.toLocaleString('ru-RU')}

/* ===== mortality ===== */
const MAXAGE=112;
function baseQ(c,sex,a){
  const sx=sex==='m'?1.1:0.9;const q=new Float64Array(MAXAGE+1);
  q[0]=Math.min(0.5,c.imr/1000*sx);
  const s14=(1-c.u5/1000)/(1-c.imr/1000);const q14=1-Math.pow(Math.max(0.5,s14),1/4);
  for(let x=1;x<5;x++)q[x]=q14*sx;
  const mk=0.0003+c.u5/1000*0.02;
  for(let x=5;x<MAXAGE;x++){let h=mk+a*Math.exp(0.088*(x-5));if(sex==='m'&&x>=15&&x<40)h+=0.0006+c.hom/1e5*1.2;q[x]=Math.min(0.7,1-Math.exp(-h))}
  q[MAXAGE]=1;return q;
}
function e0(q){let l=1,e=0;for(let x=0;x<q.length;x++){const d=l*q[x];e+=l-d*0.5;l-=d}return e}
const TBL={};
function getTable(c,sex){const k=c.code+sex;if(TBL[k])return TBL[k];const target=sex==='m'?c.leM:c.leF;let lo=Math.log(1e-8),hi=Math.log(0.3);for(let i=0;i<48;i++){const mid=(lo+hi)/2;if(e0(baseQ(c,sex,Math.exp(mid)))>target)lo=mid;else hi=mid}return TBL[k]=baseQ(c,sex,Math.exp((lo+hi)/2))}
function survTo(c,sex,age){const q=getTable(c,sex);let l=1;for(let x=0;x<age;x++)l*=1-q[x];return l}

/* доля сельских жителей: по урбанизации ООН, если её нет — по занятости в сельском хозяйстве */
function ruralShare(c){return clamp(c.urb!=null?1-c.urb/100:c.agri/100*1.15+0.05,0.02,0.9)}
/* поправки калибровки: m, f — смертность, zb — центр дохода, ki — множитель среднего дохода */
function calOf(c){return CAL[c.code]||{m:1,f:1,zb:0,ki:1}}
/* средний доход в стране в месяц (ВВП ППС × 0,55 / 12) */
function avgIncome(c){return c.gdp*0.55/12}
function pickCountry(mode){return wpick(COUNTRIES.map(c=>[c,mode==='pop'?c.pop:c.births]))}
function pickName(c,sex){return pick(NAMES[c.names][sex])}
function avgLE(c){return (c.leM+c.leF)/2}

const JOBS={
  agri:{m:['работа на земле','скотовод','фермер'],f:['работа на земле','фермер','сборщица урожая']},
  low:{m:['разнорабочий','уличный торговец','грузчик','рикша'],f:['уличная торговка','домработница','уборщица','швея на дому']},
  mid:{m:['водитель','строитель','продавец','рабочий на заводе','повар'],f:['продавец','швея','повар','работница фабрики','кассир']},
  hi:{m:['электрик','бухгалтер','фельдшер','полицейский','техник'],f:['медсестра','бухгалтер','парикмахер','администратор','лаборант']},
  uni:{m:['инженер','врач','учитель','программист','юрист','экономист'],f:['учительница','врач','инженер','программист','юрист','экономист']}
};

/* ===== выборы и события жизни =====
   Решения (DECISIONS) появляются в начале года, события (EVENTS) разыгрываются в конце.
   Вероятности считаются из статистики страны и прошлого человека; выборы сдвигают доход, риск и привычки,
   но не отменяют статистику места рождения: поправки калибровки по-прежнему держат средние по стране. */

/* Призыв: p — доля призываемых мужчин, w — женщин, y — лет службы (по законам о воинской обязанности, округлённо). */
const DRAFT={RU:{p:0.35,y:1},UA:{p:0.3,y:2},BY:{p:0.5,y:2},KZ:{p:0.3,y:1},UZ:{p:0.3,y:1},KG:{p:0.3,y:1},TJ:{p:0.4,y:2},TM:{p:0.6,y:2},AZ:{p:0.7,y:2},AM:{p:0.8,y:2},GE:{p:0.3,y:1},MD:{p:0.2,y:1},
  KR:{p:0.9,y:2},KP:{p:0.95,y:8,w:0.5},TW:{p:0.8,y:1},IL:{p:0.75,y:3,w:0.55},TR:{p:0.8,y:1},IR:{p:0.8,y:2},EG:{p:0.5,y:2},SY:{p:0.8,y:2},DZ:{p:0.3,y:1},MA:{p:0.05,y:1},TN:{p:0.1,y:1},
  VN:{p:0.15,y:2},TH:{p:0.1,y:2},MM:{p:0.1,y:2},LA:{p:0.2,y:2},KH:{p:0.05,y:2},MN:{p:0.2,y:1},SG:{p:0.95,y:2},CU:{p:0.6,y:2},BR:{p:0.05,y:1},CO:{p:0.1,y:2},BO:{p:0.2,y:1},
  GR:{p:0.7,y:1},CY:{p:0.9,y:1},AT:{p:0.6,y:1},CH:{p:0.6,y:1},FI:{p:0.75,y:1},NO:{p:0.15,y:1,w:0.1},SE:{p:0.07,y:1,w:0.04},DK:{p:0.07,y:1},EE:{p:0.5,y:1},LT:{p:0.3,y:1},LV:{p:0.1,y:1},ER:{p:0.9,y:5,w:0.6}};
/* Доля людей, которые со временем начинают часто выпивать (м, ж), по регионам — округлённые оценки ВОЗ о злоупотреблении алкоголем. */
const DRINK={EE:[0.22,0.06],CA:[0.12,0.03],HI:[0.10,0.04],LA:[0.13,0.03],EA:[0.09,0.02],SSA:[0.09,0.02],SA:[0.04,0.005],ME:[0.01,0.002]};
/* Специальности вуза: код, название, профессия (м, ж), сдвиг дохода, лишние годы учёбы. */
const MAJORS={tech:['инженерия и техника',['инженер','инженер'],0.12,0],it:['программирование',['программист','программистка'],0.18,0],med:['медицина',['врач','врач'],0.25,2],
  edu:['педагогика',['учитель','учительница'],-0.1,0],econ:['экономика',['экономист','экономист'],0.1,0],law:['право',['юрист','юрист'],0.12,0]};
/* Вероятность экономического кризиса за год по регионам. */
const CRISIS={LA:0.05,SSA:0.04,EE:0.04,ME:0.04,CA:0.035,SA:0.03,EA:0.025,HI:0.025};

const Cap=s=>s[0].toUpperCase()+s.slice(1);
const opt=(label,hint,w,fn)=>({label,hint,w:Math.max(0.0001,w),fn});
const pct=p=>Math.round(clamp(p,0,1)*100)+'%';
const retAgeOf=L=>(L.c.gdp>15000?63:68)+L.retExtra;
const wifeAge=L=>L.sex==='f'?L.age:L.spouseAge;
const adultKids=L=>L.kids.filter(k=>k.alive&&L.age-k.born>=18);

const DECISIONS=[
/* --- по флагам: идут первыми --- */
{id:'major',ages:[15,45],stage:'юность',when:L=>L.flags.majorDecision&&L.uni,make:(L,x,c)=>{L.flags.majorDecision=false;
  const keys=Object.keys(MAJORS).sort(()=>Math.random()-0.5).slice(0,3);
  const hint=k=>{const m=MAJORS[k];const demand=k==='it'?(c.gdp>15000?'спрос высокий':'вакансий мало, но платят хорошо'):k==='med'?'учиться на 2 года дольше':k==='edu'?'зарплаты скромные, работа есть всегда':'спрос средний';return `${Cap(m[0])}: ${demand}`};
  return {id:'major',title:'Выбор специальности',text:'Вы поступили. Осталось решить, чему учиться.',
    opts:keys.map(k=>opt(Cap(MAJORS[k][0]),hint(k),1,()=>{L.major=k;L.uniLeft+=MAJORS[k][3];return `Вы учитесь: ${MAJORS[k][0]}.`}))}}},
{id:'college',ages:[9,45],stage:'юность',when:L=>L.flags.collegeDecision,make:(L,x,c)=>{L.flags.collegeDecision=false;
  const w=clamp(0.2+0.3*ncdf(L.zEff())+(c.gdp>10000?0.15:0),0.1,0.8);
  return {id:'college',title:'Колледж или работа',text:'В колледже или техникуме за два года можно получить профессию: электрик, медсестра, механик, повар.',
    opts:[opt('Поступить в колледж','Два года без заработка, потом работа получше',w,()=>{L.college=true;L.collegeLeft=2;return 'Вы поступили в колледж.'}),
          opt('Сразу работать','Деньги нужны сейчас',1-w,()=>'Вы решили сразу работать.')]}}},
{id:'army',ages:[18,26],stage:'юность',when:(L,x,c)=>{const d=DRAFT[c.code];return d&&!L.flags.armyAsked&&!L.migrated&&x>=18&&x<=26&&!L.uni&&!L.college&&!L.inSchool&&(L.sex==='m'?d.p:(d.w||0))>0},
 make:(L,x,c)=>{L.flags.armyAsked=true;const d=DRAFT[c.code];if(Math.random()>(L.sex==='m'?d.p:d.w))return null;
  const y=d.y,po=clamp(0.12+0.25*ncdf(L.zEff())+(L.eduDone>=12?0.1:0),0.05,0.6);
  return {id:'army',title:'Повестка',text:`${Cap(c.inName)} действует призыв. Служба длится ${yrs(y)}.`,
    opts:[opt('Пойти служить','Работа и учёба встанут на паузу',0.8,()=>{L.serveLeft=y;L.served=true;L.mark('army','Армия');return 'Вы ушли служить.'}),
          opt('Добиваться отсрочки',`Получается примерно у ${pct(po)}`,0.2,()=>{if(Math.random()<po)return 'Отсрочку дали.';L.serveLeft=y;L.served=true;L.mark('army','Армия');return 'Отсрочку не дали. Вы ушли служить.'})]}}},
{id:'keepWorking',ages:[55,80],stage:'старость',when:(L,x)=>L.working&&!L.retired&&!L.flags.keepAsked&&x===retAgeOf(L)-1,make:(L,x,c)=>{L.flags.keepAsked=true;const poor=c.gdp<15000;
  return {id:'keepWorking',title:'Пенсионный возраст',text:poor?'Пенсия в вашей стране маленькая или её нет совсем. Можно работать дальше, пока хватает сил.':'Можно выйти на пенсию или ещё поработать.',
    opts:[opt('Работать дальше','Доход сохранится, но силы уже не те',poor?0.6:0.3,()=>{L.retExtra+=5;return 'Вы решили ещё поработать.'}),
          opt('На пенсию','Больше времени для себя и семьи',poor?0.4:0.7,()=>'Вы готовитесь к пенсии.')]}}},
{id:'marriageCrisis',ages:[13,100],stage:'взрослость',when:(L,x,c)=>L.married&&Math.random()<({HI:0.02,EE:0.02,LA:0.012,CA:0.01}[c.region]||0.006)*(1+0.4*L.stress)*clamp(1.6-L.rel/100,0.6,1.6),
 make:(L,x,c)=>{const ps=clamp(0.55+(L.focus==='family'?0.15:0)-0.05*L.stress,0.2,0.85);
  return {id:'marriageCrisis',title:'Кризис в браке',text:`Вы с ${L.spouse} всё чаще ссоритесь. Кажется, вместе вам тяжело.`,
    opts:[opt('Развестись','Начать отдельно',0.45,()=>L.divorce()),
          opt('Попробовать сохранить брак',`Получается примерно у ${pct(ps)} пар`,0.55,()=>{if(Math.random()<ps){L.stress=Math.max(0,L.stress-1);return 'Вы помирились.'}return 'Сохранить не получилось. '+L.divorce()})]}}},
/* --- детство --- */
{id:'club',ages:[7,10],stage:'детство',when:(L,x)=>x>=7&&x<=10&&L.inSchool&&!L.flags.club&&Math.random()<0.5,make:(L,x,c)=>{L.flags.club=true;
  const can=clamp(0.25+0.6*ncdf(L.zEff())-(L.rural?0.15:0),0.05,0.95);
  return {id:'club',title:'Кружок или секция',text:can<0.4?'При школе есть бесплатная секция, но после уроков нужно помогать дома.':'Родители готовы записать вас в кружок или спортивную секцию.',
    opts:[opt('Спортивная секция','Здоровье и привычка двигаться',can*0.55,()=>{L.active=true;return 'Вы занимаетесь спортом.'}),
          opt('Кружок: музыка, рисование, техника','Больше интереса к учёбе',can*0.45,()=>{L.studyPts+=2;L.flags.hobby=true;return 'Вы ходите в кружок.'}),
          opt('Не нужно','Свободное время и сэкономленные деньги',1-can,()=>'Вы обошлись без кружков.')]}}},
{id:'helpFamily',ages:[9,13],stage:'детство',when:(L,x)=>x>=9&&x<=13&&L.inSchool&&!L.flags.helpFamily&&L.zf<0&&Math.random()<0.35,make:(L,x,c)=>{L.flags.helpFamily=true;
  const w=clamp(0.3+0.4*c.agri/100+(L.rural?0.15:0)-0.15*L.zf,0.1,0.9),pe=clamp(0.25+0.3*c.school/12,0.2,0.6);
  return {id:'helpFamily',title:'Помогать семье или учиться',text:L.rural?'Началась страда: родители просят помогать в поле вместо уроков.':'Денег не хватает: родители просят помогать после школы — торговать или сидеть с младшими.',
    opts:[opt('Помогать семье','Семье станет легче, учёба пострадает',w,()=>{L.zf+=0.05;L.studyPts=Math.max(0,L.studyPts-1);L.flags.earlyWork=true;if(Math.random()<0.3)L.eduPlan=Math.max(L.eduDone+1,L.eduPlan-1);return 'Вы помогаете семье.'}),
          opt('Учиться','Больше шансов доучиться',1-w,()=>{L.studyPts+=2;L.zf-=0.03;if(Math.random()<pe)L.eduPlan=Math.min(12,L.eduPlan+1);return 'Вы стараетесь учиться.'})]}}},
{id:'famMove',ages:[4,14],stage:'детство',when:(L,x)=>x>=4&&x<=14&&!L.flags.famMove&&!L.migrated&&Math.random()<0.025,make:(L,x,c)=>{L.flags.famMove=true;
  return {id:'famMove',title:'Переезд семьи',text:L.rural?'Отцу предлагают работу в городе. Семья решает, переезжать ли.':'Родителям предлагают работу в другом городе. Семья решает, переезжать ли.',
    opts:[opt('Переехать всей семьёй','Больше денег, но новая школа и ни одного друга',0.5,()=>{L.rural=false;L.zf+=0.12;L.stress+=1;L.studyPts=Math.max(0,L.studyPts-1);return 'Семья переехала. Новый город, новая школа.'}),
          opt('Остаться','Привычная жизнь рядом с родными',0.5,()=>'Семья осталась на месте.')]}}},
{id:'crowd',ages:[12,14],stage:'детство',when:(L,x)=>x>=12&&x<=14&&!L.flags.crowd&&Math.random()<0.5,make:(L,x,c)=>{L.flags.crowd=true;
  const ws=0.3+0.25*ncdf(L.zf);
  return {id:'crowd',title:'С кем проводить время',text:'После уроков можно гулять с компанией со двора, ходить на дополнительные занятия или проводить время с семьёй.',
    opts:[opt('С компанией со двора','Весело и свободно',0.4,()=>{L.crowd='street';return 'Вы проводите время с компанией со двора.'}),
          opt('На занятиях, с одноклассниками','Учёба идёт легче',ws,()=>{L.crowd='study';L.studyPts+=1;return 'Вы много времени проводите на занятиях.'}),
          opt('Дома, с семьёй','Спокойнее и надёжнее',0.3,()=>{L.crowd='home';return 'Вы больше времени проводите дома.'})]}}},
{id:'summerJob',ages:[13,16],stage:'детство',when:(L,x,c)=>x>=13&&x<=16&&L.inSchool&&c.gdp<20000&&!L.flags.summerJob&&Math.random()<0.3,make:(L,x,c)=>{L.flags.summerJob=true;
  return {id:'summerJob',title:'Работа на каникулах',text:'Летом можно подработать: на рынке, на стройке, в поле.',
    opts:[opt('Работать летом','Свои деньги и помощь семье',0.55,()=>{L.zf+=0.04;L.flags.earlyWork=true;return 'Всё лето вы работали.'}),
          opt('Отдыхать и готовиться к учёбе','Силы и время на учёбу',0.45,()=>{L.studyPts+=1;return 'Лето вы провели с книгами и друзьями.'})]}}},
/* --- юность --- */
{id:'love',ages:[15,19],stage:'юность',when:(L,x)=>x>=15&&x<=19&&!L.married&&!L.flags.love&&Math.random()<0.25,make:(L,x,c)=>{L.flags.love=true;const n=pickName(c,L.sex==='m'?'f':'m');
  return {id:'love',title:'Первая любовь',text:`Вы влюбились. Человека зовут ${n}.`,
    opts:[opt('Встречаться','Будь что будет',0.7,()=>{L.love=n;return `Вы встречаетесь с ${n}.`}),
          opt('Сосредоточиться на учёбе и работе','Не сейчас',0.3,()=>{L.studyPts+=1;return 'Вы решили не отвлекаться.'})]}}},
{id:'studyJob',ages:[15,45],stage:'юность',when:L=>L.uni&&!L.flags.studyJob&&Math.random()<0.5,make:(L,x,c)=>{L.flags.studyJob=true;
  const w=clamp(0.75-0.4*ncdf(L.zf),0.2,0.8);
  return {id:'studyJob',title:'Подработка во время учёбы',text:'Стипендии не хватает. Можно работать по вечерам.',
    opts:[opt('Подрабатывать','Опыт и деньги, но учиться тяжелее',w,()=>{L.zf+=0.05;L.flags.uniWork=true;if(Math.random()<0.3){L.uniLeft++;return 'Вы работаете и учитесь. Из-за работы учёба затянулась на год.'}return 'Вы работаете и учитесь.'}),
          opt('Только учиться','Лучше оценки, меньше денег',1-w,()=>{if(Math.random()<0.5)L.flags.honors=true;return 'Вы полностью погрузились в учёбу.'})]}}},
/* --- взрослость --- */
{id:'jobOffer',ages:[23,55],stage:'взрослость',when:(L,x)=>L.working&&!L.biz&&!L.serveLeft&&x>=23&&x<=55&&Math.random()<0.035,make:(L,x,c)=>{
  return {id:'jobOffer',title:'Новое предложение',text:'Вам предлагают перейти на другую работу. Платят больше, но всё придётся начинать заново.',
    opts:[opt('Перейти','Обычно доход растёт, но бывает и хуже',0.5,()=>{L.stress+=0.5;if(Math.random()<0.15){L.zp-=0.1;return 'Вы перешли, но новое место оказалось хуже ожиданий.'}L.zp+=0.12+(L.degree?0.08:0)+gauss()*0.1;return 'Вы перешли на новую работу.'}),
          opt('Остаться','Стабильность и знакомые люди',0.5,()=>'Вы остались на прежнем месте.')]}}},
{id:'business',ages:[25,50],stage:'взрослость',when:(L,x)=>L.working&&!L.biz&&!L.flags.bizTried&&x>=25&&x<=50&&Math.random()<0.02*(1+0.5*Math.max(0,L.zEff())),make:(L,x,c)=>{L.flags.bizTried=true;
  const p=clamp(0.3+0.08*L.zEff()+(L.eduDone>=12?0.05:0)+(c.gdp>15000?0.05:0)-(c.gini-35)/200,0.12,0.6);
  return {id:'business',title:'Своё дело',text:'Есть идея открыть своё дело: магазин, мастерскую, кафе или небольшую фирму.',
    opts:[opt('Открыть своё дело',`Через три года работают примерно ${pct(p)} таких дел`,0.3,()=>{L.biz={y:0,p};L.mark('biz','Своё дело');L.stress+=0.5;return 'Вы открыли своё дело.'}),
          opt('Остаться наёмным работником','Меньше риска',0.7,()=>'Вы решили не рисковать.')]}}},
{id:'housing',ages:[24,40],stage:'взрослость',when:(L,x)=>!L.flags.housing&&!L.serveLeft&&L.zp!==null&&x>=24&&x<=40&&(L.married||x>=30)&&Math.random()<0.25,make:(L,x,c)=>{L.flags.housing=true;
  const can=c.gdp>=10000&&L.zEff()>-0.6,pa=clamp(0.3+0.5*ncdf(L.zEff()),0.1,0.9),par=L.mom||L.dad;
  const opts=[];
  if(can)opts.push(opt('Взять ипотеку',`Банк одобряет примерно ${pct(pa)} заявок; платить 15–25 лет`,0.4,()=>{if(Math.random()<pa){L.housing='mortgage';L.mortLeft=15+Math.floor(Math.random()*11);return 'Вы взяли ипотеку.'}L.housing='rent';return 'Банк отказал в ипотеке. Вы снимаете жильё.'}));
  else opts.push(opt('Строить свой дом понемногу','Годы стройки, зато без банка',0.4,()=>{L.housing='build';L.mortLeft=6+Math.floor(Math.random()*6);return 'Вы начали строить свой дом.'}));
  opts.push(opt('Снимать жильё','Можно переехать в любой момент',0.35,()=>{L.housing='rent';return 'Вы снимаете жильё.'}));
  if(par)opts.push(opt('Жить с родителями','Дешевле, но тесно',0.25,()=>{L.housing='parents';L.shock+=0.1;return 'Вы живёте с родителями.'}));
  return {id:'housing',title:'Где жить',text:'Пора решить, где жить дальше.',opts}}},
{id:'loan',ages:[20,60],stage:'взрослость',when:(L,x)=>!L.debt&&L.zp!==null&&x>=20&&x<=60&&L.shock<-0.25&&!L.flags['loan'+Math.floor(x/10)]&&Math.random()<0.15,make:(L,x,c)=>{L.flags['loan'+Math.floor(x/10)]=true;
  return {id:'loan',title:'Не хватает денег',text:'Деньги нужны прямо сейчас. Можно взять кредит под проценты.',
    opts:[opt('Взять кредит','Сейчас станет легче, потом несколько лет выплат',0.5,()=>{L.shock+=0.3;L.debt=3+Math.floor(Math.random()*3);return 'Вы взяли кредит.'}),
          opt('Обойтись','Затянуть пояс',0.5,()=>{L.stress+=0.5;return 'Вы решили обойтись без долгов.'})]}}},
{id:'secondChild',ages:[14,80],stage:'взрослость',when:L=>L.married&&!L.flags.secondChild&&L.kids.filter(k=>k.alive).length===1&&L.age-L.kids[L.kids.length-1].born>=1&&wifeAge(L)>=22&&wifeAge(L)<=40&&Math.random()<0.3,
 make:(L,x,c)=>{L.flags.secondChild=true;const w=clamp(c.fert/3,0.2,0.9);
  return {id:'secondChild',title:'Второй ребёнок',text:'Первому ребёнку уже больше года. Вы думаете о втором.',
    opts:[opt('Да, хотим второго','Расходов станет больше',w,()=>{L.flags.wantUntil=x+3;return 'Вы решили завести второго ребёнка.'}),
          opt('Пока подождать','Вернуться к этому позже',0.3,()=>'Вы решили подождать.'),
          opt('Нам хватит одного','Больше сил и денег на одного',Math.max(0.05,1-w),()=>{L.flags.noMoreKids=true;return 'Вы решили, что одного ребёнка достаточно.'})]}}},
{id:'careParents',ages:[25,90],stage:'взрослость',when:(L,x)=>x>=25&&!L.flags.careParents&&((L.mom&&L.momAge+x>=72)||(L.dad&&L.dadAge+x>=72))&&Math.random()<0.15,make:(L,x,c)=>{L.flags.careParents=true;
  const fam=['SA','ME','EA','CA','SSA'].includes(c.region),rich=L.zEff()>0.3||c.gdp>30000;
  const opts=[opt('Забрать родителей к себе','Тесно и тяжело, зато рядом',fam?0.65:0.35,()=>{L.caring='home';L.stress+=1;return 'Родители переехали к вам.'})];
  if(rich)opts.push(opt('Оплатить сиделку или пансионат','Дорого, но за ними присмотрят',fam?0.15:0.4,()=>{L.caring='paid';return 'Вы оплачиваете уход за родителями.'}));
  opts.push(opt('Помогать на расстоянии','Звонить, приезжать, присылать деньги',0.25,()=>{L.caring='far';L.stress+=0.5;return 'Вы помогаете родителям на расстоянии.'}));
  return {id:'careParents',title:'Родители стареют',text:'Родителям всё труднее справляться одним.',opts}}},
{id:'reconcile',ages:[13,100],stage:'взрослость',when:(L,x)=>!L.married&&L.exSpouse&&x-L.divAge<=4&&!L.flags.reconcile&&Math.random()<0.12,make:(L,x,c)=>{L.flags.reconcile=true;const n=L.exSpouse;
  return {id:'reconcile',title:'Встреча с бывшим',text:`Вы снова начали общаться с ${n}. Может, попробовать ещё раз?`,
    opts:[opt('Попробовать снова','Примерно половина таких пар снова сходится',0.4,()=>{if(Math.random()<0.5){L.marry(n,L.age+L.spDiff);L.exSpouse=null;return `Вы снова вместе с ${n}.`}return 'Попробовали, но не сложилось.'}),
          opt('Нет, всё в прошлом','Идти дальше',0.6,()=>'Вы решили не возвращаться.')]}}},
{id:'retrain',ages:[28,55],stage:'взрослость',when:(L,x)=>L.working&&x>=28&&x<=55&&!L.flags['retrain'+Math.floor(x/10)]&&Math.random()<0.03,make:(L,x,c)=>{L.flags['retrain'+Math.floor(x/10)]=true;
  return {id:'retrain',title:'Курсы',text:'Можно пойти на курсы повышения квалификации. Это стоит денег и вечеров.',
    opts:[opt('Пойти учиться','Обычно окупается через пару лет',L.focus==='study'?0.6:0.3,()=>{L.shock-=0.15;if(Math.random()<0.6){L.zp+=0.18;return 'Вы закончили курсы, и это помогло в работе.'}L.zp+=0.04;return 'Вы закончили курсы, но пользы оказалось немного.'}),
          opt('Не сейчас','Сэкономить силы и деньги',L.focus==='study'?0.4:0.7,()=>'Вы отложили учёбу.')]}}},
{id:'moveWork',ages:[24,45],stage:'взрослость',when:(L,x)=>L.working&&!L.migrated&&!L.biz&&x>=24&&x<=45&&!L.flags.moveWork&&Math.random()<0.02,make:(L,x,c)=>{L.flags.moveWork=true;
  return {id:'moveWork',title:'Переезд за работой',text:'В другом городе есть работа с зарплатой заметно выше.',
    opts:[opt('Переехать','Доход вырастет, но придётся начинать с нуля',0.4,()=>{L.zp+=0.2+gauss()*0.1;L.rural=false;L.stress+=0.5;return 'Вы переехали в другой город.'}),
          opt('Остаться рядом с близкими','Свои люди рядом',0.6,()=>'Вы остались.')]}}},
{id:'burnout',ages:[25,60],stage:'взрослость',when:(L,x)=>L.working&&x>=25&&x<=60&&!L.flags['burn'+Math.floor(x/5)]&&Math.random()<0.008+0.025*Math.min(L.stress,3)+(L.focus==='money'?0.03:0),make:(L,x,c)=>{L.flags['burn'+Math.floor(x/5)]=true;
  return {id:'burnout',title:'Усталость',text:'Последние месяцы вы почти не отдыхаете. Сил становится всё меньше.',
    opts:[opt('Взять отпуск и сбавить темп','Денег будет чуть меньше',0.5,()=>{L.stress=0;L.shock-=0.1;return 'Вы отдохнули и стали работать спокойнее.'}),
          opt('Работать дальше','Сейчас не время отдыхать',0.5,()=>{L.stress+=1;L.zp+=0.03;return 'Вы продолжили работать на пределе.'})]}}},
{id:'drinkLess',ages:[35,65],stage:'взрослость',when:(L,x)=>L.drinker&&[35,45,55,65].includes(x),make:(L,x,c)=>{const p=clamp(0.45+(L.married?0.1:0)+(L.focus==='health'?0.15:0),0.2,0.8);
  return {id:'drinkLess',title:'Алкоголь',text:'Врач говорит, что выпивка уже сказывается на здоровье.',
    opts:[opt('Пить меньше',`Получается примерно у ${pct(p)}`,0.4,()=>{if(Math.random()<p){L.drinker=false;L.drinkStopped=true;return 'Вы стали пить намного меньше.'}return 'Бросить не получилось.'}),
          opt('Не сейчас','',0.6,()=>'Всё осталось как было.')]}}},
{id:'kidStudy',ages:[28,100],stage:'взрослость',when:(L,x,c)=>L.zp!==null&&L.kids.some(k=>k.alive&&!k.asked&&x-k.born===17)&&Math.random()<clamp(0.2+c.tert/100,0.25,0.8),make:(L,x,c)=>{const k=L.kids.find(k=>k.alive&&!k.asked&&x-k.born===17);k.asked=true;
  const w=clamp(0.3+0.5*ncdf(L.zEff()),0.1,0.9),son=k.sex==='m';
  return {id:'kidStudy',title:`${son?'Сын':'Дочь'} хочет учиться дальше`,text:`${k.name} ${son?'окончил':'окончила'} школу и хочет поступать. Учёба стоит денег.`,
    opts:[opt('Оплатить учёбу','Семье придётся потратиться',w,()=>{L.shock-=0.25;k.edu='uni';return `Вы оплачиваете учёбу: ${k.name} ${son?'поступил':'поступила'}.`}),
          opt('Пусть начинает работать','Денег на учёбу нет',1-w,()=>{k.edu='work';return `${k.name} ${son?'пошёл':'пошла'} работать.`})]}}},
{id:'savings',ages:[40,55],stage:'взрослость',when:(L,x)=>L.working&&x>=40&&x<=55&&!L.flags.savings&&Math.random()<0.1,make:(L,x,c)=>{L.flags.savings=true;
  return {id:'savings',title:'Деньги на старость',text:'Можно каждый месяц откладывать часть дохода на старость.',
    opts:[opt('Откладывать','Сейчас тратить меньше, на пенсии жить лучше',0.5,()=>{L.shock-=0.05;L.pensionBoost*=1.25;return 'Вы откладываете на старость.'}),
          opt('Жить сегодняшним днём','Деньги нужны сейчас',0.5,()=>{L.shock+=0.05;return 'Вы решили не копить.'})]}}},
/* --- старость --- */
{id:'moveToKids',ages:[68,112],stage:'старость',when:(L,x)=>x>=68&&!L.withKids&&!L.flags.moveKids&&adultKids(L).length&&(!L.married||L.ill)&&Math.random()<0.2,make:(L,x,c)=>{L.flags.moveKids=true;
  const fam=['SA','ME','EA','CA','SSA','LA'].includes(c.region),k=adultKids(L)[0];
  return {id:'moveToKids',title:'Переезд к детям',text:`${k.name} зовёт вас жить к себе.`,
    opts:[opt('Переехать к детям','Рядом будут родные',fam?0.7:0.35,()=>{L.withKids=true;return 'Вы переехали к детям.'}),
          opt('Жить самостоятельно','Свой дом и свои порядки',fam?0.3:0.65,()=>'Вы остались в своём доме.')]}}},
{id:'grandkids',ages:[50,80],stage:'старость',when:(L,x)=>L.grandkids>0&&x>=50&&x<=80&&!L.flags.grandHelp&&Math.random()<0.3,make:(L,x,c)=>{L.flags.grandHelp=true;
  return {id:'grandkids',title:'Внуки',text:'Дети просят помочь с внуками.',
    opts:[opt('Помогать с внуками','Много хлопот и радости',0.65,()=>{L.helpGrand=true;L.stress=Math.max(0,L.stress-0.5);return 'Вы много времени проводите с внуками.'}),
          opt('Пожить для себя','Наконец-то время на себя',0.35,()=>L.zEff()>0.3?'Вы путешествуете и занимаетесь своими делами.':'Вы больше времени проводите с друзьями и соседями.')]}}},
{id:'nearDoctors',ages:[65,112],stage:'старость',when:(L,x)=>x>=65&&L.rural&&!L.flags.nearDoc&&Math.random()<0.08,make:(L,x,c)=>{L.flags.nearDoc=true;
  return {id:'nearDoctors',title:'Больница далеко',text:'До ближайшей больницы далеко, а здоровье уже не то.',
    opts:[opt('Переехать в город ближе к врачам','Переезд стоит денег, зато помощь рядом',0.4,()=>{L.rural=false;L.careBonus=0.94;L.shock-=0.1;return 'Вы переехали ближе к врачам.'}),
          opt('Остаться в родном доме','Здесь вся жизнь',0.6,()=>'Вы остались дома.')]}}}
];

/* Индекс по возрасту: каждый год проверяются только решения и события, подходящие по возрасту. */
function byAge(list){const idx=[];for(let x=0;x<=MAXAGE;x++)idx.push(list.filter(d=>x>=d.ages[0]&&x<=d.ages[1]));return idx}
let DEC_AGE=null,EV_AGE=null,CH_AGE=null,DAY_AGE=null;
/* взвешенный выбор из списка по весам w(L,x,c) без лишних массивов: симуляция крутит его миллионы раз */
const WBUF=new Float64Array(128);
function pickWeighted(list,L,x,c){let tot=0;for(let i=0;i<list.length;i++){let w=list[i].w(L,x,c);if(w>0){const n=L.seen[list[i].id];if(n)w*=Math.pow(0.2,n)}WBUF[i]=w>0?w:0;tot+=WBUF[i]}
  if(tot<=0)return null;let r=Math.random()*tot;for(let i=0;i<list.length;i++){r-=WBUF[i];if(r<=0&&WBUF[i]>0)return list[i]}
  for(let i=list.length-1;i>=0;i--)if(WBUF[i]>0)return list[i];return null}

/* События года. p — вероятность (с учётом страны и прошлого), fire — эффект и текст. */
const EVENTS=[
{id:'smokeStart',ages:[13,30],when:(L,x)=>!L.smoker&&!L.quitAges.length&&x>=13&&x<=30,p:(L,x,c)=>{
  const s=c.smoke/100*(L.sex==='m'?1.55:0.45);let r=x<=24?s/8:s/30;
  r*={street:1.8,study:0.8,home:0.9}[L.crowd]||1;if(L.active)r*=0.6;if(L.serveLeft>0)r*=1.7;if(L.flags.earlyWork)r*=1.3;if(L.focus==='health')r*=0.7;
  return r*(1+0.25*Math.min(L.stress,4))},
 fire:(L,x)=>{L.smoker=true;return {k:'info',t:L.serveLeft>0?'В армии вы начали курить.':L.inSchool?'В школе вы начали курить — за компанию.':L.stress>=1.5?'От нервов вы начали курить.':L.working?'На работе вы начали курить.':'Вы начали курить.'}}},
{id:'drinkStart',ages:[16,55],when:(L,x)=>!L.drinker&&!L.drinkStopped&&x>=16&&x<=55,p:(L,x,c)=>{
  const d=DRINK[c.region]||DRINK.HI;let r=(L.sex==='m'?d[0]:d[1])/(x<=40?25:60);
  r*={street:1.6,study:0.8,home:0.9}[L.crowd]||1;if(L.serveLeft>0)r*=1.5;if(L.active)r*=0.7;if(L.focus==='health')r*=0.6;if(L.divAge!=null&&x-L.divAge<=2)r*=1.5;if(L.shock<-0.3)r*=1.3;
  return r*(1+0.3*Math.min(L.stress,4))},
 fire:(L,x)=>{L.drinker=true;return {k:'info',t:L.divAge!=null&&x-L.divAge<=2?'После развода вы стали часто выпивать.':L.shock<-0.3?'В тяжёлое время вы стали часто выпивать.':'Вы стали часто выпивать.'}}},
{id:'drought',ages:[0,112],when:(L,x,c)=>L.rural&&c.agri>=5,p:(L,x,c)=>0.04*clamp(c.agri/40,0.2,1.5)*(c.gdp<10000?1.3:0.7),
 fire:(L,x,c)=>{L.shock-=0.45;if(x<5||L.zEff()<-1)L.yearRisk*=1.15;return {k:'sad',t:Math.random()<0.5?'Засуха: урожай погиб, и семья потеряла большую часть дохода.':'Неурожай: в этом году еды и денег хватало с трудом.'}}},
{id:'goodHarvest',ages:[0,112],when:(L,x,c)=>L.rural&&c.agri>=5,p:()=>0.04,fire:L=>{L.shock+=0.25;return {k:'info',t:'Хороший урожай: в этом году семья заработала больше обычного.'}}},
{id:'crisis',ages:[3,112],when:(L,x)=>x>=3,p:(L,x,c)=>CRISIS[c.region]||0.03,
 fire:(L,x)=>{L.shock-=0.35;let t='В стране экономический кризис: цены выросли, работы стало меньше.';
  if(L.working&&Math.random()<0.15){L.shock-=0.4;L.stress+=1;t+=' Вы потеряли работу.'}return {k:'sad',t}}},
{id:'epidemic',ages:[0,112],when:()=>true,p:(L,x,c)=>c.region==='SSA'?0.03:c.region==='SA'?0.02:0.012,
 fire:(L,x)=>{L.yearRisk*=x<5||x>=65?1.25:1.1;L.shock-=0.1;return {k:'sad',t:'В стране эпидемия. Больницы переполнены, многие болеют.'}}},
{id:'inflation',ages:[16,112],when:(L,x)=>x>=16,p:(L,x,c)=>c.gdp<15000?0.03:0.01,fire:L=>{L.shock-=0.2;return {k:'sad',t:'Цены резко выросли, а сбережения обесценились.'}}},
{id:'disaster',ages:[0,112],when:()=>true,p:()=>0.008,fire:L=>{L.shock-=0.35;L.yearRisk*=1.1;return {k:'sad',t:'Стихийное бедствие: ваш дом серьёзно пострадал.'}}},
{id:'inheritance',ages:[18,112],when:(L,x)=>L.flags.parentDied===x&&x>=18&&L.zf>0.3,p:()=>0.5,fire:L=>{L.shock+=0.3;if(L.zp!==null)L.zp+=0.05;return {k:'info',t:'Вам досталось наследство.'}}},
{id:'smallWin',ages:[18,112],when:(L,x)=>x>=18,p:()=>0.004,fire:L=>{L.shock+=0.4;return {k:'info',t:'Неожиданная удача: вы выиграли немного денег.'}}},
{id:'injury',ages:[16,62],when:(L,x)=>L.working&&x>=16&&x<=62,p:L=>/земл|скот|ферм|урожа|рабоч|грузч|строит|рикша/.test(L.job||'')?0.012:0.004,
 fire:L=>{L.shock-=0.25;L.illMult*=1.04;return {k:'sad',t:'Травма на работе: несколько месяцев без заработка.'}}},
{id:'grandchild',ages:[33,112],when:L=>adultKids(L).some(k=>L.age-k.born>=20),p:(L,x,c)=>clamp(0.05*c.fert/2,0.02,0.12)*adultKids(L).filter(k=>L.age-k.born>=20).length,
 fire:(L,x,c)=>{L.grandkids++;const s=Math.random()<0.512?'m':'f',k=pick(adultKids(L));return {k:'mile',t:`У ${k.sex==='m'?'сына':'дочери'} ${k.name} ${s==='m'?'родился сын':'родилась дочь'} — ${L.grandkids===1?'ваш первый внук':'ещё один внук'}: ${pickName(c,s)}.`}}},
{id:'siblingDeath',ages:[1,112],when:(L,x)=>L.sibs>0&&x>=1,p:(L,x)=>{const q=(L.qd||(L.qd=getTable(L.home,'m')))[Math.min(x+3,MAXAGE)];return clamp(q*L.sibs*0.8,0,0.5)},
 fire:L=>{L.sibs--;L.stress+=1;return {k:'sad',t:Math.random()<0.5?'Умер ваш брат.':'Умерла ваша сестра.'}}},
{id:'robbery',ages:[14,112],when:(L,x)=>x>=14,p:(L,x,c)=>clamp(c.hom/1e5*40,0.001,0.02),fire:L=>{L.shock-=0.12;L.stress+=0.5;return {k:'sad',t:'Вас обокрали: пропали деньги и вещи.'}}},
{id:'promotion',ages:[24,58],when:(L,x)=>L.working&&!L.biz&&x>=24&&x<=58,p:L=>0.04*({study:1.5,money:1.3}[L.focus]||1)*(L.degree?1.3:1)*clamp(1+0.01*(L.know-45),0.6,1.6),fire:L=>{L.zp+=0.15;return {k:'mile',t:'Вас повысили на работе.'}}},
{id:'bizYear',ages:[20,112],when:L=>!!L.biz,p:()=>1,fire:L=>{const b=L.biz;b.y++;
  if(b.y<=3&&Math.random()<(1-b.p)/3){L.biz=null;L.shock-=0.7;L.debt=Math.max(L.debt,3);L.stress+=1;return {k:'sad',t:'Ваше дело пришлось закрыть: денег не хватило. Остались долги.'}}
  if(b.y===3){L.zp+=0.35;return {k:'mile',t:'Ваше дело встало на ноги и приносит доход.'}}
  if(b.y>3&&Math.random()<0.04){L.shock-=0.4;return {k:'sad',t:'Тяжёлый год для вашего дела: клиентов стало меньше.'}}
  return null}},
{id:'debtTrap',ages:[16,112],when:L=>L.debt>0&&L.shock<-0.4,p:()=>0.3,fire:L=>{L.debt+=2;L.stress+=1;return {k:'sad',t:'Долги растут: платить по кредиту нечем.'}}},
{id:'homePrices',ages:[20,112],when:L=>['mortgage','own'].includes(L.housing),p:()=>0.03,fire:L=>{L.pensionBoost*=1.04;return {k:'info',t:'Цены на жильё выросли: ваше жильё подорожало.'}}},
{id:'rentUp',ages:[20,112],when:L=>L.housing==='rent',p:()=>0.05,fire:L=>{L.shock-=0.12;return {k:'info',t:'Хозяин поднял плату за жильё.'}}},
{id:'schoolAward',ages:[6,20],when:L=>L.inSchool&&L.studyPts>=2,p:L=>L.focus==='study'?0.06:0.03,fire:L=>{L.studyPts+=1;return {k:'mile',t:'Вы победили на школьной олимпиаде.'}}},
{id:'scholarship',ages:[15,45],when:L=>L.uni&&L.zEff()<0.3,p:L=>L.focus==='study'?0.2:0.08,fire:L=>{L.shock+=0.15;return {k:'info',t:'Вам назначили стипендию.'}}},
{id:'friendsMove',ages:[18,35],when:(L,x)=>x>=18&&x<=35,p:()=>0.02,fire:L=>{L.stress+=0.3;return {k:'info',t:'Близкие друзья уехали в другой город.'}}},
{id:'pensionReform',ages:[45,60],when:(L,x,c)=>c.gdp>15000&&x>=45&&x<=60&&!L.flags.reform,p:()=>0.02,fire:L=>{L.flags.reform=true;L.retExtra+=2;return {k:'info',t:'Пенсионный возраст повысили на два года.'}}},
{id:'remittance',ages:[15,112],when:(L,x,c)=>L.sibs>0&&c.gdp<15000&&x>=15,p:()=>0.03,fire:L=>{L.shock+=0.15;return {k:'info',t:'Брат или сестра прислали деньги из-за границы.'}}},
{id:'armyBack',ages:[16,45],when:L=>L.serveLeft>0,p:()=>1,fire:L=>{L.serveLeft--;if(L.working)L.shock-=0.15;if(L.serveLeft===0)return {k:'mile',t:'Служба закончилась. Вы вернулись домой.'};return null}}
];

/* ===== мечта в 10 лет =====
   Игрок пишет мечту своими словами. ИИ (если подключён) разбирает её в профиль {sphere, edu, needUni, needMove, difficulty};
   без ИИ работает простой разбор по ключевым словам. Развилки на пути к мечте пишет ИИ или шаблон,
   но шанс каждого варианта всегда считает движок: по трудности мечты, стране, достатку и образованию. */
const SPHERES={
  science:{name:'наука',edu:'phd',uni:true,move:true,d:4,kw:['учён','учен','наук','исследов','физик','химик','биолог','астроном','археолог','математик','изобрета','профессор','палеонт','генетик']},
  medicine:{name:'медицина',edu:'uni',uni:true,move:false,d:3,kw:['врач','доктор','хирург','медсест','медбрат','стоматолог','ветеринар','педиатр','фельдшер','лечить','медик']},
  tech:{name:'техника и IT',edu:'uni',uni:true,move:true,d:3,kw:['программист','инженер','айти','it','робот','компьютер','разработчик','игры','механик','архитектор','электрик','конструктор']},
  art:{name:'искусство',edu:'college',uni:false,move:true,d:4,kw:['художни','рисова','певиц','певец','петь','актёр','актер','актрис','музыкант','писател','поэт','танц','балер','дизайнер','режиссёр','режиссер','фотограф','рэпер','артист','звезд']},
  sport:{name:'спорт',edu:'school',uni:false,move:true,d:5,kw:['футбол','спортсмен','боксёр','боксер','хоккеист','теннис','чемпион','олимпи','бегун','гимнаст','баскетбол','борец','шахмат','волейбол','пловец','тренер']},
  business:{name:'бизнес',edu:'uni',uni:false,move:true,d:3,kw:['бизнес','предприним','миллионер','богат','директор','своё дело','свое дело','банкир','магазин']},
  education:{name:'образование',edu:'uni',uni:true,move:false,d:2,kw:['учител','воспитател','преподава']},
  law:{name:'право и государство',edu:'uni',uni:true,move:true,d:3,kw:['юрист','адвокат','судь','полицейск','полиц','президент','депутат','дипломат','следовател','прокурор','министр','детектив']},
  service:{name:'помощь людям',edu:'college',uni:false,move:false,d:2,kw:['пожарн','спасател','повар','парикмахер','продав','официант','кондитер','визажист','швея','портн','строител','пекар']},
  agriculture:{name:'земля и животные',edu:'school',uni:false,move:false,d:2,kw:['фермер','агроном','ферм','конюх','пастух','садовник','лошад','животн','коров','пчел']},
  transport:{name:'дороги и небо',edu:'college',uni:false,move:true,d:3,kw:['пилот','лётчик','летчик','водител','капитан','моряк','машинист','дальнобой','космонавт','астронавт','гонщик']},
  military:{name:'служба',edu:'college',uni:false,move:true,d:3,kw:['военн','солдат','офицер','генерал','десантник','пограничник','моряк-подводник']},
  media:{name:'медиа',edu:'uni',uni:true,move:true,d:3,kw:['журналист','телевед','ведущ','блогер','ютуб','стример','тикток']},
  other:{name:'своё',edu:'school',uni:false,move:false,d:3,kw:[]}
};
/* трудность отдельных мечт сильно отличается от сферы */
const DREAM_HARD=[['космонавт',5],['астронавт',5],['президент',5],['звезд',5],['знаменит',5],['миллиардер',5],['миллионер',4],['олимпи',5],['чемпион',5],['пилот',4],['лётчик',4],['летчик',4],['хирург',4],['учител',2],['повар',2],['фермер',2],['продав',1],['водител',2]];
/* быстрые варианты мечты (и мечты соседей по секунде) */
const DREAM_PRESETS=[['врачом',8],['учителем',6],['футболистом',6],['программистом',5],['художником',4],['полицейским',4],['пилотом',3],['певцом',4],['учёным',3],['бизнесменом',4],['фермером',3],['космонавтом',2],['инженером',4],['военным',3],['ветеринаром',3],['поваром',3]];
const FORK_AGES=[[14,16],[22,25],[35,45]];
/* насколько вариант надёжен и насколько продвигает к мечте: [множитель шанса, прирост] */
const KIND={study:[1.1,1],move:[0.8,1.4],risk:[0.55,2.2],safe:[1.35,0.6],network:[0.95,1.1],money:[1,1.3],give_up:[1,0]};
/* профессия, которая сама по себе приближает к мечте */
const MAJOR_SPHERE={med:'medicine',tech:'tech',it:'tech',edu:'education',econ:'business',law:'law'};

function classifyDreamLocal(text){
  const t=' '+String(text||'').toLowerCase().replace(/ё/g,'е')+' ';
  let sphere='other';
  for(const k in SPHERES)if(SPHERES[k].kw.some(w=>t.includes(w.replace(/ё/g,'е')))){sphere=k;break}
  const S=SPHERES[sphere];let d=S.d;
  for(const [w,v] of DREAM_HARD)if(t.includes(w.replace(/ё/g,'е'))){d=v;break}
  let clean=String(text||'').trim().replace(/[.!]+$/,'').replace(/^(я\s+)?(хочу\s+|буду\s+|стану\s+)?(стать|быть)?\s*/i,'').slice(0,50)||String(text||'').trim().slice(0,50);
  clean=/^[а-яё-]+(ом|ем|ой|ей|ью|ами|ями)(\s|$)/i.test(clean)?'Стать '+clean.toLowerCase():Cap(clean);
  return {sphere,title:clean,edu:S.edu,needUni:S.uni,needMove:S.move,difficulty:d,short:`Сфера: ${S.name}.`,src:'local'};
}

/* шаблоны развилок: тексты подставляются в buildFork */
function forkTemplate(L,stage){
  const d=L.dream,t=d.title,x=L.age,S=SPHERES[d.sphere]||SPHERES.other;
  if(stage===1){
    const o=[{label:'Учиться и готовиться всерьёз',hint:'Кружки, олимпиады, книги вместо прогулок',kind:'study'},
             {label:'Найти наставника',hint:'Человека, который уже прошёл этот путь',kind:'network'}];
    if(['sport','art'].includes(d.sphere))o.push({label:'Тренироваться вместо учёбы',hint:'Всё или ничего',kind:'risk'});
    o.push({label:'Забыть детскую мечту',hint:'Есть дела поважнее',kind:'give_up'});
    return {title:'Первый шаг к мечте',text:`Вам ${yrs(x)}. В десять лет вы мечтали: «${t}». Пора решить, всерьёз ли это.`,options:o.slice(0,3)};
  }
  if(stage===2){
    const o=[];
    if(d.needUni&&!L.degree)o.push({label:'Учиться дальше по профессии',hint:'Ещё несколько лет учёбы',kind:'study'});
    if(d.needMove&&!L.migrated)o.push({label:'Переехать туда, где больше возможностей',hint:'Большой город или другая страна',kind:'move'});
    o.push({label:'Бросить всё ради мечты',hint:'Сейчас или никогда',kind:'risk'});
    o.push({label:'Обычная работа, а мечта — медленно',hint:'Надёжно, но долго',kind:'safe'});
    return {title:'Мечта и взрослая жизнь',text:`Вам ${yrs(x)}. Детская мечта — «${t}» (${S.name}). Взрослая жизнь требует денег и времени.`,options:o.slice(0,3)};
  }
  const o=[{label:'Рискнуть и попробовать по-настоящему',hint:'Может не получиться',kind:'risk'}];
  if(L.zEff()>-0.3)o.push({label:'Вложить сбережения',hint:'Деньги семьи ради мечты',kind:'money'});
  else o.push({label:'Найти единомышленников',hint:'Вместе проще',kind:'network'});
  o.push({label:'Отпустить мечту',hint:'У жизни свои планы',kind:'give_up'});
  return {title:'Ещё не поздно?',text:`Вам ${yrs(x)}. Когда-то вы мечтали: «${t}». Половина жизни позади.`,options:o};
}

/* итог мечты: шаблонные тексты, если ИИ недоступен */
const DREAM_END={
  yes:['Детская мечта сбылась.','То, о чём вы мечтали в десять лет, стало вашей жизнью.'],
  partly:['Мечта сбылась отчасти.','Путь к мечте был долгим, и часть его вы прошли.'],
  no:['Жизнь пошла другим путём.','Детская мечта осталась в детстве, а жизнь сложилась по-своему.'],
  early:['Мечта не успела сбыться.','Жизнь оказалась короче, чем путь к мечте.']
};

/* ===== повседневная жизнь, показатели и мир =====
   Показатели 0–100: здоровье, знания, счастье, отношения (достаток — процентиль дохода).
   Они меняются от обычных событий и бытовых выборов и сами влияют на жизнь:
   здоровье — на риск смерти (hp), знания — на учёбу и доход, отношения — на брак и семью, счастье — на стресс.
   Мир (World) общий для всех, кто родился в одну секунду: новости по прогнозу ООН, большой спорт, кризисы и эпидемии. */

const up=s=>s+' ↑',down=s=>s+' ↓';
/* поправки показателей одной строкой: L.adj({mood:5, rel:-3, know:2, hp:0.01, stress:0.5, shock:-0.1}) */
function kidName(L,min,max){const k=L.kids.filter(k=>k.alive&&L.age-k.born>=min&&L.age-k.born<=max);return k.length?pick(k):null}
const sonDaughter=k=>k.sex==='m'?'Сын':'Дочь';
const heShe=(k,m,f)=>k.sex==='m'?m:f;

/* Обычные события: каждый год выпадает не больше одного. w — относительный вес (0 — не подходит). */
const DAILY=[
/* --- малыши --- */
{id:'firstWords',ages:[1,2],w:L=>L.flags.words?0:3,fire:L=>{L.flags.words=true;L.adj({know:2,mood:3});return {k:'info',t:`Вы сказали первое слово: «${pick(['мама','папа','дай','баба','нет'])}».`}}},
{id:'firstSteps',ages:[1,1],w:L=>L.flags.steps?0:3,fire:L=>{L.flags.steps=true;return {k:'info',t:'Вы сделали первые шаги — прямо к маме.'}}},
{id:'kindergarten',ages:[3,5],w:(L,x,c)=>L.flags.kg?0:clamp(c.gdp/15000+0.4*L.zf,0.1,2),fire:L=>{L.flags.kg=true;L.adj({know:3,rel:2,mood:-2});return {k:'info',t:'Вы пошли в детский сад. Первую неделю плакали каждое утро.'}}},
{id:'grandma',ages:[3,12],w:()=>1,fire:L=>{L.adj({mood:5,rel:3});return {k:'info',t:L.rural?'Лето у бабушки: вы научились доить козу и кормить кур.':'Лето у бабушки в деревне: речка, малина и никаких уроков.'}}},
{id:'pet',ages:[4,14],w:L=>L.flags.pet?0:0.6+0.3*ncdf(L.zf),fire:L=>{L.flags.pet=true;L.adj({mood:8});const d=Math.random()<0.5;return {k:'info',t:`Дома появился ${d?'щенок':'котёнок'}. Вы назвали ${d?'его':'его'} ${pick(d?['Бим','Рекс','Шарик','Джек']:['Мурзик','Барсик','Пушок','Симба'])}.`}}},
{id:'parentsQuarrel',ages:[3,17],w:L=>L.mom&&L.dad?(L.zf<-0.5?1.6:0.9):0,fire:L=>{L.adj({mood:-8,rel:-4,stress:0.5});return {k:'sad',t:pick(['Мама и папа сильно поругались. Вы всё слышали из своей комнаты.','Родители поругались из-за денег и несколько дней не разговаривали.','Папа ушёл ночевать к другу после ссоры с мамой. Через пару дней вернулся.'])}}},
{id:'childSick',ages:[1,10],w:(L,x,c)=>0.5+c.u5/40,fire:L=>{L.adj({hp:-0.005,mood:-3});return {k:'info',t:'Вы долго болели: неделя с высокой температурой. Мама не отходила от вас.'}}},
{id:'scraped',ages:[5,14],w:()=>0.8,fire:L=>{L.adj({mood:-2});return {k:'info',t:L.rural?'Вы упали с дерева и разбили коленки. Шрам остался на всю жизнь.':'Вы упали с велосипеда и разбили коленки.'}}},
{id:'brokeArm',ages:[5,16],w:()=>0.25,fire:L=>{L.adj({mood:-5,hp:-0.005});return {k:'info',t:'Вы сломали руку. Месяц в гипсе, и весь класс расписался на нём.'}}},
{id:'newSibling',ages:[2,12],w:(L,x,c)=>L.mom&&L.momAge+x<42?clamp((c.fert-1)/2,0.05,1.5):0,fire:(L,x,c)=>{const s=Math.random()<0.512?'m':'f';L.young=(L.young||0)+1;L.adj({rel:3,mood:2});return {k:'mile',t:`Родился ${s==='m'?'младший брат':'младшая сестра'}: ${pickName(c,s)}.`}}},
{id:'birthday',ages:[4,12],w:L=>0.4+0.6*ncdf(L.zf),fire:L=>{L.adj({mood:6});return {k:'info',t:`На день рождения пришли друзья. Лучший подарок — ${pick(['мяч','конструктор','книга с картинками','кукла','машинка на пульте','новые кроссовки'])}.`}}},
{id:'lost',ages:[3,8],w:()=>0.3,fire:L=>{L.adj({mood:-3});return {k:'info',t:'Вы потерялись на рынке. Нашлись через час — и получили от мамы и объятия, и нагоняй.'}}},
/* --- школа --- */
{id:'scolded',ages:[7,16],w:L=>L.inSchool?clamp(1.4-L.know/60,0.2,1.4)*(L.focus==='study'?0.6:1):0,fire:L=>{L.adj({mood:-5,rel:-3,know:1});return {k:'info',t:pick(['Вы получили двойку по математике. Дома наругали и отобрали телефон на неделю.','Учительница вызвала родителей в школу. Дома был серьёзный разговор.','За плохие оценки в четверти вас наругали и не пустили гулять.'])}}},
{id:'praised',ages:[7,17],w:L=>L.inSchool?clamp(L.know/50,0.2,1.6):0,fire:L=>{L.adj({mood:5,know:2});return {k:'info',t:'Учитель похвалил вас перед всем классом. Вы шли домой и улыбались.'}}},
{id:'friendFight',ages:[7,15],w:()=>0.7,fire:L=>{L.adj({mood:-2,rel:1});return {k:'info',t:'Вы поссорились с лучшим другом, а через неделю помирились, как будто ничего не было.'}}},
{id:'bestFriend',ages:[6,18],w:L=>L.flags.bf?0.1:1,fire:(L,x,c)=>{let n=pickName(c,L.sex);for(let i=0;i<5&&n===L.name;i++)n=pickName(c,L.sex);L.flags.bf=n;L.adj({rel:6,mood:4});return {k:'mile',t:`У вас появил${L.g('ся лучший друг','ась лучшая подруга')} — ${n}.`}}},
{id:'teased',ages:[8,15],w:()=>0.5,fire:L=>{L.adj({mood:-7,stress:0.3});return {k:'info',t:'Над вами смеялись в классе из-за одежды. Было обидно, но вы справились.'}}},
{id:'schoolTrip',ages:[8,16],w:L=>L.inSchool?0.3+0.6*ncdf(L.zf):0,fire:L=>{L.adj({mood:6,know:2});return {k:'info',t:`Поездка с классом: вы впервые увидели ${pick(['море','горы','большой музей','столицу','зоопарк'])}.`}}},
{id:'firstPhone',ages:[8,15],w:(L,x,c)=>L.flags.phone?0:clamp(c.gdp/20000+0.4*L.zf,0.05,1.5),fire:L=>{L.flags.phone=true;L.adj({mood:5});return {k:'info',t:'Вам купили первый телефон. Теперь вы почти не выпускаете его из рук.'}}},
{id:'chores',ages:[6,14],w:L=>L.rural||L.zf<-0.5?1:0.2,fire:L=>{L.adj({rel:2,mood:-1});return {k:'info',t:L.rural?'Каждое утро до школы — вода, скотина и огород.':'После школы вы сидите с младшими, пока родители на работе.'}}},
{id:'sportWin',ages:[8,18],w:L=>L.active?1.2:0,fire:L=>{L.adj({mood:8,hp:0.005});return {k:'mile',t:'Ваша команда выиграла районные соревнования.'}}},
{id:'goodBook',ages:[8,25],w:L=>clamp(L.know/50,0.2,1.5)*(L.focus==='study'?1.4:1),fire:L=>{L.adj({know:3,mood:2});return {k:'info',t:'Вы прочитали книгу, которая запомнилась на всю жизнь.'}}},
/* --- юность --- */
{id:'parentsTeen',ages:[13,18],w:L=>L.mom||L.dad?1:0,fire:L=>{L.adj({rel:-4,mood:-2});return {k:'info',t:pick(['Вы поругались с родителями из-за того, во сколько возвращаться домой.','Родители не понимают вашу музыку, одежду и друзей. Дома всё время споры.'])}}},
{id:'unrequited',ages:[13,19],w:L=>L.married?0:0.8,fire:L=>{L.adj({mood:-6});return {k:'info',t:'Вы влюбились, но без взаимности. Пару месяцев мир казался серым.'}}},
{id:'firstMoney',ages:[13,18],w:L=>L.working||L.flags.earlyWork?1:0,fire:L=>{L.adj({mood:4});return {k:'info',t:`Первые заработанные деньги вы потратили на ${pick(['подарок маме','кроссовки','телефон','сладости для младших'])}.`}}},
{id:'concert',ages:[14,25],w:L=>L.rural?0.2:0.7,fire:L=>{L.adj({mood:6,rel:2});return {k:'info',t:'Вы впервые сходили на концерт любимой группы и сорвали голос.'}}},
{id:'license',ages:[17,26],w:(L,x,c)=>L.flags.license?0:clamp(c.gdp/25000,0.05,1),fire:L=>{L.flags.license=true;L.adj({mood:3});return {k:'info',t:'Вы получили водительские права с первой попытки.'}}},
/* --- взрослость --- */
{id:'boss',ages:[18,64],w:L=>L.working&&!L.biz?0.8:0,fire:L=>{L.adj({mood:-5,stress:0.5});return {k:'info',t:'Поругались с начальником. Неделю ходили мрачнее тучи.'}}},
{id:'workFriends',ages:[18,64],w:L=>L.working?0.7:0,fire:L=>{L.adj({rel:4,mood:3});return {k:'info',t:'На работе появились хорошие друзья. Теперь по пятницам вы собираетесь вместе.'}}},
{id:'vacation',ages:[20,75],w:L=>L.zp!==null&&L.zEff()>0?0.9:0,fire:L=>{L.adj({mood:8,stress:-1,hp:0.005});return {k:'info',t:`Отпуск ${pick(['у моря','в горах','в другой стране','на даче у друзей'])}. Вы наконец выспались.`}}},
{id:'noVacation',ages:[20,64],w:L=>L.zp!==null&&L.zEff()<-0.5?0.9:0,fire:L=>{L.adj({mood:-3,stress:0.3});return {k:'info',t:'Ещё один год без отпуска: денег хватает только на самое нужное.'}}},
{id:'carBroke',ages:[22,70],w:(L,x,c)=>c.gdp>8000&&L.zp!==null&&L.zEff()>-0.3?0.5:0,fire:L=>{L.adj({shock:-0.08,mood:-3});return {k:'info',t:'Сломалась машина. Ремонт съел целую зарплату.'}}},
{id:'spouseQuarrel',ages:[18,90],w:L=>L.married?0.8:0,fire:L=>{L.adj({rel:-2,mood:-3});return {k:'info',t:`Вы с ${L.spouse} поругались из-за ${pick(['денег','родственников','ремонта','ерунды'])}, но вечером помирились.`}}},
{id:'anniversary',ages:[20,100],w:L=>L.married&&L.marriedAt!=null&&(L.age-L.marriedAt)>0&&(L.age-L.marriedAt)%10===0?3:0,fire:L=>{L.adj({mood:6,rel:4});const n=L.age-L.marriedAt;return {k:'mile',t:`${n} лет вместе с ${L.spouse}.`}}},
{id:'kidSteps',ages:[16,70],w:L=>kidName(L,1,1)?1.5:0,fire:L=>{const k=kidName(L,1,1);L.adj({mood:6});return {k:'info',t:`${sonDaughter(k)} ${k.name} ${heShe(k,'сделал','сделала')} первые шаги.`}}},
{id:'kidSchool',ages:[20,70],w:L=>kidName(L,7,7)?1.5:0,fire:L=>{const k=kidName(L,7,7);L.adj({mood:4});return {k:'info',t:`${sonDaughter(k)} ${k.name} ${heShe(k,'пошёл','пошла')} в первый класс.`}}},
{id:'kidGrade',ages:[22,70],w:L=>kidName(L,8,16)?0.6:0,fire:L=>{const k=kidName(L,8,16);L.adj({mood:-2,rel:1});return {k:'info',t:`${k.name} ${heShe(k,'принёс','принесла')} двойку. Пришлось сесть вместе за уроки.`}}},
{id:'kidSick',ages:[16,70],w:L=>kidName(L,0,9)?0.5:0,fire:L=>{const k=kidName(L,0,9);L.adj({mood:-5,stress:0.5});return {k:'info',t:`${k.name} долго ${heShe(k,'болел','болела')}. Вы почти не спали.`}}},
{id:'kidGrad',ages:[30,80],w:L=>kidName(L,17,17)?1.5:0,fire:L=>{const k=kidName(L,17,17);L.adj({mood:6});return {k:'mile',t:`${sonDaughter(k)} ${k.name} ${heShe(k,'окончил','окончила')} школу.`}}},
{id:'reunion',ages:[25,55],w:L=>L.age%10===5?1.5:0,fire:L=>{L.adj({mood:2});return {k:'info',t:'Встреча выпускников: кто-то разбогател, кто-то уехал, кто-то не пришёл.'}}},
{id:'insomnia',ages:[20,80],w:L=>L.stress>=1.5?1.2:0,fire:L=>{L.adj({hp:-0.01,mood:-4});return {k:'info',t:'Полгода вы плохо спали из-за нервов.'}}},
{id:'running',ages:[22,65],w:L=>L.active?0:L.focus==='health'?1.2:0.3,fire:L=>{L.active=true;L.adj({hp:0.01,mood:3});return {k:'info',t:'Вы начали бегать по утрам. Первую неделю болело всё.'}}},
{id:'weight',ages:[30,65],w:(L,x,c)=>!L.active&&c.gdp>10000?0.5:0,fire:L=>{L.adj({hp:-0.015,mood:-2});return {k:'info',t:'Вы заметно набрали вес. Брюки стали тесными.'}}},
{id:'neighbors',ages:[22,90],w:L=>L.rural?0.8:0.3,fire:L=>{L.adj({rel:3});return {k:'info',t:L.rural?'Соседи всей улицей помогли вам перекрыть крышу.':'Вы подружились с соседями и теперь оставляете им ключи.'}}},
{id:'wedding',ages:[20,40],w:()=>0.5,fire:L=>{L.adj({mood:4,rel:2});return {k:'info',t:`Вы были на свадьбе ${L.flags.bf?`${L.g('лучшего друга','лучшей подруги')} — ${L.flags.bf}`:'двоюродного брата'}. Танцевали до утра.`}}},
{id:'familyFeast',ages:[0,100],w:(L,x,c)=>['SA','ME','CA','SSA','EA'].includes(c.region)?0.7:0.35,fire:L=>{L.adj({rel:4,mood:4});return {k:'info',t:'Большой семейный праздник: собрались все родственники, даже те, кого вы не помнили.'}}},
{id:'parentsAging',ages:[30,65],w:L=>(L.mom&&L.momAge+L.age>70)||(L.dad&&L.dadAge+L.age>70)?0.8:0,fire:L=>{L.adj({rel:2,mood:-3});return {k:'info',t:'Родители стали часто болеть. Вы стараетесь звонить им каждый день.'}}},
{id:'newTech',ages:[45,85],w:()=>0.5,fire:L=>{L.adj({know:2});return {k:'info',t:'Вы освоили новую технику — дети терпеливо объясняли каждую кнопку.'}}},
/* --- старость --- */
{id:'garden',ages:[60,95],w:L=>L.rural?1.2:0.5,fire:L=>{L.adj({mood:5,hp:0.005});return {k:'info',t:'Вы целыми днями в огороде. Урожай раздаёте соседям.'}}},
{id:'lonely',ages:[65,105],w:L=>!L.married&&!L.withKids?1:0,fire:L=>{L.adj({mood:-6});return {k:'info',t:'Зимой было одиноко: дети звонят редко, друзей становится меньше.'}}},
{id:'grandVisit',ages:[50,100],w:L=>L.grandkids>0?1.3:0,fire:L=>{L.adj({mood:7,rel:3});return {k:'info',t:'Приезжали внуки. В доме было шумно и хорошо.'}}},
{id:'jubilee',ages:[60,100],w:L=>L.age%10===0?4:0,fire:L=>{L.adj({mood:6,rel:2});return {k:'mile',t:`Юбилей — ${yrs(L.age)}. Собрались родные и старые друзья.`}}},
{id:'oldFriend',ages:[70,105],w:()=>0.6,fire:L=>{L.adj({mood:-6});return {k:'sad',t:'Не стало старого друга. Вы долго перебирали ваши общие фотографии.'}}},
{id:'photos',ages:[55,105],w:()=>0.5,fire:L=>{L.adj({mood:3});return {k:'info',t:'Вы разбирали старые фотографии и долго смеялись над своими причёсками.'}}}
];

/* Бытовые выборы: не больше одного за год. В подсказке — что изменится (и шанс, если он есть). */
const CHOICES=[
{id:'badGrade',ages:[8,16],w:L=>L.inSchool?1.2:0,make:L=>{const p=clamp(0.3+L.know/150,0.2,0.85);
  return {id:'badGrade',stage:'детство',title:'Двойка в дневнике',text:'Вы получили двойку за контрольную. Вечером родители спросят про оценки.',
    opts:[opt('Честно показать родителям',`${down('настроение')} · ${up('отношения')}`,0.5,()=>{L.adj({mood:-3,rel:3,know:2});return 'Наругали, но потом папа помог разобраться с задачами.'}),
          opt('Спрятать дневник','Узнают примерно в 60% случаев',0.2,()=>{if(Math.random()<0.6){L.adj({rel:-8,mood:-6});return 'Обман раскрылся. Дома был скандал.'}L.adj({mood:1});return 'Пронесло. Но на душе неспокойно.'}),
          opt('Попросить учителя пересдать',`${up('знания')} · получается примерно у ${pct(p)}`,0.3,()=>{L.adj({know:3});if(Math.random()<p){L.adj({mood:4});return 'Вы пересдали на четвёрку.'}return 'Пересдать не разрешили, но тему вы поняли.'})]}}},
{id:'skipClass',ages:[12,17],w:L=>L.inSchool?1:0,make:L=>({id:'skipClass',stage:'юность',title:'Прогулять урок?',text:'Друзья зовут сбежать с последнего урока на речку.',
    opts:[opt('Пойти с друзьями',`${up('настроение')} · ${down('знания')} · могут поймать`,0.45,()=>{L.adj({mood:4,know:-2,rel:2});if(Math.random()<0.3){L.adj({rel:-5});return 'Было здорово, но классная руководительница позвонила родителям.'}return 'Было здорово, никто не узнал.'}),
          opt('Остаться на уроке',up('знания'),0.55,()=>{L.adj({know:1,rel:-1});return 'Вы остались. Друзья потом весь вечер рассказывали, как было весело.'})]})},
{id:'teenParty',ages:[15,18],w:()=>0.8,make:L=>({id:'teenParty',stage:'юность',title:'Вечеринка до утра',text:'Одноклассник зовёт на вечеринку, пока его родители в отъезде.',
    opts:[opt('Пойти',`${up('настроение')} · ${up('друзья')} · риск`,0.55,()=>{L.adj({mood:5,rel:3});L.flags.partyAt=L.age;if(Math.random()<0.25){L.adj({rel:-4});return 'Было весело, но домой вы вернулись под утро, и родители не спали.'}return 'Это была лучшая ночь года.'}),
          opt('Остаться дома','Спокойнее',0.45,()=>{L.adj({rel:-1});return 'Вы остались дома. В понедельник все обсуждали вечеринку.'})]})},
{id:'wallet',ages:[10,75],w:()=>0.5,make:L=>({id:'wallet',stage:'жизнь',title:'Чужой кошелёк',text:'На улице вы нашли кошелёк с деньгами и документами.',
    opts:[opt('Вернуть хозяину',up('настроение'),0.7,()=>{L.adj({mood:5});if(Math.random()<0.25){L.adj({shock:0.05});return 'Хозяин так обрадовался, что отдал вам часть денег в благодарность.'}return 'Хозяин долго благодарил. Приятно.'}),
          opt('Оставить деньги себе',`${up('деньги')} · ${down('настроение')}`,0.3,()=>{L.adj({shock:0.1,mood:-3});return 'Деньги пригодились, но вы ещё долго об этом вспоминали.'})]})},
{id:'friendLoan',ages:[20,65],w:L=>L.zp!==null?0.7:0,make:L=>({id:'friendLoan',stage:'взрослость',title:'Друг просит в долг',text:'Близкий друг просит крупную сумму до зарплаты. Говорит, что вернёт через месяц.',
    opts:[opt('Дать в долг',`${up('отношения')} · возвращают примерно 60%`,0.5,()=>{L.adj({rel:3});if(Math.random()<0.6)return 'Друг вернул всё в срок.';L.adj({shock:-0.1,rel:-4});return 'Деньги так и не вернулись. Дружба дала трещину.'}),
          opt('Отказать',down('отношения'),0.5,()=>{L.adj({rel:-3});return 'Друг обиделся, но потом всё понял.'})]})},
{id:'overtime',ages:[20,62],w:L=>L.working&&!L.biz?0.9:0,make:L=>({id:'overtime',stage:'взрослость',title:'Переработки',text:'Начальник предлагает работать по выходным за двойную плату.',
    opts:[opt('Согласиться',`${up('деньги')} · ${down('здоровье')} · ${down('отношения')}`,0.5,()=>{L.adj({shock:0.12,hp:-0.015,stress:0.7,rel:-2});L.zp+=0.02;return 'Денег стало больше, а сил и времени — меньше.'}),
          opt('Отказаться',`${up('отношения')}`,0.5,()=>{L.adj({rel:2,mood:2});return 'Выходные остались для семьи и отдыха.'})]})},
{id:'checkup',ages:[35,80],w:L=>L.ill?0:0.7,make:(L,x,c)=>{const cost=c.gdp<15000?'Дорого':'Займёт день';
  return {id:'checkup',stage:'здоровье',title:'Обследование',text:'Врач советует пройти полное обследование — на всякий случай.',
    opts:[opt('Пройти',`${cost} · болезни найдут раньше · ${up('здоровье')}`,0.5,()=>{L.adj({shock:c.gdp<15000?-0.1:-0.02,hp:0.01});L.flags.checked=L.age;return 'Вы прошли обследование. Врач дал несколько советов.'}),
          opt('Отложить','Сейчас не до этого',0.5,()=>'Вы решили, что чувствуете себя нормально.')]}}},
{id:'vacationRepair',ages:[28,65],w:L=>L.zp!==null&&L.zEff()>-0.6?0.7:0,make:L=>({id:'vacationRepair',stage:'взрослость',title:'Отпуск или ремонт',text:'Накопилась небольшая сумма. На что её потратить?',
    opts:[opt('Поехать в отпуск',`${up('счастье')} · ${down('стресс')}`,0.4,()=>{L.adj({mood:8,stress:-1});return 'Две недели отдыха — и мир снова в красках.'}),
          opt('Сделать ремонт',`${up('счастье')} надолго`,0.35,()=>{L.adj({mood:3});L.pensionBoost*=1.01;return 'Дома стало уютно.'}),
          opt('Отложить на чёрный день',up('деньги'),0.25,()=>{L.adj({shock:0.06});return 'Деньги лежат на счёте. Так спокойнее.'})]})},
{id:'kidPhone',ages:[25,70],w:L=>kidName(L,10,15)?0.8:0,make:L=>{const k=kidName(L,10,15);
  return {id:'kidPhone',stage:'семья',title:`${sonDaughter(k)} просит дорогой телефон`,text:`У всех в классе такой, говорит ${k.name}.`,
    opts:[opt('Купить',`${down('деньги')} · ${up('отношения')}`,0.45,()=>{L.adj({shock:-0.08,rel:4});return `${k.name} счастлив${heShe(k,'','а')}.`}),
          opt('Отказать и объяснить почему',down('отношения'),0.55,()=>{L.adj({rel:-3});return `${k.name} ${heShe(k,'обиделся','обиделась')}, но через неделю ${heShe(k,'отошёл','отошла')}.`})]}}},
{id:'volunteer',ages:[16,75],w:()=>0.5,make:L=>({id:'volunteer',stage:'жизнь',title:'Волонтёрство',text:'Знакомые зовут по выходным помогать в приюте и раздавать продукты.',
    opts:[opt('Пойти помогать',`${up('счастье')} · ${up('отношения')}`,0.45,()=>{L.adj({mood:6,rel:4,know:1});return 'Вы помогаете по выходным. Появились новые знакомые.'}),
          opt('Нет времени','',0.55,()=>'Вы отказались: и так не хватает времени.')]})},
{id:'language',ages:[14,50],w:()=>0.6,make:L=>{const p=clamp(0.35+L.know/120,0.2,0.9);
  return {id:'language',stage:'учёба',title:'Иностранный язык',text:'Можно по вечерам учить английский. Это долго, но открывает двери.',
    opts:[opt('Учить по вечерам',`${up('знания')} · доводят до конца примерно ${pct(p)}`,0.4,()=>{if(Math.random()<p){L.adj({know:6});if(L.zp!==null)L.zp+=0.04;L.flags.lang=true;return 'Через год вы уже смотрите фильмы без перевода.'}L.adj({know:2});return 'Вы бросили через три месяца, но кое-что запомнили.'}),
          opt('Не сейчас','',0.6,()=>'Как-нибудь потом.')]}}},
{id:'gym',ages:[20,60],w:L=>L.active?0:0.6,make:L=>({id:'gym',stage:'здоровье',title:'Спорт',text:'Друзья зовут по вечерам играть в футбол или ходить в спортзал.',
    opts:[opt('Записаться',`${up('здоровье')} · ${up('друзья')}`,0.4,()=>{L.active=true;L.adj({hp:0.015,rel:2,shock:-0.02});return 'Теперь два вечера в неделю — спорт.'}),
          opt('Не моё','',0.6,()=>'Вы решили, что спорт — это не ваше.')]})},
{id:'callParents',ages:[22,65],w:L=>L.mom||L.dad?0.8:0,make:L=>({id:'callParents',stage:'семья',title:'Родители',text:'Вы давно не виделись с родителями. Мама по телефону говорит, что всё хорошо, но голос грустный.',
    opts:[opt('Приехать в гости',`${up('отношения')} · ${up('счастье')}`,0.5,()=>{L.adj({rel:6,mood:4,shock:-0.02});return 'Вы приехали на выходные. Мама весь вечер не отпускала вашу руку.'}),
          opt('Позвонить подольше','',0.35,()=>{L.adj({rel:2});return 'Вы проговорили целый час.'}),
          opt('Некогда',down('отношения'),0.15,()=>{L.adj({rel:-4});return 'Вы пообещали приехать потом.'})]})},
{id:'bigQuarrel',ages:[20,85],w:L=>L.married?0.7:0,make:L=>({id:'bigQuarrel',stage:'семья',title:'Серьёзная ссора',text:`Вы с ${L.spouse} всерьёз поругались. Каждый уверен, что прав.`,
    opts:[opt('Уступить',`${up('отношения')} · ${down('счастье')}`,0.35,()=>{L.adj({rel:3,mood:-2});return 'Вы уступили. Дома снова мир.'}),
          opt('Поговорить спокойно на следующий день',`${up('отношения')}, если отношения хорошие`,0.45,()=>{if(Math.random()<L.rel/100+0.2){L.adj({rel:5,mood:3});return 'Вы поговорили и поняли друг друга лучше.'}L.adj({rel:-3});return 'Разговор не получился.'}),
          opt('Стоять на своём','Кто-то должен уступить',0.2,()=>{if(Math.random()<0.5){L.adj({mood:2});return 'В итоге уступили вам.'}L.adj({rel:-6,stress:1});return 'Вы неделю не разговаривали.'})]})},
{id:'flood',ages:[22,80],w:L=>L.rural?0:0.4,make:L=>({id:'flood',stage:'жизнь',title:'Затопили соседи',text:'Соседи сверху затопили вашу квартиру. Потолок испорчен.',
    opts:[opt('Потребовать возместить ущерб','Получается примерно в половине случаев',0.4,()=>{if(Math.random()<0.5){L.adj({mood:1});return 'Соседи оплатили ремонт.'}L.adj({shock:-0.06,rel:-2});return 'Соседи отказались платить. Ремонт за ваш счёт и испорченные отношения.'}),
          opt('Договориться миром',`${up('отношения')} · ${down('деньги')}`,0.6,()=>{L.adj({shock:-0.03,rel:3});return 'Сделали ремонт пополам. Теперь вы дружите.'})]})},
{id:'kidBullied',ages:[25,70],w:L=>kidName(L,8,14)?0.6:0,make:L=>{const k=kidName(L,8,14);
  return {id:'kidBullied',stage:'семья',title:'Ребёнка обижают',text:`${k.name} приходит из школы грустн${heShe(k,'ым','ой')}: одноклассники смеются и не берут в игры.`,
    opts:[opt('Поговорить с учителем',up('отношения'),0.5,()=>{L.adj({rel:3});return 'Учитель разобрался, стало легче.'}),
          opt('Перевести в другую школу',`${down('деньги')} · надёжнее`,0.25,()=>{L.adj({shock:-0.05,rel:2});return `В новой школе у ${heShe(k,'него','неё')} быстро появились друзья.`}),
          opt('Сказать, чтобы сам разбирался','',0.25,()=>{L.adj({rel:-3,mood:-2});return 'Пришлось справляться самому. Было непросто.'})]}}},
{id:'ticket',ages:[18,80],w:()=>0.35,make:L=>({id:'ticket',stage:'жизнь',title:'Лотерейный билет',text:'В киоске продают лотерейные билеты. Джекпот — огромный.',
    opts:[opt('Купить билет','Выигрывает один из сотни, и то немного',0.4,()=>{if(Math.random()<0.01){L.adj({shock:0.6,mood:10});return 'Вы выиграли! Не джекпот, но приятная сумма.'}L.adj({shock:-0.005});return 'Не выиграли. Как и почти все.'}),
          opt('Не тратить деньги','Одна лотерея в жизни у вас уже была — рождение',0.6,()=>'Вы прошли мимо.')]})},
{id:'food',ages:[20,55],w:(L,x,c)=>c.gdp>8000?0.5:0,make:L=>({id:'food',stage:'здоровье',title:'Еда на ходу',text:'Времени на готовку нет. Можно перейти на фастфуд или вставать пораньше.',
    opts:[opt('Готовить дома',`${up('здоровье')} · ${down('свободное время')}`,0.5,()=>{L.adj({hp:0.015,mood:-1});return 'Вы готовите на неделю вперёд по воскресеньям.'}),
          opt('Питаться на ходу',`${down('здоровье')} · ${up('время')}`,0.5,()=>{L.adj({hp:-0.015,mood:1});return 'Быстро, вкусно и не очень полезно.'})]})},
{id:'helpNeighbor',ages:[16,75],w:()=>0.4,make:L=>({id:'helpNeighbor',stage:'жизнь',title:'Одинокая соседка',text:'Пожилой соседке трудно ходить в магазин и аптеку.',
    opts:[opt('Помогать ей',`${up('счастье')} · ${up('отношения')}`,0.55,()=>{L.adj({mood:4,rel:3});return 'Вы приносите ей продукты, а она угощает вас пирогами.'}),
          opt('Это не моё дело','',0.45,()=>'Вы решили не вмешиваться.')]})},
{id:'promoOffer',ages:[25,50],w:L=>L.working&&L.married?0.5:0,make:L=>({id:'promoOffer',stage:'взрослость',title:'Повышение с командировками',text:'Предлагают должность выше, но половину месяца придётся быть в разъездах.',
    opts:[opt('Согласиться',`${up('деньги')} · ${down('отношения')}`,0.5,()=>{L.zp+=0.12;L.adj({rel:-5,stress:0.5});return 'Зарплата выросла, а дома вас видят всё реже.'}),
          opt('Отказаться',up('отношения'),0.5,()=>{L.adj({rel:3});return 'Вы остались на прежней должности, зато дома каждый вечер.'})]})}
];

/* ---- мир: один на всех, кто родился в одну секунду ---- */
let WORLD_TL=null; // прогноз ООН по миру (data/world-timeline.json)
function setWorld(tl){WORLD_TL=tl;STATIC_W=null}
const OLYMPICS={2028:'в Лос-Анджелесе',2032:'в Брисбене'},CUP={2026:'в США, Канаде и Мексике',2030:'в Марокко, Испании и Португалии',2034:'в Саудовской Аравии'};
/* Постоянная часть мира (прогноз ООН и большой спорт) считается один раз; случайная — лениво по годам с зерном,
   чтобы у всех родившихся в одну секунду был один и тот же мир. */
let STATIC_W=null;
function staticWorld(){if(STATIC_W)return STATIC_W;const Y={},add=(y,e)=>(Y[y]=Y[y]||[]).push(e);
  if(WORLD_TL){const ys=WORLD_TL.years,f=v=>String(v.toFixed(1)).replace('.',',');let peak=ys[0];for(const y of ys)if(y.pop>peak.pop)peak=y;
    for(let i=1;i<ys.length;i++){const a=ys[i-1],b=ys[i];
      for(const m of [9,10])if(a.pop<m&&b.pop>=m)add(b.year,{t:`Население Земли превысило ${m} миллиардов человек (прогноз ООН).`});
      if(a.deaths<a.births&&b.deaths>=b.births)add(b.year,{t:'Впервые за много веков людей в мире умирает больше, чем рождается (прогноз ООН).'});
      for(const m of [75,78,80])if(a.e0<m&&b.e0>=m)add(b.year,{t:`Средняя продолжительность жизни в мире достигла ${m} лет (прогноз ООН).`});
      if(b.year%10===0)add(b.year,{t:`За этот год в мире родилось около ${Math.round(b.births)} млн детей, людей на Земле — ${f(b.pop)} млрд (прогноз ООН).`})}
    add(peak.year,{t:`Население Земли достигло пика — около ${f(peak.pop)} млрд. Дальше оно начнёт медленно сокращаться (прогноз ООН).`})}
  // большой спорт: известные хозяева — каждый раз, дальше — раз в двенадцать лет, чтобы не заслонять остальное
  for(let y=2026;y<2160;y++){if(OLYMPICS[y]||(y>2032&&y%12===0))add(y,{t:`Летние Олимпийские игры${OLYMPICS[y]?' '+OLYMPICS[y]:''}.`});if(CUP[y]||(y>2034&&y%12===6))add(y,{t:`Чемпионат мира по футболу${CUP[y]?' '+CUP[y]:''}.`})}
  return STATIC_W=Y}
const WORLD_RANDOM=['Новая экспедиция отправилась к Луне.','Учёные сообщили о большом прорыве в лечении рака.','Сильнейшее землетрясение на другом конце света: весь мир собирает помощь.','Миллиарды людей смотрели полное солнечное затмение.'];
function makeWorld(start,seed){
  let s=(seed>>>0)||1;const r=()=>{s^=s<<13;s^=s>>>17;s^=s<<5;return (s>>>0)/4294967296};
  const R={},st=staticWorld();let next=start,lastCrisis=start-5,lastPand=start-30;
  const add=(y,e)=>(R[y]=R[y]||[]).push(e);
  function gen(y){
    if(y-lastCrisis>=6&&r()<0.08){lastCrisis=y;add(y,{t:'Мировой экономический кризис: цены растут, многие теряют работу.',fx:'crisis'})}
    if(y-lastPand>=20&&r()<0.025){lastPand=y;add(y,{t:'Пандемия нового вируса: закрыты границы, школы учатся из дома.',fx:'pandemic'});add(y+1,{t:'Пандемия идёт на спад.'})}
    if(r()<0.03+0.0015*(y-2026))add(y,{t:'Самый жаркий год за всю историю наблюдений.',fx:'heat'});
    if(r()<0.025)add(y,{t:'Новые технологии и ИИ изменили рынок труда: часть профессий исчезает, появляются новые.',fx:'tech'});
    if(r()<0.02)add(y,{t:WORLD_RANDOM[Math.floor(r()*WORLD_RANDOM.length)]})}
  const EMPTY=[];
  return {start,at(y){while(next<=y)gen(next++);const a=st[y],b=R[y];return a&&b?a.concat(b):a||b||EMPTY}};
}

/* ---- мировая статистика ---- */
let COHORT=null,SIG=null;
/* доля доживших до age среди всех детей мира одного года рождения (по таблицам смертности 172 стран) */
function cohortSurvival(age){
  if(!COHORT){COHORT=new Float64Array(MAXAGE+2);const tot=COUNTRIES.reduce((s,c)=>s+c.births,0);
    for(const c of COUNTRIES)for(const sex of ['m','f']){const q=getTable(c,sex),w=c.births/tot*(sex==='m'?0.512:0.488);let l=1;
      for(let x=0;x<=MAXAGE+1;x++){COHORT[x]+=w*l;if(x<=MAXAGE)l*=1-q[x]}}}
  return COHORT[clamp(age,0,MAXAGE+1)]}
function worldBirths(){return COUNTRIES.reduce((s,c)=>s+c.births,0)}
/* доля людей мира, у кого доход в месяц ниже заданного (смесь распределений 172 стран по населению) */
function worldIncomePctl(monthly){
  if(!SIG)SIG=COUNTRIES.map(c=>[c,Math.SQRT2*ndtri((c.gini/100+1)/2)]);
  let s=0,t=0;for(const [c,sg] of SIG){const mean=c.gdp*0.55*(calOf(c).ki||1)/12;s+=c.pop*ncdf((Math.log(Math.max(1,monthly)/mean)+sg*sg/2)/sg);t+=c.pop}
  return Math.round(s/t*100)}

/* --- семейный быт, ещё больше обычной жизни --- */
const KIND_LIST=DAILY;
KIND_LIST.push(
{id:'teething',ages:[0,1],w:()=>1,fire:L=>{L.adj({rel:1});return {k:'info',t:'У вас резались зубы: родители месяц не спали ночами.'}}},
{id:'lullaby',ages:[0,3],w:(L,x,c)=>['SA','ME','CA','SSA','EA','EE'].includes(c.region)?1:0.5,fire:L=>{L.adj({rel:3});return {k:'info',t:pick(['Бабушка пела вам колыбельные — те же, что пела маме.','Засыпали вы только под папину сказку про волка.'])}}},
{id:'babyBath',ages:[0,1],w:L=>L.home2&&!L.home2.water?2:0,fire:L=>({k:'info',t:'Купали вас в тазике: воду носили издалека и грели на огне.'})},
{id:'firstHaircut',ages:[1,3],w:()=>0.8,fire:L=>({k:'info',t:'Первая стрижка: вы рыдали, а мама сохранила локон в конверте.'})},
{id:'shoulders',ages:[1,5],w:L=>L.dad?1:0,fire:L=>{L.adj({rel:3,mood:3});return {k:'info',t:'На праздниках папа носил вас на плечах — так было видно всё.'}}},
{id:'darkFear',ages:[3,7],w:()=>0.8,fire:L=>({k:'info',t:L.home2&&!L.home2.elec?'Вы боялись темноты, а свет в доме был только от свечи.':'Вы боялись темноты и спали только с включённым ночником.'})},
{id:'cartoons',ages:[2,8],w:L=>L.home2&&L.home2.elec?1:0,fire:L=>{L.adj({mood:3});return {k:'info',t:'Любимый мультик вы смотрели каждый день, пока родители не выучили его наизусть.'}}},
{id:'helpCook',ages:[4,9],w:()=>0.9,fire:(L,x,c)=>{L.adj({rel:2});return {k:'info',t:`Вы помогали маме лепить ${{CA:'манты',SA:'лепёшки',ME:'лепёшки',EA:'пельмени',EE:'пирожки',LA:'тортильи',SSA:'лепёшки',HI:'печенье'}[c.region]||'пирожки'} — больше муки было на вас, чем на тесте.`}}},
{id:'yardKids',ages:[3,11],w:L=>L.rural?0.6:1,fire:L=>{L.adj({mood:3,rel:2});return {k:'info',t:L.rural?'С соседскими детьми вы целыми днями пропадали у реки.':'Во дворе целая компания детей: прятки и догонялки до темноты.'}}},
{id:'firstSnow',ages:[2,6],w:(L,x,c)=>['EE','CA','HI'].includes(c.region)?1:0,fire:L=>{L.adj({mood:4});return {k:'info',t:'Первый снег, который вы запомнили: снеговик получился кривой, но свой.'}}},
{id:'rainSeason',ages:[2,10],w:(L,x,c)=>['SSA','SA','EA','LA'].includes(c.region)?1:0,fire:L=>{L.adj({mood:2});return {k:'info',t:'Сезон дождей: двор превратился в море, а вы — в мокрого моряка.'}}},
{id:'sweets',ages:[3,8],w:()=>0.7,fire:L=>{L.adj({mood:2,rel:-1});return {k:'info',t:'Вы тайком съели все конфеты, припасённые к празднику. Влетело.'}}},
{id:'carryWater',ages:[5,14],w:L=>L.home2&&!L.home2.water?2:0,fire:L=>{L.adj({rel:1,mood:-2});return {k:'info',t:'Каждое утро вы с мамой ходите за водой — далеко и тяжело.'}}},
{id:'noLight',ages:[6,15],w:L=>L.home2&&!L.home2.elec&&L.inSchool?2:0,fire:L=>{L.adj({know:-1});return {k:'info',t:'Уроки приходится делать засветло: вечером в доме нет света.'}}},
{id:'smoke',ages:[0,10],w:L=>L.home2&&!L.home2.cook?1.2:0,fire:L=>{L.adj({hp:-0.004});return {k:'info',t:'В доме всегда пахнет дымом: еду готовят на дровах и угле.'}}},
{id:'handMeDowns',ages:[4,14],w:L=>L.sibs>0&&L.zf<0?1.2:0,fire:L=>({k:'info',t:'Вы донашиваете одежду за старшими. Новые вещи — только по праздникам.'})},
{id:'newShoes',ages:[5,14],w:L=>L.zf<-0.3?1:0,fire:L=>{L.adj({mood:4});return {k:'info',t:'Новые ботинки купили впервые за три года. Вы берегли их как сокровище.'}}},
{id:'tvEvening',ages:[3,12],w:L=>L.home2&&L.home2.elec?0.8:0,fire:L=>{L.adj({rel:2});return {k:'info',t:'По вечерам вся семья смотрит один сериал и спорит, кто прав.'}}},
{id:'dadAway',ages:[3,15],w:(L,x,c)=>L.dad&&L.zf<0&&['CA','SA','LA','SSA','EE'].includes(c.region)?0.7:0,fire:L=>{L.adj({rel:-3,mood:-3,shock:0.05});L.flags.dadAway=true;return {k:'info',t:'Папа уехал на заработки далеко от дома. Теперь вы видите его раз в год.'}}},
{id:'grandmaHome',ages:[0,12],w:(L,x,c)=>['SA','ME','CA','SSA','EA'].includes(c.region)?0.8:0.3,fire:L=>{L.adj({rel:3});return {k:'info',t:'С вами живёт бабушка: она главная по кухне, сказкам и строгости.'}}},
{id:'animals',ages:[4,13],w:L=>L.rural?1.2:0,fire:L=>{L.adj({rel:1});return {k:'info',t:pick(['Вам доверили следить за курами. Вы дали каждой имя.','Каждое утро вы выгоняете коз на пастбище.','Вы научились запрягать осла и очень этим гордитесь.'])}}},
{id:'uniform',ages:[6,7],w:L=>L.eduPlan>0&&L.zf<0?1.5:0,fire:L=>({k:'info',t:'К школе мама купила форму и тетради на последние деньги.'})},
{id:'readSigns',ages:[5,8],w:()=>0.8,fire:L=>{L.adj({know:2});return {k:'info',t:'Вы научились читать сами — по вывескам магазинов на улице.'}}},
{id:'cousins',ages:[3,14],w:()=>0.8,fire:L=>{L.adj({mood:4,rel:2});return {k:'info',t:'Приехали двоюродные братья и сёстры — неделю дом стоял вверх дном.'}}},
{id:'momSick',ages:[5,15],w:L=>L.mom?0.5:0,fire:L=>{L.adj({rel:2,mood:-2});return {k:'info',t:'Мама слегла с простудой, и неделю вы сами готовили завтрак на всех.'}}},
{id:'familyPhoto',ages:[0,10],w:()=>0.5,fire:L=>({k:'info',t:'Сделали первое фото всей семьи. Оно до сих пор висит на стене.'})},
{id:'diary',ages:[11,16],w:()=>0.6,fire:L=>({k:'info',t:'Вы завели дневник и прятали его под матрасом.'})},
{id:'haircut',ages:[13,17],w:()=>0.6,fire:L=>{L.adj({mood:2,rel:-1});return {k:'info',t:'Вы сделали смелую стрижку. Родители не оценили, друзья — в восторге.'}}},
{id:'gaming',ages:[10,18],w:L=>L.home2&&L.home2.net?1:0,fire:L=>{L.adj({mood:3,know:-1});return {k:'info',t:'Вы ночами играли в компьютерные игры, а утром спали на уроках.'}}},
{id:'kitchenTalk',ages:[20,95],w:L=>L.married?0.7:0,fire:L=>{L.adj({rel:3,mood:2});return {k:'info',t:`Лучшие разговоры с ${L.spouse} — ночью на кухне, за чаем.`}}},
{id:'diy',ages:[25,70],w:()=>0.5,fire:L=>{L.adj({mood:2,shock:0.02});return {k:'info',t:'Всё лето делали ремонт своими руками. Обои немного криво, зато сами.'}}},
{id:'feastCook',ages:[25,85],w:()=>0.5,fire:L=>{L.adj({rel:2});return {k:'info',t:'На праздник вы готовили на двадцать человек и два дня мыли посуду.'}}},
{id:'commute',ages:[20,64],w:L=>L.working&&!L.rural?0.6:0,fire:L=>{L.adj({mood:-2,stress:0.3});return {k:'info',t:'Дорога на работу — полтора часа в одну сторону. Вы выучили все остановки.'}}},
{id:'salaryLate',ages:[18,64],w:(L,x,c)=>L.working&&!L.biz&&(c.gdp<15000||L.zEff()<-0.3)?0.6:0,fire:L=>{L.adj({shock:-0.1,mood:-4});return {k:'info',t:'Зарплату задержали на два месяца. Жили в долг у соседей.'}}},
{id:'bonus',ages:[20,64],w:L=>L.working?0.5:0,fire:L=>{L.adj({shock:0.08,mood:4});return {k:'info',t:'Неожиданная премия к празднику. Купили всем подарки.'}}},
{id:'kidWord',ages:[16,70],w:L=>kidName(L,1,2)?1:0,fire:L=>{const k=kidName(L,1,2);L.adj({mood:5});return {k:'info',t:`${k.name} ${heShe(k,'сказал','сказала')} первое слово. Конечно, «${pick(['мама','папа','дай'])}».`}}},
{id:'kidDrawing',ages:[18,75],w:L=>kidName(L,4,7)?0.8:0,fire:L=>{const k=kidName(L,4,7);L.adj({mood:4});return {k:'info',t:`${k.name} ${heShe(k,'нарисовал','нарисовала')} всю семью. У вас на рисунке огромные уши.`}}},
{id:'teenKid',ages:[28,80],w:L=>kidName(L,14,17)?0.8:0,fire:L=>{const k=kidName(L,14,17);L.adj({mood:-2,rel:-1});return {k:'info',t:`${k.name} почти не разговаривает с вами и всё время в телефоне. Возраст такой.`}}},
{id:'scamCall',ages:[40,95],w:(L,x,c)=>c.gdp>5000?0.5:0,fire:L=>({k:'info',t:'Позвонили «из банка» и попросили код из СМС. Вы вовремя бросили трубку.'})},
{id:'oldSong',ages:[35,95],w:()=>0.5,fire:L=>{L.adj({mood:3});return {k:'info',t:'По радио играла песня вашей юности. Весь день ходили с улыбкой.'}}},
{id:'doctorQueue',ages:[55,105],w:()=>0.5,fire:L=>{L.adj({mood:-2});return {k:'info',t:'Полдня в очереди к врачу. Зато узнали все новости района.'}}},
{id:'pensionRaise',ages:[63,105],w:L=>L.retired?0.6:0,fire:(L,x,c)=>{L.adj({mood:c.gdp>15000?2:-1});return {k:'info',t:c.gdp>15000?'Пенсию немного проиндексировали.':'Пенсии хватает только на хлеб и лекарства. Помогают дети.'}}},
{id:'grandSummer',ages:[50,95],w:L=>L.grandkids>0?0.8:0,fire:L=>{L.adj({mood:5,stress:0.2});return {k:'info',t:'Внуки всё лето жили у вас. Устали, но счастливы.'}}}
);

/* Быт семьи при рождении: электричество, вода, туалет, чистое топливо для готовки, интернет — по доле в городе или деревне.
   Внутри страны удобств чаще нет у бедных семей: место в очереди — по достатку семьи с примесью случайности. */
function homeAccess(L,c,key){const v=c[key+(L.rural?'R':'U')]!=null?c[key+(L.rural?'R':'U')]:c[key];if(v==null)return true;
  const rank=ncdf((L.zf+(L.rural?0.35:0)+0.6*gauss())/1.17);return rank>1-clamp(v/100,0,1)}
function makeHome(L,c){const h={elec:homeAccess(L,c,'elec'),water:homeAccess(L,c,'water'),toilet:homeAccess(L,c,'sanit'),cook:homeAccess(L,c,'cook'),net:homeAccess(L,c,'net')};if(!h.elec)h.net=false;return h}
function homeText(L,c){const h=L.home2,a=[];
  const n=2+L.sibs+1+(['SA','ME','CA','SSA','EA'].includes(c.region)&&Math.random()<0.5?1+Math.floor(Math.random()*2):0);
  const rooms=clamp(Math.round(1+ncdf(L.zf)*3+(L.rural?0.5:0)),1,5);
  a.push(`В доме ${n} ${plural(n,['человек','человека','человек'])} и ${rooms} ${plural(rooms,['комната','комнаты','комнат'])}.`);
  if(!h.elec)a.push('Электричества нет: вечером сидят при свече или фонарике.');
  if(!h.water)a.push(L.rural?'Воду носят из реки или колодца далеко от дома.':'Чистой воды в доме нет — её покупают или носят из колонки.');
  else if(h.water&&ncdf(L.zf)>0.5&&c.gdp>8000)a.push('Есть водопровод и горячая вода.');
  if(!h.toilet)a.push('Нормального туалета нет — только яма во дворе.');
  if(!h.cook)a.push('Еду готовят на дровах или угле прямо в доме.');
  if(h.net)a.push('Дома есть интернет.');
  return a.join(' ')}
/* удобства со временем появляются: страны развиваются, люди переезжают */
EVENTS.push({id:'homeUpgrade',ages:[0,112],when:L=>L.home2&&(!L.home2.elec||!L.home2.water||!L.home2.toilet||!L.home2.cook||!L.home2.net),p:(L,x,c)=>clamp(0.06+0.08*ncdf(L.zEff())+(c.gdp>10000?0.06:0),0.03,0.25),
  fire:(L,x,c)=>{const h=L.home2;const miss=['elec','water','toilet','cook','net'].filter(k=>!h[k]&&(k!=='net'||h.elec));if(!miss.length)return null;const k=miss[0]==='net'&&miss.length>1&&Math.random()<0.5?miss[1]:miss[0];h[k]=true;
    L.adj({mood:5});return {k:'mile',t:{elec:'В дом провели электричество! Первый вечер все сидели и смотрели на лампочку.',water:'В дом провели воду. Больше не нужно носить вёдра.',toilet:'Во дворе построили настоящий туалет.',cook:'Купили газовую плиту — в доме больше нет дыма.',net:'Дома появился интернет.'}[k]}}});

/* ИИ: готовые бытовые события и выборы. Эффекты — только из фиксированного набора, их величину задаёт движок. */
const TAG_FX={'mood+':{mood:5},'mood-':{mood:-5},'rel+':{rel:4},'rel-':{rel:-4},'know+':{know:3},'know-':{know:-2},'health+':{hp:0.008},'health-':{hp:-0.008},'money+':{shock:0.06},'money-':{shock:-0.06},'stress+':{stress:0.5},'stress-':{stress:-0.5}};
const TAG_TEXT={'mood+':up('настроение'),'mood-':down('настроение'),'rel+':up('отношения'),'rel-':down('отношения'),'know+':up('знания'),'know-':down('знания'),'health+':up('здоровье'),'health-':down('здоровье'),'money+':up('деньги'),'money-':down('деньги'),'stress+':up('стресс'),'stress-':down('стресс')};

/* ===== Life ===== */
class Life{
  constructor(o={}){
    this.auto=!!o.auto;this.soft=!!o.soft;
    const c=o.country||pickCountry(o.mode||'births');
    this.home=c;this.c=c;this.sex=Math.random()<0.512?'m':'f';
    this.name=pickName(c,this.sex);this.born=o.year||new Date().getFullYear();
    this.age=0;this.alive=true;this.focus='study';
    this.rural=Math.random()<ruralShare(c);
    this.zf=ndtri(clamp(Math.random(),0.005,0.995))-(this.rural?0.35:0);
    this.zp=null;this.shock=0;
    this.sigma=Math.SQRT2*ndtri((c.gini/100+1)/2);
    this.q=getTable(c,this.sex);
    const E=c.school*1.08-(this.sex==='f'?c.cm/100*2.5:0);
    this.eduPlan=Math.round(clamp(E+1.6*this.zf+gauss()*2.2,0,12));
    this.eduDone=0;this.inSchool=false;this.uni=false;this.uniLeft=0;this.degree=false;this.studyPts=0;
    this.working=false;this.job=null;this.homemaker=false;this.retired=false;this.childWork=false;
    this.married=false;this.spouse=null;this.spDiff=0;this.everMarried=false;this.childBride=false;this.widowed=false;
    this.kids=[];this.pregnant=false;this.homeBirth=false;this.lostKids=0;
    this.smoker=false;this.quitAges=[];this.ill=null;this.illMult=1;
    this.migrated=false;this.migOffered=false;this.cityOffered=false;
    this.flags={};this.peak=0;this.cause=null;this.causeKey=null;
    this.momAge=Math.round(clamp(gauss()*5+23+(c.fert<2?5:0)-c.cm/20,15,44));
    this.dadAge=this.momAge+Math.round(clamp(3+gauss()*3,0,15));
    this.mom=true;this.dad=true;
    /* этап 2: привычки, стресс, армия, жильё, деньги, старость */
    this.stress=0;this.active=false;this.crowd=null;this.drinker=false;this.drinkStopped=false;
    this.serveLeft=0;this.served=false;this.major=null;this.college=false;this.collegeLeft=0;this.love=null;
    this.biz=null;this.housing=null;this.mortLeft=0;this.debt=0;this.caring=null;this.withKids=false;this.helpGrand=false;this.grandkids=0;
    this.exSpouse=null;this.divAge=null;this.yearRisk=1;this.retExtra=0;this.pensionBoost=1;this.careBonus=1;this.history=[];
    /* этап 3: мечта */
    this.dream=null;this.dreamScore=0;this.dreamWins=0;this.dreamGaveUp=false;this.forkAt=null;this.forksDone=0;
    /* этап 4: отметки ключевых событий для нити жизни и журнал дохода для графика */
    this.marks=[];this.incomeLog=[];
    /* этап 5: показатели и мир */
    this.know=0;this.mood=0;this.hp=0;this.young=0;this.marriedAt=null;
    this.rel=Math.round(clamp(60+8*this.zf-(this.sibs>4?5:0),25,90));
    this.world=o.world||makeWorld(this.born,Math.floor(Math.random()*4294967296));
    /* быт семьи и защита от повторов; aiCover / aiChoiceAges — годы, для которых события и выборы пишет ИИ */
    this.home2=makeHome(this,c);this.home2.r0=this.rural;this.home2.c0=c.code;this.seen={};this.aiCover=new Set();this.aiChoiceAges=new Set();
    this.sibs=poisson(Math.max(0,c.fert-1)*0.7);
    this.lines=[];
  }
  g(m,f){return this.sex==='m'?m:f}
  get cal(){return calOf(this.c)}
  /* поправки показателей: L.adj({mood, rel, know, hp, stress, shock}) */
  adj(o){if(o.mood)this.mood=clamp(this.mood+o.mood,-40,40);if(o.rel)this.rel=clamp(this.rel+o.rel,0,100);if(o.know)this.know=clamp(this.know+o.know,0,100);
    if(o.hp)this.hp=clamp(this.hp+o.hp,-0.5,0.3);if(o.stress)this.stress=Math.max(0,this.stress+o.stress);if(o.shock)this.shock+=o.shock}
  /* здоровье на экране: возраст и всё, что входит в личный риск смерти */
  /* здоровье: риск умереть в этом году по сравнению с ровесником в Японии (самая долгая жизнь среди больших стран), плюс возраст */
  health(){if(!this.alive)return 0;const x=Math.min(this.age,MAXAGE-1),ref=BY.JP||COUNTRIES[0];
    const qr=getTable(ref,this.sex)[x],q=this.qNow(x);
    return Math.round(clamp(100-(x>30?(x-30)*0.55:0)-12*Math.log(Math.max(1,q/qr)),2,100))}
  happy(){const c=this.c;return Math.round(clamp(c.sat*10+this.mood-5*Math.min(this.stress,6)+(this.married?4:0)+(this.kids.some(k=>k.alive)?3:0)-(this.ill?8:0)+(this.rel-60)*0.15,2,100))}
  stats(){const inc=this.income();return {health:this.health(),know:Math.round(this.know),happy:this.happy(),rel:Math.round(this.rel),wealth:this.pctl(),world:worldIncomePctl(inc)}}
  zEff(){return (this.zp===null?this.zf:this.zp-this.cal.zb)+this.shock}
  incomeAt(z,c){c=c||this.c;const mean=c.gdp*0.55*(calOf(c).ki||1);return mean*Math.exp(this.sigma*z-this.sigma*this.sigma/2)/12}
  income(){let v=this.incomeAt(this.zEff());if(this.retired)v*=0.6*this.pensionBoost*(this.housing==='own'?1.1:1);return v}
  pctl(){return Math.round(ncdf(this.zEff())*100)}
  mult(x){
    let w=Math.exp(-0.28*this.zEff())/Math.exp(0.0392);if(x<5)w=Math.pow(w,0.7);
    let m=w;const s=this.c.smoke/100;
    if(x>=35)m*=this.smoker?1.35/(1+0.35*s):1/(1+0.35*s);
    m*=this.illMult;
    if(x>=6)m*={health:0.92,study:1,family:0.98,money:1.04}[this.focus]||1;
    const dr=DRINK[this.c.region]||DRINK.HI,dp=this.sex==='m'?dr[0]:dr[1],dk=this.c.region==='EE'?1.45:1.25;
    if(x>=30)m*=this.drinker?dk/(1+(dk-1)*dp):1/(1+(dk-1)*dp);
    if(x>=18)m*=1+0.04*Math.min(this.stress,5);
    if(this.active&&x>=25)m*=0.96;
    if(this.withKids||this.helpGrand)m*=0.96;
    m*=this.careBonus*this.yearRisk;
    if(x>=5)m*=Math.exp(-this.hp);
    else if(this.home2){const c=this.c,h=this.home2,f=(has,share,k)=>has?1/(1+k*(1-share)):(1+k)/(1+k*(1-share));
      m*=f(h.water,(c.water||100)/100,0.15)*f(h.toilet,(c.sanit||100)/100,0.1)*f(h.cook,(c.cook||100)/100,0.08)}
    return m;
  }
  qNow(x){const qb=this.q[Math.min(x,MAXAGE)];const k=x>=5?this.cal[this.sex]:1;return qb>=1?1:1-Math.pow(1-qb,this.mult(x)*k)}
  init(){
    const c=this.c,ev=[];this.logIncome();
    ev.push({k:'mile',t:`Вы родились ${c.inName}, ${this.rural?'в деревне':'в городе'}. ${this.g('Мальчик','Девочка')}, вас назвали ${this.name}.`});
    const inc=this.incomeAt(this.zf),p=Math.round(ncdf(this.zf)*100);
    ev.push({k:'info',t:`Семья живёт примерно на ${money(inc)} в месяц на человека (по паритету покупательной способности). ${p<50?`Беднее, чем ${100-p}% семей страны.`:`Богаче, чем ${p}% семей страны.`}`});
    ev.push({k:'info',t:homeText(this,c)});
    ev.push({k:'info',t:`Маме ${yrs(this.momAge)}, папе ${yrs(this.dadAge)}. ${this.sibs?`У вас ${this.sibs} ${plural(this.sibs,['старший брат или сестра','старших брата или сестры','старших братьев и сестёр'])}.`:'Вы первый ребёнок в семье.'}`});
    const n=Math.round(1000/c.u5);
    ev.push({k:'stat',t:`${c.inName[0].toUpperCase()+c.inName.slice(1)} примерно ${n<=40?`каждый ${n}-й ребёнок`:`один ребёнок из ${n}`} не доживает до пяти лет.`});
    return ev;
  }
  /* decisions for the start of the year */
  beginYear(){
    const x=this.age,c=this.c,ds=[];if(!this.alive)return ds;
    if(this.flags.leaveDecision){this.flags.leaveDecision=false;
      ds.push({id:'stay',title:'Семье нужны рабочие руки',text:`Вы закончили ${this.eduDone} ${plural(this.eduDone,['класс','класса','классов'])}. Дома не хватает денег, и родители думают, не пора ли вам работать.`,
        opts:[{label:'Остаться в школе',hint:'Ещё пара лет учёбы, но семье станет тяжелее',w:0.35,fn:()=>{this.eduPlan=Math.min(12,this.eduPlan+2);this.zf-=0.08;return 'Вы остались в школе. Семья затянула пояса.'}},
              {label:'Уйти и работать',hint:'Деньги нужны сейчас',w:0.65,fn:()=>{this.inSchool=false;return `Вы ушли из школы после ${this.eduDone} ${plural(this.eduDone,['класса','классов','классов'])}.`}}]});
    }
    if(this.flags.uniDecision){this.flags.uniDecision=false;
      const pDone=clamp(c.school/12,0.25,1);const ch=clamp(c.tert/100*Math.exp(0.5*this.zEff())/pDone*clamp(Math.exp(0.02*(this.know-40)),0.5,1.8),0.03,0.95);
      ds.push({id:'uni',title:'Школа окончена',text:`Вы окончили школу. ${c.inName[0].toUpperCase()+c.inName.slice(1)} в вузы поступает около ${Math.round(c.tert)}% молодых людей.`,
        opts:[{label:'Поступать в университет',hint:`Шанс поступить примерно ${Math.round(ch*100)}%`,w:ch,fn:()=>{if(Math.random()<ch){this.uni=true;this.uniLeft=4;this.flags.majorDecision=true;return 'Вы поступили в университет.'}this.flags.collegeDecision=true;return 'Поступить не получилось.'}},
              {label:'Не поступать',hint:'Колледж или работа',w:1-ch,fn:()=>{this.flags.collegeDecision=true;return 'Вы решили не поступать в университет.'}}]});
    }
    if(!this.married&&!this.childBride&&x>=18&&x<70){
      let p=(x<35?0.13:x<50?0.05:0.012)*(0.6+this.rel/125);if(this.focus==='family')p*=1.5;if(this.widowed)p*=0.5;
      if(this.love&&x<30)p*=1.3;
      if(Math.random()<p){const old=this.love&&x<30&&Math.random()<0.35;const sp=old?this.love:pickName(c,this.sex==='m'?'f':'m');this.love=null;
        ds.push({id:'marry',title:'Встреча',text:old?`Вы по-прежнему вместе с ${sp}. Пора решать, что дальше.`:`Вы встретили человека по имени ${sp}. Кажется, это серьёзно.`,
          opts:[{label:'Пожениться',hint:'Создать семью',w:0.85,fn:()=>{this.marry(sp,x+Math.round(gauss()*3));return `Вы поженились с ${sp}.`}},
                {label:'Пока нет',hint:'Не торопиться',w:0.15,fn:()=>'Вы решили не торопиться.'}]});}
    }
    // pregnancy
    if(this.married&&this.alive){const wAge=this.sex==='f'?x:this.spouseAge;
      if(wAge>=16&&wAge<=44){let p=clamp(c.fert/16,0.04,0.45);if(c.fert<1.5)p*=0.8;if(this.kids.length>=Math.max(1,Math.round(c.fert+1)))p*=0.3;if(this.focus==='family')p*=1.3;if(this.flags.noMoreKids)p*=0.15;if(this.flags.wantUntil>=x)p*=2.5;
        if(Math.random()<p){this.pregnant=true;this.homeBirth=false;
          if(c.mmr>=80){const hp=clamp(0.35+0.55*ncdf(this.zEff())-(this.rural?0.15:0),0.1,0.95);
            ds.push({id:'birth',title:this.sex==='f'?'Вы ждёте ребёнка':'Ваша жена ждёт ребёнка',text:`${c.inName[0].toUpperCase()+c.inName.slice(1)} на 100 000 родов умирает около ${c.mmr} женщин. Больница ${this.rural?'далеко, ':''}и стоит денег.`,
              opts:[{label:'Рожать в больнице',hint:'Безопаснее, но дорого',w:hp,fn:()=>{this.homeBirth=false;this.shock-=0.12;return 'Решено рожать в больнице.'}},
                    {label:'Рожать дома',hint:'Бесплатно, но риск выше',w:1-hp,fn:()=>{this.homeBirth=true;return 'Решено рожать дома.'}}]});}}}
    }
    if(!this.migrated&&!this.migOffered&&x>=20&&x<=35&&c.gdp<35000){
      if(Math.random()<0.015*(1+0.4*this.zEff())){this.migOffered=true;const d=this.pickDest();
        if(d)ds.push({id:'mig',title:'Шанс уехать',text:`Знакомые зовут работать: ${d.name}. Средний доход там примерно в ${Math.max(2,Math.round(d.gdp/c.gdp))} раза выше, но вы будете чужим.`,
          opts:[{label:`Уехать (${d.name})`,hint:'Получится не у всех',w:0.4,fn:()=>this.migrate(d)},
                {label:'Остаться дома',hint:'Рядом семья и свой язык',w:0.6,fn:()=>'Вы остались дома.'}]});}
    }
    if(this.rural&&!this.cityOffered&&!this.migrated&&x>=17&&x<=32&&Math.random()<0.06){this.cityOffered=true;
      ds.push({id:'city',title:'Переехать в город?',text:'В городе больше работы и выше зарплаты, но жильё дорогое, а родные останутся в деревне.',
        opts:[{label:'Переехать в город',hint:'Доход обычно растёт',w:0.45,fn:()=>{this.rural=false;if(this.zp!==null)this.zp+=0.25;else this.zf+=0.15;return 'Вы переехали в город.'}},
              {label:'Остаться в деревне',hint:'Привычная жизнь',w:0.55,fn:()=>'Вы остались в деревне.'}]});}
    if(this.smoker&&[35,45,55].includes(x)){
      ds.push({id:'quit',title:'Сигареты',text:'Врач говорит, что курение уже сказывается на здоровье.',
        opts:[{label:'Бросить курить',hint:'Получается примерно у 40%',w:0.35,fn:()=>{if(Math.random()<0.4){this.smoker=false;return 'Вы бросили курить.'}return 'Бросить не получилось.'}},
              {label:'Не сейчас',hint:'',w:0.65,fn:()=>'Вы продолжили курить.'}]});}
    if(x>=40&&!this.ill&&Math.random()<0.012*Math.exp(0.05*(x-40))){
      const ill=pick(['болезнь сердца','опухоль','диабет с осложнениями','болезнь почек','болезнь лёгких']);this.ill=ill;this.mark('ill','Диагноз: '+ill);
      const poor=c.gdp<20000;const months=Math.round(clamp((poor?10:3)/Math.exp(0.6*this.zEff()),1,60));
      const tp=clamp(0.5+0.4*ncdf(this.zEff()),0.2,0.95);
      ds.push({id:'ill',title:'Диагноз',text:`Врачи нашли у вас серьёзную болезнь: ${ill}.`,
        opts:[{label:'Лечиться',hint:`Обойдётся примерно в ${months} ${plural(months,['месячный доход','месячных дохода','месячных доходов'])}`,w:tp,fn:()=>{const early=this.flags.checked!=null&&this.age-this.flags.checked<=5;this.illMult=early?1.1:1.2;this.shock-=poor?0.45:0.12;return early?'Болезнь нашли на ранней стадии благодаря обследованию. Вы начали лечение.':'Вы начали лечение.'}},
              {label:'Не лечиться',hint:'Сохранить деньги семье',w:1-tp,fn:()=>{this.illMult=1.9;return 'Вы решили не лечиться.'}}]});
    }
    // мечта: вопрос в 10 лет и развилки в 14–16, 22–25 и 35–45 лет (вне лимита в два решения)
    if(x===10&&!this.dream&&!this.flags.dreamAsked){this.flags.dreamAsked=true;ds.push(this.dreamQuestion())}
    if(this.dream&&!this.dreamGaveUp&&this.forkAt&&this.forkAt[this.forksDone]===x){const st=++this.forksDone;ds.push(this.buildFork(st,forkTemplate(this,st)))}
    // выборы этапа 2: не больше двух за год, чтобы год не превращался в анкету
    let extra=0;
    if(this.alive&&x>=8&&!this.aiChoiceAges.has(x)&&Math.random()<0.32){if(!CH_AGE)CH_AGE=byAge(CHOICES);
      const C=pickWeighted(CH_AGE[Math.min(x,MAXAGE)],this,x,c);
      if(C){const d=C.make(this,x,c);if(d){this.seen[C.id]=(this.seen[C.id]||0)+1;d.everyday=true;ds.push(d)}}}
    if(!DEC_AGE)DEC_AGE=byAge(DECISIONS);
    for(const D of DEC_AGE[Math.min(x,MAXAGE)]){if(extra>=2)break;if(!this.alive||!D.when(this,x,c))continue;const d=D.make(this,x,c);if(d){d.stage=D.stage;ds.push(d);extra++}}
    return ds;
  }
  autoChoice(d){return wpick(d.opts.map((o,i)=>[i,Math.max(0.0001,o.w)]))}
  resolve(d,i){const r=d.opts[i].fn();this.history.push({age:this.age,id:d.id,opt:i,label:d.opts[i].label});return r}
  /* ИИ: применить метки эффектов (не больше трёх) */
  applyTags(tags){for(const t of (tags||[]).slice(0,3))if(TAG_FX[t])this.adj(TAG_FX[t])}
  /* ИИ: бытовой выбор из готового текста; эффекты — только метки, их сила задана движком */
  buildAIChoice(spec){return {id:'aiChoice',stage:'жизнь',src:'ai',everyday:true,title:String(spec.title).slice(0,60),text:String(spec.text).slice(0,300),
    opts:spec.options.slice(0,3).map(o=>({label:String(o.label).slice(0,60),hint:(o.tags||[]).slice(0,3).map(t=>TAG_TEXT[t]).filter(Boolean).join(' · '),w:1,
      fn:()=>{this.applyTags(o.tags);return String(o.result||'Решено.').slice(0,200)}}))}}
  /* ключевое событие на нити жизни */
  mark(key,label){this.marks.push({age:this.age,key,label})}
  /* фаза жизни: детство, учёба, работа, старость */
  phase(){if(!this.alive)return 'dead';const a=this.age;if(a<6)return 'child';if(this.inSchool||this.uni||this.college||a<15)return 'school';if(this.retired||a>=65)return 'old';return 'work'}
  logIncome(){this.incomeLog.push({age:this.age,inc:Math.round(this.income()),avg:Math.round(avgIncome(this.c)),ph:this.phase(),hap:this.happy(),hl:this.health(),kn:Math.round(this.know)});
    if(this.age>=25&&this.age<=60&&this.zp!==null){this.zSum=(this.zSum||0)+this.zEff();this.zN=(this.zN||0)+1}}
  /* положение в обществе своей страны за взрослую жизнь (для «параллельных жизней») */
  zMean(){return this.zN?this.zSum/this.zN:this.zf}
  /* ---- мечта ---- */
  dreamQuestion(){const pool=DREAM_PRESETS.slice(),pre=[];
    while(pre.length<4){const q=wpick(pool.map(v=>[v,v[1]]));pool.splice(pool.indexOf(q),1);pre.push(q[0])}
    return {id:'dream',input:true,stage:'мечта',title:'Кем ты хочешь стать?',text:'Вам десять лет. Напишите своими словами, кем мечтает стать этот ребёнок, или выберите вариант.',
      opts:pre.map(v=>({label:'Стать '+v,hint:'',w:1,fn:()=>this.setDream(Object.assign(classifyDreamLocal(v),{title:'Стать '+v,text:v}))}))}}
  setDream(p){const s=SPHERES[p.sphere]?p.sphere:'other';
    this.dream={text:String(p.text||p.title).slice(0,200),title:String(p.title).slice(0,60),sphere:s,edu:p.edu||SPHERES[s].edu,needUni:!!p.needUni,needMove:!!p.needMove,
      difficulty:clamp(Math.round(p.difficulty)||3,1,5),short:String(p.short||'').slice(0,240),src:p.src||'local'};
    this.forkAt=FORK_AGES.map(([a,b])=>a+Math.floor(Math.random()*(b-a+1)));this.forksDone=0;
    this.mark('dream','Мечта: '+this.dream.title);
    return `Мечта: ${this.dream.title}.`}
  /* шанс варианта считает только движок: трудность мечты, страна, достаток, образование и прошлые успехи */
  dreamChance(k){const d=this.dream,c=this.c,z=this.zEff();
    let p=[0.8,0.68,0.55,0.42,0.3][d.difficulty-1];
    if(d.needUni)p*=this.degree?1.25:clamp(0.35+c.tert/100,0.4,1.1);
    p*=clamp(0.6+0.15*Math.log(c.gdp/3000),0.45,1.15);
    p*=clamp(Math.exp(0.22*z),0.6,1.5);
    if(d.needMove&&this.rural)p*=0.75;
    // там, где много детских браков, у девочек меньше дорог в спорт, науку, армию и авиацию
    if(this.sex==='f'&&c.cm>20&&['sport','military','transport','science'].includes(d.sphere))p*=0.8;
    p*=1+0.12*Math.min(this.dreamWins,3);
    p*=clamp(Math.exp(0.008*(this.know-45)),0.75,1.3);
    if(k==='money')p*=z>0?1.05:0.65;
    return clamp(p*KIND[k][0],0.03,0.95)}
  buildFork(stage,spec){
    const opts=spec.options.slice(0,3).map(o=>{const k=KIND[o.kind]?o.kind:'safe';
      if(k==='give_up')return {label:o.label,hint:o.hint||'',kind:k,w:0.15,fn:()=>{this.dreamGaveUp=true;this.stress=Math.max(0,this.stress-0.5);return 'Вы отпустили детскую мечту.'}};
      const p=this.dreamChance(k);
      return {label:o.label,hint:`${o.hint?o.hint+' · ':''}шанс примерно ${Math.round(p*100)}%`,kind:k,chance:p,w:0.25+p*0.5,fn:()=>this.forkResult(k,p,stage)}});
    return {id:'dreamFork',dreamFork:stage,stage:'мечта',title:spec.title,text:spec.text,opts,src:spec.src||'template'}}
  forkResult(k,p,stage){const ok=Math.random()<p;
    if(ok){this.dreamScore+=KIND[k][1];this.dreamWins++}else this.dreamScore-=k==='risk'?0.5:0.2;
    if(k==='study'){this.studyPts+=2;if(stage===1)this.eduPlan=Math.min(12,this.eduPlan+1)}
    if(k==='move'&&ok){this.rural=false;if(this.zp!==null)this.zp+=0.1}
    if(k==='risk'){if(ok){if(this.zp!==null)this.zp+=0.15}else{this.shock-=0.3;this.stress+=1}}
    if(k==='money'){this.shock-=0.25;if(ok&&this.zp!==null)this.zp+=0.1}
    if(k==='network'&&ok)this.dreamWins++;
    if(k==='safe'&&this.zp!==null)this.zp+=0.03;
    const T={study:['Учёба дала плоды: вы стали ближе к мечте.','Вы старались, но пока это не помогло.'],move:['Переезд открыл новые двери.','Переезд не дал того, на что вы надеялись.'],
      risk:['Риск оправдался: мечта стала ближе.','Рискнули — и проиграли. Пришлось начинать заново.'],safe:['Медленно, но вы двигаетесь к мечте.','Обычная жизнь отнимает все силы.'],
      network:['Нужные люди помогли вам.','Помощи найти не удалось.'],money:['Вложения окупились.','Деньги ушли, а мечта не приблизилась.']}[k];
    return ok?T[0]:T[1]}
  dreamOutcome(){if(!this.dream)return null;let s=this.dreamScore;
    const work=(this.major&&MAJOR_SPHERE[this.major])||(this.biz?'business':null)||(this.served&&this.dream.sphere==='military'?'military':null)||(/земл|ферм|скот|урожа/.test(this.job||'')?'agriculture':null);
    if(work===this.dream.sphere)s+=1.5;
    const need=2+(this.dream.difficulty-3)*0.4;
    let key=s>=need&&!this.dreamGaveUp?'yes':s>=need*0.45?'partly':'no';
    if(key!=='yes'&&(this.age<20||(key==='no'&&this.age<30)))key='early';
    return {key,score:+s.toFixed(2),title:DREAM_END[key][0],text:DREAM_END[key][1]}}
  divorce(){this.married=false;this.exSpouse=this.spouse;this.divAge=this.age;this.stress+=1;return `Вы развелись с ${this.spouse}.`}
  get spouseAge(){return this.age+(this.spDiff||0)}
  marry(sp,spAge){this.mark('ring','Свадьба: '+sp);this.marriedAt=this.age;this.adj({mood:10,rel:5});this.married=true;this.everMarried=true;this.spouse=sp;this.spDiff=clamp(spAge,14,90)-this.age;
    if(this.sex==='f'&&this.working&&['ME','SA'].includes(this.c.region)&&Math.random()<0.55){this.working=false;this.homemaker=true}}
  pickDest(){const list=(DEST[this.c.region]||DEST.HI).map(([k,w])=>[BY[k],w]).filter(([d])=>d&&d.code!==this.c.code&&d.gdp>this.c.gdp*1.2);return list.length?wpick(list):null}
  migrate(d){if(Math.random()<0.7){const from=this.c;this.c=d;this.migrated=true;this.mark('move','Переезд: '+d.name);this.rural=false;this.q=getTable(d,this.sex);this.sigma=Math.SQRT2*ndtri((d.gini/100+1)/2);
      if(this.zp!==null)this.zp=this.zp*0.5-0.6;else this.zp=-0.8;this.shock=0;if(this.dream&&this.dream.needMove&&!this.dreamGaveUp)this.dreamScore+=0.5;return `Вы уехали. Новая страна: ${d.name}. Первое время будет трудно.`}
    return 'Уехать не вышло: документы не одобрили.'}
  startWork(){const c=this.c,x=this.age;let tier;
    if(this.rural&&Math.random()<clamp(c.agri/100/ruralShare(c),0,0.95))tier='agri';
    else if(this.degree)tier='uni';else if(this.flags.collegeDone)tier='hi';else if(this.eduDone>=12)tier=Math.random()<0.6?'hi':'mid';else if(this.eduDone>=7)tier='mid';else tier='low';
    const mj=tier==='uni'&&this.major?MAJORS[this.major]:null;
    this.job=mj?mj[1][this.sex==='m'?0:1]:pick(JOBS[tier][this.sex]);this.working=true;if(!this.flags.firstJob){this.flags.firstJob=true;this.mark('work','Первая работа: '+this.job)}
    this.zp=0.55*this.zf+0.6*gauss()+0.12*(this.eduDone-c.school)+(this.degree?0.4:0)-(tier==='agri'?0.3:0)
      +(mj?mj[2]*(this.major==='it'&&c.gdp<15000?0.5:1):0)+(this.flags.honors?0.12:0)+(this.flags.uniWork?0.08:0)+(this.flags.collegeDone?0.15:0)+0.005*(this.know-40);
    return `${x<15?'Уже в '+yrs(x)+' вы':'Вы'} начали работать: ${this.job}.`}
  endYear(){
    const x=this.age,c=this.c,ev=[];if(!this.alive)return ev;
    this.yearRisk=1;
    // parents
    const qm=this.qm||(this.qm=getTable(this.home,'f')),qd=this.qd||(this.qd=getTable(this.home,'m'));const pw=Math.exp(-0.28*this.zf)/Math.exp(0.0392)*(this.caring==='home'||this.caring==='paid'?0.85:1);
    if(this.mom&&Math.random()<1-Math.pow(1-qm[Math.min(this.momAge+x,MAXAGE)],pw)){this.mom=false;this.stress+=1;this.flags.parentDied=x;ev.push({k:'sad',t:`Умерла ваша мама. Ей было ${yrs(this.momAge+x)}.`})}
    if(this.dad&&Math.random()<1-Math.pow(1-qd[Math.min(this.dadAge+x,MAXAGE)],pw)){this.dad=false;this.stress+=1;this.flags.parentDied=x;ev.push({k:'sad',t:`Умер ваш папа. Ему было ${yrs(this.dadAge+x)}.`})}
    if(this.caring&&!this.mom&&!this.dad)this.caring=null;
    // school
    if(x===6){if(this.eduPlan>0){this.inSchool=true;this.mark('school','Пошли в школу');ev.push({k:'mile',t:'Вы пошли в школу.'})}
      else ev.push({k:'info',t:this.rural?'В школу вы так и не пошли: до неё далеко, а дома нужна помощь.':'В школу вы так и не пошли: семье нечем платить за форму и учебники.'})}
    else if(this.inSchool){this.eduDone++;if(this.focus==='study')this.studyPts++;
      if(this.eduDone>=this.eduPlan){
        if(this.eduPlan<12&&this.studyPts>=3&&Math.random()<0.5){this.eduPlan++;this.studyPts=0;ev.push({k:'info',t:'Вы хорошо учились, и вас уговорили остаться ещё на год.'})}
        else if(this.eduDone>=12){this.inSchool=false;this.flags.uniDecision=true;this.mark('grad','Окончили школу');ev.push({k:'mile',t:'Вы окончили школу.'})}
        else if(this.eduDone>=4&&x<=16&&!this.flags.leaveAsked){this.flags.leaveAsked=true;this.flags.leaveDecision=true}
        else{this.inSchool=false;if(this.eduDone>=9)this.flags.collegeDecision=true;ev.push({k:'info',t:`Учёба закончилась после ${this.eduDone} ${plural(this.eduDone,['класса','классов','классов'])}.`})}}
    }
    if(this.college){this.collegeLeft--;if(this.collegeLeft<=0){this.college=false;this.flags.collegeDone=true;this.mark('grad','Окончили колледж');ev.push({k:'mile',t:'Вы окончили колледж и получили профессию.'})}}
    if(this.uni){this.uniLeft--;if(this.uniLeft<=0){this.uni=false;this.degree=true;this.eduDone=16;this.mark('grad','Диплом вуза');ev.push({k:'mile',t:'Вы получили диплом.'})}}
    // child marriage
    if(this.sex==='f'&&!this.married&&x>=13&&x<=17&&Math.random()<c.cm/100/4.2){this.childBride=true;const sp=pickName(c,'m');this.marry(sp,x+6+Math.round(Math.abs(gauss())*6));if(this.inSchool&&Math.random()<0.7){this.inSchool=false;}ev.push({k:'sad',t:`В ${yrs(x)} вас выдали замуж за ${sp}. ${this.spouseAge-x>8?'Он намного старше.':''}`})}
    // work
    if(!this.working&&!this.homemaker&&!this.retired&&!this.inSchool&&!this.uni&&!this.college&&!this.serveLeft&&!this.flags.leaveDecision&&!this.flags.uniDecision&&!this.flags.collegeDecision){
      if(x>=15||(x>=10&&this.zf<-0.3&&(this.rural||this.eduPlan<=5)&&Math.random()<0.35)){
        if(this.sex==='f'&&this.married&&['ME','SA'].includes(c.region)&&Math.random()<0.6){this.homemaker=true;this.zp=0.55*this.zf+0.5*gauss();ev.push({k:'info',t:'Вы ведёте хозяйство дома, а деньги зарабатывает муж.'})}
        else ev.push({k:x<15?'sad':'mile',t:this.startWork()})}}
    if(this.zp!==null&&!this.retired){
      this.zp+=gauss()*0.06-0.006+({study:0.012,money:0.03,family:-0.01,health:-0.01}[this.focus]||0)*(x<55?1:0.3);
      if(this.working&&x>=20&&x<60&&Math.random()<0.035){this.shock-=0.6;this.stress+=1;ev.push({k:'sad',t:'Вы потеряли работу. Несколько месяцев пришлось искать новую.'})}
    }
    if(this.mortLeft>0){this.mortLeft--;this.shock-=0.06;if(this.mortLeft===0){const b=this.housing==='build';this.housing='own';ev.push({k:'mile',t:b?'Вы достроили свой дом.':'Вы выплатили ипотеку. Жильё теперь ваше.'})}}
    if(this.debt>0){this.debt--;this.shock-=0.07;if(this.debt===0)ev.push({k:'info',t:'Вы рассчитались с долгами.'})}
    if(this.caring==='home')this.shock-=0.08;else if(this.caring==='paid')this.shock-=0.12;
    this.shock*=0.6;
    const retAge=retAgeOf(this);
    if(this.working&&x>=retAge&&!this.retired){this.retired=true;this.working=false;this.mark('rest','Пенсия');ev.push({k:'mile',t:c.gdp>15000?'Вы вышли на пенсию.':'Работать стало тяжело. Вы живёте на помощь детей и небольшие подработки.'})}
    // birth
    if(this.pregnant){this.pregnant=false;const ks=Math.random()<0.512?'m':'f';const kn=pickName(c,ks);
      const kid={name:kn,sex:ks,born:x,alive:true,dieAt:null};
      const qk=c.u5/1000*Math.exp(-0.3*this.zEff())*(this.homeBirth?1.3:1);
      if(Math.random()<qk)kid.dieAt=x+(Math.random()<0.6?0:1+Math.floor(Math.random()*4));
      this.kids.push(kid);this.mark('baby',(ks==='m'?'Сын ':'Дочь ')+kn);
      ev.push({k:'mile',t:`Родился ребёнок: ${ks==='m'?'сын':'дочь'} ${kn}.`});
      const mr=c.mmr/1e5*(this.homeBirth?1.6:0.6)*(this.sex==='f'&&x<18?2:1);
      if(Math.random()<mr){if(this.sex==='f'){return this.die(ev,'maternal')}else{this.married=false;this.widowed=true;ev.push({k:'sad',t:`Ваша жена ${this.spouse} умерла при родах.`})}}
    }
    for(const k of this.kids){if(k.alive&&k.dieAt===x){k.alive=false;this.lostKids++;ev.push({k:'sad',t:`${k.sex==='m'?'Ваш сын':'Ваша дочь'} ${k.name} ${k.sex==='m'?'умер':'умерла'}, ${x-k.born<1?'не дожив до года':'не дожив до пяти лет'}.`})}}
    // spouse
    if(this.married){if(!this.qs||this.qsC!==c){this.qs=getTable(c,this.sex==='m'?'f':'m');this.qsC=c}const sq=this.qs[clamp(this.spouseAge,0,MAXAGE)];
      if(Math.random()<sq*Math.exp(-0.2*this.zEff())){this.married=false;this.widowed=true;this.stress+=1.5;ev.push({k:'sad',t:`${this.sex==='m'?'Умерла ваша жена':'Умер ваш муж'} ${this.spouse}.`})}}
    // события года: привычки, урожай, кризисы, удачи и неудачи
    if(!EV_AGE)EV_AGE=byAge(EVENTS);
    for(const E of EV_AGE[Math.min(x,MAXAGE)]){if(E.when(this,x,c)&&Math.random()<E.p(this,x,c)){const e=E.fire(this,x,c);if(e){e.id=E.id;ev.push(e)}}}
    // знания растут от учёбы и работы
    this.adj({know:(x>=3&&x<6&&this.zf>-0.5?1.5:0)+(this.inSchool?3.5+(this.focus==='study'?1.5:0):0)+(this.uni?5:0)+(this.college?4:0)+(this.working?0.4+(this.degree?0.4:0):0)-(x>70?0.3:0)});
    // одно обычное событие года (у детей чаще)
    if(!this.aiCover.has(x)&&Math.random()<(x<18?0.85:x<65?0.7:0.65)){if(!DAY_AGE)DAY_AGE=byAge(DAILY);
      const D=pickWeighted(DAY_AGE[Math.min(x,MAXAGE)],this,x,c);
      if(D){this.seen[D.id]=(this.seen[D.id]||0)+1;const e=D.fire(this,x,c);if(e){e.id=D.id;e.daily=true;ev.push(e)}}}
    // переехали — в новом месте бывают удобства, которых не было
    if(this.home2&&(this.home2.r0!==this.rural||this.home2.c0!==this.c.code)){const h=this.home2,n=makeHome(this,this.c);for(const k of ['elec','water','toilet','cook','net'])h[k]=h[k]||n[k];h.r0=this.rural;h.c0=this.c.code}
    // что происходит в мире
    for(const w of this.world.at(this.born+x)){const e={k:'world',t:w.t,id:'world'};
      if(w.fx==='crisis'){this.shock-=0.25;if(this.working&&Math.random()<0.12){this.shock-=0.4;this.stress+=1;e.t+=' Вы потеряли работу.'}}
      else if(w.fx==='pandemic'){this.yearRisk*=x>=65?1.3:x<5?1.1:1.08;this.shock-=0.1;this.adj({mood:-5,rel:-2})}
      else if(w.fx==='heat'){if(x>=70)this.yearRisk*=1.03}
      else if(w.fx==='tech'&&this.working&&/водител|продав|кассир|рабоч|бухгалтер|грузч|администратор|работниц/.test(this.job||'')&&Math.random()<0.15){this.shock-=0.4;this.adj({know:3,stress:1});e.t+=' Вашу работу заменили машины — пришлось переучиваться.'}
      ev.push(e)}
    // настроение возвращается к обычному, отношения — к среднему; несчастье добавляет стресс
    this.mood*=0.7;this.rel+=(60-this.rel)*0.08;
    const hp=this.happy();if(hp<35)this.stress+=0.4;else if(hp>75)this.stress*=0.85;
    this.stress=Math.max(0,this.stress*0.75);
    // occasional facts
    const st=this.statFact(x);if(st)ev.push({k:'stat',t:st});
    // death
    if(Math.random()<this.qNow(x))return this.die(ev,null);
    this.age++;
    this.logIncome();
    const inc=this.income();if(this.zp!==null&&inc>this.peak)this.peak=inc;
    return ev;
  }
  statFact(x){const c=this.c;
    if(x===12&&this.c===this.home)return `${c.inName[0].toUpperCase()+c.inName.slice(1)} взрослые учились в среднем ${String(c.school).replace('.',',')} ${plural(Math.round(c.school),['год','года','лет'])}.`;
    if(x===25)return `В вашей стране около ${Math.round(c.agri)}% работающих заняты в сельском хозяйстве.`;
    if(x===40)return `На вопрос «насколько вы довольны жизнью» люди ${c.inName} в среднем отвечают ${String(c.sat).replace('.',',')} из 10.`;
    return null}
  die(ev,forced){
    this.alive=false;const x=this.age;const key=forced||this.pickCause(x);this.causeKey=key;this.cause=this.causeText(key);this.mark('end','Конец жизни');
    ev.push({k:['hom','sui'].includes(key)?'heavy':'sad',t:`Вы умерли ${x===0?'не дожив до года':'в '+yrs(x)}. Причина: ${this.cause}.`,help:['hom','sui'].includes(key)});
    return ev}
  pickCause(x){const c=this.c,m=this.sex==='m',low=c.gdp<15000,H=Math.max(1e-6,this.qNow(x));
    const ext=[];
    if(x>=12)ext.push(['hom',c.hom/1e5*(m?1.7:0.3)*(x>=15&&x<60?1.3:0.4)]);
    if(x>=13)ext.push(['sui',9/1e5*(m?1.6:0.5)*(c.region==='EE'?2:1)]);
    if(x>=1)ext.push(['road',(low?24:9)/1e5*(m?1.6:0.6)]);
    ext.push(['drown',(x<15?4:1)/1e5]);
    if(x>=15&&x<65)ext.push(['hiv',c.hiv/100*0.012]);
    let sum=0;for(const e of ext)sum+=e[1];const sc=sum/H>0.85?0.85*H/sum:1;
    const r=Math.random()*H;let acc=0;for(const e of ext){acc+=e[1]*sc;if(r<acc)return e[0]}
    const S=c.region==='SSA',reg=c.region;let L;
    if(x===0)L=[['neo',5],['pneu',2],['diar',1.2],['cong',1.5],['sepsis',1.2],['mal',S?1.5:0]];
    else if(x<5)L=[['pneu',3],['diar',2.5],['mal',S?4:0],['measles',S||reg==='SA'?0.6:0.1],['malnut',low?1:0.1],['accident',1]];
    else if(x<15)L=[['infect',2],['mal',S?2:0],['leuk',1],['accident',1.5]];
    else if(x<40)L=[['tb',low?2:0.2],['heart',1],['cancer',1.2],['liver',1],['infect',low?1.5:0.3],['accident',1.2]];
    else if(x<65)L=[['ihd',4*(reg==='EE'?1.8:1)],['stroke',2.5],['lung',this.smoker?2.5:0.6],['cancer',3],['liver',reg==='EE'?1.5:0.8],['diab',1],['tb',low?1:0.1],['copd',0.7]];
    else L=[['ihd',5*(reg==='EE'?1.5:1)],['stroke',3.5],['cancer',3*(reg==='HI'?1.4:1)],['dementia',reg==='HI'?2.5:1],['copd',1.5],['pneu',1.5],['diab',1],['kidney',0.8]];
    if(this.ill)L.push(['ill',4]);
    return wpick(L.filter(e=>e[1]>0))}
  causeText(k){const soft=this.soft;const T={hom:soft?'внешняя причина':'убийство',sui:soft?'внешняя причина':'самоубийство',road:'дорожная авария',drown:'утопление',hiv:'СПИД',maternal:'осложнения при родах',
    neo:'осложнения при рождении (недоношенность, асфиксия)',pneu:'пневмония',diar:'диарея',cong:'врождённый порок',sepsis:'сепсис',mal:'малярия',measles:'корь',malnut:'истощение',accident:'несчастный случай',
    infect:'инфекция',leuk:'лейкоз',tb:'туберкулёз',heart:'болезнь сердца',cancer:'рак',liver:'болезнь печени',ihd:'ишемическая болезнь сердца',stroke:'инсульт',lung:'рак лёгких',diab:'диабет',copd:'хроническая болезнь лёгких',dementia:'деменция',kidney:'болезнь почек',ill:this.ill||'болезнь'};return T[k]||'болезнь'}
  status(){const x=this.age;
    if(!this.alive)return (this.sex==='m'?'умер':'умерла')+' в '+yrs(x);
    if(x<3)return 'малыш';if(x<6)return 'дошкольник';
    if(this.inSchool)return 'школьник, '+(this.eduDone+1)+' класс';
    if(this.serveLeft>0)return 'служит в армии';
    if(this.uni)return 'студент';
    if(this.college)return 'учится в колледже';
    if(this.retired)return this.withKids?'на пенсии, живёт с детьми':'на пенсии';
    if(this.homemaker)return 'ведёт хозяйство';
    if(this.working)return this.shock<-0.3?'ищет работу':this.biz?'своё дело':this.job;
    return x<15?'не учится, помогает дома':'без работы'}
  family(){const alive=this.kids.filter(k=>k.alive).length;let s;
    if(this.married)s=(this.sex==='m'?'женат':'замужем')+' ('+this.spouse+')';else if(this.widowed)s=this.sex==='m'?'вдовец':'вдова';else if(this.everMarried)s='в разводе';else s=this.age<16?'с родителями':'не в браке';
    if(this.kids.length)s+=`, ${alive} ${plural(alive,['ребёнок','ребёнка','детей'])}`;return s}
  snapshot(){return {age:this.age,alive:this.alive,status:this.status(),cause:this.cause,ph:this.phase()}}
}
/* доход в месяц для того же положения (z) в другой стране */
function incomeIn(c,z){const sg=Math.SQRT2*ndtri((c.gdp?c.gini:35)/100/2+0.5);return c.gdp*0.55*(calOf(c).ki||1)*Math.exp(sg*z-sg*sg/2)/12}
function simulateFull(mode,soft,world){const L=new Life({auto:true,mode,soft,world});L.init();const snaps=[L.snapshot()];let g=0;
  while(L.alive&&g++<130){const ds=L.beginYear();for(const d of ds)L.resolve(d,L.autoChoice(d));L.endYear();snaps.push(L.snapshot())}
  return {L,snaps}}

return {TAG_FX,homeText,DAILY,CHOICES,makeWorld,setWorld,cohortSurvival,worldBirths,worldIncomePctl,incomeIn,COUNTRIES,BY,NAMES,DECISIONS,EVENTS,DRAFT,SPHERES,KIND,classifyDreamLocal,forkTemplate,Life,simulateFull,getTable,e0,survTo,avgLE,avgIncome,ruralShare,pickCountry,setData,setCal:v=>{CAL=v},getCal:()=>CAL,
  clamp,gauss,ndtri,ncdf,plural,yrs,money,pick,wpick,MAXAGE};
});
