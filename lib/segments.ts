// Constructor de segmentos — query builder sobre el padrón (ARCHITECTURE §6.4).
// Combina cada contacto con su ficha de relación derivada para poder filtrar
// también por salud y disponibilidad.
import { dbConfigured } from "@/lib/db/supabase";
import { readPadronFromDb } from "@/lib/db/padron";
import { loadRawRelationships } from "@/lib/db/relations";
import { mockPadron } from "@/lib/mock/padron";
import { getRawRelationship } from "@/lib/mock/relaciones";
import {
  deriveRelationship,
  healthBand,
  type ContactRelationship,
} from "@/lib/relationship";
import type { Contact } from "@/lib/connectors/types";

const DAY_MS = 24 * 60 * 60 * 1000;

export type HealthBandFilter = "green" | "yellow" | "red";

export interface SegmentFilter {
  // Demografía
  sexo?: "F" | "M";
  edadMin?: number;
  edadMax?: number;
  // Geografía
  barrio?: string;
  circuito?: string;
  mesa?: string;
  // Salud agregada
  healthMin?: number;
  healthBands?: HealthBandFilter[]; // ej ["green","yellow"]
  // Actividad
  respondedWithinDays?: number; // respondió en últimos N días
  notContactedDays?: number; // último contacto > N días (o nunca)
  // Contactabilidad
  hasEmail?: boolean;
  hasTelefono?: boolean;
  preferredChannel?: "email" | "whatsapp" | "sms" | "voice";
}

export interface ContactWithRelationship {
  contact: Contact;
  rel: ContactRelationship;
  edad: number | null;
}

export function edadDe(fechaNac?: string, now = Date.now()): number | null {
  if (!fechaNac) return null;
  const d = new Date(fechaNac);
  if (Number.isNaN(d.getTime())) return null;
  const nowD = new Date(now);
  let age = nowD.getUTCFullYear() - d.getUTCFullYear();
  const m = nowD.getUTCMonth() - d.getUTCMonth();
  if (m < 0 || (m === 0 && nowD.getUTCDate() < d.getUTCDate())) age--;
  return age;
}

export async function loadContacts(): Promise<ContactWithRelationship[]> {
  if (!dbConfigured()) {
    return mockPadron.map((contact) => ({
      contact,
      rel: deriveRelationship(contact.dni, getRawRelationship(contact.dni)),
      edad: edadDe(contact.fecha_nac),
    }));
  }
  // Path real: padron + ficha de relación derivada de envios/respuestas/opt_outs.
  const contacts = await readPadronFromDb();
  const rels = await loadRawRelationships(contacts.map((c) => c.dni));
  return contacts.map((contact) => ({
    contact,
    rel: deriveRelationship(contact.dni, rels.get(contact.dni)),
    edad: edadDe(contact.fecha_nac),
  }));
}

export function applySegment(
  all: ContactWithRelationship[],
  filter: SegmentFilter,
  now = Date.now(),
): ContactWithRelationship[] {
  return all.filter(({ contact, rel, edad }) => {
    // Demografía
    if (filter.sexo && contact.sexo !== filter.sexo) return false;
    if (filter.edadMin != null && (edad == null || edad < filter.edadMin)) return false;
    if (filter.edadMax != null && (edad == null || edad > filter.edadMax)) return false;
    // Geografía
    if (filter.barrio && contact.barrio !== filter.barrio) return false;
    if (filter.circuito && contact.circuito !== filter.circuito) return false;
    if (filter.mesa && contact.mesa !== filter.mesa) return false;
    // Salud agregada
    if (filter.healthMin != null && rel.healthScore < filter.healthMin) return false;
    if (
      filter.healthBands &&
      filter.healthBands.length > 0 &&
      !filter.healthBands.includes(healthBand(rel.healthScore))
    )
      return false;
    // Actividad (requiere ficha derivada)
    if (filter.respondedWithinDays != null) {
      const lastResp = Object.values(rel.channels)
        .map((c) => c.lastRespondedAt)
        .filter(Boolean) as string[];
      if (lastResp.length === 0) return false;
      const newest = Math.max(...lastResp.map((d) => +new Date(d)));
      if ((now - newest) / DAY_MS > filter.respondedWithinDays) return false;
    }
    if (filter.notContactedDays != null) {
      const lastCont = Object.values(rel.channels)
        .map((c) => c.lastContactedAt)
        .filter(Boolean) as string[];
      if (lastCont.length > 0) {
        const newest = Math.max(...lastCont.map((d) => +new Date(d)));
        if ((now - newest) / DAY_MS < filter.notContactedDays) return false;
      }
      // sin historial → cumple (nunca lo contactaron)
    }
    // Contactabilidad
    if (filter.hasEmail === true && !contact.email) return false;
    if (filter.hasEmail === false && contact.email) return false;
    if (filter.hasTelefono === true && !contact.telefono) return false;
    if (filter.hasTelefono === false && contact.telefono) return false;
    if (filter.preferredChannel && rel.preferredChannel !== filter.preferredChannel)
      return false;
    return true;
  });
}

export function barriosDisponibles(all: ContactWithRelationship[]): string[] {
  return Array.from(
    new Set(all.map((c) => c.contact.barrio).filter(Boolean) as string[]),
  ).sort((a, b) => a.localeCompare(b, "es"));
}

// Parse de filtros desde search params (la UI guarda el segmento en la URL).
export function filterFromParams(
  params: Record<string, string | undefined>,
): SegmentFilter {
  const num = (v: string | undefined) =>
    v != null && v !== "" && !Number.isNaN(Number(v)) ? Number(v) : undefined;
  const bool = (v: string | undefined) =>
    v === "1" || v === "true"
      ? true
      : v === "0" || v === "false"
        ? false
        : undefined;
  const bands = params.healthBands
    ? (params.healthBands
        .split(",")
        .map((s) => s.trim())
        .filter((s): s is HealthBandFilter =>
          s === "green" || s === "yellow" || s === "red",
        ) as HealthBandFilter[])
    : undefined;
  const ch = params.preferredChannel;
  return {
    sexo: params.sexo === "F" || params.sexo === "M" ? params.sexo : undefined,
    edadMin: num(params.edadMin),
    edadMax: num(params.edadMax),
    barrio: params.barrio || undefined,
    circuito: params.circuito || undefined,
    mesa: params.mesa || undefined,
    healthMin: num(params.healthMin),
    healthBands: bands && bands.length > 0 ? bands : undefined,
    respondedWithinDays: num(params.respondedWithinDays),
    notContactedDays: num(params.notContactedDays),
    hasEmail: bool(params.hasEmail),
    hasTelefono: bool(params.hasTelefono),
    preferredChannel:
      ch === "email" || ch === "whatsapp" || ch === "sms" || ch === "voice"
        ? ch
        : undefined,
  };
}
