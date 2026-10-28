// Слой провайдеров ИИ. Переключение — переменной PROVIDER (gemini | anthropic | deepseek)
// и, при желании, MODEL. Каждый провайдер получает {system, user, schema, maxTokens}
// и возвращает разобранный JSON. Ключи берутся только из секретов Worker'а (env).

export const DEFAULT_MODELS = {
  gemini: 'gemini-3.5-flash',
  anthropic: 'claude-haiku-5-5',
  deepseek: 'deepseek-chat'
};
const KEY_NAMES = { gemini: 'GEMINI_API_KEY', anthropic: 'ANTHROPIC_API_KEY', deepseek: 'DEEPSEEK_API_KEY' };
const TIMEOUT_MS = 25000;
// Google часто переименовывает и отключает модели (gemini-2.5-flash отключён осенью 2026).
// Если модель не найдена, Worker пробует следующую из списка и запоминает рабочую.
export const GEMINI_FALLBACK = ['gemini-3.5-flash', 'gemini-flash-latest', 'gemini-2.5-flash'];
const deadModels = new Set();
let workingModel = '';
export const lastModel = () => workingModel;
export const _resetModels = () => { deadModels.clear(); workingModel = ''; };

export class ProviderError extends Error {
  constructor(code, status, detail) { super(code); this.code = code; this.status = status; this.detail = detail; }
}

export function providerOf(env) {
  const p = String(env.PROVIDER || 'gemini').toLowerCase();
  if (!DEFAULT_MODELS[p]) throw new ProviderError('bad_provider', 500);
  return { name: p, model: env.MODEL || DEFAULT_MODELS[p], key: env[KEY_NAMES[p]] };
}

async function post(url, headers, body) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  let r;
  try {
    r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body), signal: ctl.signal });
  } catch (e) {
    throw new ProviderError(e.name === 'AbortError' ? 'timeout' : 'network', 504);
  } finally { clearTimeout(t); }
  if (r.status === 429) throw new ProviderError('quota', 429);
  if (!r.ok) throw new ProviderError('upstream', r.status, (await r.text()).slice(0, 300));
  return r.json();
}

function parseJSON(text) {
  if (typeof text !== 'string') throw new ProviderError('bad_output', 502);
  const s = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '');
  try { return JSON.parse(s); } catch (e) { throw new ProviderError('bad_output', 502); }
}

// Gemini понимает подмножество OpenAPI-схемы: типы заглавными буквами, без additionalProperties.
export function toGeminiSchema(s) {
  if (Array.isArray(s)) return s.map(toGeminiSchema);
  if (!s || typeof s !== 'object') return s;
  const out = {};
  for (const [k, v] of Object.entries(s)) {
    if (k === 'additionalProperties') continue;
    if (k === 'type') out.type = String(v).toUpperCase();
    else if (k === 'properties') out.properties = Object.fromEntries(Object.entries(v).map(([pk, pv]) => [pk, toGeminiSchema(pv)]));
    else if (k === 'items') out.items = toGeminiSchema(v);
    else out[k] = v;
  }
  return out;
}

// «Размышления» замедляют ответ: у 2.5 Flash их выключает бюджет 0, у Gemini 3.x — минимальный уровень.
function thinkingFor(model) {
  if (/2\.5-flash/.test(model)) return { thinkingBudget: 0 };
  if (/gemini-[3-9]/.test(model)) return { thinkingLevel: 'minimal' };
  return null;
}
const isMissingModel = e => e instanceof ProviderError && e.code === 'upstream' &&
  (e.status === 404 || ((e.status === 400 || e.status === 403) && /not found|no longer available|not supported|is not available|deprecated/i.test(e.detail || '')));

async function geminiOnce(model, key, { system, user, schema, maxTokens }, thinking) {
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: user }] }],
    // размышления тоже тратят выходные токены — даём запас
    generationConfig: { responseMimeType: 'application/json', responseSchema: toGeminiSchema(schema), maxOutputTokens: maxTokens + (thinking ? 1500 : 0), temperature: 0.8 },
    safetySettings: ['HARM_CATEGORY_HARASSMENT', 'HARM_CATEGORY_HATE_SPEECH', 'HARM_CATEGORY_SEXUALLY_EXPLICIT', 'HARM_CATEGORY_DANGEROUS_CONTENT']
      .map(category => ({ category, threshold: 'BLOCK_LOW_AND_ABOVE' }))
  };
  if (thinking) body.generationConfig.thinkingConfig = thinking;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const r = await post(url, { 'x-goog-api-key': key }, body);
  if (r.promptFeedback && r.promptFeedback.blockReason) throw new ProviderError('blocked', 422);
  const c = r.candidates && r.candidates[0];
  if (!c) throw new ProviderError('bad_output', 502);
  if (c.finishReason === 'SAFETY' || c.finishReason === 'PROHIBITED_CONTENT') throw new ProviderError('blocked', 422);
  if (c.finishReason === 'MAX_TOKENS') throw new ProviderError('bad_output', 502, 'ответ обрезан по длине');
  const text = (c.content && c.content.parts || []).filter(p => !p.thought).map(p => p.text || '').join('');
  return parseJSON(text);
}

const PROVIDERS = {
  async gemini({ model, key }, req) {
    const list = [...new Set([workingModel, model, ...GEMINI_FALLBACK].filter(m => m && !deadModels.has(m)))];
    let last = new ProviderError('upstream', 404, 'нет доступной модели Gemini');
    for (const m of list) {
      try {
        let out;
        try { out = await geminiOnce(m, key, req, thinkingFor(m)); }
        catch (e) {
          // если модель не понимает настройку размышлений — повторяем без неё
          if (e.code === 'upstream' && e.status === 400 && /thinking/i.test(e.detail || '')) out = await geminiOnce(m, key, req, null);
          else throw e;
        }
        workingModel = m;
        return out;
      } catch (e) {
        if (!isMissingModel(e)) throw e;
        deadModels.add(m); last = e;
      }
    }
    throw last;
  },

  async anthropic({ model, key }, { system, user, schema, maxTokens }) {
    const r = await post('https://api.anthropic.com/v1/messages', { 'x-api-key': key, 'anthropic-version': '2026-10-21' }, {
      model,
      max_tokens: maxTokens + 1500, // с запасом: у Claude Haiku 5.5 размышления включены и тоже расходуют токены
      system,
      messages: [{ role: 'user', content: user }],
      output_config: { effort: 'low', format: { type: 'json_schema', schema } }
    });
    if (r.stop_reason === 'refusal') throw new ProviderError('blocked', 422);
    if (r.stop_reason === 'max_tokens') throw new ProviderError('bad_output', 502);
    const block = (r.content || []).find(b => b.type === 'text');
    return parseJSON(block && block.text);
  },

  async deepseek({ model, key }, { system, user, schema, maxTokens }) {
    // У DeepSeek нет строгой JSON-схемы: просим JSON-объект и описываем схему в промпте, проверка — в Worker'е.
    const r = await post('https://api.deepseek.com/chat/completions', { authorization: `Bearer ${key}` }, {
      model,
      max_tokens: maxTokens,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: `${system}\nОтветь только JSON-объектом по этой JSON-схеме:\n${JSON.stringify(schema)}` },
        { role: 'user', content: user }
      ]
    });
    const msg = r.choices && r.choices[0] && r.choices[0].message;
    return parseJSON(msg && msg.content);
  }
};

export async function callModel(env, req) {
  const p = providerOf(env);
  if (!p.key) throw new ProviderError('no_key', 503);
  return PROVIDERS[p.name](p, req);
}
