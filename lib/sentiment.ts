// Clasificador pragmático de sentimiento + extractor de tags. Heurístico
// keyword-based en español, suficiente para una nube en /escucha. Cuando
// haya volumen real conviene mover a Claude (lib/connectors/claude-api).

const POS = new Set([
  "bueno", "buena", "buenos", "buenas",
  "excelente", "excelentes",
  "genial", "increible", "increíble",
  "mejor", "mejores",
  "positivo", "positiva", "positivos", "positivas",
  "gracias", "felicitaciones", "felicito",
  "logro", "logros", "logramos",
  "exitoso", "exitosa",
  "apoyo", "apoyan", "apoyamos",
  "feliz", "felices",
  "lindo", "linda", "lindos", "lindas",
  "esperanza", "alegria", "alegría",
  "avance", "avances", "progreso",
  "celebrar", "celebra",
]);

const NEG = new Set([
  "malo", "mala", "malos", "malas",
  "pesimo", "pésimo", "pesima", "pésima",
  "horrible", "horribles",
  "peor", "peores",
  "negativo", "negativa", "negativos", "negativas",
  "queja", "quejas", "reclamo", "reclamos",
  "abandono", "abandonan",
  "corrupto", "corruptos", "corrupcion", "corrupción",
  "inutil", "inútil",
  "robo", "robos", "robaron",
  "escandalo", "escándalo",
  "peligro", "peligroso",
  "muerte", "muerto", "muerta", "muertos", "muertas",
  "violencia", "violento", "violenta",
  "crimen", "crimenes", "crímenes",
  "crisis", "desastre",
  "miedo", "preocupacion", "preocupación", "preocupados",
  "destruir", "destruyen", "destruccion", "destrucción",
  "basta", "vergüenza", "verguenza",
  "lamentable", "tragedia",
]);

export type Sentiment = "positive" | "negative" | "neutral";

export interface SentimentScore {
  sentiment: Sentiment;
  pos: number;
  neg: number;
}

export function classifySentiment(text: string): SentimentScore {
  const tokens = tokenize(text);
  let pos = 0;
  let neg = 0;
  for (const t of tokens) {
    if (POS.has(t)) pos++;
    else if (NEG.has(t)) neg++;
  }
  const sentiment: Sentiment =
    pos > neg ? "positive" : neg > pos ? "negative" : "neutral";
  return { sentiment, pos, neg };
}

// ── Tag extractor ────────────────────────────────────────────────────────

const STOPWORDS = new Set([
  "el", "la", "los", "las", "un", "una", "unos", "unas", "y", "o", "pero",
  "que", "de", "del", "al", "a", "en", "por", "para", "con", "sin", "su",
  "sus", "es", "son", "fue", "ser", "estar", "esta", "este", "estos",
  "esas", "esos", "esa", "eso", "ese", "más", "mas", "no", "si", "sí",
  "ya", "se", "le", "lo", "me", "te", "nos", "les", "mi", "tu", "yo",
  "él", "el", "ella", "ellos", "ellas", "ustedes", "usted", "como", "cuando",
  "donde", "porque", "para", "todo", "toda", "todos", "todas", "muy",
  "hay", "haber", "habia", "había", "fue", "esto", "soy", "eres", "somos",
  "rt", "via", "vía", "http", "https", "co", "amp",
]);

export function extractTags(
  text: string,
  maxTokens = 200,
): string[] {
  const tokens = tokenize(text).slice(0, maxTokens);
  return tokens.filter(
    (t) => t.length >= 4 && !STOPWORDS.has(t) && !/^\d+$/.test(t),
  );
}

function tokenize(text: string): string[] {
  // Lowercase, quitar puntuación + URLs + mentions/hashtags markers,
  // partir por espacios.
  return text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[#@]/g, "")
    .replace(/[.,;:!?¿¡()"'‘’“”\[\]{}]/g, " ")
    .replace(/[\s\n\r\t]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

// ── Agregación de tags por sentimiento sobre una lista ───────────────────

export interface TagCount {
  tag: string;
  count: number;
}

export function aggregateTagsBySentiment(
  items: { text: string }[],
): { positive: TagCount[]; negative: TagCount[]; neutral: TagCount[] } {
  const buckets: Record<Sentiment, Map<string, number>> = {
    positive: new Map(),
    negative: new Map(),
    neutral: new Map(),
  };
  for (const it of items) {
    const score = classifySentiment(it.text);
    const tags = extractTags(it.text);
    const bucket = buckets[score.sentiment];
    for (const t of tags) {
      bucket.set(t, (bucket.get(t) ?? 0) + 1);
    }
  }
  const toSorted = (m: Map<string, number>): TagCount[] =>
    Array.from(m.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 40);
  return {
    positive: toSorted(buckets.positive),
    negative: toSorted(buckets.negative),
    neutral: toSorted(buckets.neutral),
  };
}
