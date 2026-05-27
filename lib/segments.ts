// Constructor de segmentos — query builder sobre el padrón (ARCHITECTURE §6.4).
// Combina cada contacto con su ficha de relación derivada para poder filtrar
// también por salud y disponibilidad.
import { dbConfigured } from "@/lib/db/supabase";
import { readPadronFromDb } from "@/lib/db/padron";
import { mockPadron } from "@/lib/mock/padron";
import { getRawRelationship } from "@/lib/mock/relaciones";
import { deriveRelationship, type ContactRelationship } from "@/lib/relationship";
import type { Contact } from "@/lib/connectors/types";

export interface SegmentFilter {
  sexo?: "F" | "M";
  edadMin?: number;
  edadMax?: number;
  barrio?: string;
  healthMin?: number;
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
  const contacts = dbConfigured() ? await readPadronFromDb() : mockPadron;
  return contacts.map((contact) => ({
    contact,
    rel: deriveRelationship(contact.dni, getRawRelationship(contact.dni)),
    edad: edadDe(contact.fecha_nac),
  }));
}

export function applySegment(
  all: ContactWithRelationship[],
  filter: SegmentFilter,
): ContactWithRelationship[] {
  return all.filter(({ contact, rel, edad }) => {
    if (filter.sexo && contact.sexo !== filter.sexo) return false;
    if (filter.barrio && contact.barrio !== filter.barrio) return false;
    if (filter.edadMin != null && (edad == null || edad < filter.edadMin)) return false;
    if (filter.edadMax != null && (edad == null || edad > filter.edadMax)) return false;
    if (filter.healthMin != null && rel.healthScore < filter.healthMin) return false;
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
  return {
    sexo: params.sexo === "F" || params.sexo === "M" ? params.sexo : undefined,
    edadMin: num(params.edadMin),
    edadMax: num(params.edadMax),
    barrio: params.barrio || undefined,
    healthMin: num(params.healthMin),
  };
}
