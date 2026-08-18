// Plantillas de mensaje por canal. Variables tipo {{nombre}}, {{barrio}}.
// Persistencia Supabase directa (mapea camelCase↔snake_case: la columna es
// created_at, no createdAt) con fallback en memoria.
//
// SCOPE POR PROYECTO, sin excepciones. Antes las lecturas eran org-globales y
// las escrituras caían al DEFAULT de la columna project_id: cualquier plantilla
// creada por un proyecto la veían todos. `projectId` es obligatorio en toda la
// superficie pública para que ningún caller pueda olvidarlo.
import type { Channel } from "@/lib/relationship";
import { dbConfigured, getSupabase } from "@/lib/db/supabase";
import { DEFAULT_PROJECT_ID } from "@/lib/projects";
import { prefixedId } from "@/lib/ids";

export type TemplateFormato = "texto" | "html" | "html_full";

export interface Template {
  id: string;
  projectId: string;
  channel: Channel;
  nombre: string;
  asunto?: string;
  cuerpo: string;
  // Diseño del email: "texto" (default, retrocompatible) o "html". Solo aplica
  // a email; los otros canales son siempre texto plano.
  formato: TemplateFormato;
  // HTML crudo del editor cuando formato = "html". El `cuerpo` en texto se
  // conserva como fallback (preview/plaintext y canales no-email).
  cuerpoHtml?: string;
  estado: "borrador" | "activo";
  createdAt: string;
}

type SeedTemplate = Omit<Template, "projectId">;

const SEED: SeedTemplate[] = [
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
    formato: "texto",
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
    formato: "texto",
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
    formato: "texto",
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
    formato: "texto",
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
    formato: "texto",
    estado: "activo",
    createdAt: "2026-05-01T00:00:00.000Z",
  },
];

interface TemplateRow {
  id: string;
  project_id: string;
  channel: Channel;
  nombre: string;
  asunto: string | null;
  cuerpo: string;
  formato?: string | null;
  cuerpo_html?: string | null;
  estado: Template["estado"];
  created_at: string;
}

const g = globalThis as unknown as { __templates?: Template[] };
const mem = (g.__templates ??= []);

// Los ids de las plantillas semilla son la PK de la tabla, así que no pueden
// repetirse entre proyectos. El proyecto default conserva el id histórico
// (`tpl-invitacion`) para no romper las campañas que ya lo referencian; el
// resto lo lleva sufijado.
function seedIdFor(baseId: string, projectId: string): string {
  // El projectId entero, no un prefijo: la PK es text y un prefijo corto
  // colisiona entre proyectos con nombres parecidos.
  return projectId === DEFAULT_PROJECT_ID ? baseId : `${baseId}--${projectId}`;
}

function seedFor(projectId: string): Template[] {
  return SEED.map((t) => ({
    ...t,
    id: seedIdFor(t.id, projectId),
    projectId,
  }));
}

function rowToTemplate(r: TemplateRow): Template {
  return {
    id: r.id,
    projectId: r.project_id,
    channel: r.channel,
    nombre: r.nombre,
    asunto: r.asunto ?? undefined,
    cuerpo: r.cuerpo,
    formato:
      r.formato === "html"
        ? "html"
        : r.formato === "html_full"
          ? "html_full"
          : "texto",
    cuerpoHtml: r.cuerpo_html ?? undefined,
    estado: r.estado,
    createdAt: r.created_at,
  };
}

// Fila para la DB: createdAt → created_at, projectId → project_id.
function templateToRow(t: Template): TemplateRow {
  return {
    id: t.id,
    project_id: t.projectId,
    channel: t.channel,
    nombre: t.nombre,
    asunto: t.asunto ?? null,
    cuerpo: t.cuerpo,
    formato: t.formato ?? "texto",
    cuerpo_html: t.cuerpoHtml ?? null,
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

// Semilla POR PROYECTO: un proyecto nuevo arranca con las plantillas base, no
// con las del vecino. El set de ya-sembrados es por proceso; el chequeo real es
// el count por proyecto contra la DB.
const seeded = new Set<string>();
async function ensureSeed(projectId: string) {
  if (seeded.has(projectId)) return;
  if (!dbConfigured()) {
    if (!mem.some((t) => t.projectId === projectId)) {
      mem.push(...seedFor(projectId));
    }
    seeded.add(projectId);
    return;
  }
  const { count, error } = await getSupabase()
    .from("templates")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId);
  if (error) throw error;
  if ((count ?? 0) === 0) for (const t of seedFor(projectId)) await upsertTemplate(t);
  seeded.add(projectId);
}

export async function listTemplates(
  projectId: string,
  channel?: Channel,
): Promise<Template[]> {
  await ensureSeed(projectId);
  if (!dbConfigured()) {
    return mem.filter(
      (t) => t.projectId === projectId && (!channel || t.channel === channel),
    );
  }
  let q = getSupabase()
    .from("templates")
    .select("*")
    .eq("project_id", projectId);
  if (channel) q = q.eq("channel", channel);
  const { data, error } = await q;
  if (error) throw error;
  return (data as TemplateRow[]).map(rowToTemplate);
}

// Busca una plantilla por id DENTRO de un proyecto (anti-IDOR cross-tenant):
// una plantilla de otro proyecto se trata como inexistente. `projectId` es
// obligatorio a propósito — cuando era opcional, el path de envío de campañas
// no lo pasaba y podía resolver la plantilla de otro tenant.
export async function getTemplate(
  id: string,
  projectId: string,
): Promise<Template | undefined> {
  await ensureSeed(projectId);
  if (!dbConfigured()) {
    return mem.find((t) => t.id === id && t.projectId === projectId);
  }
  const { data } = await getSupabase()
    .from("templates")
    .select("*")
    .eq("id", id)
    .eq("project_id", projectId)
    .maybeSingle();
  return data ? rowToTemplate(data as TemplateRow) : undefined;
}

export async function createTemplate(
  projectId: string,
  input: Omit<Template, "id" | "projectId" | "createdAt" | "formato"> & {
    formato?: TemplateFormato;
  },
): Promise<Template> {
  const tpl: Template = {
    ...input,
    projectId,
    formato: input.formato ?? "texto",
    id: prefixedId("tpl"),
    createdAt: new Date().toISOString(),
  };
  return upsertTemplate(tpl);
}

// Actualiza una plantilla existente del proyecto dado (conserva id + createdAt).
// Devuelve undefined si el id no existe o pertenece a otro proyecto: el chequeo
// de pertenencia vive acá, en la capa de datos, para que el caller no lo olvide.
export async function updateTemplate(
  id: string,
  projectId: string,
  input: Omit<Template, "id" | "projectId" | "createdAt" | "formato"> & {
    formato?: TemplateFormato;
  },
): Promise<Template | undefined> {
  const existing = await getTemplate(id, projectId);
  if (!existing) return undefined;
  const tpl: Template = {
    ...existing,
    ...input,
    projectId,
    formato: input.formato ?? existing.formato,
    id,
    createdAt: existing.createdAt,
  };
  return upsertTemplate(tpl);
}

// La interpolación vive en un solo lugar: lib/interpolate-vars.ts.
//
// Convivían DOS motores: uno acá —sólo campos directos del contacto— y
// `interpolateExtended`, que además resuelve derivadas ({{saludo}},
// {{fecha_humana}}, {{firma}}, {{encuesta_url}}) y fallbacks. Los cuerpos usaban
// el completo y los ASUNTOS el de acá, así que un `{{saludo}}` en el asunto se
// renderizaba vacío mientras el mismo token en el cuerpo funcionaba — y el
// editor de plantillas ofrecía las derivadas sin distinguir dónde valían. Todos
// los call sites pasaron al motor completo y este se eliminó.

// Variables que la plantilla referencia.
export function templateVars(text: string): string[] {
  return Array.from(
    new Set([...text.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1])),
  );
}
