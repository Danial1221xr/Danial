// Собирает data/countries.json из открытых источников.
// Запуск из папки игры:
//   cd tools && npm install && cd ..
//   node tools/fetch-data.js              — Всемирный банк через зеркало Gapminder на GitHub (по умолчанию)
//   node tools/fetch-data.js --official   — Всемирный банк напрямую через api.worldbank.org
//   node tools/fetch-data.js --refresh    — не использовать кэш tools/.cache
//
// Источники (у каждой цифры в countries.json сохраняются источник и год, оценки помечены est: true):
//   UN WPP 2024 — рождения, население, продолжительность жизни мужчин и женщин (R-пакет ООН wpp2024 на GitHub);
//   World Bank WDI — младенческая и детская смертность (UN IGME), ВВП ППС, Джини, охват вузами (UNESCO),
//     занятость в сельском хозяйстве (ILO), рождаемость (UN WPP), материнская смертность (WHO), ВИЧ (UNAIDS),
//     убийства (UNODC), курение (WHO GHO), детские браки (UNICEF), доля городского населения (UN);
//   Barro–Lee v3 — средние годы учёбы взрослых 25–64 лет;
//   World Happiness Report — удовлетворённость жизнью (через Gapminder).
// Пропуски заполняются средним по региону игры (взвешенным по населению) и помечаются как оценка.
const fs = require('fs');
const path = require('path');
const { readRData, rows } = require('./lib/rdata');
const META = require('./country-meta');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'data', 'countries.json');
const CACHE = path.join(__dirname, '.cache');
const args = process.argv.slice(2);
const OFFICIAL = args.includes('--official');
const REFRESH = args.includes('--refresh');

const GH = 'https://raw.githubusercontent.com';
const WDI_MIRROR = `${GH}/open-numbers/ddf--open_numbers--world_development_indicators/master/datapoints`;
const WPP = `${GH}/PPgp/wpp2024/main/data`;
const BL = `${GH}/barrolee/BarroLeeDataSet/master/BLData/BL_v3_MF.csv`;
const FT = `${GH}/open-numbers/ddf--gapminder--fasttrack/master/countries_etc_datapoints`;
const WHR = `${FT}/ddf--datapoints--hapiscore_whr--by--country--time.csv`;
// Запасные ряды Gapminder для стран, которых нет у Всемирного банка (Тайвань, КНДР, Куба, Эритрея…).
const GAPMINDER = {
  gdp: { file: 'gdp_pcap', note: 'Gapminder, ВВП на душу ППС (в ценах 2021 г.)', dp: -1 },
  u5: { file: 'child_mortality_0_5_year_olds_dying_per_1000_born', note: 'Gapminder (на основе UN IGME)', dp: 1 }
};
// Коды стран в зеркале Gapminder, отличающиеся от ISO.
const MIRROR_ISO = { XKX: 'KOS' };
const WPP_YEAR = 2023; // последний год оценок (не прогнозов) в WPP 2024

const SOURCES = {
  wpp: { title: 'UN World Population Prospects 2024 (Отдел народонаселения ООН)', url: 'https://population.un.org/wpp/', via: 'R-пакет wpp2024: https://github.com/PPgp/wpp2024' },
  wdi: { title: 'World Bank, World Development Indicators', url: 'https://databank.worldbank.org/source/world-development-indicators', via: OFFICIAL ? 'api.worldbank.org' : 'зеркало Gapminder: https://github.com/open-numbers/ddf--open_numbers--world_development_indicators' },
  bl: { title: 'Barro R., Lee J.-W. Educational Attainment Dataset v3 (1950–2015)', url: 'https://barrolee.github.io/BarroLeeDataSet/', via: 'https://github.com/barrolee/BarroLeeDataSet' },
  whr: { title: 'World Happiness Report (лестница Кантрила, 0–10)', url: 'https://worldhappiness.report/', via: 'Gapminder fasttrack: https://github.com/open-numbers/ddf--gapminder--fasttrack' },
  gapminder: { title: 'Gapminder Fast Track (запасной источник, когда нет данных Всемирного банка)', url: 'https://www.gapminder.org/data/', via: 'https://github.com/open-numbers/ddf--gapminder--fasttrack' },
  region: { title: 'Оценка: среднее по региону игры, взвешенное по населению' }
};

// Поля из World Bank WDI: индикатор, первичный источник, минимальный год, округление.
const WDI = {
  imr:   { ind: 'SP.DYN.IMRT.IN', orig: 'UN IGME', min: 2015, dp: 1 },
  u5:    { ind: 'SH.DYN.MORT', orig: 'UN IGME', min: 2015, dp: 1 },
  gdp:   { ind: 'NY.GDP.PCAP.PP.CD', orig: 'World Bank ICP', min: 2015, dp: -1 },
  gini:  { ind: 'SI.POV.GINI', orig: 'World Bank PIP', min: 2005, dp: 1 },
  tert:  { ind: 'SE.TER.ENRR', orig: 'UNESCO UIS', min: 2010, dp: 0 },
  agri:  { ind: 'SL.AGR.EMPL.ZS', orig: 'ILO (модельные оценки)', min: 2015, dp: 1 },
  fert:  { ind: 'SP.DYN.TFRT.IN', orig: 'UN WPP', min: 2015, dp: 2 },
  mmr:   { ind: 'SH.STA.MMRT', orig: 'WHO / MMEIG', min: 2015, dp: 0 },
  hiv:   { ind: 'SH.DYN.AIDS.ZS', orig: 'UNAIDS', min: 2015, dp: 2 },
  hom:   { ind: 'VC.IHR.PSRC.P5', orig: 'UNODC', min: 2012, dp: 1 },
  smoke: { ind: 'SH.PRV.SMOK', orig: 'WHO GHO', min: 2015, dp: 1 },
  cm:    { ind: 'SP.M18.2024.FE.ZS', orig: 'UNICEF', min: 2005, dp: 1 },
  urb:   { ind: 'SP.URB.TOTL.IN.ZS', orig: 'UN World Urbanization Prospects', min: 2015, dp: 0 },
  // быт: доля людей с электричеством, чистой водой, туалетом, чистым топливом для готовки и интернетом (город / деревня)
  elec:  { ind: 'EG.ELC.ACCS.ZS', orig: 'World Bank / SE4ALL', min: 2015, dp: 0 },
  elecU: { ind: 'EG.ELC.ACCS.UR.ZS', orig: 'World Bank / SE4ALL', min: 2015, dp: 0 },
  elecR: { ind: 'EG.ELC.ACCS.RU.ZS', orig: 'World Bank / SE4ALL', min: 2015, dp: 0 },
  water: { ind: 'SH.H2O.BASW.ZS', orig: 'WHO/UNICEF JMP', min: 2015, dp: 0 },
  waterU:{ ind: 'SH.H2O.BASW.UR.ZS', orig: 'WHO/UNICEF JMP', min: 2015, dp: 0 },
  waterR:{ ind: 'SH.H2O.BASW.RU.ZS', orig: 'WHO/UNICEF JMP', min: 2015, dp: 0 },
  sanit: { ind: 'SH.STA.BASS.ZS', orig: 'WHO/UNICEF JMP', min: 2015, dp: 0 },
  sanitU:{ ind: 'SH.STA.BASS.UR.ZS', orig: 'WHO/UNICEF JMP', min: 2015, dp: 0 },
  sanitR:{ ind: 'SH.STA.BASS.RU.ZS', orig: 'WHO/UNICEF JMP', min: 2015, dp: 0 },
  cook:  { ind: 'EG.CFT.ACCS.ZS', orig: 'WHO', min: 2015, dp: 0 },
  net:   { ind: 'IT.NET.USER.ZS', orig: 'ITU', min: 2015, dp: 0 }
};
const ORDER = ['births', 'pop', 'leM', 'leF', 'imr', 'u5', 'gdp', 'gini', 'school', 'tert', 'agri', 'fert', 'mmr', 'hiv', 'hom', 'smoke', 'sat', 'cm', 'urb', 'elec', 'elecU', 'elecR', 'water', 'waterU', 'waterR', 'sanit', 'sanitU', 'sanitR', 'cook', 'net'];
// Если в регионе нет ни одного значения, для этих полей ставится 0 (например, детские браки в богатых странах).
const ZERO_IF_EMPTY = new Set(['cm', 'hiv']);

/* ---------- загрузка с кэшем ---------- */
async function get(url, binary) {
  fs.mkdirSync(CACHE, { recursive: true });
  const file = path.join(CACHE, url.replace(/^https?:\/\//, '').replace(/[^\w.-]+/g, '_').slice(-180));
  if (!REFRESH && fs.existsSync(file)) return binary ? fs.readFileSync(file) : fs.readFileSync(file, 'utf8');
  for (let attempt = 1; ; attempt++) {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      const buf = Buffer.from(await r.arrayBuffer());
      fs.writeFileSync(file, buf);
      return binary ? buf : buf.toString('utf8');
    } catch (e) {
      if (attempt >= 4) throw new Error(`Не удалось скачать ${url}: ${e.message}`);
      await new Promise(res => setTimeout(res, 2000 * 2 ** (attempt - 1)));
    }
  }
}

function parseCSV(text) {
  const out = [];
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter(Boolean);
  const split = l => { const a = []; let cur = '', q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === ',' && !q) { a.push(cur); cur = ''; } else cur += ch; } a.push(cur); return a; };
  const h = split(lines[0]);
  for (let i = 1; i < lines.length; i++) { const a = split(lines[i]); const o = {}; h.forEach((k, j) => { o[k] = a[j]; }); out.push(o); }
  return out;
}

// Последнее значение не раньше minYear: { iso3: {v, y} }.
function latest(list, minYear) {
  const out = {};
  for (const { iso3, y, v } of list) {
    if (v === null || !Number.isFinite(v) || y < minYear) continue;
    if (!out[iso3] || y > out[iso3].y) out[iso3] = { v, y };
  }
  return out;
}

async function wdiSeries(ind) {
  if (OFFICIAL) {
    const url = `https://api.worldbank.org/v2/country/all/indicator/${ind}?format=json&per_page=20000&date=2000:2026`;
    const [, data] = JSON.parse(await get(url));
    return (data || []).map(r => ({ iso3: r.countryiso3code, y: +r.date, v: r.value === null ? null : +r.value }));
  }
  const key = ind.toLowerCase().replace(/\./g, '_');
  const text = await get(`${WDI_MIRROR}/ddf--datapoints--${key}--by--geo--time.csv`);
  return parseCSV(text).map(r => ({ iso3: r.geo.toUpperCase(), y: +r.time, v: r[key] === '' ? null : +r[key] }));
}

async function wpp(name) {
  const o = readRData(await get(`${WPP}/${name}.rda`, true));
  return rows(o[name]);
}

/* ---------- сборка ---------- */
(async () => {
  const wc = require('world-countries');
  const iso = {};
  for (const c of wc) iso[c.cca2] = { iso3: c.cca3, num: +c.ccn3 };
  iso.XK = { iso3: 'XKX', num: 412 }; // Косово: в WPP код 412, во Всемирном банке XKX

  console.log('UN WPP 2024…');
  const misc = {}, e0 = {};
  for (const r of await wpp('misc1dt')) if (r.year === WPP_YEAR) misc[r.country_code] = r;
  for (const r of await wpp('e01dt')) if (r.year === WPP_YEAR) e0[r.country_code] = r;

  console.log('World Bank WDI…');
  const wdi = {};
  for (const [f, s] of Object.entries(WDI)) wdi[f] = latest(await wdiSeries(s.ind), s.min);

  // Устаревшие значения (раньше минимального года, но не раньше 2000) — запасной вариант, помечается как оценка.
  const wdiOld = {};
  for (const [f, s] of Object.entries(WDI)) wdiOld[f] = latest(await wdiSeries(s.ind), 2000);

  console.log('Gapminder…');
  const gm = {};
  for (const [f, g] of Object.entries(GAPMINDER)) {
    const series = parseCSV(await get(`${FT}/ddf--datapoints--${g.file}--by--country--time.csv`)).map(r => ({ iso3: r.country.toUpperCase(), y: +r.time, v: r[g.file] === '' ? null : +r[g.file] }));
    gm[f] = latest(series.filter(r => r.y <= 2024), 2015); // только оценки, без прогнозов Gapminder на будущие годы
  }

  console.log('Barro–Lee…');
  const bl = {};
  { // взвешенное по населению среднее для 25–64 лет, последний год
    const acc = {};
    for (const r of parseCSV(await get(BL))) {
      if (+r.agefrom < 25 || +r.ageto > 64) continue;
      const k = r.WBcode, y = +r.year;
      if (!acc[k] || acc[k].y < y) acc[k] = { y, s: 0, w: 0 };
      if (acc[k].y === y) { acc[k].s += +r.yr_sch * +r.pop; acc[k].w += +r.pop; }
    }
    for (const k in acc) bl[k === 'ROM' ? 'ROU' : k === 'SER' ? 'SRB' : k] = { v: acc[k].s / acc[k].w, y: acc[k].y };
  }

  console.log('World Happiness Report…');
  const whr = latest(parseCSV(await get(WHR)).map(r => ({ iso3: r.country.toUpperCase(), y: +r.time, v: r.hapiscore_whr === '' ? null : +r.hapiscore_whr / 10 })), 2015);

  const round = (v, dp) => dp < 0 ? Math.round(v / 10 ** -dp) * 10 ** -dp : +v.toFixed(dp);
  const countries = [];
  for (const m of META) {
    const id = iso[m.code];
    if (!id) throw new Error('Нет ISO-кодов для ' + m.code);
    const c = { code: m.code, iso3: id.iso3, num: id.num, name: m.name, inName: m.inName, region: m.region, names: m.names };
    const src = {};
    const mi = misc[id.num], le = e0[id.num];
    if (!mi || !le) throw new Error('Нет данных WPP для ' + m.code);
    c.births = mi.births >= 100 ? Math.round(mi.births) : +mi.births.toFixed(1);
    c.pop = +(mi.births / mi.cbr).toFixed(3); // млн: рождения (тыс.) / CBR (на 1000)
    c.leM = +le.e0M.toFixed(1); c.leF = +le.e0F.toFixed(1);
    for (const f of ['births', 'pop', 'leM', 'leF']) src[f] = { s: 'wpp', y: WPP_YEAR };
    const mk = OFFICIAL ? id.iso3 : (MIRROR_ISO[id.iso3] || id.iso3);
    for (const [f, s] of Object.entries(WDI)) {
      const d = wdi[f][mk], g = GAPMINDER[f] && gm[f][mk], old = wdiOld[f][mk];
      if (d) { c[f] = round(d.v, s.dp); src[f] = { s: 'wdi', ind: s.ind, orig: s.orig, y: d.y }; }
      else if (g) { c[f] = round(g.v, GAPMINDER[f].dp); src[f] = { s: 'gapminder', note: GAPMINDER[f].note, y: g.y, est: true }; }
      else if (old) { c[f] = round(old.v, s.dp); src[f] = { s: 'wdi', ind: s.ind, orig: s.orig, y: old.y, est: true, note: 'последнее доступное значение' }; }
    }
    if (bl[id.iso3]) { c.school = +bl[id.iso3].v.toFixed(1); src.school = { s: 'bl', y: bl[id.iso3].y, note: 'взрослые 25–64 лет' }; }
    if (whr[id.iso3]) { c.sat = +whr[id.iso3].v.toFixed(2); src.sat = { s: 'whr', y: whr[id.iso3].y }; }
    c.src = src;
    countries.push(c);
  }

  // Младенческая смертность из детской: по медианному отношению imr/u5 в регионе.
  const filled = {};
  for (const c of countries) if (c.imr === undefined && c.u5 !== undefined) {
    const r = countries.filter(o => o.region === c.region && o.imr !== undefined && o.src.imr.s === 'wdi' && !o.src.imr.est).map(o => o.imr / o.u5).sort((a, b) => a - b);
    c.imr = +(c.u5 * r[Math.floor(r.length / 2)]).toFixed(1);
    c.src.imr = { s: 'region', est: true, note: 'из смертности до 5 лет по типичному для региона соотношению' };
    (filled.imr = filled.imr || []).push(c.code);
  }

  // Пропуски → среднее по региону игры, взвешенное по населению.
  for (const f of ORDER) {
    const dp = WDI[f] ? WDI[f].dp : f === 'sat' ? 2 : 1;
    for (const c of countries) {
      if (c[f] !== undefined) continue;
      const peers = countries.filter(o => o.region === c.region && o.src[f] && !o.src[f].est);
      let v;
      if (peers.length) v = peers.reduce((s, o) => s + o[f] * o.pop, 0) / peers.reduce((s, o) => s + o.pop, 0);
      else if (ZERO_IF_EMPTY.has(f)) v = 0;
      else { const all = countries.filter(o => o.src[f] && !o.src[f].est); v = all.reduce((s, o) => s + o[f] * o.pop, 0) / all.reduce((s, o) => s + o.pop, 0); }
      c[f] = round(v, dp);
      c.src[f] = { s: 'region', est: true };
      (filled[f] = filled[f] || []).push(c.code);
    }
  }
  // Детская смертность (до 5 лет) не может быть меньше младенческой.
  for (const c of countries) if (c.u5 < c.imr) c.u5 = c.imr;

  // Порядок полей как в прежнем RAW, src в конце.
  const ordered = countries.map(c => {
    const o = { code: c.code, iso3: c.iso3, num: c.num, name: c.name, inName: c.inName, region: c.region, names: c.names };
    for (const f of ORDER) o[f] = c[f];
    o.src = c.src;
    return o;
  });

  // Сверка с прежними данными (цифры прототипа были введены приблизительно).
  let old = null;
  try { old = JSON.parse(fs.readFileSync(OUT, 'utf8')).countries; } catch (e) { /* нет файла */ }
  if (old && old.some(c => c.src && Object.values(c.src).some(s => /прототип/.test(s.s)))) writeComparison(old, ordered);

  const out = {
    meta: {
      generated: new Date().toISOString().slice(0, 10),
      note: 'Сгенерировано tools/fetch-data.js. Не редактируйте вручную — правьте tools/country-meta.js и перезапустите скрипт.',
      units: { births: 'тыс. в год', pop: 'млн', leM: 'лет', leF: 'лет', imr: 'на 1000 рождений', u5: 'на 1000 рождений', gdp: 'ВВП на душу, ППС, межд. $ текущих цен', gini: 'индекс 0–100', school: 'лет', tert: '% (валовой охват)', agri: '% занятых', fert: 'детей на женщину', mmr: 'на 100 000 рождений', hiv: '% 15–49 лет', hom: 'на 100 000', smoke: '% 15+ (стандартизовано по возрасту)', sat: '0–10', cm: '% женщин 20–24, вышедших замуж до 18', urb: '% населения', elec: '% с электричеством (U — город, R — деревня)', water: '% с базовым доступом к питьевой воде', sanit: '% с базовыми санитарными условиями', cook: '% готовят на чистом топливе', net: '% пользуются интернетом' },
      sources: SOURCES
    },
    countries: ordered
  };
  // Одна строка на страну: так файл удобно читать и сравнивать в git.
  fs.writeFileSync(OUT, '{"meta":' + JSON.stringify(out.meta, null, 1) + ',\n"countries":[\n' + ordered.map(c => JSON.stringify(c)).join(',\n') + '\n]}\n');

  console.log(`\nГотово: ${ordered.length} стран, ${ordered.reduce((s, c) => s + c.births, 0).toFixed(0)} тыс. рождений в год.`);
  console.log('Оценки (не первичные данные): ');
  for (const f of ORDER) { const e = ordered.filter(c => c.src[f].est && c.src[f].s !== 'region'); if (e.length) console.log(`  ${f.padEnd(6)} ${e.map(c => c.code + ':' + c.src[f].s + '/' + c.src[f].y).join(' ')}`); }
  console.log('Заполнено средним по региону:');
  for (const f of ORDER) if (filled[f]) console.log(`  ${f.padEnd(6)} ${filled[f].length}: ${filled[f].join(' ')}`);
})().catch(e => { console.error(e.message); process.exit(1); });

function writeComparison(old, fresh) {
  const F = [['leM', 'LE муж.'], ['leF', 'LE жен.'], ['imr', 'Младенч. смертн.'], ['u5', 'Смертн. до 5'], ['gdp', 'ВВП ППС'], ['gini', 'Джини'], ['school', 'Годы учёбы'], ['tert', 'Вузы %'], ['agri', 'С/х %'], ['fert', 'Рождаемость'], ['mmr', 'Матер. смертн.'], ['hom', 'Убийства'], ['smoke', 'Курение %'], ['sat', 'Удовл. жизнью'], ['cm', 'Дет. браки %'], ['births', 'Рождения, тыс.']];
  const by = Object.fromEntries(fresh.map(c => [c.code, c]));
  const lines = ['# Сверка данных прототипа с источниками', '', `Сформировано tools/fetch-data.js ${new Date().toISOString().slice(0, 10)}. Формат ячейки: было → стало. Жирным — расхождение больше 15 %.`, ''];
  lines.push('| Страна | ' + F.map(f => f[1]).join(' | ') + ' |', '|' + ' --- |'.repeat(F.length + 1));
  let big = 0;
  for (const o of old) {
    const n = by[o.code]; if (!n) continue;
    const cells = F.map(([f]) => {
      const a = o[f], b = n[f];
      const off = Math.abs(b - a) > 0.15 * Math.max(Math.abs(a), Math.abs(b), f === 'hom' || f === 'cm' || f === 'hiv' ? 2 : 0.01);
      if (off) big++;
      const s = `${a} → ${b}${n.src[f] && n.src[f].est ? ' (оц.)' : ''}`;
      return off ? `**${s}**` : s;
    });
    lines.push(`| ${o.name} | ${cells.join(' | ')} |`);
  }
  lines.push('', `Всего расхождений больше 15 %: ${big}.`, '');
  fs.writeFileSync(path.join(ROOT, 'data', 'comparison-prototype.md'), lines.join('\n'));
  console.log(`Сверка с прототипом записана в data/comparison-prototype.md (расхождений > 15 %: ${big})`);
}
