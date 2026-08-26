// Parseo de números y etiquetas localizadas (es/en) de las redes. Puro: sin
// chrome.*, sin DOM, sin estado. Lo usan content.js (vía import dinámico) y
// los parsers de core/*dom.js.
//
// Casos que tiene que resolver, todos vistos en producción:
//   "38,2 mil" 38200 · "136K" 136000 · "1.806" 1806 · "1,2 M" 1200000 · "12" 12

// Sufijo de magnitud. El lookahead evita que "12 mensajes" se lea como 12 M.
const SUFFIX = "(?:mill?(?:ones|[oó]n)?|mil|k|m|b)(?![a-záéíóúüñ])";
// Un número con separadores de miles/decimales y espacios finos adentro.
const NUMBER = "\\d[\\d.,\\s]*\\d|\\d";
const COUNT = `(${NUMBER})\\s*(${SUFFIX})?`;

// "1.806" 1806 · "38,2" 38.2 · "1.234,5" 1234.5 · "1,234.5" 1234.5
function numberFromLocalized(raw) {
  const s = String(raw).replace(/\s+/g, "");
  if (!/^\d[\d.,]*$/.test(s)) return null;
  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  const sepAt = Math.max(lastDot, lastComma);
  if (sepAt < 0) return Number(s);
  const sep = s[sepAt];
  // Notación mixta: el ÚLTIMO separador es el decimal, el otro es de miles.
  if (lastDot >= 0 && lastComma >= 0) {
    const thousands = sep === "." ? "," : ".";
    return Number(s.split(thousands).join("").replace(sep, "."));
  }
  const groups = s.split(sep).length - 1;
  const decimals = s.length - sepAt - 1;
  // Un solo tipo de separador: es de miles si se repite o agrupa 3 dígitos.
  if (groups > 1 || decimals === 3) return Number(s.split(sep).join(""));
  return Number(s.replace(sep, "."));
}

export function parseCount(input) {
  if (typeof input === "number") return Number.isFinite(input) ? Math.round(input) : null;
  const m = String(input == null ? "" : input).match(new RegExp(COUNT, "i"));
  if (!m) return null;
  const base = numberFromLocalized(m[1]);
  if (base === null || !Number.isFinite(base)) return null;
  const suffix = (m[2] || "").toLowerCase();
  if (!suffix) return Math.round(base);
  if (suffix === "mil" || suffix === "k") return Math.round(base * 1000);
  if (suffix === "b") return Math.round(base * 1e9);
  return Math.round(base * 1e6); // m, mill, millón, millones
}

// El número que precede a una unidad ("136K seguidores"): no el primero del
// texto, el que está pegado a la palabra. `unit` es una alternancia de regex.
export function countBefore(text, unit) {
  const m = String(text == null ? "" : text).match(new RegExp(`${COUNT}\\s*(?:${unit})`, "i"));
  if (!m) return null;
  return parseCount(`${m[1]} ${m[2] || ""}`);
}

// aria-label del [role="group"] de un tweet:
// "7 respuestas, 6 reposts, 23 Me gusta, 1 elemento guardado, 1828 reproducciones"
const X_UNITS = {
  replies: "respuestas?|replies|reply",
  reposts: "reposts?|retweets?|republicaciones?",
  likes: "me gusta|likes?",
  views: "reproducciones|visualizaciones|views?",
};

export function parseXGroupLabel(label) {
  const out = {};
  for (const key of Object.keys(X_UNITS)) {
    const n = countBefore(label, X_UNITS[key]);
    if (n != null) out[key] = n;
  }
  return out;
}

const FOLLOWERS = "seguidores|followers";

// Header del perfil de IG: "1.806 publicaciones 136 mil seguidores 216 seguidos".
export function parseIgHeader(text) {
  return countBefore(text, FOLLOWERS);
}

// meta[property="og:description"]: "136K seguidores, 216 seguidos, 16K publicaciones".
export function parseIgOg(desc) {
  return {
    followers: countBefore(desc, FOLLOWERS),
    posts: countBefore(desc, "publicaciones|posts"),
  };
}
