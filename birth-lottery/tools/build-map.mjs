// Собирает data/world.json — готовые SVG-пути карты мира для стартового экрана.
// Источник: Natural Earth 1:110m (пакет world-atlas, общественное достояние), проекция Natural Earth.
// Запуск из папки игры:  cd tools && npm install && cd ..  →  node tools/build-map.mjs
// На странице не нужно ни одной библиотеки: только пути и точки для вспышек рождений.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { feature } from 'topojson-client';
import { geoNaturalEarth1, geoPath, geoContains, geoBounds } from 'd3-geo';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const topo = require('world-atlas/countries-110m.json');
const countries = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'countries.json'), 'utf8')).countries;
const wc = require('world-countries');

const W = 960, H = 500;
const geo = feature(topo, topo.objects.countries);
const projection = geoNaturalEarth1().fitExtent([[4, 4], [W - 4, H - 4]], { type: 'Sphere' });
const gp = geoPath(projection);
const round = d => d.replace(/-?\d+\.\d+/g, n => (+n).toFixed(1)).replace(/\.0(?=\D|$)/g, '');

// Сеанс воспроизводим: точки для вспышек одинаковые при каждой сборке.
let seed = 42;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };

const byNum = {};
for (const f of geo.features) if (f.id !== undefined) byNum[+f.id] = f;
const kosovo = geo.features.find(f => /kosovo/i.test(f.properties.name || ''));

const paths = {}, pts = {}, missing = [];
const used = new Set();
for (const c of countries) {
  const f = c.code === 'XK' ? kosovo : byNum[c.num];
  if (f) {
    used.add(f);
    paths[c.code] = round(gp(f));
    // до 16 случайных точек внутри границ страны
    const [[x0, y0], [x1, y1]] = geoBounds(f);
    const list = [];
    for (let i = 0; i < 400 && list.length < 16; i++) {
      const lon = x0 + (x1 >= x0 ? x1 - x0 : x1 + 360 - x0) * rnd(), lat = y0 + (y1 - y0) * rnd();
      const L = lon > 180 ? lon - 360 : lon;
      if (geoContains(f, [L, lat])) { const [x, y] = projection([L, lat]); list.push([+x.toFixed(1), +y.toFixed(1)]); }
    }
    if (!list.length) { const [x, y] = gp.centroid(f); list.push([+x.toFixed(1), +y.toFixed(1)]); }
    pts[c.code] = list;
  } else {
    // слишком маленькая для карты страна — точка по координатам столицы/центра
    const w = wc.find(x => x.cca2 === c.code);
    const [lat, lon] = w ? w.latlng : [0, 0];
    const [x, y] = projection([lon, lat]);
    pts[c.code] = [[+x.toFixed(1), +y.toFixed(1)]];
    missing.push(c.code);
  }
}
// остальная суша (Антарктида, Гренландия, мелкие территории) — одним путём фона
const rest = round(gp({ type: 'FeatureCollection', features: geo.features.filter(f => !used.has(f)) }));
const sphere = round(gp({ type: 'Sphere' }));

const out = { source: 'Natural Earth 1:110m через world-atlas 2.0.2, проекция Natural Earth', w: W, h: H, sphere, rest, paths, pts };
fs.writeFileSync(path.join(ROOT, 'data', 'world.json'), JSON.stringify(out));
console.log(`data/world.json: ${Object.keys(paths).length} стран с контуром, ${missing.length} только точкой (${missing.join(' ')}), ${(JSON.stringify(out).length / 1024).toFixed(0)} КБ`);
