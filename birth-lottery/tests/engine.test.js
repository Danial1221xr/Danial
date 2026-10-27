// Простые тесты движка. Запуск из папки игры: node --test
const test = require('node:test');
const assert = require('node:assert');
const { loadEngine } = require('../tools/load-engine');

const E = loadEngine();
const NUM = ['births', 'pop', 'leM', 'leF', 'imr', 'u5', 'gdp', 'gini', 'school', 'tert', 'agri', 'fert', 'mmr', 'hiv', 'hom', 'smoke', 'sat', 'cm', 'urb'];
const REGIONS = ['SA', 'EA', 'SSA', 'ME', 'LA', 'EE', 'CA', 'HI'];

function live(L, choose) {
  const choices = [];
  L.init();
  let g = 0;
  while (L.alive && g++ < 130) {
    for (const d of L.beginYear()) {
      assert.ok(d.id && d.title && d.opts.length >= 2, 'у решения есть id, заголовок и варианты');
      for (const o of d.opts) {
        assert.strictEqual(typeof o.fn, 'function');
        assert.ok(Number.isFinite(o.w) && o.w >= 0, `вес w у варианта «${o.label}» решения ${d.id}`);
      }
      const i = choose ? choose(d) : L.autoChoice(d);
      const r = L.resolve(d, i);
      assert.strictEqual(typeof r, 'string', `решение ${d.id} возвращает текст`);
      choices.push(d.id);
    }
    const ev = L.endYear();
    for (const e of ev) assert.ok(typeof e.t === 'string' && e.t.length, 'у события есть текст');
  }
  return choices;
}

test('данные стран полные и числовые', () => {
  assert.ok(E.COUNTRIES.length >= 49);
  const codes = new Set();
  for (const c of E.COUNTRIES) {
    assert.ok(!codes.has(c.code), 'код не повторяется: ' + c.code); codes.add(c.code);
    assert.ok(c.name && c.inName, 'название ' + c.code);
    assert.ok(REGIONS.includes(c.region), 'регион ' + c.code);
    assert.ok(E.NAMES[c.names] && E.NAMES[c.names].m.length && E.NAMES[c.names].f.length, 'имена ' + c.code);
    for (const f of NUM) assert.ok(Number.isFinite(c[f]) && c[f] >= 0, `${c.code}.${f} = ${c[f]}`);
    assert.ok(c.leM > 40 && c.leM < 90 && c.leF > 40 && c.leF < 95, 'LE ' + c.code);
    assert.ok(c.u5 >= c.imr, 'детская смертность не меньше младенческой ' + c.code);
  }
});

test('172 страны, у каждой цифры есть источник и год (или пометка «оценка»)', () => {
  assert.strictEqual(E.COUNTRIES.length, 172);
  for (const c of E.COUNTRIES) for (const f of NUM) {
    const s = c.src && c.src[f];
    assert.ok(s && s.s, `источник ${c.code}.${f}`);
    assert.ok(s.est || Number.isInteger(s.y), `год ${c.code}.${f}`);
  }
});

test('у каждой страны есть поправки калибровки', () => {
  const cal = E.getCal();
  for (const c of E.COUNTRIES) {
    const k = cal[c.code];
    assert.ok(k && k.m > 0 && k.f > 0 && k.ki > 0 && Number.isFinite(k.zb), 'CAL ' + c.code);
  }
});

test('таблица смертности даёт нужную продолжительность жизни', () => {
  for (const c of E.COUNTRIES) for (const sex of ['m', 'f']) {
    const e = E.e0(E.getTable(c, sex));
    assert.ok(Math.abs(e - (sex === 'm' ? c.leM : c.leF)) < 0.05, `${c.code}${sex}: ${e}`);
  }
});

test('в каждой стране жизнь доходит до конца без ошибок', () => {
  for (const c of E.COUNTRIES) for (let i = 0; i < 6; i++) {
    const L = new E.Life({ auto: true, country: c });
    live(L);
    assert.strictEqual(L.alive, false);
    assert.ok(L.age >= 0 && L.age <= E.MAXAGE);
    assert.ok(L.cause, 'есть причина смерти');
  }
});

test('выбор любого варианта (первого и последнего) не ломает жизнь', () => {
  for (const pickLast of [false, true]) for (let i = 0; i < 200; i++) {
    const L = new E.Life({ auto: true });
    live(L, d => pickLast ? d.opts.length - 1 : 0);
    assert.strictEqual(L.alive, false);
  }
});

test('режим «Убрать пугающие подробности» скрывает насильственные причины', () => {
  const L = new E.Life({ auto: true, soft: true });
  for (const k of ['hom', 'sui']) assert.strictEqual(L.causeText(k), 'внешняя причина');
  const H = new E.Life({ auto: true, soft: false });
  assert.strictEqual(H.causeText('hom'), 'убийство');
});

test('страна выпадает по доле рождений', () => {
  const n = 40000, cnt = {};
  for (let i = 0; i < n; i++) { const c = E.pickCountry('births'); cnt[c.code] = (cnt[c.code] || 0) + 1; }
  const total = E.COUNTRIES.reduce((s, c) => s + c.births, 0);
  const big = [...E.COUNTRIES].sort((a, b) => b.births - a.births)[0];
  const share = big.births / total;
  assert.ok(Math.abs(cnt[big.code] / n - share) < 0.015, `${big.code}: ${cnt[big.code] / n} vs ${share}`);
});

test('этап 2: не меньше 25 новых решений и 20 событий, и все они встречаются', () => {
  assert.ok(E.DECISIONS.length >= 25, 'решений: ' + E.DECISIONS.length);
  assert.ok(E.EVENTS.length >= 20, 'событий: ' + E.EVENTS.length);
  const dIds = new Set(E.DECISIONS.map(d => d.id)), eIds = new Set(E.EVENTS.map(e => e.id));
  const seenD = new Set(), seenE = new Set();
  for (let i = 0; i < 6000 && (seenD.size < dIds.size || seenE.size < eIds.size); i++) {
    const L = new E.Life({ auto: true });
    L.init();
    let g = 0;
    while (L.alive && g++ < 130) {
      for (const d of L.beginYear()) { if (dIds.has(d.id)) seenD.add(d.id); L.resolve(d, L.autoChoice(d)); }
      for (const e of L.endYear()) if (eIds.has(e.id)) seenE.add(e.id);
    }
  }
  const missD = E.DECISIONS.map(d => d.id).filter(id => !seenD.has(id));
  const missE = E.EVENTS.map(e => e.id).filter(id => !seenE.has(id));
  assert.deepStrictEqual(missD, [], 'решения, которые ни разу не выпали');
  assert.deepStrictEqual(missE, [], 'события, которые ни разу не произошли');
});

test('курение и алкоголь — только события, а не выбор', () => {
  // ни одно решение не включает привычку напрямую — только события с вероятностью
  for (const d of E.DECISIONS) {
    const src = String(d.make);
    assert.ok(!/smoker\s*=\s*true|drinker\s*=\s*true/.test(src), 'решение ' + d.id + ' не должно включать привычку');
  }
  assert.ok(E.EVENTS.some(e => e.id === 'smokeStart') && E.EVENTS.some(e => e.id === 'drinkStart'));
});

test('выбор в детстве меняет шанс закурить, но не определяет его', () => {
  const runs = (crowd, active) => {
    let n = 0;
    const c = E.BY.RU;
    for (let i = 0; i < 4000; i++) {
      const L = new E.Life({ auto: true, country: c });
      L.sex = 'm'; L.crowd = crowd; L.active = active; L.flags.crowd = true; L.flags.club = true;
      L.init();
      let g = 0;
      while (L.alive && L.age < 31 && g++ < 40) { for (const d of L.beginYear()) L.resolve(d, L.autoChoice(d)); L.endYear(); }
      if (L.smoker) n++;
    }
    return n / 4000;
  };
  const street = runs('street', false), sport = runs('study', true);
  assert.ok(street > sport * 1.5, `двор ${street} против секции ${sport}`);
  assert.ok(sport > 0.05, 'даже спортсмены иногда начинают курить: ' + sport);
});

test('мечта: вопрос в 10 лет, разбор без ИИ и развилки с шансами движка', () => {
  const d = E.classifyDreamLocal('хочу стать врачом');
  assert.strictEqual(d.sphere, 'medicine');
  assert.strictEqual(E.classifyDreamLocal('космонавтом').difficulty, 5);
  let asked = 0, forks = 0, outcomes = 0;
  for (let i = 0; i < 400; i++) {
    const L = new E.Life({ auto: true, country: E.BY.KZ });
    L.init();
    let g = 0;
    while (L.alive && g++ < 130) {
      for (const dd of L.beginYear()) {
        if (dd.id === 'dream') { asked++; assert.strictEqual(L.age, 10); assert.ok(dd.input && dd.opts.length >= 2); }
        if (dd.id === 'dreamFork') {
          forks++;
          for (const o of dd.opts) if (o.kind !== 'give_up') assert.ok(o.chance > 0 && o.chance < 1 && /шанс примерно \d+%/.test(o.hint));
        }
        L.resolve(dd, L.autoChoice(dd));
      }
      L.endYear();
    }
    if (L.dreamOutcome()) outcomes++;
  }
  assert.ok(asked > 300 && forks > asked, `вопросов ${asked}, развилок ${forks}`);
  assert.strictEqual(outcomes, asked);
});

test('развилка от ИИ: движок сам считает шансы, неизвестный kind не ломает игру', () => {
  const L = new E.Life({ auto: true, country: E.BY.NO });
  L.age = 15; L.setDream({ sphere: 'medicine', title: 'Врач', edu: 'uni', needUni: true, needMove: false, difficulty: 3, short: '' });
  const d = L.buildFork(1, { title: 'Т', text: 'Текст', src: 'ai', options: [
    { label: 'Учиться', hint: '', kind: 'study' }, { label: 'Рискнуть', hint: 'всё или ничего', kind: 'risk', chance: 0.99 }, { label: '???', hint: '', kind: 'fly' }] });
  assert.strictEqual(d.src, 'ai');
  assert.ok(d.opts[1].chance < d.opts[0].chance, 'риск менее надёжен, чем учёба, что бы ни прислал ИИ');
  assert.strictEqual(d.opts[2].kind, 'safe');
  assert.strictEqual(typeof L.resolve(d, 0), 'string');
});

test('мечта зависит от места рождения: «врач» в Норвегии сбывается чаще, чем в Нигере', () => {
  const rate = code => {
    let yes = 0, n = 0;
    for (let i = 0; i < 1500; i++) {
      const L = new E.Life({ auto: true, country: E.BY[code] });
      L.init();
      let g = 0;
      while (L.alive && g++ < 130) {
        for (const dd of L.beginYear()) {
          if (dd.id === 'dream') { L.setDream(E.classifyDreamLocal('врачом')); continue; }
          L.resolve(dd, L.autoChoice(dd));
        }
        L.endYear();
      }
      const o = L.dreamOutcome();
      if (o) { n++; if (o.key === 'yes') yes++; }
    }
    return yes / n;
  };
  const no = rate('NO'), ne = rate('NE');
  assert.ok(no > ne * 3, `Норвегия ${no}, Нигер ${ne}`);
});

test('повседневная жизнь: все бытовые события и выборы встречаются, показатели в пределах 0–100', () => {
  assert.ok(E.DAILY.length >= 50 && E.CHOICES.length >= 20, `событий ${E.DAILY.length}, выборов ${E.CHOICES.length}`);
  const seenD = new Set(), seenC = new Set();
  let daily = 0, choices = 0, years = 0;
  for (let i = 0; i < 4000; i++) {
    const L = new E.Life({ auto: true });
    L.init();
    let g = 0;
    while (L.alive && g++ < 130) {
      for (const d of L.beginYear()) {
        if (d.everyday) { seenC.add(d.id); choices++; for (const o of d.opts) assert.ok(o.hint !== undefined && o.w > 0); }
        L.resolve(d, L.autoChoice(d));
      }
      for (const e of L.endYear()) if (e.daily) { seenD.add(e.id); daily++; }
      years++;
      if (L.alive && g % 7 === 0) for (const [k, v] of Object.entries(L.stats())) assert.ok(v >= 0 && v <= 100, `${k} = ${v}`);
    }
  }
  assert.deepStrictEqual(E.DAILY.map(d => d.id).filter(id => !seenD.has(id)), [], 'бытовые события, которых не было');
  assert.deepStrictEqual(E.CHOICES.map(d => d.id).filter(id => !seenC.has(id)), [], 'бытовые выборы, которых не было');
  assert.ok(daily / years > 0.5 && daily / years < 1.01, 'примерно одно обычное событие в год: ' + daily / years);
  assert.ok(choices / years > 0.15 && choices / years < 0.4, 'бытовой выбор раз в 3–6 лет: ' + choices / years);
});

test('мир один для всех, кто родился в одну секунду', () => {
  const w = E.makeWorld(2026, 777);
  const lives = [0, 1, 2].map(() => { const r = E.simulateFull('births', false, w); return r.L; });
  assert.ok(lives.every(L => L.world === w));
  const a = E.makeWorld(2026, 777), b = E.makeWorld(2026, 777);
  for (let y = 2026; y < 2100; y++) assert.deepStrictEqual(a.at(y).map(e => e.t), b.at(y).map(e => e.t));
  const all = []; for (let y = 2026; y < 2101; y++) all.push(...w.at(y).map(e => e.t));
  assert.ok(all.some(t => /Население Земли/.test(t)), 'есть рубежи населения из прогноза ООН');
});

test('мировая статистика: поколение и доход в мире', () => {
  assert.ok(E.cohortSurvival(0) > 0.999 && E.cohortSurvival(5) < 0.99 && E.cohortSurvival(80) < 0.5);
  assert.ok(E.worldIncomePctl(50) < E.worldIncomePctl(500) && E.worldIncomePctl(5000) > 90);
  const z = 0.5;
  assert.ok(E.incomeIn(E.BY.NO, z) > E.incomeIn(E.BY.NE, z) * 10, 'то же место в обществе в Норвегии и Нигере');
});

test('соседи по секунде: снимки на каждый год', () => {
  const { L, snaps } = E.simulateFull('births', false);
  assert.strictEqual(snaps.length, L.age + 2, 'снимок при рождении и после каждого прожитого года');
  assert.strictEqual(snaps[snaps.length - 1].alive, false);
});
