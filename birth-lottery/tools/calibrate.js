// Пересчитывает поправки калибровки и записывает их в data/cal.json.
// Запуск из папки игры:  node tools/calibrate.js            (полная калибровка, несколько минут)
//                        node tools/calibrate.js --check    (только проверка текущих поправок)
//                        node tools/calibrate.js --only KZ,RU --n 4000
//                        node tools/calibrate.js --reset    (начать с нуля, а не с текущих поправок)
//                        node tools/calibrate.js --start 20000 --iter 1   (дошлифовать уже близкие поправки на больших выборках)
// Нужен после любых изменений данных стран или правил смертности/дохода.
// Для каждой страны и пола симулирует тысячи жизней и подгоняет:
//   m, f — множитель смертности, чтобы средний возраст смерти ≈ ожидаемая продолжительность жизни − 0,5;
//   zb   — сдвиг z-оценки дохода, чтобы личный доход был центрирован (процентили «беднее/богаче» честные);
//   ki   — множитель дохода, чтобы средний доход взрослых совпадал со средним по стране (ВВП ППС × 0,55).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const { loadEngine } = require('./load-engine');

const CAL_FILE = path.join(__dirname, '..', 'data', 'cal.json');
const REPORT_FILE = path.join(__dirname, 'calibration-report.txt');

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
// Размер выборки растёт от итерации к итерации; последний прогон только измеряет итог (поправки уже не меняет).
const N = +(opt('--n') || 30000);
const ITER = +(opt('--iter') || 5);
const START = +(opt('--start') || 2000);
const SCHEDULE = CHECK ? [N] : [...Array.from({ length: ITER }, (_, i) => Math.round(Math.min(N, START * 2 ** i))), N];
const THREADS = Math.max(1, Math.min(+(opt('--threads') || os.cpus().length), 16));

const E0 = loadEngine();
const only = opt('--only') ? opt('--only').split(',') : null;
const codes = E0.COUNTRIES.map(c => c.code).filter(k => !only || only.includes(k));
const CAL = JSON.parse(JSON.stringify(E0.getCal()));
for (const c of E0.COUNTRIES) CAL[c.code] = Object.assign({ m: 1, f: 1, zb: 0, ki: 1 }, CAL[c.code]);
if (args.includes('--reset')) for (const k of codes) CAL[k] = { m: 1, f: 1, zb: 0, ki: 1 };

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
  for (let it = 0; it < SCHEDULE.length; it++) {
    const last = it === SCHEDULE.length - 1;
    res = await simulate(SCHEDULE[it]);
    if (!last) for (const k of codes) {
      const c = E0.BY[k], r = res[k];
      for (const sex of ['m', 'f']) {
        const target = (sex === 'm' ? c.leM : c.leF) - 0.5;
        CAL[k][sex] *= Math.exp(0.088 * (r[sex].mean - target) * 0.9);
      }
      CAL[k].zb = (r.m.zb + r.f.zb) / 2;
      const ratio = ((r.m.inc + r.f.inc) / 2) / (c.gdp * 0.55 / 12);
      if (ratio > 0 && it > 0) CAL[k].ki /= ratio; // доход подгоняется после того, как zb устоялся
    }
    // поправки сохраняются после каждой итерации: если прогон прервут, работа не пропадёт
    if (!last && !CHECK) saveCal();
    console.log(`${last ? 'Проверка' : 'Итерация ' + (it + 1) + '/' + (SCHEDULE.length - 1)}: ${SCHEDULE[it]} жизней на пол (${Math.round((Date.now() - t0) / 1000)} с)`);
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
  const sd = 25; // типичное стандартное отклонение возраста смерти
  console.log(`\nМаксимальное отклонение возраста смерти: ${worstAge.toFixed(2)} года (шум выборки при n=${N}: 1σ ≈ ${(sd / Math.sqrt(N)).toFixed(2)}, у худшей из ${codes.length * 2} групп ожидается ≈ ${(3 * sd / Math.sqrt(N)).toFixed(2)})`);
  console.log(`Максимальное отклонение дохода: ${(worstInc * 100).toFixed(1)}%`);
  if (!only) fs.writeFileSync(REPORT_FILE, `Отчёт калибровки ${new Date().toISOString().slice(0, 10)}, ${N} жизней на пол\n` +
    'Страна: средний возраст смерти / цель (LE − 0,5), средний доход взрослых / (ВВП ППС × 0,55)\n' + rows.join('\n') +
    `\n\nМаксимальное отклонение возраста смерти: ${worstAge.toFixed(2)} года\nМаксимальное отклонение дохода: ${(worstInc * 100).toFixed(1)}%\n`);

  if (!CHECK) {
    saveCal();
    console.log('Поправки записаны в data/cal.json');
  }
})();

function saveCal() {
  {
    const out = {};
    for (const k in CAL) if (E0.BY[k]) out[k] = { m: +CAL[k].m.toFixed(3), f: +CAL[k].f.toFixed(3), zb: +CAL[k].zb.toFixed(3), ki: +CAL[k].ki.toFixed(3) };
    fs.writeFileSync(CAL_FILE, JSON.stringify(out) + '\n');
  }
}
