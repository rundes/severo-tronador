// Agregados de menciones para las tarjetas de síntesis (tab Informe) y de
// métricas (tab Monitoreo). Funciones puras sobre los items del cache: los
// tests las importan directo y los componentes solo renderizan el resultado.
import type { ListenItem } from "@/lib/connectors/types";

// Primer segmento del source ("instagram/extension" → instagram). Los que no
// son red social se leen como medios digitales (gdelt, rss, news.google.com).
const REDES = new Set(["instagram", "x", "facebook", "tiktok", "meta", "twitter", "telegram"]);

export interface ResumenMenciones {
  total: number;
  enRedes: number;
  enMedios: number;
  meGusta: number;
  comentarios: number;
  porPlataforma: { plataforma: string; n: number }[];
}

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0);

export function plataformaDe(source: string): string {
  // Conserva puntos para que un dominio quede legible como etiqueta.
  return source.toLowerCase().split(/[^a-z0-9.-]+/)[0] || "otros";
}

export function esRedSocial(source: string): boolean {
  const seg = source.toLowerCase().split(/[^a-z0-9]+/)[0] ?? "";
  return REDES.has(seg);
}

// Mismo criterio de ventana que get_recent_items del MCP: un item sin fecha
// cuenta adentro (lo trajo una corrida reciente y descartarlo escondería dato).
export function resumirMenciones(
  items: ListenItem[],
  horas: number,
  now = Date.now(),
): ResumenMenciones {
  const corte = now - horas * 3_600_000;
  const ventana = items.filter((i) => !i.publishedAt || Date.parse(i.publishedAt) >= corte);
  const porPlataforma = new Map<string, number>();
  let enRedes = 0;
  let meGusta = 0;
  let comentarios = 0;
  for (const i of ventana) {
    const p = plataformaDe(i.source);
    porPlataforma.set(p, (porPlataforma.get(p) ?? 0) + 1);
    if (esRedSocial(i.source)) enRedes++;
    const m = (i.meta ?? {}) as Record<string, unknown>;
    meGusta += num(m.likeCount);
    comentarios += num(m.commentCount);
  }
  return {
    total: ventana.length,
    enRedes,
    enMedios: ventana.length - enRedes,
    meGusta,
    comentarios,
    porPlataforma: [...porPlataforma.entries()]
      .map(([plataforma, n]) => ({ plataforma, n }))
      .sort((a, b) => b.n - a.n),
  };
}

// "hace 5 min / hace 3 h / hace 2 días" para fechas ISO; null si no parsea.
export function haceCuanto(iso: string | undefined, now = Date.now()): string | null {
  if (!iso) return null;
  const ms = now - Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  if (ms < 0) return "recién";
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "recién";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.floor(h / 24)} días`;
}
