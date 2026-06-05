// Schemas zod para validación en server actions. Centralizamos acá las shapes
// para no scatterar parseos manuales por cada action (#6 STABILIZATION).
//
// Cada action arma un objeto plano desde FormData y llama Schema.safeParse(obj).
// En caso de error: redirect a la página origen con ?error=validacion.
// En el path "happy" usa los datos ya tipados.
import { z } from "zod";

// ── Enums compartidos ─────────────────────────────────────────────────────
export const ChannelEnum = z.enum(["email", "whatsapp", "sms", "voice", "telegram"]);

export const SexoEnum = z.enum(["F", "M"]);

export const CallOutcomeEnum = z.enum([
  "contactado",
  "no_atendio",
  "rechazo",
  "numero_invalido",
]);

// Helper: vacío / undefined → undefined. Útil con FormData que devuelve siempre
// string vacío en lugar de null cuando un input está sin completar.
const emptyToUndef = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v == null || v === "" ? undefined : v));

// Helper para enteros opcionales con rango. Convierte string vacío en undef.
function optInt(min: number, max: number) {
  return emptyToUndef
    .transform((v) => (v == null ? undefined : Number(v)))
    .pipe(z.number().int().min(min).max(max).optional());
}

// ── Filtro de segmento (usado en query string + form de campañas) ─────────
const HealthBandEnum = z.enum(["green", "yellow", "red"]);

export const SegmentFilterSchema = z.object({
  sexo: emptyToUndef.pipe(SexoEnum.optional()),
  edadMin: optInt(0, 120),
  edadMax: optInt(0, 120),
  barrio: emptyToUndef,
  circuito: emptyToUndef,
  mesa: emptyToUndef,
  healthMin: optInt(0, 100),
  healthBands: z.array(HealthBandEnum).max(3).optional(),
  respondedWithinDays: optInt(0, 3650),
  notContactedDays: optInt(0, 3650),
  hasEmail: z.boolean().optional(),
  hasTelefono: z.boolean().optional(),
  preferredChannel: emptyToUndef.pipe(ChannelEnum.optional()),
});
export type SegmentFilterInput = z.infer<typeof SegmentFilterSchema>;

// ── Crear campaña ─────────────────────────────────────────────────────────
// preguntas viene como textarea (split por \n) — pre-procesado en la action.
export const CrearCampanaSchema = z.object({
  nombre: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .catch("Campaña sin nombre"),
  templateId: z.string().trim().min(1, "Plantilla requerida"),
  channel: ChannelEnum.catch("email"),
  preguntas: z.array(z.string().trim().min(1)).max(20).default([]),
  segmentFilter: SegmentFilterSchema,
});
export type CrearCampanaInput = z.infer<typeof CrearCampanaSchema>;

// ── Nueva plantilla ───────────────────────────────────────────────────────
export const NuevaPlantillaSchema = z
  .object({
    nombre: z.string().trim().min(1, "Nombre requerido").max(120),
    asunto: emptyToUndef.pipe(z.string().max(200).optional()),
    cuerpo: z.string().trim().min(1, "Cuerpo requerido").max(5000),
    channel: ChannelEnum.catch("email"),
  })
  // asunto solo aplica a email; en otros canales se descarta.
  .transform((v) => ({
    ...v,
    asunto: v.channel === "email" ? v.asunto : undefined,
  }));
export type NuevaPlantillaInput = z.infer<typeof NuevaPlantillaSchema>;

// ── Registrar llamada manual ─────────────────────────────────────────────
export const RegistrarLlamadaSchema = z.object({
  dni: z.string().trim().min(1).max(20),
  outcome: CallOutcomeEnum,
  notes: emptyToUndef.pipe(z.string().max(1000).optional()),
});
export type RegistrarLlamadaInput = z.infer<typeof RegistrarLlamadaSchema>;

// ── Encuesta (token UUID) ─────────────────────────────────────────────────
export const TokenSchema = z.object({
  token: z.string().trim().uuid("Token inválido"),
});
export type TokenInput = z.infer<typeof TokenSchema>;

export const SurveyAnswerSchema = z.object({
  pregunta: z.string().min(1),
  respuesta: z.string().trim().min(1).max(5000),
});
export type SurveyAnswerInput = z.infer<typeof SurveyAnswerSchema>;

// ── Config de escucha ─────────────────────────────────────────────────────
const optFloat = (min: number, max: number) =>
  emptyToUndef
    .transform((v) => (v == null ? null : Number(v)))
    .pipe(z.union([z.number().min(min).max(max), z.null()]));

export const GuardarEscuchaSchema = z.object({
  zona: z.string().trim().max(120).catch(""),
  pais: z
    .string()
    .trim()
    .toUpperCase()
    .pipe(z.string().regex(/^[A-Z]{2}$/, "País debe ser ISO-2"))
    .catch("AR"),
  radioKm: emptyToUndef
    .transform((v) => (v == null ? null : Number(v)))
    .pipe(z.union([z.number().int().min(0).max(5000), z.null()])),
  lat: optFloat(-90, 90),
  lng: optFloat(-180, 180),
  keywords: z.array(z.string().trim().min(1)).max(100).default([]),
  fuentes: z.array(z.string().trim().min(1)).max(20).default([]),
  rssFeeds: z.array(z.string().trim().url()).max(40).default([]),
});
export type GuardarEscuchaInput = z.infer<typeof GuardarEscuchaSchema>;

// ── Validadores de destino (email + teléfono) ────────────────────────────
// Reglas pragmáticas para filtrar destinos rotos antes de enviar
// (#14 STABILIZATION). No reemplaza un verifier API, pero descarta typos.

// RFC 5322 simplificado: local + @ + dominio con TLD.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;

// E.164: + opcional + 8-15 dígitos. Acepta separadores comunes (' ', '-')
// que se limpian antes del check.
const PHONE_RE = /^\+?[1-9]\d{7,14}$/;

export function isValidEmail(s: string | undefined | null): boolean {
  if (!s) return false;
  return EMAIL_RE.test(s.trim());
}

export function isValidPhone(s: string | undefined | null): boolean {
  if (!s) return false;
  const cleaned = s.replace(/[\s()-]/g, "");
  return PHONE_RE.test(cleaned);
}

export const EmailSchema = z
  .string()
  .trim()
  .refine(isValidEmail, "Email inválido");

export const PhoneSchema = z
  .string()
  .trim()
  .refine(isValidPhone, "Teléfono inválido (formato E.164)");

// ── Helpers ───────────────────────────────────────────────────────────────

// FormData → objeto plano. Agrupa keys repetidas en array. Devuelve string |
// string[] por entry. Las acciones suelen postprocesar (split por \n, etc).
export function formToObject(fd: FormData): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const [k, v] of fd.entries()) {
    if (typeof v !== "string") continue;
    const existing = out[k];
    if (existing == null) {
      out[k] = v;
    } else if (Array.isArray(existing)) {
      existing.push(v);
    } else {
      out[k] = [existing, v];
    }
  }
  return out;
}

// Mensaje compacto para mostrar en la UI: "campo: razon, otroCampo: razon".
export function summarizeZodError(error: z.ZodError): string {
  return error.issues
    .map((i) => `${i.path.join(".") || "campo"}: ${i.message}`)
    .join(", ");
}
