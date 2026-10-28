// Cloudflare Worker — посредник между игрой «Лотерея рождения» и ИИ.
// Страница игры не знает ключа: он хранится только как секрет Worker'а.
// Защита: CORS только для разрешённых сайтов, ограничение частоты, ограничение размера и длины ввода,
// фильтр неприемлемого текста на входе и на выходе, проверка ответа модели по схеме.
//
// POST /dream     — разбор мечты 10-летнего героя
// POST /fork      — развилка на пути к мечте (шансы считает игра)
// POST /epilogue  — короткий итог в конце жизни
// POST /moments   — обычные события и бытовой выбор на несколько лет вперёд
// GET  /health    — проверка, что Worker жив (без секретов)
// GET  /health?test=1 — настоящий короткий запрос к ИИ: откройте в браузере, чтобы увидеть, что не так
import { ENDPOINTS } from './schemas.js';
import { callModel, providerOf, ProviderError, lastModel } from './providers.js';
import { isInappropriate, outputIsSafe } from './filter.js';

const MAX_BODY = 4096;

// Запасной лимит в памяти изолята — на случай, если привязка RATE_LIMITER не настроена.
const hits = new Map();
export function memLimit(key, limit, now = Date.now(), windowMs = 60000) {
  const arr = (hits.get(key) || []).filter(t => now - t < windowMs);
  if (arr.length >= limit) { hits.set(key, arr); return false; }
  arr.push(now); hits.set(key, arr);
  if (hits.size > 5000) hits.clear();
  return true;
}
export const _resetLimits = () => hits.clear();

function allowedOrigin(request, env) {
  const origin = request.headers.get('Origin') || '';
  const list = String(env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  return origin && list.includes(origin) ? origin : null;
}

function reply(body, status, origin) {
  const headers = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
  if (origin) Object.assign(headers, { 'access-control-allow-origin': origin, vary: 'Origin' });
  return new Response(JSON.stringify(body), { status, headers });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = allowedOrigin(request, env);

    if (request.method === 'OPTIONS') {
      if (!origin) return new Response(null, { status: 403 });
      return new Response(null, { status: 204, headers: {
        'access-control-allow-origin': origin, 'access-control-allow-methods': 'POST, GET, OPTIONS',
        'access-control-allow-headers': 'content-type', 'access-control-max-age': '86400', vary: 'Origin' } });
    }
    if (url.pathname === '/health' && request.method === 'GET') {
      // проверку видно с любого сайта: в ней нет секретов, а запрос к ИИ ограничен 4 в минуту
      const origin = allowedOrigin(request, env) || '*';
      let p; try { p = providerOf(env); } catch (e) { return reply({ ok: false, error: 'bad_provider' }, 500, origin); }
      const info = { provider: p.name, model: lastModel() || p.model, configured: !!p.key, origins: String(env.ALLOWED_ORIGINS || '') };
      if (!url.searchParams.has('test')) return reply({ ok: true, ...info }, 200, origin);
      if (!memLimit('health:' + (request.headers.get('CF-Connecting-IP') || ''), 4)) return reply({ ok: false, error: 'rate_limit', ...info }, 429, origin);
      if (!p.key) return reply({ ok: false, error: 'not_configured', hint: 'Не задан секрет с ключом: npx wrangler secret put GEMINI_API_KEY', ...info }, 503, origin);
      try {
        const out = await callModel(env, { system: 'Ты проверка связи. Ответь JSON.', user: 'Верни {"ok": true}.', schema: { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'], additionalProperties: false }, maxTokens: 50 });
        return reply({ ok: !!(out && out.ok), ...info, model: lastModel() || p.model }, 200, origin);
      } catch (e) {
        const code = e instanceof ProviderError ? e.code : 'internal';
        return reply({ ok: false, error: code, status: e.status || 0, detail: String(e.detail || e.message || '').replace(p.key, '***').slice(0, 300), ...info }, 200, origin);
      }
    }
    if (!origin) return reply({ error: 'origin_not_allowed' }, 403, null);
    if (request.method !== 'POST') return reply({ error: 'method' }, 405, origin);
    const ep = ENDPOINTS[url.pathname.replace(/^\/+/, '')];
    if (!ep) return reply({ error: 'not_found' }, 404, origin);

    // Ограничение частоты: по адресу игрока.
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    let allowed;
    if (env.RATE_LIMITER && typeof env.RATE_LIMITER.limit === 'function') allowed = (await env.RATE_LIMITER.limit({ key: ip })).success;
    else allowed = memLimit(ip, Number(env.RATE_LIMIT) || 8);
    if (!allowed) return reply({ error: 'rate_limit' }, 429, origin);

    // Размер и формат.
    const len = Number(request.headers.get('content-length') || 0);
    if (len > MAX_BODY) return reply({ error: 'too_large' }, 413, origin);
    const raw = await request.text();
    if (raw.length > MAX_BODY) return reply({ error: 'too_large' }, 413, origin);
    let body;
    try { body = JSON.parse(raw); } catch (e) { return reply({ error: 'bad_json' }, 400, origin); }
    if (!body || typeof body !== 'object') return reply({ error: 'bad_json' }, 400, origin);

    const input = ep.clean(body, Number(env.MAX_INPUT) || 200);
    if (input.error) return reply({ error: input.error }, 400, origin);
    if (isInappropriate(input.userText)) return reply({ error: 'inappropriate' }, 422, origin);

    let out;
    try {
      const { system, user } = ep.prompt(input);
      out = await callModel(env, { system, user, schema: ep.schema, maxTokens: ep.maxTokens });
    } catch (e) {
      // видно в «npx wrangler tail»: код ошибки и начало ответа ИИ, без ключа
      console.error('[ai]', url.pathname, e && e.code, e && e.status, String(e && e.detail || '').slice(0, 200));
      if (e instanceof ProviderError) {
        if (e.code === 'blocked') return reply({ error: 'inappropriate' }, 422, origin);
        if (e.code === 'quota') return reply({ error: 'quota' }, 503, origin);
        if (e.code === 'no_key') return reply({ error: 'not_configured' }, 503, origin);
        return reply({ error: e.code }, e.status >= 500 ? e.status : 502, origin);
      }
      return reply({ error: 'internal' }, 500, origin);
    }

    const v = ep.validate(out, input);
    if (!v.ok) return reply({ error: v.error || 'bad_output' }, v.error === 'inappropriate' ? 422 : 502, origin);
    if (!outputIsSafe(v.value, input.soft)) return reply({ error: 'unsafe_output' }, 502, origin);
    return reply(v.value, 200, origin);
  }
};
