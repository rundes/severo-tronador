// Encoder CSV mínimo. Quotea celdas con comas, quotes o newlines.
// Sin libs externas. Sirve para exports del dashboard y de segmentos.

// Caracteres con los que Excel, LibreOffice y Google Sheets interpretan la
// celda como FÓRMULA en vez de texto. Es CSV injection: un contacto cuyo nombre
// sea `=HYPERLINK("http://malo","Click")` —o `=cmd|'/c calc'!A1` en Excel— se
// convierte en código que corre en la máquina de quien abre el export. El dato
// entra por el padrón (Sheet o CSV importado), así que es texto de terceros.
//
// El prefijo `'` le dice a la planilla "esto es texto": no se muestra en la
// celda y el valor se lee igual.
const FORMULA_START = /^[=+\-@\t\r]/;

export function csvEscape(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "object") return JSON.stringify(value);
  let s = String(value);
  if (FORMULA_START.test(s)) s = `'${s}`;
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
