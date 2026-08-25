// Helpers puros para los bloques de Escenario: etiqueta "vigente → propuesto"
// y serialización por líneas de cuentas / calendario / entidades (el formato
// que editan los textareas y que parsean guardarRedes / guardarReglas).

// "vigente 3 → propuesto 5 (+3 −1)" comparando líneas normalizadas.
export function diffLabel(current: string[], proposed: string[] | undefined): string | undefined {
  if (!proposed) return undefined;
  const norm = (s: string) => s.trim().toLowerCase();
  const cur = new Set(current.map(norm));
  const pro = new Set(proposed.map(norm));
  const added = [...pro].filter((x) => !cur.has(x)).length;
  const removed = [...cur].filter((x) => !pro.has(x)).length;
  return `vigente ${current.length} → propuesto ${proposed.length} (+${added} −${removed})`;
}

export const accLine = (a: { handle: string; platform: string; category: string; vinculo?: string }) =>
  `${a.handle}, ${a.platform}, ${a.category}${a.vinculo ? `, ${a.vinculo}` : ""}`;

export const calLine = (e: { label: string; date: string }) => `${e.label}, ${e.date}`;

export const entLines = (e: Record<string, string>) => Object.entries(e).map(([k, v]) => `${k}: ${v}`);
