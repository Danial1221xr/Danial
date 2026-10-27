// Пересчитывает поправки калибровки и записывает их в data/cal.json.
// Запуск из папки игры:  node tools/calibrate.js            (полная калибровка, несколько минут)
//                        node tools/calibrate.js --check    (только проверка текущих поправок)
//                        node tools/calibrate.js --only KZ,RU --n 4000
// Нужен после любых изменений данных стран или правил смертности/дохода.
// Для каждой страны и пола симулирует тысячи жизней и подгоняет:
//   m, f — множитель смертности, чтобы средний возраст смерти ≈ ожидаемая продолжительность жизни − 0,5;
//   zb   — сдвиг дохода, чтобы средний доход взрослых совпадал со средним по стране (ВВП ППС × 0,55).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const { loadEngine } = require('./load-engine');

const CAL_FILE = path.join(__dirname, '..', 'data', 'cal.json');

// Одна страна, один пол: средний возраст смерти, средний сдвиг z и средний доход взрослых.
function run(E, c, sex, n) {
  let sum = 0, zs = 0, zn = 0, inc = 0, incN = 0;
  for (let i = 0; i < n; i++) {
    const L = new E.Life({ auto: true, country: c });
    L.sex = sex; L.q = E.getTable(c, sex); L.init();
    let g = 0;
    while (L.alive && g++ < 130) {
      for (const d of L.beginYear()) L.resolve(d, L.autoChoice(d));
      L.endYear();
      if (L.alive && L.zp !== null && !L.migrated && L.age >= 25 && L.age <= 60) {
        zs += L.zp; zn++;
        inc += L.income(); incN++;
      }
    }
    sum += L.age;
  }
  return { mean: sum / n, zb: zn ? zs / zn : 0, inc: incN ? inc / incN : 0 };
}

if (!isMainThread) {
  const E = loadEngine({ cal: workerData.cal });
  const out = {};
  for (const code of workerData.codes) {
    const c = E.BY[code];
    out[code] = { m: run(E, c, 'm', workerData.n), f: run(E, c, 'f', workerData.n) };
  }
  parentPort.postMessage(out);
  return;
}

const args = process.argv.slice(2);
const opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const CHECK = args.includes('--check');
const ITER = +(opt('--iter') || (CHECK ? 1 : 4));
const N = +(opt('--n') || 3000);
const THREADS = Math.max(1, Math.min(+(opt('--threads') || os.cpus().length), 16));

const E0 = loadEngine();
const only = opt('--only') ? opt('--only').split(',') : null;
const codes = E0.COUNTRIES.map(c => c.code).filter(k => !only || only.includes(k));
const CAL = JSON.parse(JSON.stringify(E0.getCal()));
for (const c of E0.COUNTRIES) if (!CAL[c.code]) CAL[c.code] = { m: 1, f: 1, zb: 0 };
if (!CHECK && !only) for (const k of codes) CAL[k] = { m: 1, f: 1, zb: CAL[k].zb || 0 };

function simulate(n) {
  // Крупные страны вперемешку с мелкими, чтобы потоки были загружены равномерно.
  const chunks = Array.from({ length: THREADS }, () => []);
  codes.forEach((k, i) => chunks[i % THREADS].push(k));
  return Promise.all(chunks.filter(ch => ch.length).map(ch => new Promise((res, rej) => {
    const w = new Worker(__filename, { workerData: { codes: ch, cal: CAL, n } });
    w.on('message', res); w.on('error', rej);
  }))).then(parts => Object.assign({}, ...parts));
}

(async () => {
  const t0 = Date.now();
  let res;
  for (let it = 0; it < ITER; it++) {
    const last = it === ITER - 1;
    res = await simulate(last ? N : Math.round(N / 2));
    if (!CHECK) for (const k of codes) {
      const c = E0.BY[k], r = res[k];
      for (const sex of ['m', 'f']) {
        const target = (sex === 'm' ? c.leM : c.leF) - 0.5;
        CAL[k][sex] *= Math.exp(0.088 * (r[sex].mean - target) * 0.9);
      }
      if (!last) CAL[k].zb = (r.m.zb + r.f.zb) / 2;
    }
    console.log(`Итерация ${it + 1}/${ITER} готова (${Math.round((Date.now() - t0) / 1000)} с)`);
  }

  // Отчёт: отклонение возраста смерти от LE − 0,5 и отношение дохода к ВВП ППС × 0,55.
  let worstAge = 0, worstInc = 0;
  const rows = [];
  for (const k of codes) {
    const c = E0.BY[k], r = res[k];
    const dm = r.m.mean - (c.leM - 0.5), df = r.f.mean - (c.leF - 0.5);
    const ratio = ((r.m.inc + r.f.inc) / 2) / (c.gdp * 0.55 / 12);
    worstAge = Math.max(worstAge, Math.abs(dm), Math.abs(df));
    worstInc = Math.max(worstInc, Math.abs(ratio - 1));
    rows.push(`${k.padEnd(3)} м ${r.m.mean.toFixed(1)}/${(c.leM - 0.5).toFixed(1)} (${dm >= 0 ? '+' : ''}${dm.toFixed(2)})  ж ${r.f.mean.toFixed(1)}/${(c.leF - 0.5).toFixed(1)} (${df >= 0 ? '+' : ''}${df.toFixed(2)})  доход ×${ratio.toFixed(3)}`);
  }
  console.log('\nСтрана: средний возраст смерти / цель (LE − 0,5), средний доход взрослых / (ВВП ППС × 0,55)');
  console.log(rows.join('\n'));
  console.log(`\nМаксимальное отклонение возраста смерти: ${worstAge.toFixed(2)} года (шум выборки при n=${N} ≈ ±${(2 * 20 / Math.sqrt(N)).toFixed(2)})`);
  console.log(`Максимальное отклонение дохода: ${(worstInc * 100).toFixed(1)}%`);

  if (!CHECK) {
    const out = {};
    for (const k in CAL) out[k] = { m: +CAL[k].m.toFixed(3), f: +CAL[k].f.toFixed(3), zb: +CAL[k].zb.toFixed(3) };
    fs.writeFileSync(CAL_FILE, JSON.stringify(out) + '\n');
    console.log('Поправки записаны в data/cal.json');
  }
})();
