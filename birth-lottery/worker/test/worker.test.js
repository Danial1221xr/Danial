// Тесты Worker'а без сети: fetch подменяется, ответы провайдеров — заготовки.
// Запуск: из папки игры `node --test` или из worker/ `npm test`.
import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { _resetLimits } from '../src/index.js';
import { toGeminiSchema } from '../src/providers.js';
import { isInappropriate, outputIsSafe } from '../src/filter.js';

const ORIGIN = 'http://localhost:8000';
const ENV = { PROVIDER: 'gemini', MODEL: '', ALLOWED_ORIGINS: ORIGIN, MAX_INPUT: '200', RATE_LIMIT: '100', GEMINI_API_KEY: 'test-key-123' };
const DREAM = { appropriate: true, sphere: 'medicine', title: 'Врач', edu: 'uni', needUni: true, needMove: false, difficulty: 3, short: 'Долгая учёба, потом работа в больнице.' };
const FORK = { title: 'Медицинский класс', text: 'В городе открыли медицинский класс. Туда берут по экзамену.', options: [
  { label: 'Готовиться к экзамену', hint: 'Каждый вечер за учебниками', kind: 'study' },
  { label: 'Остаться в своей школе', hint: 'Рядом друзья', kind: 'safe' }] };

let calls = [];
function mockFetch(responder) {
  calls = [];
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url: String(url), headers: init.headers, body });
    const { status = 200, json } = responder(String(url), body);
    return new Response(JSON.stringify(json), { status, headers: { 'content-type': 'application/json' } });
  };
}
const gemini = obj => ({ json: { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(obj) }] } }] } });

function req(path, body, { origin = ORIGIN, method = 'POST', ip = '1.2.3.4' } = {}) {
  const headers = { 'content-type': 'application/json', 'CF-Connecting-IP': ip };
  if (origin) headers.Origin = origin;
  return new Request('https://ai.example.workers.dev' + path, { method, headers, body: method === 'POST' ? JSON.stringify(body) : undefined });
}
const call = (r, env = ENV) => worker.fetch(r, env);

test.beforeEach(() => _resetLimits());

test('CORS: чужой сайт получает 403, разрешённый — заголовки', async () => {
  mockFetch(() => gemini(DREAM));
  const bad = await call(req('/dream', { text: 'врачом' }, { origin: 'https://evil.example' }));
  assert.equal(bad.status, 403);
  assert.equal(bad.headers.get('access-control-allow-origin'), null);
  const pre = await call(new Request('https://x/dream', { method: 'OPTIONS', headers: { Origin: ORIGIN } }));
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get('access-control-allow-origin'), ORIGIN);
  const ok = await call(req('/dream', { text: 'врачом' }));
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get('access-control-allow-origin'), ORIGIN);
});

test('мечта: ключ уходит только в заголовке, ответ проверен по схеме', async () => {
  mockFetch(() => gemini({ ...DREAM, difficulty: 9, title: '  Врач  ' }));
  const r = await call(req('/dream', { text: 'Хочу лечить людей', country: 'Казахстан', sex: 'f', income: 40 }));
  assert.equal(r.status, 200);
  const v = await r.json();
  assert.equal(v.title, 'Врач');
  assert.equal(v.difficulty, 5, 'сложность ограничена 1–5');
  assert.equal(calls.length, 1);
  assert.ok(!calls[0].url.includes('test-key-123'), 'ключа нет в адресе');
  assert.equal(calls[0].headers['x-goog-api-key'], 'test-key-123');
  assert.match(calls[0].url, /gemini-2\.5-flash:generateContent$/);
  const gc = calls[0].body.generationConfig;
  assert.equal(gc.responseMimeType, 'application/json');
  assert.equal(gc.responseSchema.type, 'OBJECT');
  assert.ok(!('additionalProperties' in gc.responseSchema));
  assert.match(calls[0].body.contents[0].parts[0].text, /Хочу лечить людей/);
  const health = await (await call(req('/health', null, { method: 'GET' }))).json();
  assert.ok(!JSON.stringify(health).includes('test-key-123'), 'health не раскрывает ключ');
});

test('длина ввода и размер тела ограничены', async () => {
  mockFetch(() => gemini(DREAM));
  assert.equal((await call(req('/dream', { text: 'а'.repeat(201) }))).status, 400);
  assert.equal((await call(req('/dream', { text: '' }))).status, 400);
  assert.equal((await call(req('/dream', { text: 'врач', pad: 'x'.repeat(5000) }))).status, 413);
  assert.equal(calls.length, 0, 'до модели такие запросы не доходят');
});

test('фильтр: неприемлемая мечта отклоняется до модели и после неё', async () => {
  mockFetch(() => gemini(DREAM));
  assert.equal((await call(req('/dream', { text: 'хочу стать киллером' }))).status, 422);
  assert.equal(calls.length, 0);
  mockFetch(() => gemini({ ...DREAM, appropriate: false }));
  assert.equal((await call(req('/dream', { text: 'абырвалг' }))).status, 422);
  mockFetch(() => ({ json: { promptFeedback: { blockReason: 'SAFETY' } } }));
  assert.equal((await call(req('/dream', { text: 'что-то странное' }))).status, 422);
  assert.ok(isInappropriate('Хочу стать порнозвездой'));
  assert.ok(!isInappropriate('Хочу стать врачом и лечить детей'));
  assert.ok(!isInappropriate('космонавт, учёный или художник'));
});

test('режим без пугающих подробностей проверяет и ответ ИИ', async () => {
  const scary = { ...FORK, text: 'Многие в этой профессии погибли на работе.' };
  mockFetch(() => gemini(scary));
  const body = { stage: 2, age: 23, dream: { title: 'Пожарный', sphere: 'service' } };
  assert.equal((await call(req('/fork', { ...body, soft: true }))).status, 502);
  assert.equal((await call(req('/fork', { ...body, soft: false }))).status, 200);
  assert.ok(!outputIsSafe({ text: 'Он увидел труп' }, false), 'натуралистичные детали запрещены всегда');
  assert.ok(outputIsSafe({ text: 'Вы купили новую кровать' }, true), 'нет ложных срабатываний на «кровать»');
});

test('развилка: варианты с разными kind, шансов в ответе нет', async () => {
  mockFetch(() => gemini({ ...FORK, options: [...FORK.options, { label: 'Ещё учиться', hint: '', kind: 'study' }, { label: 'X', hint: '', kind: 'fly' }] }));
  const r = await call(req('/fork', { stage: 1, age: 15, dream: { title: 'Врач', sphere: 'medicine' }, history: ['Кружок: да'] }));
  assert.equal(r.status, 200);
  const v = await r.json();
  assert.deepEqual(v.options.map(o => o.kind), ['study', 'safe']);
  assert.ok(!('chance' in v.options[0]));
  mockFetch(() => gemini({ title: 'Т', text: 'Текст', options: [{ label: 'один', hint: '', kind: 'safe' }] }));
  assert.equal((await call(req('/fork', { stage: 1, age: 15, dream: { title: 'Врач' } }))).status, 502, 'меньше двух вариантов — шаблон');
});

test('ограничение частоты: привязка Cloudflare и запасной лимит', async () => {
  mockFetch(() => gemini(DREAM));
  const env = { ...ENV, RATE_LIMIT: '3' };
  const codes = [];
  for (let i = 0; i < 5; i++) codes.push((await call(req('/dream', { text: 'врач' }, { ip: '9.9.9.9' }), env)).status);
  assert.deepEqual(codes, [200, 200, 200, 429, 429]);
  let asked = 0;
  const bound = { ...ENV, RATE_LIMITER: { limit: async ({ key }) => { asked++; assert.equal(key, '7.7.7.7'); return { success: false }; } } };
  assert.equal((await call(req('/dream', { text: 'врач' }, { ip: '7.7.7.7' }), bound)).status, 429);
  assert.equal(asked, 1);
});

test('лимит или ошибка ИИ → 503/502, клиент переходит на шаблоны', async () => {
  mockFetch(() => ({ status: 429, json: { error: { message: 'quota' } } }));
  const q = await call(req('/dream', { text: 'врач' }));
  assert.equal(q.status, 503);
  assert.equal((await q.json()).error, 'quota');
  mockFetch(() => ({ json: { candidates: [{ content: { parts: [{ text: 'не JSON' }] } }] } }));
  assert.equal((await call(req('/dream', { text: 'врач' }))).status, 502);
  assert.equal((await call(req('/dream', { text: 'врач' }), { ...ENV, GEMINI_API_KEY: '' })).status, 503);
});

test('переключение на Claude Haiku и DeepSeek одной настройкой', async () => {
  mockFetch(url => url.includes('anthropic')
    ? { json: { stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: JSON.stringify(DREAM) }] } }
    : { json: { choices: [{ message: { content: JSON.stringify(DREAM) } }] } });
  const a = await call(req('/dream', { text: 'врач' }), { ...ENV, PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'sk-ant-test' });
  assert.equal(a.status, 200);
  const ac = calls[0];
  assert.equal(ac.url, 'https://api.anthropic.com/v1/messages');
  assert.equal(ac.body.model, 'claude-haiku-5-5');
  assert.equal(ac.body.output_config.format.type, 'json_schema');
  assert.equal(ac.body.output_config.format.schema.additionalProperties, false);
  assert.equal(ac.headers['x-api-key'], 'sk-ant-test');
  assert.ok(!('temperature' in ac.body));
  const d = await call(req('/dream', { text: 'врач' }), { ...ENV, PROVIDER: 'deepseek', DEEPSEEK_API_KEY: 'ds-test' });
  assert.equal(d.status, 200);
  const dc = calls[calls.length - 1];
  assert.equal(dc.body.model, 'deepseek-chat');
  assert.equal(dc.body.response_format.type, 'json_object');
  assert.equal(dc.headers.authorization, 'Bearer ds-test');
  mockFetch(() => ({ json: { stop_reason: 'refusal', content: [] } }));
  assert.equal((await call(req('/dream', { text: 'врач' }), { ...ENV, PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'k' })).status, 422);
});

test('схема для Gemini: заглавные типы, без additionalProperties', () => {
  const s = toGeminiSchema({ type: 'object', additionalProperties: false, properties: { a: { type: 'array', items: { type: 'string', enum: ['x'] } } } });
  assert.deepEqual(s, { type: 'OBJECT', properties: { a: { type: 'ARRAY', items: { type: 'STRING', enum: ['x'] } } } });
});
