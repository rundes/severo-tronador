// Test del mapeo + readPadronMapped sin tocar la DB.
// Aplica un mapeo inferido (matching exacto de headers conocidos) y
// muestra cuántas filas resultantes tienen valores en cada campo.
import { readFileSync, existsSync } from "node:fs";

function loadEnv(path: string) {
  if (!existsSync(path)) return;
  const txt = readFileSync(path, "utf8");
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (!(m[1] in process.env)) process.env[m[1]] = v;
  }
}
loadEnv(".env.local");

async function main() {
  const { readPadronMapped } = await import(
    "@/lib/connectors/google-sheets"
  );

  // Mapeo manual basado en los headers reales del Sheet del usuario.
  const mapping: Record<string, string> = {
    dni: "DNI",
    nombre: "APELLIDO Y NOMBRE",
    sexo: "SEXO",
    domicilio: "DOMICILIO",
    barrio: "LOCALIDAD",
    circuito: "CIRCUITO",
    mesa: "NRO_MESA",
    fecha_nac: "CLASE",
    telefono: "MAIPU_celular #1",
    email: "MAIPU_email #1",
    x_handle: "MAIPU_twitter",
  };

  const rows = await readPadronMapped(mapping);
  const stats: Record<string, number> = {};
  for (const field of Object.keys(mapping)) stats[field] = 0;
  for (const r of rows) {
    for (const field of Object.keys(mapping)) {
      const v = (r as Record<string, string>)[field];
      if (v && v.trim() !== "" && v !== "-" && v !== "SIN DATO") {
        stats[field]++;
      }
    }
  }

  console.log(JSON.stringify({
    total_rows: rows.length,
    sample_first: rows[0],
    sample_with_twitter: rows.find(
      (r) => (r as Record<string, string>).x_handle?.trim(),
    ),
    fields_filled: stats,
  }, null, 2));
}

main().catch((e: Error) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
