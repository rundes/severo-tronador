// Limpieza de feeds pagos/muertos en listening_config de todos los proyectos.
// Corre en GitHub Actions (workflow maintenance.yml) con los secrets de
// Supabase del repo; no hay acceso a la DB desde afuera de esa vía.
//
// Regla: borra SOLO dominios de servicios de feeds pagos conocidos (hoy
// rss.app: 402 desde que cerró el free tier — la derivación propia del
// conector RSS lo reemplaza). Feeds propios que fallan NO se borran: el
// conector ya reintenta desde la raíz del sitio y un 404 puede ser transitorio.
//
// Uso: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node clean-paid-feeds.mjs

const PAID_HOSTS = /(^|\.)rss\.app$|(^|\.)feedspot\.com$|(^|\.)feedly\.com$/i;

const base = process.env.SUPABASE_URL?.replace(/\/$/, "");
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!base || !key) {
  console.error("Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const headers = {
  apikey: key,
  authorization: `Bearer ${key}`,
  "content-type": "application/json",
};

function hostOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

const res = await fetch(`${base}/rest/v1/listening_config?select=project_id,rss_feeds`, { headers });
if (!res.ok) {
  console.error(`GET listening_config: HTTP ${res.status}`);
  process.exit(1);
}

for (const row of await res.json()) {
  const feeds = row.rss_feeds ?? [];
  const kept = feeds.filter((u) => !PAID_HOSTS.test(hostOf(u)));
  const removed = feeds.filter((u) => PAID_HOSTS.test(hostOf(u)));
  if (removed.length === 0) continue;
  const patch = await fetch(
    `${base}/rest/v1/listening_config?project_id=eq.${row.project_id}`,
    { method: "PATCH", headers, body: JSON.stringify({ rss_feeds: kept }) },
  );
  console.log(
    `${row.project_id}: -${removed.length} feeds pagos (${removed.map(hostOf).join(", ")}) → ${patch.ok ? "ok" : `HTTP ${patch.status}`}`,
  );
}
console.log("limpieza completa");
