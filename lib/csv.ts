// Encoder CSV mínimo. Quotea celdas con comas, quotes o newlines.
// Sin libs externas. Sirve para exports del dashboard y de segmentos.

export function csvEscape(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "object") return JSON.stringify(value);
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

// rows: array de objetos planos. Toma headers de la primera fila (o del
// arg explícito). Devuelve string CSV con \n.
export function toCsv<T extends Record<string, unknown>>(
  rows: T[],
  headers?: (keyof T)[],
): string {
  if (rows.length === 0 && !headers) return "";
  const cols = (headers ?? (Object.keys(rows[0] ?? {}) as (keyof T)[])) as string[];
  const lines: string[] = [cols.join(",")];
  for (const row of rows) {
    lines.push(cols.map((c) => csvEscape((row as Record<string, unknown>)[c])).join(","));
  }
  return lines.join("\n");
}
