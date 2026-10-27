// Загружает движок и данные из data/ для запуска в Node (калибровка, тесты).
const path = require('path');
const fs = require('fs');

function loadEngine({ cal } = {}) {
  const E = require('../js/engine.js');
  const dir = path.join(__dirname, '..', 'data');
  const read = f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  E.setData(read('countries.json').countries, read('names.json'), cal || read('cal.json'));
  return E;
}

module.exports = { loadEngine };
