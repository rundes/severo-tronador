// Agregaciones para /dashboard (Plan 03 F1). Server-side, no caches:
// las queries con índices over (created_at) van rápido al volumen actual.
//
// Memory fallback devuelve zeros para keep dev safe — el dashboard solo
// vale la pena con DB real.

import { dbConfigured, getSupabase } from "@/lib/db/supabase";
import type { Channel } from "@/lib/relationship";
import { outreachConnectorFor, OUTREACH_CHANNELS } from "@/lib/campaigns";
import { healthBand, type HealthBand } from "@/lib/relationship";
import { loadContacts } from "@/lib/segments";
import { listSavedSegments } from "@/lib/segments-store";
import { listTemplates } from "@/lib/templates";
import { listEncuestas } from "@/lib/encuestas";

export type WindowDays = 7 | 30 | 90;

export interface KpiSummary {
  windowDays: WindowDays;
  since: string;
  // Envíos por estado
  sent: number;
  failed: number;
  skipped: number;
  // Respuestas
  responses: number;
  responseRate: number; // 0..1 sobre sent
  // Opt-outs en la ventana
  optOuts: number;
  optOutRate: number; // 0..1 sobre sent
  // Costo estimado en USD sumando sent × costPerUnit por canal
  estCostUsd: number;
  // Tracking por canal
  byChannel: Record<Channel, { sent: number; responses: number }>;
}

export interface CampaignRow {
  id: string;
  nombre: string;
  channel: Channel;
  created_at: string;
  sent: number;
  failed: number;
  skipped: number;
  responses: number;
  responseRate: number;
  estCostUsd: number;
}

export interface DayPoint {
  day: string; // YYYY-MM-DD
  envios: number;
  responses: number;
}

export interface HealthDistribution {
  total: number;
  green: number;
  yellow: number;
  red: number;
}

// Overview de inventario del proyecto: lo que existe HOY, independiente de si
// hubo o no campañas en la ventana. Hace útil el dashboard de un proyecto
// recién creado (que aún no tiene envíos).
export interface ChannelQuota {
  channel: Channel;
  used: number;
  limit: number;
}

export interface OverviewData {
  padron: number;
  segments: number;
  templates: number;
  encuestasTotal: number;
  encuestasActivas: number;
  campaignsTotal: number;
  listeningRecent: number; // items de escucha últimos 30d
  quotas: ChannelQuota[];
}

export interface DashboardData {
  kpis: KpiSummary;
  campaigns: CampaignRow[];
  timeSeries: DayPoint[];
  health: HealthDistribution;
  overview: OverviewData;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const FREE_TIER_IDS = new Set<string>(["resend", "meta-wa-cloud"]);
const VOICE_MIN_PER_CALL = 2;

function isoSince(windowDays: WindowDays, now = Date.now()): string {
  return new Date(now - windowDays * DAY_MS).toISOString();
}

// Costo estimado por canal × volumen sent. Misma lógica que segments-cost.
function costFor(channel: Channel, sent: number): number {
  const c = outreachConnectorFor(channel);
  if (!c) return 0;
  const cap = c.capabilities.find((cap) => cap.costPerUnit != null);
  const costPerUnit = cap?.costPerUnit ?? 0;
  if (costPerUnit === 0) return 0;
  if (FREE_TIER_IDS.has(c.id)) return 0; // dentro del free tier estimado
  const units = channel === "voice" ? sent * VOICE_MIN_PER_CALL : sent;
  return units * costPerUnit;
}

function zeroChannelMap<T>(filler: () => T): Record<Channel, T> {
  return {
    email: filler(),
    whatsapp: filler(),
    sms: filler(),
    voice: filler(),
    telegram: filler(),
    "meta-ad": filler(),
  };
}

function emptyKpi(window: WindowDays): KpiSummary {
  return {
    windowDays: window,
    since: isoSince(window),
    sent: 0,
    failed: 0,
    skipped: 0,
    responses: 0,
    responseRate: 0,
    optOuts: 0,
    optOutRate: 0,
    estCostUsd: 0,
    byChannel: zeroChannelMap(() => ({ sent: 0, responses: 0 })),
  };
}

export async function loadDashboard(
  projectId: string,
  window: WindowDays = 30,
): Promise<DashboardData> {
  const since = isoSince(window);
  if (!dbConfigured()) {
    const health = await healthDistribution(projectId);
    return {
      kpis: emptyKpi(window),
      campaigns: [],
      timeSeries: [],
      health,
      overview: await loadOverview(projectId, health.total),
    };
  }

  const db = getSupabase();

  // Los agregados se calculan en SQL (RPC dashboard_stats). Antes se traían las
  // filas crudas de envios/respuestas/opt_outs y se contaban en JS: sin
  // `.limit()` PostgREST corta en 1000 SIN error, así que pasadas las 1000
  // filas en la ventana las métricas mentían y nadie se enteraba.
  const [statsRes, campanasRes] = await Promise.all([
    db.rpc("dashboard_stats", { p_project_id: projectId, p_since: since }),
    db
      .from("campanas")
      .select("id, nombre, channel, created_at")
      .eq("project_id", projectId)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  interface CampaignStat {
    campaign_id: string;
    sent: number;
    failed: number;
    skipped: number;
    responses: number;
  }
  interface DailyStat {
    day: string;
    envios: number;
    responses: number;
  }
  interface DashboardStats {
    byCampaign: CampaignStat[];
    daily: DailyStat[];
    optOuts: number;
  }
  type CampRow = {
    id: string;
    nombre: string;
    channel: Channel;
    created_at: string;
  };

  const stats = (statsRes.data ?? {
    byCampaign: [],
    daily: [],
    optOuts: 0,
  }) as DashboardStats;
  const campanas = (campanasRes.data ?? []) as CampRow[];

  // Index canal por campaign_id.
  const channelById = new Map(campanas.map((c) => [c.id, c.channel]));

  const enviosByCamp = new Map<
    string,
    { sent: number; failed: number; skipped: number; responses: number }
  >();
  for (const c of stats.byCampaign ?? []) {
    enviosByCamp.set(c.campaign_id, {
      sent: Number(c.sent),
      failed: Number(c.failed),
      skipped: Number(c.skipped),
      responses: Number(c.responses),
    });
  }

  // ── KPIs globales ────────────────────────────────────────────────────────
  // Suma de los agregados por campaña. El desglose por canal necesita el canal
  // de cada campaña, que sale de `campanas`: los envíos de campañas fuera de
  // esas 100 más recientes cuentan en el total pero no en el desglose.
  const kpi = emptyKpi(window);
  for (const [campaignId, m] of enviosByCamp) {
    const ch = channelById.get(campaignId) as Channel | undefined;
    kpi.sent += m.sent;
    kpi.failed += m.failed;
    kpi.skipped += m.skipped;
    kpi.responses += m.responses;
    if (ch) {
      kpi.byChannel[ch].sent += m.sent;
      kpi.byChannel[ch].responses += m.responses;
    }
  }
  kpi.optOuts = Number(stats.optOuts ?? 0);
  kpi.responseRate = kpi.sent > 0 ? kpi.responses / kpi.sent : 0;
  kpi.optOutRate = kpi.sent > 0 ? kpi.optOuts / kpi.sent : 0;
  for (const channel of OUTREACH_CHANNELS) {
    kpi.estCostUsd += costFor(channel, kpi.byChannel[channel].sent);
  }

  const campaigns: CampaignRow[] = campanas.map((c) => {
    const m = enviosByCamp.get(c.id) ?? {
      sent: 0,
      failed: 0,
      skipped: 0,
      responses: 0,
    };
    return {
      id: c.id,
      nombre: c.nombre,
      channel: c.channel,
      created_at: c.created_at,
      sent: m.sent,
      failed: m.failed,
      skipped: m.skipped,
      responses: m.responses,
      responseRate: m.sent > 0 ? m.responses / m.sent : 0,
      estCostUsd: costFor(c.channel, m.sent),
    };
  });

  // ── Time-series ──────────────────────────────────────────────────────────
  // La serie diaria también viene agregada del RPC. `responses` cuenta ahora el
  // dia del ENVIO respondido, no el de la respuesta: es lo que hace comparables
  // las dos curvas del grafico (de N envios de ese dia, cuantos respondieron).
  const dayMap = new Map<string, { envios: number; responses: number }>();
  for (const d of stats.daily ?? []) {
    dayMap.set(d.day, {
      envios: Number(d.envios),
      responses: Number(d.responses),
    });
  }
  // Forzar todos los días en la ventana, incluso con 0.
  const points: DayPoint[] = [];
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  for (let i = window - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * DAY_MS);
    const key = d.toISOString().slice(0, 10);
    const v = dayMap.get(key) ?? { envios: 0, responses: 0 };
    points.push({ day: key, envios: v.envios, responses: v.responses });
  }

  const health = await healthDistribution(projectId);
  return {
    kpis: kpi,
    campaigns,
    timeSeries: points,
    health,
    overview: await loadOverview(projectId, health.total),
  };
}

// Inventario del proyecto. Resiliente: cada fuente cae a 0/[] si falla, para
// que el dashboard nunca quede en blanco por un error parcial.
async function loadOverview(
  projectId: string,
  padron: number,
): Promise<OverviewData> {
  const [segments, templates, encuestas] = await Promise.all([
    listSavedSegments(projectId).catch(() => []),
    listTemplates(projectId).catch(() => []),
    listEncuestas(projectId).catch(() => []),
  ]);

  let campaignsTotal = 0;
  let listeningRecent = 0;
  if (dbConfigured()) {
    const db = getSupabase();
    const [campRes, listenRes] = await Promise.all([
      db
        .from("campanas")
        .select("*", { count: "exact", head: true })
        .eq("project_id", projectId),
      db
        .from("listening_items")
        .select("*", { count: "exact", head: true })
        .eq("project_id", projectId)
        .gte("published_at", isoSince(30)),
    ]);
    campaignsTotal = campRes.count ?? 0;
    listeningRecent = listenRes.count ?? 0;
  }

  const quotas: ChannelQuota[] = [];
  for (const channel of OUTREACH_CHANNELS) {
    const c = outreachConnectorFor(channel);
    if (!c) continue;
    try {
      const q = await c.getQuota(projectId);
      quotas.push({ channel, used: q.used, limit: q.limit });
    } catch {
      // conector sin cuota disponible: lo omitimos.
    }
  }

  return {
    padron,
    segments: segments.length,
    templates: templates.length,
    encuestasTotal: encuestas.length,
    encuestasActivas: encuestas.filter((e) => e.estado === "publicada").length,
    campaignsTotal,
    listeningRecent,
    quotas,
  };
}

async function healthDistribution(
  projectId: string,
): Promise<HealthDistribution> {
  try {
    const contacts = await loadContacts(projectId);
    const dist: HealthDistribution = {
      total: contacts.length,
      green: 0,
      yellow: 0,
      red: 0,
    };
    for (const c of contacts) {
      const band: HealthBand = healthBand(c.rel.healthScore);
      dist[band]++;
    }
    return dist;
  } catch {
    return { total: 0, green: 0, yellow: 0, red: 0 };
  }
}
