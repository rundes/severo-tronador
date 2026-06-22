// Tokenizador compartido para escucha / coding cualitativo.
//
// Antes vivía duplicado y DESINCRONIZADO en lib/connectors/claude-api.ts y
// lib/sentiment.ts: el de claude-api NO quitaba URLs, así que un post con
// "https://x.com/foo" se contaba como el "tema" `https`, y `posted` / `rt` /
// `via` colaban como temas porque no estaban en su lista de stopwords. Acá hay
// una sola fuente de verdad para el camino de temas emergentes.
//
// Dos vistas del texto:
//   - words():    secuencia de palabras lowercased/ascii SIN remover stopwords.
//                 Sirve para n-gramas (necesitamos la adyacencia "corte de luz").
//   - tokenize(): tokens de contenido (stopwords + ruido fuera). Sirve para
//                 unigramas y para clasificar.

// Stopwords ES funcionales + ruido de plataforma/web + genéricos del corpus.
// Todo en ascii: tokenize() corre NFD y elimina diacríticos, así que "más" se
// compara como "mas", "maipú" como "maipu", etc.
export const STOPWORDS = new Set<string>([
  // artículos / preposiciones / conjunciones
  "el", "la", "los", "las", "un", "una", "unos", "unas", "lo", "al", "del",
  "de", "a", "y", "o", "u", "que", "en", "por", "para", "con", "sin", "su",
  "sus", "es", "son", "fue", "ser", "estar", "esta", "este", "estos", "estas",
  "esas", "esos", "esa", "eso", "ese", "mas", "no", "si", "ya", "se", "le",
  "les", "me", "te", "nos", "mi", "tu", "yo", "ella", "ellos", "ellas",
  "usted", "ustedes", "como", "cuando", "donde", "porque", "pero", "aunque",
  "muy", "hay", "haber", "habia", "esto", "soy", "eres", "somos", "tiene",
  "tienen", "todo", "toda", "todos", "todas", "cada", "otra", "otro", "otras",
  "otros", "sobre", "entre", "desde", "hasta", "tambien", "nuestro", "nuestra",
  "nuestros", "nuestras", "han", "hace", "hacer", "puede", "pueden", "asi",
  // ruido de plataforma / web (restos tras strip de URLs)
  "http", "https", "www", "com", "amp", "rt", "via", "posted", "retweet",
  "tweet", "status", "twitter", "facebook", "instagram", "html", "gmail",
  // ruido de datos de prueba
  "prueba", "pruebas", "test", "testing",
  // cortas frecuentes (al bajar el mínimo a 3 letras hay que filtrarlas)
  "uno", "dos", "tres", "aun", "tan", "sea", "ver", "mil", "aca", "ahi",
  "hoy", "ayer", "asi", "voy", "vas", "van", "fui", "ira",
  // genéricos del corpus Maipu (no son temas en sí mismos)
  "maipu", "barrio", "barrios", "vecino", "vecinos", "vecina", "vecinas",
]);

const URL_RE = /https?:\/\/\S+|www\.\S+/g;

// Normaliza a palabras ascii lowercased. NO remueve stopwords (las necesitamos
// como "pegamento" interno de los n-gramas) pero sí URLs, puntuación, números
// puros y tokens de 1 sola letra.
export function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(URL_RE, " ") // URLs fuera ANTES de romper la puntuación
    .normalize("NFD") // separa diacríticos…
    .replace(/[̀-ͯ]/g, "") // …y los elimina (ñ→n, á→a)
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !/^\d+$/.test(w));
}

// Tokens de contenido: como words() pero sin stopwords, sin números y con
// largo mínimo. Mínimo 3 para no perder palabras-tema cortas y reales (luz,
// voz, paz, gas, ley…). Alimenta el conteo de unigramas y el matching.
export function tokenize(text: string, minLen = 3): string[] {
  return words(text).filter((w) => w.length >= minLen && !STOPWORDS.has(w));
}

// ¿Es una palabra de contenido válida como BORDE de un n-grama? (no stopword,
// no número, largo suficiente). El interior de un n-grama sí admite pegamento
// ("corte de luz" → "de" es válido en el medio, no en los extremos).
export function isContentWord(w: string, minLen = 3): boolean {
  return w.length >= minLen && !STOPWORDS.has(w) && !/^\d+$/.test(w);
}
