// Dataset mock de listening pasivo. Items de prensa/redes (genéricos)
// repartidos en ~21 días, con "inseguridad" pegando un pico en los últimos 7
// días para demostrar la detección de tema emergente.
// Se reemplaza por las APIs reales (GDELT/X/Reddit) cuando haya credenciales.
import type { ListenItem } from "@/lib/connectors/types";

const NOW = Date.UTC(2026, 4, 26);
const DAY = 24 * 60 * 60 * 1000;
const iso = (daysAgo: number) => new Date(NOW - daysAgo * DAY).toISOString();

type Src = "gdelt" | "x-api" | "reddit-api";

interface Raw {
  source: Src;
  daysAgo: number;
  text: string;
}

// Línea de base estable (transporte, alumbrado, obras) + pico reciente de
// inseguridad concentrado en los últimos 7 días.
const RAW: Raw[] = [
  // baseline transporte
  { source: "gdelt", daysAgo: 19, text: "Reclaman mejoras en el transporte público de la ciudad" },
  { source: "x-api", daysAgo: 17, text: "otra vez el colectivo tardísimo, el transporte un desastre" },
  { source: "reddit-api", daysAgo: 12, text: "Cómo está el transporte para ir a estudiar?" },
  { source: "gdelt", daysAgo: 6, text: "Anuncian nuevas frecuencias de transporte para el barrio" },
  // baseline alumbrado / obras
  { source: "x-api", daysAgo: 18, text: "falta alumbrado en varias calles del centro" },
  { source: "reddit-api", daysAgo: 11, text: "Obras en la ruta, alguien sabe cuándo terminan?" },
  { source: "gdelt", daysAgo: 9, text: "El municipio licita obras de alumbrado público" },
  // baseline inseguridad (pocos, período viejo)
  { source: "x-api", daysAgo: 16, text: "robaron en el barrio, ojo con la inseguridad" },
  // pico reciente inseguridad (últimos 7 días)
  { source: "x-api", daysAgo: 5, text: "otra entradera en el barrio, la inseguridad no para" },
  { source: "reddit-api", daysAgo: 4, text: "Ola de robos en la zona, mucha inseguridad esta semana" },
  { source: "gdelt", daysAgo: 3, text: "Vecinos marchan por la inseguridad creciente" },
  { source: "x-api", daysAgo: 2, text: "la inseguridad está peor que nunca, otro robo" },
  { source: "reddit-api", daysAgo: 2, text: "Inseguridad en el barrio: cámaras y más patrullaje ya" },
  { source: "gdelt", daysAgo: 1, text: "Comerciantes reclaman por la inseguridad" },
  { source: "x-api", daysAgo: 1, text: "no se puede salir de noche por la inseguridad" },
];

const MOCK_AUTHORS: Record<Src, string[]> = {
  gdelt: ["lanacion.com.ar", "clarin.com", "pagina12.com.ar", "infobae.com"],
  "x-api": ["vecino_centro", "anaperez", "marcosk", "agronoticias", "noticiero_x"],
  "reddit-api": ["u/vecino_norte", "u/larubia", "u/turista", "u/comunero"],
};

export function mockListenItems(source: Src): ListenItem[] {
  const authors = MOCK_AUTHORS[source];
  return RAW.filter((r) => r.source === source).map((r, i) => ({
    source,
    text: r.text,
    url: `https://example.com/${source}/${r.daysAgo}`,
    publishedAt: iso(r.daysAgo),
    author: authors[i % authors.length],
  }));
}
