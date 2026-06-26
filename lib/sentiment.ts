// Clasificador pragmático de sentimiento + extractor de tags. Heurístico
// keyword-based en español, suficiente para una nube en /escucha. Cuando
// haya volumen real conviene mover a Claude (lib/connectors/claude-api).
//
// Tokeniza con el módulo compartido @/lib/text/tokenize (mismo que usan temas
// emergentes): quita URLs/ruido de plataforma, normaliza diacríticos (NFD) y
// comparte stopwords. Antes este archivo tenía su propio tokenizer + STOPWORDS
// divergentes (sin NFD, lista más chica), así que /escucha clasificaba con un
// tokenizer inferior y desincronizado del de temas.
import { tokenize } from "@/lib/text/tokenize";

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

// Tags para la nube: palabras de contenido de >=4 chars (el tokenizer compartido
// ya quita URLs, ruido de plataforma, stopwords y números).
export function extractTags(text: string, maxTokens = 200): string[] {
  return tokenize(text, 4).slice(0, maxTokens);
}

// ── Agregación de tags por sentimiento sobre una lista ───────────────────

export interface TagCount {
  tag: string;
  count: number;
}

export function aggregateTagsBySentiment(
  // Acepta el sentiment ya clasificado para evitar reclasificar por item (el
  // caller en lib/listening.ts ya lo calculó). Cae a classifySentiment si falta.
  items: { text: string; sentiment?: Sentiment }[],
): { positive: TagCount[]; negative: TagCount[]; neutral: TagCount[] } {
  const buckets: Record<Sentiment, Map<string, number>> = {
    positive: new Map(),
    negative: new Map(),
    neutral: new Map(),
  };
  for (const it of items) {
    const sentiment = it.sentiment ?? classifySentiment(it.text).sentiment;
    const tags = extractTags(it.text);
    const bucket = buckets[sentiment];
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
