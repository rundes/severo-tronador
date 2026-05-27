// Plantillas de mensaje por canal. Variables tipo {{nombre}}, {{barrio}}.
// F3: store en memoria (globalThis) sembrado con un par de plantillas. La
// persistencia real es la hoja `templates` (refinamiento posterior).
import type { Channel } from "@/lib/relationship";
import type { Contact } from "@/lib/connectors/types";

export interface Template {
  id: string;
  channel: Channel;
  nombre: string;
  asunto?: string;
  cuerpo: string;
  estado: "borrador" | "activo";
  createdAt: string;
}

const seed: Template[] = [
  {
    id: "tpl-invitacion",
    channel: "email",
    nombre: "Invitación a encuesta corta",
    asunto: "¿Nos das 2 minutos, {{nombre}}?",
    cuerpo:
      "Hola {{nombre}}, somos el equipo de relevamiento de Maipú. " +
      "Estamos haciendo una encuesta de opinión sobre tu barrio ({{barrio}}). " +
      "No es campaña electoral ni vendemos nada. ¿Nos contás qué pensás? " +
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
      "Hola {{nombre}}, somos el equipo de relevamiento de Maipú. ¿Tenés 2 " +
      "minutos para una pregunta sobre {{barrio}}? Es investigación, no es " +
      "campaña electoral. Si no querés recibir más mensajes, respondé BAJA.",
    estado: "activo",
    createdAt: "2026-05-01T00:00:00.000Z",
  },
];

type Store = Template[];
const g = globalThis as unknown as { __templates?: Store };
const store: Store = (g.__templates ??= seed);

export function listTemplates(channel?: Channel): Template[] {
  return channel ? store.filter((t) => t.channel === channel) : store;
}

export function getTemplate(id: string): Template | undefined {
  return store.find((t) => t.id === id);
}

export function createTemplate(input: Omit<Template, "id" | "createdAt">): Template {
  const tpl: Template = {
    ...input,
    id: `tpl-${Date.now().toString(36)}`,
    createdAt: new Date().toISOString(),
  };
  store.push(tpl);
  return tpl;
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
