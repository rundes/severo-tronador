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

  // Fetch en paralelo (scopeado por proyecto).
  const [enviosRes, respuestasRes, encuestaRespRes, optoutsRes, campanasRes] = await Promise.all([
    db
      .from("envios")
      .select("campaign_id, estado, token, created_at")
      .eq("project_id", projectId)
      .gte("created_at", since),
    db
      .from("respuestas")
      .select("token, created_at")
      .eq("project_id", projectId)
      .gte("created_at", since),
    // Respuestas del módulo nuevo de encuestas, atribuibles a una campaña por
    // token (las campañas "Encuesta:" guardan acá, no en `respuestas` legacy).
    db
      .from("encuesta_respuestas")
      .select("token, created_at")
      .eq("project_id", projectId)
      .not("token", "is", null)
      .gte("created_at", since),
    db
      .from("opt_outs")
      .select("dni, at")
      .eq("project_id", projectId)
      .gte("at", since),
    db
      .from("campanas")
      .select("id, nombre, channel, created_at")
      .eq("project_id", projectId)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  type EnvioRow = {
    campaign_id: string;
    estado: string;
    token: string | null;
    created_at: string;
  };
  type RespRow = { token: string; created_at: string };
  type CampRow = {
    id: string;
    nombre: string;
    channel: Channel;
    created_at: string;
  };

  const envios = (enviosRes.data ?? []) as EnvioRow[];
  // Unimos respuestas legacy + las del módulo encuestas (ambas keyed por token).
  const respuestas = [
    ...((respuestasRes.data ?? []) as RespRow[]),
    ...((encuestaRespRes.data ?? []) as RespRow[]),
  ];
  const optouts = optoutsRes.data ?? [];
  const campanas = (campanasRes.data ?? []) as CampRow[];

  // Index respuestas por token para join.
  const respByToken = new Set(respuestas.map((r) => r.token));
  // Index canal por campaign_id.
  const channelById = new Map(campanas.map((c) => [c.id, c.channel]));

  // ── KPIs globales ────────────────────────────────────────────────────────
  const kpi = emptyKpi(window);
  for (const e of envios) {
    const ch = channelById.get(e.campaign_id) as Channel | undefined;
    if (e.estado === "sent") {
      kpi.sent++;
      if (ch) kpi.byChannel[ch].sent++;
    } else if (e.estado === "failed") {
      kpi.failed++;
    } else if (e.estado === "skipped") {
      kpi.skipped++;
    }
    if (e.token && respByToken.has(e.token)) {
      kpi.responses++;
      if (ch) kpi.byChannel[ch].responses++;
    }
  }
  kpi.optOuts = optouts.length;
  kpi.responseRate = kpi.sent > 0 ? kpi.responses / kpi.sent : 0;
  kpi.optOutRate = kpi.sent > 0 ? kpi.optOuts / kpi.sent : 0;
  for (const channel of OUTREACH_CHANNELS) {
    kpi.estCostUsd += costFor(channel, kpi.byChannel[channel].sent);
  }

  // ── Comparativa campañas ─────────────────────────────────────────────────
  const enviosByCamp = new Map<
    string,
    { sent: number; failed: number; skipped: number; responses: number }
  >();
  for (const e of envios) {
    const cur = enviosByCamp.get(e.campaign_id) ?? {
      sent: 0,
      failed: 0,
      skipped: 0,
      responses: 0,
    };
    if (e.estado === "sent") cur.sent++;
    else if (e.estado === "failed") cur.failed++;
    else if (e.estado === "skipped") cur.skipped++;
    if (e.token && respByToken.has(e.token)) cur.responses++;
    enviosByCamp.set(e.campaign_id, cur);
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
  const dayMap = new Map<string, { envios: number; responses: number }>();
  for (const e of envios) {
    const d = e.created_at.slice(0, 10);
    const cur = dayMap.get(d) ?? { envios: 0, responses: 0 };
    cur.envios++;
    dayMap.set(d, cur);
  }
  for (const r of respuestas) {
    const d = r.created_at.slice(0, 10);
    const cur = dayMap.get(d) ?? { envios: 0, responses: 0 };
    cur.responses++;
    dayMap.set(d, cur);
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
    listTemplates().catch(() => []),
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
