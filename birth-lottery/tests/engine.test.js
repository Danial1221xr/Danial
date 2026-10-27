// Простые тесты движка. Запуск из папки игры: node --test
const test = require('node:test');
const assert = require('node:assert');
const { loadEngine } = require('../tools/load-engine');

const E = loadEngine();
const NUM = ['births', 'pop', 'leM', 'leF', 'imr', 'u5', 'gdp', 'gini', 'school', 'tert', 'agri', 'fert', 'mmr', 'hiv', 'hom', 'smoke', 'sat', 'cm'];
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

test('соседи по секунде: снимки на каждый год', () => {
  const { L, snaps } = E.simulateFull('births', false);
  assert.strictEqual(snaps.length, L.age + 2, 'снимок при рождении и после каждого прожитого года');
  assert.strictEqual(snaps[snaps.length - 1].alive, false);
});
