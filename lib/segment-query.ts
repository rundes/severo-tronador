// Modelo de queries de segmento como árbol (Plan 02 — F1.1).
//
// Hoy `SegmentFilter` es un objeto plano: cada propiedad se AND'ea
// implícitamente. Esto cubre el caso simple pero no permite:
//   ( sexo=F AND edad ∈ [40,65] )  OR  ( opt_out_only_email )
//   NOT ( ya_respondió_en_30d )
//
// `SegmentQuery` es un árbol: grupos con AND/OR y opcional NOT, hojas
// que son condiciones (field, op, value). Se evalúa recursivo contra
// ContactWithRelationship.
//
// Storage: SavedSegment.filtros puede ser SegmentFilter (legacy) o
// SegmentQuery (nuevo). isSegmentQuery() distingue runtime.
//
// Serialización URL: base64(JSON) en query param `q` para evitar URLs
// kilométricas y simplificar parsing (no query strings anidados).

import { healthBand, type Channel } from "@/lib/relationship";
import type { ContactWithRelationship, SegmentFilter } from "@/lib/segments";

// ── Tipos ─────────────────────────────────────────────────────────────────

export type SegmentField =
  | "sexo"
  | "edad"
  | "barrio"
  | "circuito"
  | "mesa"
  | "healthScore"
  | "healthBand"
  | "respondedWithinDays"
  | "notContactedDays"
  | "hasEmail"
  | "hasTelefono"
  | "preferredChannel";

export type SegmentOp =
  | "eq"
  | "neq"
  | "gte"
  | "lte"
  | "in"
  | "nin"
  | "exists"
  | "not_exists";

export interface SegmentCondition {
  type: "condition";
  field: SegmentField;
  op: SegmentOp;
  // Valor: string para enums, number para edad/salud, array para in/nin,
  // boolean para hasEmail/hasTelefono, null para exists/not_exists.
  value?: string | number | boolean | string[] | number[] | null;
}

export interface SegmentGroup {
  type: "group";
  combinator: "AND" | "OR";
  negate?: boolean;
  conditions: SegmentNode[];
}

export type SegmentNode = SegmentCondition | SegmentGroup;
export type SegmentQuery = SegmentGroup;

// ── Type guards ───────────────────────────────────────────────────────────

export function isSegmentQuery(x: unknown): x is SegmentQuery {
  return (
    typeof x === "object" &&
    x !== null &&
    (x as { type?: string }).type === "group"
  );
}

// ── Conversión: SegmentFilter → SegmentQuery ──────────────────────────────
// Toma el filtro plano y arma un grupo AND con una condición por cada
// propiedad definida. Equivalencia funcional: evalQuery(filterToQuery(f))
// debe matchear applySegment(all, f).

export function filterToQuery(filter: SegmentFilter): SegmentQuery {
  const conditions: SegmentCondition[] = [];
  if (filter.sexo) conditions.push(cond("sexo", "eq", filter.sexo));
  if (filter.edadMin != null) conditions.push(cond("edad", "gte", filter.edadMin));
  if (filter.edadMax != null) conditions.push(cond("edad", "lte", filter.edadMax));
  if (filter.barrio) conditions.push(cond("barrio", "eq", filter.barrio));
  if (filter.circuito) conditions.push(cond("circuito", "eq", filter.circuito));
  if (filter.mesa) conditions.push(cond("mesa", "eq", filter.mesa));
  if (filter.healthMin != null)
    conditions.push(cond("healthScore", "gte", filter.healthMin));
  if (filter.healthBands && filter.healthBands.length > 0)
    conditions.push(cond("healthBand", "in", filter.healthBands));
  if (filter.respondedWithinDays != null)
    conditions.push(cond("respondedWithinDays", "lte", filter.respondedWithinDays));
  if (filter.notContactedDays != null)
    conditions.push(cond("notContactedDays", "gte", filter.notContactedDays));
  if (filter.hasEmail === true) conditions.push(cond("hasEmail", "exists", null));
  if (filter.hasEmail === false)
    conditions.push(cond("hasEmail", "not_exists", null));
  if (filter.hasTelefono === true)
    conditions.push(cond("hasTelefono", "exists", null));
  if (filter.hasTelefono === false)
    conditions.push(cond("hasTelefono", "not_exists", null));
  if (filter.preferredChannel)
    conditions.push(cond("preferredChannel", "eq", filter.preferredChannel));
  return { type: "group", combinator: "AND", conditions };
}

function cond(
  field: SegmentField,
  op: SegmentOp,
  value: SegmentCondition["value"],
): SegmentCondition {
  return { type: "condition", field, op, value };
}

// ── Evaluador ─────────────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;

export function evalNode(
  node: SegmentNode,
  c: ContactWithRelationship,
  now = Date.now(),
): boolean {
  if (node.type === "condition") {
    return evalCondition(node, c, now);
  }
  return evalGroup(node, c, now);
}

export function evalGroup(
  group: SegmentGroup,
  c: ContactWithRelationship,
  now = Date.now(),
): boolean {
  if (group.conditions.length === 0) return !group.negate;
  let result: boolean;
  if (group.combinator === "AND") {
    result = group.conditions.every((n) => evalNode(n, c, now));
  } else {
    result = group.conditions.some((n) => evalNode(n, c, now));
  }
  return group.negate ? !result : result;
}

function getFieldValue(
  field: SegmentField,
  c: ContactWithRelationship,
  now: number,
): unknown {
  switch (field) {
    case "sexo":
      return c.contact.sexo;
    case "edad":
      return c.edad;
    case "barrio":
      return c.contact.barrio;
    case "circuito":
      return c.contact.circuito;
    case "mesa":
      return c.contact.mesa;
    case "healthScore":
      return c.rel.healthScore;
    case "healthBand":
      return healthBand(c.rel.healthScore);
    case "respondedWithinDays": {
      const last = lastDate(c, "lastRespondedAt");
      if (last == null) return null;
      return (now - last) / DAY_MS;
    }
    case "notContactedDays": {
      const last = lastDate(c, "lastContactedAt");
      if (last == null) return Number.POSITIVE_INFINITY; // nunca contactado
      return (now - last) / DAY_MS;
    }
    case "hasEmail":
      return Boolean(c.contact.email);
    case "hasTelefono":
      return Boolean(c.contact.telefono);
    case "preferredChannel":
      return c.rel.preferredChannel;
  }
}

function lastDate(
  c: ContactWithRelationship,
  key: "lastRespondedAt" | "lastContactedAt",
): number | null {
  const dates = Object.values(c.rel.channels)
    .map((ch) => ch[key])
    .filter(Boolean) as string[];
  if (dates.length === 0) return null;
  return Math.max(...dates.map((d) => +new Date(d)));
}

export function evalCondition(
  c: SegmentCondition,
  contact: ContactWithRelationship,
  now = Date.now(),
): boolean {
  const v = getFieldValue(c.field, contact, now);
  const target = c.value;
  switch (c.op) {
    case "eq":
      return v === target;
    case "neq":
      return v !== target;
    case "gte":
      return typeof v === "number" && typeof target === "number" && v >= target;
    case "lte":
      return typeof v === "number" && typeof target === "number" && v <= target;
    case "in":
      return Array.isArray(target) && (target as unknown[]).includes(v as never);
    case "nin":
      return Array.isArray(target) && !(target as unknown[]).includes(v as never);
    case "exists":
      return Boolean(v);
    case "not_exists":
      return !v;
  }
}

// ── applyQuery: filtra una lista con un SegmentQuery ──────────────────────

export function applyQuery(
  all: ContactWithRelationship[],
  query: SegmentQuery,
  now = Date.now(),
): ContactWithRelationship[] {
  return all.filter((c) => evalGroup(query, c, now));
}

// ── Serialización URL-safe ────────────────────────────────────────────────
// Base64(URL-safe) del JSON. Para query param `q` en /segmentos.

export function encodeQuery(query: SegmentQuery): string {
  const json = JSON.stringify(query);
  return Buffer.from(json, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function decodeQuery(s: string): SegmentQuery | null {
  try {
    const padded = s.replace(/-/g, "+").replace(/_/g, "/");
    const padding = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
    const json = Buffer.from(padded + padding, "base64").toString("utf8");
    const parsed = JSON.parse(json);
    if (!isSegmentQuery(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

// ── Helpers UI ────────────────────────────────────────────────────────────

export const FIELD_LABELS: Record<SegmentField, string> = {
  sexo: "Sexo",
  edad: "Edad",
  barrio: "Barrio",
  circuito: "Circuito",
  mesa: "Mesa",
  healthScore: "Salud (0-100)",
  healthBand: "Banda de salud",
  respondedWithinDays: "Días desde última respuesta",
  notContactedDays: "Días desde último contacto",
  hasEmail: "Tiene email",
  hasTelefono: "Tiene teléfono",
  preferredChannel: "Canal preferido",
};

export const OP_LABELS: Record<SegmentOp, string> = {
  eq: "=",
  neq: "≠",
  gte: "≥",
  lte: "≤",
  in: "∈",
  nin: "∉",
  exists: "tiene",
  not_exists: "no tiene",
};

// Operadores válidos para cada campo (la UI los expone como dropdown).
export const OPS_BY_FIELD: Record<SegmentField, SegmentOp[]> = {
  sexo: ["eq", "neq"],
  edad: ["gte", "lte", "eq", "neq"],
  barrio: ["eq", "neq"],
  circuito: ["eq", "neq"],
  mesa: ["eq", "neq"],
  healthScore: ["gte", "lte"],
  healthBand: ["in", "nin", "eq", "neq"],
  respondedWithinDays: ["lte", "gte"],
  notContactedDays: ["gte", "lte"],
  hasEmail: ["exists", "not_exists"],
  hasTelefono: ["exists", "not_exists"],
  preferredChannel: ["eq", "neq"],
};

// Type aliases re-export para evitar imports cruzados desde server actions.
export type { Channel };
