// Фильтр неприемлемого текста. Простой словарь основ (русский и английский):
// он не идеален, поэтому дополнительно включены фильтры безопасности модели
// и модель сама помечает неприемлемую мечту полем appropriate = false.

const norm = s => String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}\s-]/gu, ' ');

// Ввод игрока: мат, сексуальный контент, насилие и преступления как «мечта».
const INPUT_STEMS = [
  'хуй', 'хуе', 'хуя', 'пизд', 'ебат', 'ебал', 'ебан', 'ебу', 'бляд', 'блят', 'мудак', 'долбоеб', 'залуп', 'шлюх', 'гандон', 'пидор', 'пидар',
  'порн', 'секс', 'проститу', 'изнасил', 'насильник', 'педофил',
  'убийц', 'убивать', 'убить', 'киллер', 'террор', 'смертник', 'наркоторгов', 'наркодил', 'нацист', 'фашист', 'гитлер',
  'самоуб', 'суицид', 'повеситься', 'покончить с собой',
  'fuck', 'shit', 'bitch', 'cunt', 'dick', 'porn', 'sex', 'whore', 'rape', 'nazi', 'hitler', 'terror', 'killer', 'kill', 'murder', 'suicide'
];

// Ответ модели: никаких натуралистичных подробностей ни в одном режиме.
const GRAPHIC_STEMS = ['труп', 'кровав', 'кровопрол', 'расчлен', 'пытк', 'изнасил', 'повесил', 'застрел', 'зарезал', 'суицид', 'самоуб'];
// Режим «Убрать пугающие подробности»: никакой смерти и насилия вообще.
const SOFT_STEMS = ['убий', 'убит', 'смерт', 'умер', 'умир', 'гибел', 'погиб', 'насил', 'войн', 'оружи'];

function hasStem(text, stems) {
  const t = ' ' + norm(text) + ' ';
  return stems.some(s => s.includes(' ') ? t.includes(s) : new RegExp('(^|[\\s-])' + s).test(t));
}

export const isInappropriate = text => hasStem(text, INPUT_STEMS);

// Проверка ответа модели: true — текст можно показывать.
export function outputIsSafe(value, soft) {
  const text = JSON.stringify(value);
  if (hasStem(text, GRAPHIC_STEMS) || hasStem(text, INPUT_STEMS.filter(s => !['kill', 'sex'].includes(s)))) return false;
  if (soft && hasStem(text, SOFT_STEMS)) return false;
  return true;
}
