// Construye RawRelationship por dni a partir de los envíos/respuestas/opt-outs
// reales en Supabase. Reemplaza el mock estático cuando hay DB configurada
// (#9 STABILIZATION).
//
// Estrategia: 3 queries en paralelo (envios, respuestas, opt_outs) filtradas
// por la lista de DNIs visibles, + 1 query para resolver channel por
// campaign_id. La derivación de health score / cooldown corre app-side.
import { dbConfigured, getSupabase } from "@/lib/db/supabase";
import { CHANNELS, type Channel, type RawRelationship } from "@/lib/relationship";

interface EnvioRow {
  campaign_id: string;
  dni: string;
  token: string | null;
  created_at: string;
  estado: string;
}

interface RespRow {
  token: string;
  dni: string;
  created_at: string;
}

interface OptOutRow {
  dni: string;
  at: string;
  reason: string | null;
}

// Cuánta historia mira la ficha de relación. Todo lo que deriva de acá
// (cooldown, health score, último contacto) es sobre actividad reciente.
export const RELATIONS_WINDOW_DAYS = 180;

export async function loadRawRelationships(
  projectId: string,
  dnis: string[],
): Promise<Map<string, RawRelationship>> {
  const map = new Map<string, RawRelationship>();
  if (!dbConfigured() || dnis.length === 0) return map;

  const sinceIso = new Date(
    Date.now() - RELATIONS_WINDOW_DAYS * 86400_000,
  ).toISOString();

  const db = getSupabase();
  // Filtramos por proyecto (NO por la lista de DNIs): con padrones grandes,
  // un .in() con miles de DNIs revienta el largo de URL (414). La actividad
  // (envios/respuestas/opt_outs) es mucho menor que el padrón. Paginamos
  // porque PostgREST corta en 1000 filas por request.
  const PAGE = 1000;
  async function fetchAll<T>(
    table: string,
    cols: string,
    order: string,
    sinceCol?: string,
  ): Promise<T[]> {
    const out: T[] = [];
    for (let from = 0; ; from += PAGE) {
      let q = db
        .from(table)
        .select(cols)
        .eq("project_id", projectId);
      if (sinceCol) q = q.gte(sinceCol, sinceIso);
      const { data, error } = await q
        .order(order, { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw error;
      const batch = (data ?? []) as T[];
      out.push(...batch);
      if (batch.length < PAGE) break;
    }
    return out;
  }

  const [envios, respuestas, optouts] = await Promise.all([
    // Ventana de 180 días: la ficha de relación mide actividad reciente
    // (cooldown, health score, último contacto), no la historia completa. Sin
    // ventana, cada request paginaba TODOS los envíos y respuestas del
    // proyecto — el costo crecía para siempre y no cambiaba el resultado.
    fetchAll<EnvioRow>(
      "envios",
      "campaign_id, dni, token, created_at, estado",
      "created_at",
      "created_at",
    ),
    fetchAll<RespRow>("respuestas", "token, dni, created_at", "created_at", "created_at"),
    // Las bajas NO se ventanean: son para siempre (ARCHITECTURE §5.5). Una
    // baja de hace un año tiene que seguir apareciendo.
    fetchAll<OptOutRow>("opt_outs", "dni, at, reason", "dni"),
  ]);

  const campIds = Array.from(new Set(envios.map((e) => e.campaign_id)));
  const channelById = new Map<string, Channel>();
  // En lotes: un `.in()` con miles de ids arma una URL que el servidor rechaza
  // con 414 antes de contestar.
  for (let i = 0; i < campIds.length; i += 200) {
    const { data } = await db
      .from("campanas")
      .select("id, channel")
      .eq("project_id", projectId)
      .in("id", campIds.slice(i, i + 200));
    for (const c of data ?? []) {
      channelById.set(c.id as string, c.channel as Channel);
    }
  }

  const respByToken = new Map(respuestas.map((r) => [r.token, r.created_at]));

  for (const dni of dnis) map.set(dni, { dni, events: [], optOuts: [] });

  for (const e of envios) {
    // Solo cuentan los envíos efectivamente despachados.
    if (e.estado !== "sent") continue;
    const channel = channelById.get(e.campaign_id);
    if (!channel) continue;
    const rel = map.get(e.dni);
    if (!rel) continue;
    const respondedAt = e.token ? respByToken.get(e.token) : undefined;
    rel.events.push({
      channel,
      contactedAt: e.created_at,
      respondedAt: respondedAt ?? undefined,
    });
  }

  // Opt-out en DB es global cross-channel. Para que deriveRelationship lo
  // marque como opted_out, expandimos a los 4 canales (la lógica del lib
  // requiere que CHANNELS.every(...) matchee).
  for (const o of optouts) {
    const rel = map.get(o.dni);
    if (!rel) continue;
    for (const ch of CHANNELS) {
      rel.optOuts.push({
        channel: ch,
        at: o.at,
        reason: o.reason ?? undefined,
      });
    }
  }

  return map;
}
