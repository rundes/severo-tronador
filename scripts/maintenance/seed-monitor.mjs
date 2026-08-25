// Precarga de escenario de monitoreo para FERRO e Ibicuy. Corre en GitHub
// Actions con los secrets de Supabase del repo. Resuelve los proyectos por
// nombre (ILIKE), setea listening_config (zona+keywords: dispara el barrido
// automático server-side y el informe diario) y monitor-config (calendario,
// búsquedas simétricas, entidades, memoria de errores). Idempotente.
//
// NO precarga handles de agrupaciones/oposición: esos son datos del caso que
// el operador carga con evidencia. Sí las cuentas institucionales públicas.

const base = process.env.SUPABASE_URL?.replace(/\/$/, "");
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!base || !key) { console.error("faltan secrets"); process.exit(1); }
const H = { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" };

async function rest(method, path, body) {
  const res = await fetch(`${base}/rest/v1/${path}`, {
    method, headers: { ...H, prefer: "return=representation,resolution=merge-duplicates" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

async function findProject(nameLike) {
  const rows = await rest("GET", `projects?select=id,nombre&nombre=ilike.*${encodeURIComponent(nameLike)}*`);
  return rows[0] || null;
}

async function upsertConfig(connectorId, config) {
  // El POST con merge-duplicates no alcanza: la unique es (connector_id,
  // project_id) con project_id NULL y la segunda corrida daba 409
  // ("duplicate key ... monitor-config:<ferro>"), cortando el seed antes de
  // Ibicuy. GET + PATCH/POST explícito.
  const id = encodeURIComponent(connectorId);
  const cur = await rest("GET", `conector_config?connector_id=eq.${id}&project_id=is.null&select=connector_id`);
  const row = { config, updated_at: new Date().toISOString() };
  if (cur.length > 0) {
    await rest("PATCH", `conector_config?connector_id=eq.${id}&project_id=is.null`, row);
  } else {
    await rest("POST", "conector_config", { connector_id: connectorId, ...row });
  }
}

async function setListening(projectId, patch) {
  // listening_config tiene PK project_id; merge con lo existente.
  const cur = (await rest("GET", `listening_config?project_id=eq.${projectId}&select=*`))[0] || {};
  await rest("POST", "listening_config", {
    project_id: projectId,
    geo: patch.geo ?? cur.geo ?? { zona: "", pais: "AR" },
    keywords: patch.keywords ?? cur.keywords ?? [],
    fuentes: cur.fuentes ?? [],
    rss_feeds: cur.rss_feeds ?? [],
    x_handles: cur.x_handles ?? [],
    radio_streams: cur.radio_streams ?? [],
    lat: cur.lat ?? null, lng: cur.lng ?? null, radio: cur.radio ?? null,
    updated_at: new Date().toISOString(),
  });
}

const DEFAULT_BUDGET = {
  instagram: { requests: 60, pausaMinMs: 6000, pausaMaxMs: 20000 },
  x: { requests: 35, pausaMinMs: 6000, pausaMaxMs: 20000 },
  facebook: { requests: 25, pausaMinMs: 8000, pausaMaxMs: 22000 },
  tiktok: { requests: 15, pausaMinMs: 8000, pausaMaxMs: 22000 },
};

// ---- FERRO: Club Ferro Carril Oeste, elecciones 2026 ----
const FERRO = {
  match: "ferro",
  listening: {
    geo: { zona: "Club Ferro Carril Oeste", pais: "AR" },
    keywords: [
      "Ferro Carril Oeste", "elecciones Ferro", "socios Ferro",
      "comisión directiva Ferro", "lista Ferro", "asamblea Ferro",
      "Caballito", "el Verdolaga",
    ],
  },
  monitor: {
    accounts: [
      // Institucionales públicas (verificables). Las agrupaciones/listas las
      // carga el operador con evidencia — no se precargan por §9.2.3.
      { handle: "ferrocarriloeste", platform: "instagram", category: "institucional", nota: "cuenta oficial — verificar handle" },
      { handle: "ferrooesteoficial", platform: "x", category: "institucional", nota: "verificar handle" },
    ],
    searchesA: ["Ferro elecciones oficialismo", "Ferro lista oficialista", "gestión Ferro"],
    searchesB: ["Ferro elecciones oposición", "Ferro lista opositora", "recambio Ferro"],
    calendar: [{ label: "Elecciones Ferro (fecha a confirmar)", date: "2026-09-14" }],
    noRepetir: [
      "La última actividad de una cuenta es el máximo entre feed e historias, no solo el feed (spec §7.2).",
      "La tracción de una pieza se mide a las 24 h; por debajo es provisoria (spec §7.4).",
      "No atribuir una operación a una lista sin evidencia; coincidencia de blanco o mes de creación no prueba coordinación (spec §9.2).",
    ],
    entidades: {
      "Ferro Carril Oeste": "Club deportivo de Caballito, CABA. Estadio Arquitecto Ricardo Etcheverri.",
      "Etcheverri": "Estadio de Ferro en Caballito. No confundir con predios de entrenamiento en otro municipio.",
    },
    budget: DEFAULT_BUDGET,
  },
};

// ---- IBICUY: escucha territorial (no electoral) ----
const IBICUY = {
  match: "ibicuy",
  listening: {
    geo: { zona: "Ibicuy, Entre Ríos", pais: "AR" },
    // Dos capas, porque la prensa nacional casi no nombra "Ibicuy": los
    // términos amplios (transporte, seguridad, inundaciones, Entre Ríos)
    // son los que traen prensa provincial vía GDELT (~50 artículos/corrida);
    // con solo los específicos GDELT dio 0 (2026-08-25). El gdelt-worker
    // parte en lotes de 7, así que el orden importa: amplios primero.
    keywords: [
      // amplios (territorio + agenda)
      "Transporte", "Seguridad", "Inundaciones", "Entre Rios",
      "Departamento Islas", "islas de ibicuy", "Ibicuy",
      // específicos (gestión local)
      "Islas del Ibicuy", "municipio Ibicuy", "intendente Ibicuy",
      "obras Ibicuy", "cloacas Ibicuy", "agua Ibicuy", "caminos Ibicuy",
      "Villa Paranacito", "Médanos Entre Ríos",
    ],
  },
  monitor: {
    accounts: [],
    searchesA: ["Ibicuy gestión municipal", "Ibicuy obras"],
    searchesB: ["Ibicuy reclamos vecinos", "Ibicuy oposición"],
    calendar: [],
    noRepetir: [
      "Ibicuy es escucha territorial, no monitoreo electoral: priorizar prensa local y páginas municipales.",
    ],
    entidades: {
      "Ibicuy": "Localidad y departamento Islas del Ibicuy, sur de Entre Ríos.",
    },
    budget: DEFAULT_BUDGET,
  },
};

for (const c of [FERRO, IBICUY]) {
  const p = await findProject(c.match);
  if (!p) { console.log(`SIN PROYECTO para "${c.match}" — omitido`); continue; }
  await setListening(p.id, c.listening);
  await upsertConfig(`monitor-config:${p.id}`, c.monitor);
  console.log(`${c.match} → ${p.nombre} (${p.id}): listening ${c.listening.keywords.length} kw, monitor ${c.monitor.accounts.length} cuentas, ${c.monitor.searchesA.length + c.monitor.searchesB.length} búsquedas`);
}
console.log("seed completo");
