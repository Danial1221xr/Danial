// Минимальный читатель файлов R .rda/.RData (формат XDR, версии 2 и 3) — только то,
// что нужно для таблиц пакета wpp2024: data.frame / data.table из чисел и строк.
// Сжатие: gzip (встроено в Node) или bzip2 (пакет seek-bzip).
const zlib = require('zlib');

function decompress(buf) {
  if (buf[0] === 0x1f && buf[1] === 0x8b) return zlib.gunzipSync(buf);
  if (buf.slice(0, 3).toString() === 'BZh') return Buffer.from(require('seek-bzip').decode(buf));
  if (buf[0] === 0xfd && buf.slice(1, 6).toString() === '7zXZ') throw new Error('xz-сжатие .rda не поддерживается');
  return buf;
}

function readRData(raw) {
  const b = decompress(raw);
  const magic = b.slice(0, 5).toString();
  if (!/^RDX[23]\n$/.test(magic)) throw new Error('Не файл .rda: ' + JSON.stringify(magic));
  let p = 5;
  if (b.slice(p, p + 2).toString() !== 'X\n') throw new Error('Поддерживается только XDR-формат');
  p += 2;
  const int = () => { const v = b.readInt32BE(p); p += 4; return v; };
  const dbl = () => { const v = b.readDoubleBE(p); p += 8; return v; };
  const version = int(); int(); int();
  if (version === 3) { const n = int(); p += n; }
  const refs = [];
  const len = () => { const l = int(); if (l !== -1) return l; const hi = int(), lo = int(); return hi * 2 ** 32 + lo; };

  function attrsToObj(pl) {
    const o = {};
    for (let x = pl; x && x.type === 'pairlist'; x = x.cdr) o[x.tag] = x.car;
    return o;
  }

  function item() {
    const flags = int();
    const type = flags & 0xff, hasAttr = flags & (1 << 9), hasTag = flags & (1 << 10);
    switch (type) {
      case 254: return null; // NILVALUE
      case 242: case 241: case 253: return { type: 'env' };
      case 251: case 252: return null;
      case 255: { let i = flags >> 8; if (i === 0) i = int(); return refs[i - 1]; }
      case 250: return { type: 'env' };
      case 249: case 248: { // NAMESPACESXP / PACKAGESXP
        const info = item(); const v = { type: 'env', info }; refs.push(v); return v;
      }
      case 1: { const s = item(); refs.push(s); return s; } // SYMSXP -> строка
      case 2: case 6: case 239: case 240: { // LISTSXP, LANGSXP
        const attr = hasAttr ? item() : null;
        const tag = hasTag ? item() : null;
        const car = item();
        const cdr = item();
        return { type: 'pairlist', tag, car, cdr, attr };
      }
      case 4: { // ENVSXP
        const v = { type: 'env' }; refs.push(v);
        int(); item(); item(); item(); item();
        return v;
      }
      case 9: { // CHARSXP
        const l = int(); if (l === -1) return null;
        const s = b.slice(p, p + l).toString('utf8'); p += l; return s;
      }
      case 10: case 13: { // LGLSXP, INTSXP
        const n = len(); const a = new Array(n);
        for (let i = 0; i < n; i++) { const v = int(); a[i] = v === -2147483648 ? null : v; }
        return withAttr(a, hasAttr);
      }
      case 14: {
        const n = len(); const a = new Array(n);
        for (let i = 0; i < n; i++) { const v = dbl(); a[i] = Number.isNaN(v) ? null : v; }
        return withAttr(a, hasAttr);
      }
      case 16: case 19: case 20: { // STRSXP, VECSXP, EXPRSXP
        const n = len(); const a = new Array(n);
        for (let i = 0; i < n; i++) a[i] = item();
        return withAttr(a, hasAttr);
      }
      case 22: { // EXTPTRSXP
        const v = { type: 'extptr' }; refs.push(v); item(); item();
        if (hasAttr) item(); return v;
      }
      case 23: { const v = { type: 'weakref' }; refs.push(v); if (hasAttr) item(); return v; }
      case 25: { const v = { type: 's4' }; if (hasAttr) v.attr = attrsToObj(item()); return v; }
      case 238: { // ALTREP
        const info = item(), state = item(), attr = item();
        const cls = info && info.car;
        let v;
        if (cls === 'compact_intseq' || cls === 'compact_realseq') {
          const [n, start, step] = state; v = Array.from({ length: n }, (_, i) => start + i * step);
        } else if (/^wrap_/.test(cls)) v = state[0];
        else if (cls === 'deferred_string') v = (state.car || []).map(x => x === null ? null : String(x));
        else throw new Error('Неизвестный ALTREP: ' + cls);
        if (attr) v.attr = attrsToObj(attr);
        return v;
      }
      default: throw new Error(`Неподдерживаемый тип R ${type} на позиции ${p}`);
    }
  }
  function withAttr(a, hasAttr) { if (hasAttr) a.attr = attrsToObj(item()); return a; }

  const top = item();
  const out = {};
  for (let x = top; x && x.type === 'pairlist'; x = x.cdr) out[x.tag] = x.car;
  return out;
}

// data.frame → массив объектов-строк.
function rows(df) {
  const names = df.attr && df.attr.names;
  if (!names) throw new Error('Не таблица');
  const n = df[0].length, out = new Array(n);
  for (let i = 0; i < n; i++) { const r = {}; names.forEach((k, j) => { r[k] = df[j][i]; }); out[i] = r; }
  return out;
}

module.exports = { readRData, rows };
