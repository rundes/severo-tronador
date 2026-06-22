// Extracción de temas emergentes para /escucha.
//
// PROBLEMA que resuelve: el panel "Temas emergentes" mostraba los 6 unigramas
// más frecuentes (lib/connectors/claude-api.ts · mockCoding). Una palabra suelta
// no es un tema: "https"/"posted" colaban como ruido y un bot repitiendo una
// palabra inflaba un "tema". Acá un tema surge de:
//
//   Capa 1 (keyness)   — se ranquea por crecimiento reciente vs. previo, no por
//                        frecuencia cruda. Lo ambiental (siempre presente) se
//                        degrada solo, sin listarlo a mano.
//   Capa 2 (n-gramas)  — candidatos uni/bi/trigrama ("corte de luz", no "luz"),
//                        con los extremos siempre palabras de contenido.
//   Capa 4 (validez)   — se deduplican reposts/retweets antes de contar y se
//                        exige un mínimo de autores distintos: una palabra
//                        amplificada por una sola cuenta NO es un tema.
//
// Devuelve EmergingTopic[] (mismo shape que detectEmerging) para no tocar el
// contrato de la UI ni el tipo Topic de lib/listening.ts.
import type { ListenItem } from "@/lib/connectors/types";
import { words, isContentWord } from "@/lib/text/tokenize";
import {
  sortByEmergence,
  type EmergingTopic,
  type TopicBreakdown,
} from "@/lib/emergence";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface TopicConfig {
  windowDays: number; // ventana reciente (y previa, del mismo tamaño)
  minVolume: number; // documentos distintos recientes mínimos (anti-ruido)
  ratio: number; // recent/prior para marcar emergente
  minAuthors: number; // autores distintos mínimos (anti-amplificación)
  maxTopics: number; // tope de temas devueltos
  maxNgram: number; // largo máximo de frase (1..3)
  now?: number; // ancla de "ahora" para tests reproducibles
}

export const DEFAULT_TOPIC_CONFIG: TopicConfig = {
  windowDays: Number(process.env.LISTENING_WINDOW_DAYS ?? 7),
  minVolume: Number(process.env.LISTENING_EMERGENCE_MIN ?? 3),
  ratio: Number(process.env.LISTENING_EMERGENCE_RATIO ?? 3),
  minAuthors: Number(process.env.LISTENING_MIN_AUTHORS ?? 2),
  maxTopics: Number(process.env.LISTENING_MAX_TOPICS ?? 8),
  maxNgram: 3,
};

// Boost leve al score por palabra extra: empata desempates a favor de la frase
// sobre sus unigramas componentes.
const NGRAM_BOOST = 0.15;
// Un candidato corto se descarta si una frase más larga ya aceptada cubre esta
// fracción de sus documentos (subsunción: preferimos "corte de luz" a "luz").
const SUBSUME_COVERAGE = 0.7;

// Firma normalizada para deduplicar reposts/retweets casi idénticos. Quita el
// prefijo "rt <handle>" para que dos RT del mismo tuit colapsen en una firma.
function signature(text: string): string {
  return words(text).join(" ").replace(/^rt \w+ /, "").slice(0, 140);
}

// n-gramas contiguos (1..maxN) sobre la secuencia de palabras. Sólo es
// candidato si los EXTREMOS son palabras de contenido; el interior admite
// pegamento ("corte de luz"). Únicos por documento.
function candidatesOf(ws: string[], maxN: number): string[] {
  const out = new Set<string>();
  for (let n = 1; n <= maxN; n++) {
    for (let i = 0; i + n <= ws.length; i++) {
      const gram = ws.slice(i, i + n);
      if (!isContentWord(gram[0]) || !isContentWord(gram[n - 1])) continue;
      out.add(gram.join(" "));
    }
  }
  return [...out];
}

interface Agg {
  recent: Set<string>; // firmas distintas en la ventana reciente
  prior: Set<string>; // firmas distintas en la ventana previa
  authors: Set<string>; // autores distintos recientes
  authoredHits: number; // items recientes CON autor que matchearon
  bySource: Record<string, TopicBreakdown>;
  examples: string[];
}

interface Scored {
  label: string;
  n: number;
  recent: number;
  prior: number;
  authors: number;
  authoredHits: number;
  recentSigs: Set<string>;
  bySource: Record<string, TopicBreakdown>;
  examples: string[];
  score: number;
}

export function extractTopics(
  items: ListenItem[],
  config: TopicConfig = DEFAULT_TOPIC_CONFIG,
): EmergingTopic[] {
  const now = config.now ?? Date.now();
  const windowMs = config.windowDays * DAY_MS;
  const aggs = new Map<string, Agg>();

  // 1 pasada: acumular candidatos por ventana, deduplicando por firma.
  for (const it of items) {
    const age = it.publishedAt ? now - +new Date(it.publishedAt) : Infinity;
    const window =
      age <= windowMs ? "recent" : age <= 2 * windowMs ? "prior" : null;
    if (!window) continue; // fuera de la ventana de 2× → ignorar

    const sig = signature(it.text);
    const cands = candidatesOf(words(it.text), config.maxNgram);
    for (const label of cands) {
      let a = aggs.get(label);
      if (!a) {
        a = {
          recent: new Set(),
          prior: new Set(),
          authors: new Set(),
          authoredHits: 0,
          bySource: {},
          examples: [],
        };
        aggs.set(label, a);
      }
      const bucket = window === "recent" ? a.recent : a.prior;
      const isNewDoc = !bucket.has(sig); // dedupe reposts dentro de la ventana
      bucket.add(sig);
      if (window === "recent" && it.author) {
        a.authors.add(it.author);
        a.authoredHits++;
      }
      if (isNewDoc) {
        a.bySource[it.source] ??= { recent: 0, prior: 0 };
        a.bySource[it.source][window]++;
        if (window === "recent" && a.examples.length < 2) {
          a.examples.push(it.text);
        }
      }
    }
  }

  // Filtrar + puntuar por keyness (crecimiento reciente vs previo).
  const scored: Scored[] = [];
  for (const [label, a] of aggs) {
    const recent = a.recent.size;
    if (recent < config.minVolume) continue; // volumen mínimo (deduplicado)
    // Anti-amplificación: si hay datos de autor y los aporta < minAuthors
    // cuentas distintas, es amplificación, no un tema. Si no hay autores
    // (fuentes que no los exponen) no podemos saberlo → no penalizamos acá.
    if (a.authoredHits > 0 && a.authors.size < config.minAuthors) continue;

    const prior = a.prior.size;
    const n = label.split(" ").length;
    const keyness = (recent + 0.5) / (prior + 0.5); // suavizado de Laplace
    scored.push({
      label,
      n,
      recent,
      prior,
      authors: a.authors.size,
      authoredHits: a.authoredHits,
      recentSigs: a.recent,
      bySource: a.bySource,
      examples: a.examples,
      score: keyness * (1 + NGRAM_BOOST * (n - 1)),
    });
  }

  // Ranking por keyness; subsunción de unigramas cubiertos por una frase.
  scored.sort((x, y) => y.score - x.score || y.recent - x.recent);
  const kept: Scored[] = [];
  for (const c of scored) {
    if (kept.length >= config.maxTopics) break;
    const subsumed = kept.some(
      (k) => k.n > c.n && overlap(k.recentSigs, c.recentSigs) >= SUBSUME_COVERAGE * c.recent,
    );
    if (subsumed) continue;
    kept.push(c);
  }

  // Mapear a EmergingTopic aplicando la regla de emergencia.
  return sortByEmergence(
    kept.map((c) => {
      const meetsVolume = c.recent >= config.minVolume;
      const meetsRatio =
        c.prior === 0 ? meetsVolume : c.recent / c.prior >= config.ratio;
      const meetsAuthors =
        c.authoredHits === 0 || c.authors >= config.minAuthors;
      return {
        label: c.label,
        recent: c.recent,
        prior: c.prior,
        emerging: meetsVolume && meetsRatio && meetsAuthors,
        examples: c.examples,
        bySource: c.bySource,
      };
    }),
  );
}

// Cantidad de firmas de `b` presentes también en `a` (intersección).
function overlap(a: Set<string>, b: Set<string>): number {
  let c = 0;
  for (const s of b) if (a.has(s)) c++;
  return c;
}
