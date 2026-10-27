// Слой провайдеров ИИ. Переключение — переменной PROVIDER (gemini | anthropic | deepseek)
// и, при желании, MODEL. Каждый провайдер получает {system, user, schema, maxTokens}
// и возвращает разобранный JSON. Ключи берутся только из секретов Worker'а (env).

export const DEFAULT_MODELS = {
  gemini: 'gemini-2.5-flash',
  anthropic: 'claude-haiku-5-5',
  deepseek: 'deepseek-chat'
};
const KEY_NAMES = { gemini: 'GEMINI_API_KEY', anthropic: 'ANTHROPIC_API_KEY', deepseek: 'DEEPSEEK_API_KEY' };
const TIMEOUT_MS = 12000;

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

const PROVIDERS = {
  async gemini({ model, key }, { system, user, schema, maxTokens }) {
    const body = {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: toGeminiSchema(schema), maxOutputTokens: maxTokens, temperature: 0.8 },
      safetySettings: ['HARM_CATEGORY_HARASSMENT', 'HARM_CATEGORY_HATE_SPEECH', 'HARM_CATEGORY_SEXUALLY_EXPLICIT', 'HARM_CATEGORY_DANGEROUS_CONTENT']
        .map(category => ({ category, threshold: 'BLOCK_LOW_AND_ABOVE' }))
    };
    // У моделей 2.5 Flash «размышления» можно выключить: ответ быстрее и дешевле.
    if (/2\.5-flash/.test(model)) body.generationConfig.thinkingConfig = { thinkingBudget: 0 };
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    const r = await post(url, { 'x-goog-api-key': key }, body);
    if (r.promptFeedback && r.promptFeedback.blockReason) throw new ProviderError('blocked', 422);
    const c = r.candidates && r.candidates[0];
    if (!c) throw new ProviderError('bad_output', 502);
    if (c.finishReason === 'SAFETY' || c.finishReason === 'PROHIBITED_CONTENT') throw new ProviderError('blocked', 422);
    const text = (c.content && c.content.parts || []).map(p => p.text || '').join('');
    return parseJSON(text);
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
