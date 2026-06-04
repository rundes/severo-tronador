// Variables expandidas para interpolación de templates (Plan 02 — F4).
// Va más allá de los campos directos del Contact: variables derivadas
// (saludo, fecha humana, firma) y fallbacks seguros.

import type { Contact } from "@/lib/connectors/types";
import { ORG_NAME, APP_NAME, APP_TZ } from "@/lib/config";

export interface InterpolationContext {
  now?: number;
  surveyUrl?: string;
}

// Partes de reloj de pared en la TZ del territorio (no la del runtime).
// Vercel corre en UTC; usar getHours()/getDate() directos desfasa el
// saludo y la fecha. Extraemos vía Intl con timeZone fijo.
interface WallParts {
  hour: number;
  weekday: number; // 0=domingo … 6=sábado
  date: number;
  month: number; // 0=enero … 11=diciembre
  iso: string; // YYYY-MM-DD en la TZ
}

const WEEKDAY_IDX: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

function wallParts(d: Date): WallParts {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: APP_TZ,
      hour12: false,
      weekday: "short",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
    })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  let hour = parseInt(parts.hour, 10);
  if (hour === 24) hour = 0; // algunos runtimes emiten "24" a medianoche
  return {
    hour,
    weekday: WEEKDAY_IDX[parts.weekday] ?? 0,
    date: parseInt(parts.day, 10),
    month: parseInt(parts.month, 10) - 1,
    iso: `${parts.year}-${parts.month}-${parts.day}`,
  };
}

// Resolver de variables derivadas. Devuelve string o undefined si la
// variable no aplica.
function resolveDerived(
  key: string,
  contact: Contact,
  ctx: InterpolationContext = {},
): string | undefined {
  const now = new Date(ctx.now ?? Date.now());
  switch (key) {
    case "saludo": {
      const h = wallParts(now).hour;
      if (h < 12) return "Buenos días";
      if (h < 19) return "Buenas tardes";
      return "Buenas noches";
    }
    case "fecha_humana":
      return formatFechaHumana(now);
    case "fecha_iso":
      return wallParts(now).iso;
    case "firma":
      return `Equipo de relevamiento ${ORG_NAME}`.trim();
    case "org":
      return ORG_NAME;
    case "app":
      return APP_NAME;
    case "encuesta_url":
      return ctx.surveyUrl;
    case "nombre_apellido":
      return [contact.nombre, contact.apellido].filter(Boolean).join(" ");
    case "iniciales":
      return [contact.nombre, contact.apellido]
        .filter(Boolean)
        .map((s) => (s ? s[0].toUpperCase() : ""))
        .join("");
    default:
      return undefined;
  }
}

// Formato fecha humana ES: "lunes 28 de mayo". Usa el reloj de pared de
// la TZ del territorio, no la del runtime.
function formatFechaHumana(d: Date): string {
  const dias = [
    "domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado",
  ];
  const meses = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
  ];
  const w = wallParts(d);
  return `${dias[w.weekday]} ${w.date} de ${meses[w.month]}`;
}

// Default-fallbacks por variable. Si la persona no tiene barrio y la
// plantilla referencia {{barrio}}, usamos "tu zona" en vez de quedar
// vacío. Sin esto las cartas leen "Hola María, te escribimos sobre  para
// preguntarte..."
const FALLBACKS: Record<string, string> = {
  nombre: "Hola",
  barrio: "tu zona",
  circuito: "tu circuito",
  mesa: "tu mesa",
};

// Reemplaza {{var}} buscando primero derivadas, luego contact, luego
// fallback configurado. Vacío si nada matchea.
export function interpolateExtended(
  text: string,
  contact: Contact,
  ctx: InterpolationContext = {},
): string {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => {
    const derived = resolveDerived(key, contact, ctx);
    if (derived != null && derived !== "") return derived;
    const direct = (contact as unknown as Record<string, unknown>)[key];
    if (direct != null && direct !== "") return String(direct);
    return FALLBACKS[key] ?? "";
  });
}

// Lista de variables soportadas para mostrar en la UI de plantillas.
export const SUPPORTED_VARS: { key: string; desc: string }[] = [
  { key: "nombre", desc: "Nombre del contacto" },
  { key: "apellido", desc: "Apellido del contacto" },
  { key: "nombre_apellido", desc: "Nombre y apellido juntos" },
  { key: "iniciales", desc: "Iniciales del nombre y apellido" },
  { key: "barrio", desc: "Barrio del contacto" },
  { key: "circuito", desc: "Circuito electoral" },
  { key: "mesa", desc: "Mesa electoral" },
  { key: "email", desc: "Email del contacto" },
  { key: "telefono", desc: "Teléfono del contacto" },
  { key: "encuesta_url", desc: "URL con token de la encuesta" },
  { key: "saludo", desc: "Saludo según hora (Buenos días/tardes/noches)" },
  { key: "fecha_humana", desc: "Fecha en español (lunes 28 de mayo)" },
  { key: "fecha_iso", desc: "Fecha ISO YYYY-MM-DD" },
  { key: "firma", desc: "Firma del equipo (Equipo de relevamiento ORG)" },
  { key: "org", desc: "Nombre de la organización" },
  { key: "app", desc: "Nombre del producto" },
];

// Set lookup eficiente de variables soportadas.
export const SUPPORTED_VAR_KEYS = new Set(SUPPORTED_VARS.map((v) => v.key));

// ── Helpers para UI cliente ──────────────────────────────────────────────

// Pre-resuelve TODAS las variables soportadas para un contacto+context.
// Útil para pasar al cliente como Record<string,string> y que el editor
// haga preview sin acceder a process.env ni recalcular en cada keystroke.
export function buildVarMap(
  contact: Contact,
  ctx: InterpolationContext = {},
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const v of SUPPORTED_VARS) {
    const derived = resolveDerived(v.key, contact, ctx);
    if (derived != null && derived !== "") {
      out[v.key] = derived;
      continue;
    }
    const direct = (contact as unknown as Record<string, unknown>)[v.key];
    if (direct != null && direct !== "") {
      out[v.key] = String(direct);
      continue;
    }
    out[v.key] = FALLBACKS[v.key] ?? "";
  }
  return out;
}

// Pure: interpola usando un map pre-resuelto. Safe para cliente.
export function interpolateWithMap(
  text: string,
  vars: Record<string, string>,
): string {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => {
    return vars[key] ?? "";
  });
}

// Extrae las variables que el texto referencia.
export function extractUsedVars(text: string): string[] {
  return Array.from(
    new Set([...text.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1])),
  );
}
