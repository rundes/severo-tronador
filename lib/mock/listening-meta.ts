// Dataset mock para el connector Meta Content Library mientras la API real
// no está aprobada (Plan 05 F1 paperwork pendiente). Imita el shape que
// devuelven posts FB, reels IG y comentarios públicos ya bajados al tipo
// común `ListenItem`. Source distingue plataforma para breakdown en /escucha.
//
// Plan 05 F4: el mock ahora modela threading. Cada post/reel tiene un id
// estable + URL canónica; los comments referencian el URL del padre vía
// `parentUrl` para que la UI pueda agruparlos.
import type { ListenItem } from "@/lib/connectors/types";

const NOW = Date.UTC(2026, 4, 26);
const DAY = 24 * 60 * 60 * 1000;
const iso = (daysAgo: number) => new Date(NOW - daysAgo * DAY).toISOString();

type Src = "meta-ig" | "meta-fb";
type Kind = "post" | "reel" | "comment";

interface RawParent {
  source: Src;
  kind: "post" | "reel";
  id: string;
  daysAgo: number;
  text: string;
  author: string;
  lat?: number;
  lng?: number;
  comments?: RawComment[];
}

interface RawComment {
  daysAgo: number;
  text: string;
  author: string;
}

const PARENTS: RawParent[] = [
  {
    source: "meta-fb",
    kind: "post",
    id: "fb-obras-metrobus",
    daysAgo: 18,
    text: "Estado de las obras del nuevo Metrobús: avances reales y plazos",
    author: "diariotn",
    lat: -34.61,
    lng: -58.42,
    comments: [
      {
        daysAgo: 17,
        text: "Comentario: por fin avanzan, pero los plazos son optimistas",
        author: "marcela_g",
      },
      {
        daysAgo: 17,
        text: "Comentario: la obra va a destiempo, queja general en el barrio",
        author: "lucasv",
      },
    ],
  },
  {
    source: "meta-ig",
    kind: "post",
    id: "ig-alumbrado-ok",
    daysAgo: 16,
    text: "El alumbrado público mejoró bastante en el barrio, felicitaciones al municipio",
    author: "vecinos.centro",
    lat: -34.6,
    lng: -58.39,
    comments: [
      {
        daysAgo: 15,
        text: "Excelente trabajo del equipo de alumbrado, muy buen avance",
        author: "anaperez",
      },
    ],
  },
  {
    source: "meta-ig",
    kind: "reel",
    id: "ig-reel-polo-deportivo",
    daysAgo: 10,
    text: "Reel: recorrida por las obras del nuevo polo deportivo del barrio",
    author: "muniba_oficial",
    lat: -34.59,
    lng: -58.41,
    comments: [
      {
        daysAgo: 9,
        text: "Lindo el polo, esperemos terminen pronto las obras",
        author: "centroaltura",
      },
    ],
  },
  // Pico inseguridad reciente — post con varios comments threadeados.
  {
    source: "meta-fb",
    kind: "post",
    id: "fb-inseguridad-asamblea",
    daysAgo: 8,
    text: "Vecinos preocupados por la inseguridad en la zona, organizan asamblea",
    author: "junta.vecinal",
    lat: -34.6,
    lng: -58.38,
    comments: [
      {
        daysAgo: 7,
        text: "Comentario: la inseguridad creciente no para, necesitamos más patrullaje",
        author: "marcela_g",
      },
      {
        daysAgo: 4,
        text: "Comentario: otra entradera ayer, la inseguridad es desastre",
        author: "lucasv",
      },
      {
        daysAgo: 2,
        text: "Comentario: la inseguridad nos saca el sueño, queremos respuestas",
        author: "anaperez",
      },
    ],
  },
  {
    source: "meta-ig",
    kind: "reel",
    id: "ig-reel-camaras-robo",
    daysAgo: 3,
    text: "Reel viral: cámaras del barrio captan robo, vecinos reclaman patrullaje",
    author: "vecinos.centro",
    lat: -34.6,
    lng: -58.41,
    comments: [
      {
        daysAgo: 3,
        text: "Excelente que se viralice, basta de robos y de violencia",
        author: "centroaltura",
      },
      {
        daysAgo: 2,
        text: "Inseguridad creciente, este robo es uno más de la lista",
        author: "marcela_g",
      },
    ],
  },
  {
    source: "meta-fb",
    kind: "post",
    id: "fb-marcha-inseguridad",
    daysAgo: 1,
    text: "Marcha por la inseguridad: vecinos del barrio se concentran en la plaza",
    author: "junta.vecinal",
    lat: -34.6,
    lng: -58.4,
    comments: [
      {
        daysAgo: 1,
        text: "Excelente convocatoria contra la inseguridad",
        author: "anaperez",
      },
    ],
  },
];

function parentUrl(p: RawParent): string {
  return `https://example.com/${p.source}/${p.id}`;
}

function commentUrl(p: RawParent, idx: number): string {
  return `${parentUrl(p)}#c${idx}`;
}

function flatten(filter: "ig" | "fb" | "all"): {
  parents: RawParent[];
  items: { item: ListenItem; raw?: RawParent; comment?: RawComment }[];
} {
  const parents = PARENTS.filter((p) =>
    filter === "all"
      ? true
      : filter === "ig"
        ? p.source === "meta-ig"
        : p.source === "meta-fb",
  );
  const items: { item: ListenItem; raw?: RawParent; comment?: RawComment }[] =
    [];
  for (const p of parents) {
    items.push({
      raw: p,
      item: {
        source: p.source,
        kind: p.kind,
        text: p.text,
        url: parentUrl(p),
        publishedAt: iso(p.daysAgo),
        author: p.author,
      },
    });
    p.comments?.forEach((c, idx) => {
      items.push({
        raw: p,
        comment: c,
        item: {
          source: p.source,
          kind: "comment" satisfies Kind,
          text: c.text,
          url: commentUrl(p, idx),
          publishedAt: iso(c.daysAgo),
          author: c.author,
          parentUrl: parentUrl(p),
        },
      });
    });
  }
  return { parents, items };
}

export function mockMetaItems(filter?: "ig" | "fb" | "all"): ListenItem[] {
  return flatten(filter ?? "all").items.map((x) => x.item);
}

// Re-exporta el dataset crudo + flatten para tests / geo filtering.
export const META_MOCK_PARENTS = PARENTS;
export const _flattenForTests = flatten;
