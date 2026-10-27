// Пересчитывает поправки CAL в index.html.
// Запуск из корня проекта:  node tools/calibrate.js
// Нужен после любых изменений данных стран или правил смертности/дохода.
// Для каждой страны и пола симулирует тысячи жизней и подгоняет:
//   m, f — множитель смертности, чтобы средний возраст смерти ≈ ожидаемая продолжительность жизни − 0,5;
//   zb   — сдвиг дохода, чтобы средний доход взрослых совпадал со средним по стране.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const file = path.join(__dirname, '..', 'index.html');
const html = fs.readFileSync(file, 'utf8');
const m = html.match(/<script id="engine">([\s\S]*?)<\/script>/);
if (!m) throw new Error('Не найден <script id="engine"> в index.html');

const sandbox = { module: { exports: {} }, Math, console };
vm.createContext(sandbox);
vm.runInContext(m[1], sandbox);
const E = sandbox.module.exports;

const CAL = {};
for (const c of E.COUNTRIES) CAL[c.code] = { m: 1, f: 1, zb: 0 };
E.setCal(CAL);

function run(c, sex, n) {
  let sum = 0, zs = 0, zn = 0;
  for (let i = 0; i < n; i++) {
    const L = new E.Life({ auto: true, country: c });
    L.sex = sex; L.q = E.getTable(c, sex); L.init();
    let g = 0;
    while (L.alive && g++ < 130) {
      for (const d of L.beginYear()) L.resolve(d, L.autoChoice(d));
      L.endYear();
      if (L.zp !== null && !L.migrated && L.age >= 25 && L.age <= 60) { zs += L.zp; zn++; }
    }
    sum += L.age;
  }
  return { mean: sum / n, zb: zn ? zs / zn : 0 };
}

const ITER = 4;
for (let it = 0; it < ITER; it++) {
  const last = it === ITER - 1;
  for (const c of E.COUNTRIES) {
    const N = last ? 3000 : 1500;
    let zb = 0;
    for (const sex of ['m', 'f']) {
      const r = run(c, sex, N);
      const target = (sex === 'm' ? c.leM : c.leF) - 0.5;
      CAL[c.code][sex] *= Math.exp(0.088 * (r.mean - target) * 0.9);
      zb += r.zb / 2;
      if (last) process.stdout.write(`${c.code}${sex} ${r.mean.toFixed(1)}/${target}  `);
    }
    if (!last) CAL[c.code].zb = zb;
  }
  process.stdout.write(`\nИтерация ${it + 1}/${ITER} готова\n`);
}

const out = {};
for (const k in CAL) out[k] = { m: +CAL[k].m.toFixed(3), f: +CAL[k].f.toFixed(3), zb: +CAL[k].zb.toFixed(3) };
const next = html.replace(/let CAL=\{[\s\S]*?\};/, 'let CAL=' + JSON.stringify(out) + ';');
if (next === html) throw new Error('Не найдена строка "let CAL={...};" в index.html');
fs.writeFileSync(file, next);
console.log('CAL обновлён в index.html');
