// Plantillas de mensaje por canal. Variables tipo {{nombre}}, {{barrio}}.
// Persistencia Supabase directa (mapea camelCase↔snake_case: la columna es
// created_at, no createdAt) con fallback en memoria. Org-global (sin filtro de
// proyecto en lectura; el project_id lo completa el default de la tabla).
import type { Channel } from "@/lib/relationship";
import type { Contact } from "@/lib/connectors/types";
import { dbConfigured, getSupabase } from "@/lib/db/supabase";

export interface Template {
  id: string;
  channel: Channel;
  nombre: string;
  asunto?: string;
  cuerpo: string;
  estado: "borrador" | "activo";
  createdAt: string;
}

const SEED: Template[] = [
  {
    id: "tpl-invitacion",
    channel: "email",
    nombre: "Invitación a encuesta corta",
    asunto: "¿Nos das 2 minutos, {{nombre}}?",
    cuerpo:
      "Hola {{nombre}}, somos el equipo de relevamiento. " +
      "Estamos haciendo una encuesta de opinión sobre tu barrio ({{barrio}}). " +
      "No es campaña electoral ni vendemos nada. Respondé acá: {{encuesta_url}} " +
      "Para no recibir más mensajes, respondé BAJA.",
    estado: "activo",
    createdAt: "2026-05-01T00:00:00.000Z",
  },
  {
    id: "tpl-recordatorio",
    channel: "email",
    nombre: "Recordatorio (24h)",
    asunto: "Tu opinión sigue abierta, {{nombre}}",
    cuerpo:
      "Hola {{nombre}}, te escribimos ayer sobre una encuesta en {{barrio}}. " +
      "Si tenés un minuto, nos ayuda mucho. Para no recibir más, respondé BAJA.",
    estado: "activo",
    createdAt: "2026-05-01T00:00:00.000Z",
  },
  {
    id: "tpl-wa-invitacion",
    channel: "whatsapp",
    nombre: "WA · Invitación a encuesta",
    cuerpo:
      "Hola {{nombre}}, somos el equipo de relevamiento. ¿Tenés 2 " +
      "minutos para una pregunta sobre {{barrio}}? Es investigación, no es " +
      "campaña electoral. Respondé acá: {{encuesta_url}} " +
      "Si no querés recibir más mensajes, respondé BAJA.",
    estado: "activo",
    createdAt: "2026-05-01T00:00:00.000Z",
  },
  {
    id: "tpl-sms-recordatorio",
    channel: "sms",
    nombre: "SMS · Recordatorio corto",
    cuerpo:
      "Relevamiento: {{nombre}}, encuesta de {{barrio}}: {{encuesta_url}} " +
      "Responder BAJA para no recibir más.",
    estado: "activo",
    createdAt: "2026-05-01T00:00:00.000Z",
  },
  {
    id: "tpl-voz-ivr",
    channel: "voice",
    nombre: "Voz · Guion IVR",
    cuerpo:
      "Hola {{nombre}}. Le habla el equipo de relevamiento. " +
      "Estamos haciendo una breve encuesta de opinión sobre {{barrio}}. " +
      "Si desea participar, presione 1. Para no recibir más llamados, presione 9.",
    estado: "activo",
    createdAt: "2026-05-01T00:00:00.000Z",
  },
];

interface TemplateRow {
  id: string;
  channel: Channel;
  nombre: string;
  asunto: string | null;
  cuerpo: string;
  estado: Template["estado"];
  created_at: string;
}

const g = globalThis as unknown as { __templates?: Template[] };
const mem = (g.__templates ??= []);

function rowToTemplate(r: TemplateRow): Template {
  return {
    id: r.id,
    channel: r.channel,
    nombre: r.nombre,
    asunto: r.asunto ?? undefined,
    cuerpo: r.cuerpo,
    estado: r.estado,
    createdAt: r.created_at,
  };
}

// Fila para la DB: createdAt → created_at. Sin project_id (default de la tabla).
function templateToRow(t: Template): TemplateRow {
  return {
    id: t.id,
    channel: t.channel,
    nombre: t.nombre,
    asunto: t.asunto ?? null,
    cuerpo: t.cuerpo,
    estado: t.estado,
    created_at: t.createdAt,
  };
}

async function upsertTemplate(t: Template): Promise<Template> {
  if (!dbConfigured()) {
    const i = mem.findIndex((x) => x.id === t.id);
    if (i >= 0) mem[i] = t;
    else mem.push(t);
    return t;
  }
  const { data, error } = await getSupabase()
    .from("templates")
    .upsert(templateToRow(t))
    .select()
    .single();
  if (error) throw error;
  return rowToTemplate(data as TemplateRow);
}

let seeded = false;
async function ensureSeed() {
  if (seeded) return;
  if (!dbConfigured()) {
    if (mem.length === 0) mem.push(...SEED);
    seeded = true;
    return;
  }
  const { count, error } = await getSupabase()
    .from("templates")
    .select("id", { count: "exact", head: true });
  if (error) throw error;
  if ((count ?? 0) === 0) for (const t of SEED) await upsertTemplate(t);
  seeded = true;
}

export async function listTemplates(channel?: Channel): Promise<Template[]> {
  await ensureSeed();
  if (!dbConfigured()) {
    return channel ? mem.filter((t) => t.channel === channel) : [...mem];
  }
  const { data, error } = await getSupabase().from("templates").select("*");
  if (error) throw error;
  const all = (data as TemplateRow[]).map(rowToTemplate);
  return channel ? all.filter((t) => t.channel === channel) : all;
}

export async function getTemplate(id: string): Promise<Template | undefined> {
  await ensureSeed();
  if (!dbConfigured()) return mem.find((t) => t.id === id);
  const { data } = await getSupabase()
    .from("templates")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return data ? rowToTemplate(data as TemplateRow) : undefined;
}

export async function createTemplate(
  input: Omit<Template, "id" | "createdAt">,
): Promise<Template> {
  const tpl: Template = {
    ...input,
    id: `tpl-${Date.now().toString(36)}`,
    createdAt: new Date().toISOString(),
  };
  return upsertTemplate(tpl);
}

// Sustituye {{var}} por el campo del contacto (vacío si no existe).
export function interpolate(text: string, contact: Contact): string {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => {
    const v = (contact as unknown as Record<string, unknown>)[key];
    return v == null ? "" : String(v);
  });
}

// Variables que la plantilla referencia.
export function templateVars(text: string): string[] {
  return Array.from(
    new Set([...text.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1])),
  );
}
