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
 CA:[['RU',5],['KZ',2],['KR',1],['DE',1],['TR',1]],
 SA:[['SA',3],['US',2],['GB',2],['CA',1],['AU',1]],
 ME:[['DE',2],['TR',2],['SA',2],['FR',1],['GB',1],['US',1]],
 SSA:[['ZA',2],['FR',2],['GB',2],['US',2],['SA',1],['DE',1]],
 LA:[['US',6],['AR',1],['CA',1]],
 EA:[['US',3],['JP',2],['KR',2],['AU',2],['SA',1]],
 EE:[['PL',3],['DE',3],['US',1],['KZ',1]],
 HI:[['US',2],['GB',1],['CA',1],['AU',1],['DE',1]]
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

/* ===== Life ===== */
class Life{
  constructor(o={}){
    this.auto=!!o.auto;this.soft=!!o.soft;
    const c=o.country||pickCountry(o.mode||'births');
    this.home=c;this.c=c;this.sex=Math.random()<0.512?'m':'f';
    this.name=pickName(c,this.sex);this.born=o.year||new Date().getFullYear();
    this.age=0;this.alive=true;this.focus='study';
    this.rural=Math.random()<clamp(c.agri/100*1.15+0.05,0.03,0.85);
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
    this.sibs=poisson(Math.max(0,c.fert-1)*0.7);
    this.lines=[];
  }
  g(m,f){return this.sex==='m'?m:f}
  get cal(){return CAL[this.c.code]||{m:1,f:1,zb:0}}
  zEff(){return (this.zp===null?this.zf:this.zp-this.cal.zb)+this.shock}
  incomeAt(z,c){c=c||this.c;const mean=c.gdp*0.55;return mean*Math.exp(this.sigma*z-this.sigma*this.sigma/2)/12}
  income(){let v=this.incomeAt(this.zEff());if(this.retired)v*=0.6;return v}
  pctl(){return Math.round(ncdf(this.zEff())*100)}
  mult(x){
    let w=Math.exp(-0.28*this.zEff())/Math.exp(0.0392);if(x<5)w=Math.pow(w,0.7);
    let m=w;const s=this.c.smoke/100;
    if(x>=35)m*=this.smoker?1.35/(1+0.35*s):1/(1+0.35*s);
    m*=this.illMult;
    if(x>=6)m*={health:0.92,study:1,family:0.98,money:1.04}[this.focus]||1;
    return m;
  }
  qNow(x){const qb=this.q[Math.min(x,MAXAGE)];const k=x>=5?this.cal[this.sex]:1;return qb>=1?1:1-Math.pow(1-qb,this.mult(x)*k)}
  init(){
    const c=this.c,ev=[];
    ev.push({k:'mile',t:`Вы родились ${c.inName}, ${this.rural?'в деревне':'в городе'}. ${this.g('Мальчик','Девочка')}, вас назвали ${this.name}.`});
    const inc=this.incomeAt(this.zf),p=Math.round(ncdf(this.zf)*100);
    ev.push({k:'info',t:`Семья живёт примерно на ${money(inc)} в месяц на человека (по паритету покупательной способности). ${p<50?`Беднее, чем ${100-p}% семей страны.`:`Богаче, чем ${p}% семей страны.`}`});
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
      const pDone=clamp(c.school/12,0.25,1);const ch=clamp(c.tert/100*Math.exp(0.5*this.zEff())/pDone,0.03,0.95);
      ds.push({id:'uni',title:'Школа окончена',text:`Вы окончили школу. ${c.inName[0].toUpperCase()+c.inName.slice(1)} в вузы поступает около ${Math.round(c.tert)}% молодых людей.`,
        opts:[{label:'Поступать в университет',hint:`Шанс поступить примерно ${Math.round(ch*100)}%`,w:ch,fn:()=>{if(Math.random()<ch){this.uni=true;this.uniLeft=4;return 'Вы поступили в университет.'}return 'Поступить не получилось. Вы пошли работать.'}},
              {label:'Пойти работать',hint:'Свои деньги начнутся раньше',w:1-ch,fn:()=>'Вы решили сразу работать.'}]});
    }
    if(!this.married&&!this.childBride&&x>=18&&x<70){
      let p=x<35?0.13:x<50?0.05:0.012;if(this.focus==='family')p*=1.5;if(this.widowed)p*=0.5;
      if(Math.random()<p){const sp=pickName(c,this.sex==='m'?'f':'m');
        ds.push({id:'marry',title:'Встреча',text:`Вы встретили человека по имени ${sp}. Кажется, это серьёзно.`,
          opts:[{label:'Пожениться',hint:'Создать семью',w:0.85,fn:()=>{this.marry(sp,x+Math.round(gauss()*3));return `Вы поженились с ${sp}.`}},
                {label:'Пока нет',hint:'Не торопиться',w:0.15,fn:()=>'Вы решили не торопиться.'}]});}
    }
    // pregnancy
    if(this.married&&this.alive){const wAge=this.sex==='f'?x:this.spouseAge;
      if(wAge>=16&&wAge<=44){let p=clamp(c.fert/16,0.04,0.45);if(c.fert<1.5)p*=0.8;if(this.kids.length>=Math.max(1,Math.round(c.fert+1)))p*=0.3;if(this.focus==='family')p*=1.3;
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
      const ill=pick(['болезнь сердца','опухоль','диабет с осложнениями','болезнь почек','болезнь лёгких']);this.ill=ill;
      const poor=c.gdp<20000;const months=Math.round(clamp((poor?10:3)/Math.exp(0.6*this.zEff()),1,60));
      const tp=clamp(0.5+0.4*ncdf(this.zEff()),0.2,0.95);
      ds.push({id:'ill',title:'Диагноз',text:`Врачи нашли у вас серьёзную болезнь: ${ill}.`,
        opts:[{label:'Лечиться',hint:`Обойдётся примерно в ${months} ${plural(months,['месячный доход','месячных дохода','месячных доходов'])}`,w:tp,fn:()=>{this.illMult=1.2;this.shock-=poor?0.45:0.12;return 'Вы начали лечение.'}},
              {label:'Не лечиться',hint:'Сохранить деньги семье',w:1-tp,fn:()=>{this.illMult=1.9;return 'Вы решили не лечиться.'}}]});
    }
    return ds;
  }
  autoChoice(d){return wpick(d.opts.map((o,i)=>[i,Math.max(0.0001,o.w)]))}
  resolve(d,i){return d.opts[i].fn()}
  get spouseAge(){return this.age+(this.spDiff||0)}
  marry(sp,spAge){this.married=true;this.everMarried=true;this.spouse=sp;this.spDiff=clamp(spAge,14,90)-this.age;
    if(this.sex==='f'&&this.working&&['ME','SA'].includes(this.c.region)&&Math.random()<0.55){this.working=false;this.homemaker=true}}
  pickDest(){const list=(DEST[this.c.region]||DEST.HI).map(([k,w])=>[BY[k],w]).filter(([d])=>d&&d.code!==this.c.code&&d.gdp>this.c.gdp*1.2);return list.length?wpick(list):null}
  migrate(d){if(Math.random()<0.7){const from=this.c;this.c=d;this.migrated=true;this.rural=false;this.q=getTable(d,this.sex);this.sigma=Math.SQRT2*ndtri((d.gini/100+1)/2);
      if(this.zp!==null)this.zp=this.zp*0.5-0.6;else this.zp=-0.8;this.shock=0;return `Вы уехали. Новая страна: ${d.name}. Первое время будет трудно.`}
    return 'Уехать не вышло: документы не одобрили.'}
  startWork(){const c=this.c,x=this.age;let tier;
    if(this.rural&&Math.random()<clamp(c.agri/100*1.4,0,0.95))tier='agri';
    else if(this.degree)tier='uni';else if(this.eduDone>=12)tier=Math.random()<0.6?'hi':'mid';else if(this.eduDone>=7)tier='mid';else tier='low';
    this.job=pick(JOBS[tier][this.sex]);this.working=true;
    this.zp=0.55*this.zf+0.6*gauss()+0.12*(this.eduDone-c.school)+(this.degree?0.4:0)-(tier==='agri'?0.3:0);
    return `${x<15?'Уже в '+yrs(x)+' вы':'Вы'} начали работать: ${this.job}.`}
  endYear(){
    const x=this.age,c=this.c,ev=[];if(!this.alive)return ev;
    // parents
    const qm=getTable(this.home,'f'),qd=getTable(this.home,'m');const pw=Math.exp(-0.28*this.zf)/Math.exp(0.0392);
    if(this.mom&&Math.random()<1-Math.pow(1-qm[Math.min(this.momAge+x,MAXAGE)],pw)){this.mom=false;ev.push({k:'sad',t:`Умерла ваша мама. Ей было ${yrs(this.momAge+x)}.`})}
    if(this.dad&&Math.random()<1-Math.pow(1-qd[Math.min(this.dadAge+x,MAXAGE)],pw)){this.dad=false;ev.push({k:'sad',t:`Умер ваш папа. Ему было ${yrs(this.dadAge+x)}.`})}
    // school
    if(x===6){if(this.eduPlan>0){this.inSchool=true;ev.push({k:'mile',t:'Вы пошли в школу.'})}
      else ev.push({k:'info',t:this.rural?'В школу вы так и не пошли: до неё далеко, а дома нужна помощь.':'В школу вы так и не пошли: семье нечем платить за форму и учебники.'})}
    else if(this.inSchool){this.eduDone++;if(this.focus==='study')this.studyPts++;
      if(this.eduDone>=this.eduPlan){
        if(this.eduPlan<12&&this.studyPts>=3&&Math.random()<0.5){this.eduPlan++;this.studyPts=0;ev.push({k:'info',t:'Вы хорошо учились, и вас уговорили остаться ещё на год.'})}
        else if(this.eduDone>=12){this.inSchool=false;this.flags.uniDecision=true;ev.push({k:'mile',t:'Вы окончили школу.'})}
        else if(this.eduDone>=4&&x<=16&&!this.flags.leaveAsked){this.flags.leaveAsked=true;this.flags.leaveDecision=true}
        else{this.inSchool=false;ev.push({k:'info',t:`Учёба закончилась после ${this.eduDone} ${plural(this.eduDone,['класса','классов','классов'])}.`})}}
    }
    if(this.uni){this.uniLeft--;if(this.uniLeft<=0){this.uni=false;this.degree=true;this.eduDone=16;ev.push({k:'mile',t:'Вы получили диплом.'})}}
    // child marriage
    if(this.sex==='f'&&!this.married&&x>=13&&x<=17&&Math.random()<c.cm/100/4.2){this.childBride=true;const sp=pickName(c,'m');this.marry(sp,x+6+Math.round(Math.abs(gauss())*6));if(this.inSchool&&Math.random()<0.7){this.inSchool=false;}ev.push({k:'sad',t:`В ${yrs(x)} вас выдали замуж за ${sp}. ${this.spouseAge-x>8?'Он намного старше.':''}`})}
    // work
    if(!this.working&&!this.homemaker&&!this.retired&&!this.inSchool&&!this.uni&&!this.flags.leaveDecision&&!this.flags.uniDecision){
      if(x>=15||(x>=10&&this.zf<-0.3&&(this.rural||this.eduPlan<=5)&&Math.random()<0.35)){
        if(this.sex==='f'&&this.married&&['ME','SA'].includes(c.region)&&Math.random()<0.6){this.homemaker=true;this.zp=0.55*this.zf+0.5*gauss();ev.push({k:'info',t:'Вы ведёте хозяйство дома, а деньги зарабатывает муж.'})}
        else ev.push({k:x<15?'sad':'mile',t:this.startWork()})}}
    if(this.zp!==null&&!this.retired){
      this.zp+=gauss()*0.06-0.006+({study:0.012,money:0.03,family:-0.01,health:-0.01}[this.focus]||0)*(x<55?1:0.3);
      if(this.working&&x>=20&&x<60&&Math.random()<0.035){this.shock-=0.6;ev.push({k:'sad',t:'Вы потеряли работу. Несколько месяцев пришлось искать новую.'})}
    }
    this.shock*=0.6;
    const retAge=c.gdp>15000?63:68;
    if(this.working&&x>=retAge&&!this.retired){this.retired=true;this.working=false;ev.push({k:'mile',t:c.gdp>15000?'Вы вышли на пенсию.':'Работать стало тяжело. Вы живёте на помощь детей и небольшие подработки.'})}
    // birth
    if(this.pregnant){this.pregnant=false;const ks=Math.random()<0.512?'m':'f';const kn=pickName(c,ks);
      const kid={name:kn,sex:ks,born:x,alive:true,dieAt:null};
      const qk=c.u5/1000*Math.exp(-0.3*this.zEff())*(this.homeBirth?1.3:1);
      if(Math.random()<qk)kid.dieAt=x+(Math.random()<0.6?0:1+Math.floor(Math.random()*4));
      this.kids.push(kid);
      ev.push({k:'mile',t:`Родился ребёнок: ${ks==='m'?'сын':'дочь'} ${kn}.`});
      const mr=c.mmr/1e5*(this.homeBirth?1.6:0.6)*(this.sex==='f'&&x<18?2:1);
      if(Math.random()<mr){if(this.sex==='f'){return this.die(ev,'maternal')}else{this.married=false;this.widowed=true;ev.push({k:'sad',t:`Ваша жена ${this.spouse} умерла при родах.`})}}
    }
    for(const k of this.kids){if(k.alive&&k.dieAt===x){k.alive=false;this.lostKids++;ev.push({k:'sad',t:`${k.sex==='m'?'Ваш сын':'Ваша дочь'} ${k.name} ${k.sex==='m'?'умер':'умерла'}, ${x-k.born<1?'не дожив до года':'не дожив до пяти лет'}.`})}}
    // spouse
    if(this.married){const sq=getTable(c,this.sex==='m'?'f':'m')[clamp(this.spouseAge,0,MAXAGE)];
      if(Math.random()<sq*Math.exp(-0.2*this.zEff())){this.married=false;this.widowed=true;ev.push({k:'sad',t:`${this.sex==='m'?'Умерла ваша жена':'Умер ваш муж'} ${this.spouse}.`})}
      else if(Math.random()<(['HI','EE'].includes(c.region)?0.012:0.004)){this.married=false;ev.push({k:'sad',t:`Вы развелись с ${this.spouse}.`})}}
    // smoking
    if(!this.smoker&&x>=14&&x<=24&&!this.quitAges.length){const s=c.smoke/100*(this.sex==='m'?1.55:0.45);if(Math.random()<s/8){this.smoker=true;ev.push({k:'info',t:'Вы начали курить.'})}}
    // occasional facts
    const st=this.statFact(x);if(st)ev.push({k:'stat',t:st});
    // death
    if(Math.random()<this.qNow(x))return this.die(ev,null);
    this.age++;
    const inc=this.income();if(this.zp!==null&&inc>this.peak)this.peak=inc;
    return ev;
  }
  statFact(x){const c=this.c;
    if(x===12&&this.c===this.home)return `${c.inName[0].toUpperCase()+c.inName.slice(1)} взрослые учились в среднем ${String(c.school).replace('.',',')} ${plural(Math.round(c.school),['год','года','лет'])}.`;
    if(x===25)return `В вашей стране около ${Math.round(c.agri)}% работающих заняты в сельском хозяйстве.`;
    if(x===40)return `На вопрос «насколько вы довольны жизнью» люди ${c.inName} в среднем отвечают ${String(c.sat).replace('.',',')} из 10.`;
    return null}
  die(ev,forced){
    this.alive=false;const x=this.age;const key=forced||this.pickCause(x);this.causeKey=key;this.cause=this.causeText(key);
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
    if(this.uni)return 'студент';
    if(this.retired)return 'на пенсии';
    if(this.homemaker)return 'ведёт хозяйство';
    if(this.working)return this.shock<-0.3?'ищет работу':this.job;
    return x<15?'не учится, помогает дома':'без работы'}
  family(){const alive=this.kids.filter(k=>k.alive).length;let s;
    if(this.married)s=(this.sex==='m'?'женат':'замужем')+' ('+this.spouse+')';else if(this.widowed)s=this.sex==='m'?'вдовец':'вдова';else if(this.everMarried)s='в разводе';else s=this.age<16?'с родителями':'не в браке';
    if(this.kids.length)s+=`, ${alive} ${plural(alive,['ребёнок','ребёнка','детей'])}`;return s}
  snapshot(){return {age:this.age,alive:this.alive,status:this.status(),cause:this.cause}}
}
function simulateFull(mode,soft){const L=new Life({auto:true,mode,soft});L.init();const snaps=[L.snapshot()];let g=0;
  while(L.alive&&g++<130){const ds=L.beginYear();for(const d of ds)L.resolve(d,L.autoChoice(d));L.endYear();snaps.push(L.snapshot())}
  return {L,snaps}}

return {COUNTRIES,BY,NAMES,Life,simulateFull,getTable,e0,survTo,avgLE,pickCountry,setData,setCal:v=>{CAL=v},getCal:()=>CAL,
  clamp,gauss,ndtri,ncdf,plural,yrs,money,pick,wpick,MAXAGE};
});
