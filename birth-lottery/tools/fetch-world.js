// Собирает data/world-timeline.json — прогноз ООН (WPP 2024, средний вариант) по миру в целом на 2024–2100 годы:
// население, рождения, смерти, продолжительность жизни. Из него игра берёт новости «В мире».
// Запуск из папки игры:  node tools/fetch-world.js   (нужны зависимости tools: cd tools && npm install)
const fs = require('fs');
const path = require('path');
const { readRData, rows } = require('./lib/rdata');

const WPP = 'https://raw.githubusercontent.com/PPgp/wpp2024/main/data';
const WORLD = 900; // код «Мир» в WPP

async function load(name) {
  const r = await fetch(`${WPP}/${name}.rda`);
  if (!r.ok) throw new Error(`${name}: ${r.status}`);
  const o = readRData(Buffer.from(await r.arrayBuffer()));
  return rows(o[name]).filter(x => x.country_code === WORLD);
}

(async () => {
  const [misc, e0, pop] = await Promise.all([load('miscproj1dt'), load('e0proj1dt'), load('popproj1dt')]);
  const by = {};
  for (const r of pop) by[r.year] = { year: r.year, pop: +((r.popM + r.popF) / 1e6).toFixed(3) };
  for (const r of misc) if (by[r.year]) Object.assign(by[r.year], { births: +(r.births / 1000).toFixed(1), deaths: +(r.deaths / 1000).toFixed(1) });
  for (const r of e0) if (by[r.year]) Object.assign(by[r.year], { e0: +r.e0B.toFixed(1), e0M: +r.e0M.toFixed(1), e0F: +r.e0F.toFixed(1) });
  const years = Object.values(by).filter(y => y.births !== undefined && y.e0 !== undefined).sort((a, b) => a.year - b.year);
  const out = {
    source: 'UN World Population Prospects 2024, средний вариант прогноза (R-пакет wpp2024). Население в конце года, млрд; рождения и смерти, млн в год; продолжительность жизни, лет.',
    years
  };
  fs.writeFileSync(path.join(__dirname, '..', 'data', 'world-timeline.json'), JSON.stringify(out) + '\n');
  const peak = years.reduce((a, b) => b.pop > a.pop ? b : a);
  console.log(`data/world-timeline.json: ${years[0].year}–${years[years.length - 1].year}, пик населения ${peak.pop} млрд в ${peak.year}`);
})().catch(e => { console.error(e.message); process.exit(1); });
