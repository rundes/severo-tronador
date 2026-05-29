// Script de diagnóstico Plan 05 / contactos bugfix.
// Lee preview del Google Sheet con la nueva ventana A1:ZZ y muestra:
//   - n° de headers detectados (debería superar 26 si el sheet tiene más cols)
//   - lista completa de headers
//   - 2 filas sample
//   - total de rows
// Uso: npx tsx scripts/test-sheet-import.ts
import { readFileSync, existsSync } from "node:fs";

// Loader minimal de .env.local sin dependencia externa.
function loadEnv(path: string) {
  if (!existsSync(path)) return;
  const txt = readFileSync(path, "utf8");
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    const [, k, vRaw] = m;
    let v = vRaw.trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (!(k in process.env)) process.env[k] = v;
  }
}
loadEnv(".env.local");

async function main() {
  const { readPadronPreview } = await import(
    "@/lib/connectors/google-sheets"
  );
  const out = await readPadronPreview(2);
  console.log(
    JSON.stringify(
      {
        headers_count: out.headers.length,
        headers: out.headers,
        sample_rows: out.sampleRows,
        total_rows: out.totalRows,
      },
      null,
      2,
    ),
  );
}

main().catch((e: Error) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});

