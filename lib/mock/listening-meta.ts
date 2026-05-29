// Dataset mock para el connector Meta Content Library mientras la API real
// no está aprobada (Plan 05 F1 paperwork pendiente). Imita el shape que
// devuelven posts FB, reels IG y comentarios públicos ya bajados al tipo
// común `ListenItem`. Source distingue plataforma para breakdown en /escucha.
import type { ListenItem } from "@/lib/connectors/types";

const NOW = Date.UTC(2026, 4, 26);
const DAY = 24 * 60 * 60 * 1000;
const iso = (daysAgo: number) => new Date(NOW - daysAgo * DAY).toISOString();

type Src = "meta-ig" | "meta-fb";

interface Raw {
  source: Src;
  daysAgo: number;
  text: string;
  author: string;
  contentType: "post" | "reel" | "comment";
  lat?: number;
  lng?: number;
}

// Base AMBA (lat -34.6, lng -58.4 aprox). Mix de prensa local IG/FB +
// comments públicos sobre temas regionales (transporte, inseguridad,
// alumbrado, obras) para empalmar con el resto del listening pipeline.
const RAW: Raw[] = [
  {
    source: "meta-fb",
    daysAgo: 18,
    text: "Estado de las obras del nuevo Metrobús: avances reales y plazos",
    author: "diariotn",
    contentType: "post",
    lat: -34.61,
    lng: -58.42,
  },
  {
    source: "meta-ig",
    daysAgo: 16,
    text: "El alumbrado público mejoró bastante en el barrio, felicitaciones al municipio",
    author: "vecinos.centro",
    contentType: "post",
    lat: -34.6,
    lng: -58.39,
  },
  {
    source: "meta-fb",
    daysAgo: 14,
    text: "Comentario: el transporte sigue siendo un desastre, no respetan frecuencias",
    author: "marcela_g",
    contentType: "comment",
    lat: -34.62,
    lng: -58.4,
  },
  {
    source: "meta-ig",
    daysAgo: 10,
    text: "Reel: recorrida por las obras del nuevo polo deportivo del barrio",
    author: "muniba_oficial",
    contentType: "reel",
    lat: -34.59,
    lng: -58.41,
  },
  {
    source: "meta-fb",
    daysAgo: 8,
    text: "Vecinos preocupados por la inseguridad en la zona, organizan asamblea",
    author: "junta.vecinal",
    contentType: "post",
    lat: -34.6,
    lng: -58.38,
  },
  {
    source: "meta-ig",
    daysAgo: 6,
    text: "Felicitaciones al equipo del centro cultural por el evento del fin de semana",
    author: "centroaltura",
    contentType: "post",
    lat: -34.61,
    lng: -58.39,
  },
  // pico reciente inseguridad (alineado con la línea de listening base)
  {
    source: "meta-fb",
    daysAgo: 4,
    text: "Otra entradera en el barrio, la inseguridad creciente preocupa cada vez más",
    author: "diariotn",
    contentType: "post",
    lat: -34.6,
    lng: -58.4,
  },
  {
    source: "meta-ig",
    daysAgo: 3,
    text: "Reel viral: cámaras del barrio captan robo, vecinos reclaman patrullaje",
    author: "vecinos.centro",
    contentType: "reel",
    lat: -34.6,
    lng: -58.41,
  },
  {
    source: "meta-fb",
    daysAgo: 2,
    text: "Comentario: la inseguridad nos saca el sueño, queremos respuestas",
    author: "marcela_g",
    contentType: "comment",
    lat: -34.61,
    lng: -58.4,
  },
  {
    source: "meta-ig",
    daysAgo: 1,
    text: "Marcha por la inseguridad: vecinos del barrio se concentran en la plaza",
    author: "muniba_oficial",
    contentType: "post",
    lat: -34.6,
    lng: -58.4,
  },
];

export function mockMetaItems(filter?: "ig" | "fb" | "all"): ListenItem[] {
  const f = filter ?? "all";
  return RAW.filter((r) =>
    f === "all" ? true : f === "ig" ? r.source === "meta-ig" : r.source === "meta-fb",
  ).map((r) => ({
    source: r.source,
    text: r.text,
    url: `https://example.com/${r.source}/${r.daysAgo}-${r.contentType}`,
    publishedAt: iso(r.daysAgo),
    author: r.author,
  }));
}

// Re-exporta el dataset crudo para tests / geo filtering.
export const META_MOCK_RAW = RAW;
