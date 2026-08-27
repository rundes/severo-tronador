// Service worker (módulo): orquestador de la corrida. Baja el plan del server,
// respeta el presupuesto/jitter/concurrencia-1/breaker y horario plausible,
// navega cada cuenta en una pestaña de su plataforma, pide al content script
// que colecte, ejecuta las búsquedas A/B del escenario, sube lo relevado y
// los candidatos a actor, y reporta señales anti-bloqueo al server.
import { Budget, plausibleHour, shuffle, sleep } from "./core/budget.js";
import { signalFromResponse } from "./core/breaker.js";
import { profileUrl, searchUrl, candidatesFromIgSearch, candidatesFromItems, mergeCandidates, sameHost, isOnTarget } from "./core/nav.js";

const PLATFORM_HOME = {
  instagram: "https://www.instagram.com/",
  x: "https://x.com/",
  facebook: "https://www.facebook.com/",
  tiktok: "https://www.tiktok.com/",
};

// Techos por cuenta y corrida (spec §3 y §4).
const IG_COMMENT_PIECES = 6;
const X_REPLY_PIECES = 2;
const MAX_ERRORES = 50;
// Requests que se le reservan a cada plataforma para las búsquedas A/B: sin
// esta reserva las primeras cuentas se comen el presupuesto pidiendo
// comentarios y la corrida se queda sin descubrimiento de actores.
const RESERVA_BUSQUEDAS = 10;
// Techo global de pedidos de comentarios/respuestas por corrida.
const MAX_COMENTARIOS_CORRIDA = 20;
// MV3 apaga el service worker a los ~30s sin actividad de API; una corrida dura
// horas. Un ping periódico a chrome.* lo mantiene vivo mientras dura.
const KEEP_ALIVE_MS = 20000;

// Largos del contrato de errores (el server los recorta igual; mejor no mandar
// media página de HTML como "detail").
const MAX_PLATFORM = 20;
const MAX_HANDLE = 120;
const MAX_STEP = 40;
const MAX_DETAIL = 300;

// Error de corrida con forma estable: lo consume el panel y el server
// (POST /api/extension/signal kind:"run-summary").
function pushError(errores, platform, handle, step, detail) {
  if (errores.length >= MAX_ERRORES) return;
  errores.push({
    platform: String(platform == null ? "?" : platform).slice(0, MAX_PLATFORM),
    handle: handle ? String(handle).slice(0, MAX_HANDLE) : undefined,
    step: String(step == null || step === "" ? "?" : step).slice(0, MAX_STEP),
    detail: String(detail == null ? "" : detail).slice(0, MAX_DETAIL),
  });
}

// ¿Se puede pedir un lote más de comentarios/respuestas? Devuelve el motivo por
// el que NO, para que quede escrito en el resumen de la corrida.
function motivoSinFanOut(budget, platform, comentarios) {
  if (comentarios >= MAX_COMENTARIOS_CORRIDA) return "techo de comentarios de la corrida";
  if (budget.remaining(platform) <= RESERVA_BUSQUEDAS) return "reserva para búsquedas";
  return null;
}

async function cfg() {
  return chrome.storage.sync.get({ appUrl: "", token: "" });
}
async function api(path, options = {}) {
  const { appUrl, token } = await cfg();
  if (!appUrl || !token) throw new Error("Configurá URL y token en Opciones");
  const res = await fetch(`${appUrl.replace(/\/$/, "")}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(options.headers || {}) },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function setStatus(patch) {
  return chrome.storage.local.get("runStatus").then((s) => {
    const cur = s.runStatus || {};
    return chrome.storage.local.set({ runStatus: { ...cur, ...patch, at: Date.now() } });
  });
}

// Pestañas abiertas por la extensión en esta corrida (platform → tabId). Se
// prefieren siempre a cualquier otra pestaña del usuario; solo si no hay una
// propia viva se reusa una pestaña ajena cuyo hostname sea el de la plataforma
// (nunca por substring: "dropbox.com" no es "x.com").
const ownTabs = new Map();

async function liveTab(tabId) {
  if (tabId == null) return null;
  return chrome.tabs.get(tabId).catch(() => null);
}

async function findPlatformTab(platform) {
  const own = await liveTab(ownTabs.get(platform));
  if (own) return own;
  ownTabs.delete(platform);
  const host = new URL(PLATFORM_HOME[platform]).hostname.replace(/^www\./, "");
  const tabs = await chrome.tabs.query({});
  return tabs.find((t) => t.url && sameHost(t.url, host)) || null;
}

// Abre (o reusa) la pestaña de la plataforma y la navega de verdad a `url`
// (nunca se lee el DOM de la home a secas); espera a que cargue + jitter.
async function openIn(platform, url) {
  let tab = await findPlatformTab(platform);
  if (tab) {
    // El atajo "ya estamos en destino" solo vale chequeado ANTES del update:
    // después, la pestaña sigue reportando la URL vieja y el chequeo daba por
    // cargada una página que recién empezaba a navegar.
    if (tab.status === "complete" && isOnTarget(tab.url, url)) {
      ownTabs.set(platform, tab.id);
      await sleep(2000 + Math.floor(Math.random() * 2000));
      return tab;
    }
    const loaded = waitLoaded(tab.id, url, LOAD_TIMEOUT_MS, false);
    await chrome.tabs.update(tab.id, { url, active: false });
    await loaded;
  } else {
    tab = await chrome.tabs.create({ url, active: false });
    await waitLoaded(tab.id, url);
  }
  ownTabs.set(platform, tab.id);
  await sleep(2000 + Math.floor(Math.random() * 2000));
  return tab;
}

const LOAD_TIMEOUT_MS = 20000;
// Resuelve cuando la pestaña `tabId` terminó de cargar (`status: complete`) y
// está efectivamente en `expectedUrl` (origin+pathname). El listener se registra
// ANTES de navegar para no perder el evento; si ya está cargada en destino,
// resuelve de inmediato.
function waitLoaded(tabId, expectedUrl, timeoutMs = LOAD_TIMEOUT_MS, checkNow = true) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => { if (settled) return; settled = true; clearTimeout(t); chrome.tabs.onUpdated.removeListener(on); resolve(); };
    const t = setTimeout(finish, timeoutMs);
    function on(id, info, tab) {
      if (id !== tabId || info.status !== "complete") return;
      if (isOnTarget(tab && tab.url, expectedUrl)) finish();
    }
    chrome.tabs.onUpdated.addListener(on);
    // Chequeo inicial por si ya estaba completa en destino. No se hace cuando
    // el llamador ya está por navegar: ahí la URL vieja todavía figura como
    // actual y resolvería antes de que cargue la nueva.
    if (checkNow) {
      liveTab(tabId).then((tab) => {
        if (tab && tab.status === "complete" && isOnTarget(tab.url, expectedUrl)) finish();
      });
    }
  });
}

const SEND_TIMEOUT_MS = 45000;
function send(tabId, msg) {
  const reply = new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, msg, (r) => {
      if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
      else resolve(r || { ok: false, error: "sin respuesta" });
    });
  });
  const timeout = new Promise((resolve) => setTimeout(() => resolve({ ok: false, error: "timeout" }), SEND_TIMEOUT_MS));
  return Promise.race([reply, timeout]);
}

async function reportSignal(platform, signal) {
  try { await api("/api/extension/signal", { method: "POST", body: JSON.stringify({ platform, signal }) }); }
  catch (e) { console.warn("signal report failed", e); }
}
async function pushItems(items) {
  if (!items.length) return 0;
  const r = await api("/api/extension/items", { method: "POST", body: JSON.stringify({ items }) });
  return r.inserted || 0;
}

// Resumen final de la corrida: sin esto nadie ve que una plataforma viene
// fallando hace días (IG devolvió 400 durante una semana sin que se notara).
async function reportRun(summary) {
  try {
    await api("/api/extension/signal", {
      method: "POST",
      body: JSON.stringify({ kind: "run-summary", ...summary }),
    });
  } catch (e) {
    console.warn("run-summary report failed", e);
  }
}

// Una corrida dura horas y MV3 apaga el worker a los 30s de silencio: sin este
// keep-alive la corrida muere a mitad de camino y nadie se entera.
async function runCollection() {
  const keepAlive = setInterval(() => {
    try { chrome.runtime.getPlatformInfo().catch(() => {}); } catch { /* worker cerrándose */ }
  }, KEEP_ALIVE_MS);
  try {
    await collectOnce();
  } finally {
    clearInterval(keepAlive);
  }
}

// Una corrida completa: cuentas del plan → búsquedas A/B → candidatos a actor,
// todo dentro del presupuesto.
async function collectOnce() {
  if (!plausibleHour()) {
    await setStatus({ estado: "fuera de horario (08:00–01:00)" });
    return;
  }
  await setStatus({ estado: "bajando plan…", inserted: 0, cuentas: 0, busquedas: 0, candidatos: 0, sugeridos: 0, errores: [] });
  const plan = await api("/api/extension/plan");
  ownTabs.clear();
  const budget = new Budget(plan.budget);
  const cooled = new Set(Object.keys(plan.cooldowns || {}));
  const accounts = shuffle(plan.accounts).filter((a) => !cooled.has(a.platform));

  let inserted = 0;
  let done = 0;
  let comentarios = 0;
  const errores = [];
  for (const acc of accounts) {
    const platform = acc.platform;
    if (cooled.has(platform)) continue;
    const handle = acc.handle.replace(/^@/, "");
    // Saltear en silencio hacía que media corrida sin mirar pareciera exitosa.
    if (budget.remaining(platform) <= 0) {
      pushError(errores, platform, handle, "presupuesto", "sin requests");
      continue;
    }
    await setStatus({ estado: `${platform}: @${handle} (${done + 1}/${accounts.length})`, inserted, cuentas: done });

    try {
      const url = profileUrl(platform, handle);
      if (!url) { pushError(errores, platform, handle, "plan", "plataforma sin URL de perfil"); continue; }
      // Cada navegación gasta 1 request del presupuesto de la plataforma.
      const tab = await openIn(platform, url);
      await budget.spend(platform);
      const res = await send(
        tab.id,
        platform === "instagram"
          ? { type: "ig-collect", handle, since: acc.since }
          : { type: "dom-profile", handle, since: acc.since },
      );
      if (!res.ok) { pushError(errores, platform, handle, "colecta", res.error || "sin respuesta"); continue; }
      // La unidad de API en página de IG (feed + historias) es otro request del
      // presupuesto, aparte de la navegación (spec §8).
      if (platform === "instagram") await budget.spend(platform);
      // Los errores de la unidad se guardan siempre, también cuando enfriamos:
      // son justo los que explican por qué apareció la señal.
      for (const e of res.errors || []) pushError(errores, platform, handle, e.step, e.detail);

      const sig = signalFromResponse(res.status, res.body);
      if (sig) {
        cooled.add(platform);
        await reportSignal(platform, sig);
        pushError(errores, platform, handle, "breaker", sig);
        await setStatus({ estado: `${platform} enfriado (${sig})`, inserted, cuentas: done });
        continue; // nunca reintentar en la misma corrida
      }
      // Una cuenta está hecha solo si no se cayó ni disparó el breaker.
      done++;
      inserted += await pushItems(res.items || []);
      await setStatus({ inserted, cuentas: done });

      const pieces = res.pieces || [];
      if (platform === "instagram") {
        // Comentarios de las piezas nuevas con más comentarios (máx. 6).
        const conComentarios = [...pieces]
          .filter((p) => (p.commentCount || 0) > 0)
          .sort((a, b) => (b.commentCount || 0) - (a.commentCount || 0))
          .slice(0, IG_COMMENT_PIECES);
        for (const p of conComentarios) {
          if (cooled.has(platform)) break;
          const motivo = motivoSinFanOut(budget, platform, comentarios);
          if (motivo) { pushError(errores, platform, handle, "presupuesto", motivo); break; }
          await setStatus({ estado: `instagram: comentarios de @${handle}`, inserted, cuentas: done });
          comentarios++;
          await budget.spend(platform);
          const cr = await send(tab.id, { type: "ig-comments", pk: p.pk, url: p.url, handle });
          if (!cr.ok) { pushError(errores, platform, handle, "comentarios", cr.error || "sin respuesta"); continue; }
          for (const e of cr.errors || []) pushError(errores, platform, handle, e.step, e.detail);
          const csig = signalFromResponse(cr.status, cr.body);
          if (csig) {
            cooled.add(platform);
            await reportSignal(platform, csig);
            pushError(errores, platform, handle, "breaker", csig);
            break;
          }
          inserted += await pushItems(cr.items || []);
          await setStatus({ inserted });
        }
      } else if (platform === "x") {
        // Respuestas de las 2 piezas con más respuestas de esta corrida.
        const conRespuestas = [...pieces]
          .filter((p) => (p.replyCount || 0) > 0)
          .sort((a, b) => (b.replyCount || 0) - (a.replyCount || 0))
          .slice(0, X_REPLY_PIECES);
        for (const p of conRespuestas) {
          if (cooled.has(platform)) break;
          const motivo = motivoSinFanOut(budget, platform, comentarios);
          if (motivo) { pushError(errores, platform, handle, "presupuesto", motivo); break; }
          await setStatus({ estado: `x: respuestas de @${handle}`, inserted, cuentas: done });
          comentarios++;
          const rtab = await openIn(platform, p.url);
          await budget.spend(platform);
          const rr = await send(rtab.id, { type: "dom-replies", url: p.url, handle });
          if (!rr.ok) { pushError(errores, platform, handle, "respuestas", rr.error || "sin respuesta"); continue; }
          for (const e of rr.errors || []) pushError(errores, platform, handle, e.step, e.detail);
          const rsig = signalFromResponse(rr.status, rr.body);
          if (rsig) {
            cooled.add(platform);
            await reportSignal(platform, rsig);
            pushError(errores, platform, handle, "breaker", rsig);
            break;
          }
          inserted += await pushItems(rr.items || []);
          await setStatus({ inserted });
        }
      }
    } catch (e) {
      console.warn("colecta falló", platform, acc.handle, e);
      pushError(errores, platform, handle, "excepción", String((e && e.message) || e));
    }
  }

  // Pestaña de Instagram para las búsquedas (ig-search es API, sirve
  // cualquier pestaña de instagram.com).
  let igTab = await findPlatformTab("instagram");

  // Búsquedas A/B: se ejecutan después de las cuentas, con el presupuesto que
  // quede. Cada búsqueda gasta 1 request del presupuesto de su plataforma y
  // produce candidatos a actor (cuentas vistas, no incorporadas automáticamente).
  const candidateLists = [];
  const searches = [...(plan.searches?.a || []), ...(plan.searches?.b || [])];
  let busquedas = 0;
  for (const q of searches) {
    for (const platform of ["instagram", "x", "facebook"]) {
      if (cooled.has(platform) || budget.remaining(platform) <= 0) continue;
      await setStatus({ estado: `búsqueda ${platform}: ${q}`, inserted, cuentas: done, busquedas });
      try {
        if (platform === "instagram") {
          // ig-search es una llamada a la API interna: se reusa igTab sin re-navegar.
          if (!(await liveTab(igTab && igTab.id))) igTab = await openIn("instagram", PLATFORM_HOME.instagram);
          const res = await send(igTab.id, { type: "ig-search", query: q });
          if (!res.ok) { pushError(errores, platform, undefined, "búsqueda", `"${q}": ${res.error || "sin respuesta"}`); continue; }
          await budget.spend(platform);
          const sig = signalFromResponse(res.status, res.body);
          if (sig) {
            cooled.add(platform);
            await reportSignal(platform, sig);
            pushError(errores, platform, undefined, "breaker", sig);
            continue;
          }
          if (res.json) candidateLists.push(candidatesFromIgSearch(res.json, q));
        } else {
          const tab = await openIn(platform, searchUrl(platform, q));
          // La navegación ya consumió el request: se descuenta como en las cuentas.
          await budget.spend(platform);
          const res = await send(tab.id, { type: "dom-collect", query: q });
          if (!res.ok) { pushError(errores, platform, undefined, "búsqueda", `"${q}": ${res.error || "sin respuesta"}`); continue; }
          // Faltaba: una búsqueda contra un muro de login se guardaba como
          // "0 resultados" y la corrida seguía golpeando la plataforma.
          const sig = signalFromResponse(res.status, res.body);
          if (sig) {
            cooled.add(platform);
            await reportSignal(platform, sig);
            pushError(errores, platform, undefined, "breaker", sig);
            continue;
          }
          inserted += await pushItems(res.items || []);
          candidateLists.push(candidatesFromItems(res.items || [], q));
        }
        busquedas++;
        await setStatus({ busquedas, inserted });
      } catch (e) {
        console.warn("búsqueda falló", platform, q, e);
        pushError(errores, platform, undefined, "búsqueda", `"${q}": ${String((e && e.message) || e)}`);
      }
    }
  }

  const candidates = mergeCandidates(candidateLists).slice(0, 60);
  let sugeridos = 0;
  if (candidates.length) {
    try {
      const r = await api("/api/extension/candidates", { method: "POST", body: JSON.stringify({ candidates, searches: plan.searches }) });
      sugeridos = r.suggested || 0;
    } catch (e) {
      console.warn("candidatos falló", e);
      pushError(errores, "server", undefined, "candidatos", String((e && e.message) || e));
    }
  }

  await reportRun({
    cuentas: done,
    busquedas,
    items: inserted,
    candidatos: candidates.length,
    sugeridos,
    errores,
  });

  await setStatus({
    estado: `listo — ${inserted} nuevos · ${candidates.length} candidatos → ${sugeridos} sugeridos${errores.length ? ` · ${errores.length} errores` : ""}`,
    inserted, cuentas: done, busquedas, candidatos: candidates.length, sugeridos, errores, finishedAt: Date.now(),
  });
  chrome.notifications.create({
    type: "basic", iconUrl: "icons/icon128.png",
    title: "Monitor: corrida completa",
    message: `${done} cuentas, ${busquedas} búsquedas, ${inserted} menciones nuevas, ${sugeridos} actores sugeridos, ${errores.length} errores.`,
  });
}

chrome.runtime.onMessage.addListener((msg, _s, sendResponse) => {
  if (msg.type === "run-now") {
    runCollection().then(() => sendResponse({ ok: true })).catch((e) => sendResponse({ ok: false, error: String(e.message || e) }));
    return true;
  }
  return false;
});

// Alarma diaria con deriva horaria (spec §3.3): disparar entre la hora
// configurada y +40 min.
const DERIVA_MIN = 40;
async function scheduleAlarm() {
  const { hora } = await chrome.storage.sync.get({ hora: "09:00" });
  const [h, m] = hora.split(":").map(Number);
  const next = new Date();
  // La deriva se suma DESPUÉS de decidir el día: sumándola antes, una alarma que
  // dispara a las 09:05 se reprogramaba para las 09:30 del mismo día y la
  // corrida salía dos veces.
  next.setHours(h, m || 0, 0, 0);
  if (next <= new Date()) next.setDate(next.getDate() + 1);
  next.setMinutes(next.getMinutes() + Math.floor(Math.random() * DERIVA_MIN));
  chrome.alarms.create("corrida-diaria", { when: +next });
}
chrome.runtime.onInstalled.addListener(() => {
  scheduleAlarm();
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
});
chrome.runtime.onStartup.addListener(scheduleAlarm);
chrome.storage.onChanged.addListener((ch) => { if (ch.hora) scheduleAlarm(); });
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name !== "corrida-diaria") return;
  // Reprogramar ANTES de correr: si la corrida se cae (o el worker muere), la
  // alarma ya quedó puesta y el monitoreo no se apaga en silencio.
  Promise.resolve(scheduleAlarm())
    .catch((e) => console.warn("no se pudo reprogramar la alarma", e))
    .then(() => runCollection())
    .catch((e) => console.warn("corrida falló", e));
});
