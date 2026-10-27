# Лотерея рождения

Симуляция жизни: вы рождаетесь случайным ребёнком (страна выпадает по реальной статистике рождений) и проживаете его жизнь год за годом.

## Запуск

Сборка и установка не нужны, но данные стран лежат в отдельных JSON-файлах, поэтому игру нужно открывать через локальный сервер (двойной щелчок по `index.html` не сработает — браузер не даст загрузить `data/*.json`):

```
cd birth-lottery
python3 -m http.server 8000      # или: npx serve .
```

и откройте http://localhost:8000.

## Структура

- `index.html` — разметка экранов.
- `css/style.css` — дизайн, цветовые токены светлой и тёмной темы.
- `js/engine.js` — движок без DOM (работает и в браузере, и в Node).
- `js/ui.js` — интерфейс.
- `js/ai.js`, `js/config.js` — клиент ИИ и его настройки.
- `data/countries.json` — статистика стран, `data/names.json` — имена, `data/cal.json` — поправки калибровки.
- `tools/` — калибровка и сбор данных, `tests/` — тесты движка.

## Работа с Claude Code

1. Установите Claude Code: https://docs.claude.com/en/docs/claude-code/overview
2. В терминале перейдите в папку проекта и запустите:

   ```
   cd birth-lottery
   claude
   ```

3. Claude Code сам прочитает `CLAUDE.md`, где описаны контекст, устройство движка и план.

## Калибровка и тесты

После изменения данных стран или правил симуляции запустите:

```
node tools/calibrate.js          # пересчитать data/cal.json
node tools/calibrate.js --check  # только проверить отклонения
node --test                      # тесты движка
```

## Данные стран

`data/countries.json` собирается скриптом `tools/fetch-data.js` из открытых источников (172 страны, у каждой цифры — источник и год в поле `src`, оценки помечены `est: true`):

- UN World Population Prospects 2024 — рождения, население, продолжительность жизни (R-пакет ООН `wpp2024` на GitHub);
- World Bank World Development Indicators — смертность детей, ВВП ППС, Джини, образование, занятость, здоровье, урбанизация (по умолчанию через зеркало Gapminder на GitHub, с флагом `--official` — напрямую через api.worldbank.org);
- Barro–Lee v3 — средние годы учёбы взрослых;
- World Happiness Report — удовлетворённость жизнью;
- Gapminder — запасной источник для стран без данных Всемирного банка (Тайвань, КНДР, Куба и др.).

```
cd tools && npm install && cd ..
node tools/fetch-data.js
node tools/calibrate.js
```

Русские названия, регионы и группы имён стран — в `tools/country-meta.js`, имена — в `data/names.json`. Сверка старых цифр прототипа с источниками — `data/comparison-prototype.md`, последний отчёт калибровки — `tools/calibration-report.txt`.
