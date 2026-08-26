// Service worker (módulo): orquestador de la corrida. Baja el plan del server,
// respeta el presupuesto/jitter/concurrencia-1/breaker y horario plausible,
// navega cada cuenta en una pestaña de su plataforma, pide al content script
// que colecte, ejecuta las búsquedas A/B del escenario, sube lo relevado y
// los candidatos a actor, y reporta señales anti-bloqueo al server.
import { Budget, plausibleHour, shuffle, sleep } from "./core/budget.js";
import { signalFromResponse } from "./core/breaker.js";
import { profileUrl, searchUrl, candidatesFromIgSearch, candidatesFromItems, mergeCandidates } from "./core/nav.js";

const PLATFORM_HOME = {
  instagram: "https://www.instagram.com/",
  x: "https://x.com/",
  facebook: "https://www.facebook.com/",
  tiktok: "https://www.tiktok.com/",
};

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

// Abre (o reusa) la pestaña de la plataforma y la navega de verdad a `url`
// (nunca se lee el DOM de la home a secas); espera a que cargue + jitter.
async function openIn(platform, url) {
  const host = new URL(PLATFORM_HOME[platform]).hostname.replace("www.", "");
  let tab = (await chrome.tabs.query({})).find((t) => t.url && t.url.includes(host));
  if (tab) await chrome.tabs.update(tab.id, { url, active: false });
  else tab = await chrome.tabs.create({ url, active: false });
  await waitLoaded(tab.id);
  await sleep(2000 + Math.floor(Math.random() * 2000));
  return tab;
}
function waitLoaded(tabId, timeoutMs = 20000) {
  return new Promise((resolve) => {
    const t = setTimeout(() => { chrome.tabs.onUpdated.removeListener(on); resolve(); }, timeoutMs);
    function on(id, info) { if (id === tabId && info.status === "complete") { clearTimeout(t); chrome.tabs.onUpdated.removeListener(on); resolve(); } }
    chrome.tabs.onUpdated.addListener(on);
  });
}

function send(tabId, msg) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, msg, (r) => {
      if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
      else resolve(r || { ok: false, error: "sin respuesta" });
    });
  });
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

// Una corrida completa: cuentas del plan → búsquedas A/B → candidatos a actor,
// todo dentro del presupuesto.
async function runCollection() {
  if (!plausibleHour()) {
    await setStatus({ estado: "fuera de horario (08:00–01:00)" });
    return;
  }
  await setStatus({ estado: "bajando plan…", inserted: 0, cuentas: 0, busquedas: 0, candidatos: 0, sugeridos: 0, errores: [] });
  const plan = await api("/api/extension/plan");
  const budget = new Budget(plan.budget);
  const cooled = new Set(Object.keys(plan.cooldowns || {}));
  const accounts = shuffle(plan.accounts).filter((a) => !cooled.has(a.platform));

  let inserted = 0;
  let done = 0;
  const errores = [];
  let igTab = null;

  for (const acc of accounts) {
    const platform = acc.platform;
    if (cooled.has(platform)) continue;
    if (budget.remaining(platform) <= 0) continue;
    await setStatus({ estado: `${platform}: @${acc.handle} (${done + 1}/${accounts.length})`, inserted, cuentas: done });

    try {
      const handle = acc.handle.replace(/^@/, "");
      let tab;
      let msg;
      if (platform === "instagram") {
        // La API interna de IG no depende del perfil visitado: se navega a la
        // home una sola vez por corrida y se reusa esa pestaña para cada cuenta.
        if (!igTab) igTab = await openIn("instagram", PLATFORM_HOME.instagram);
        tab = igTab;
        msg = { type: "ig-collect", handle };
      } else {
        tab = await openIn(platform, profileUrl(platform, handle));
        msg = { type: "dom-collect", handle };
      }
      const res = await send(tab.id, msg);
      await budget.spend(platform);
      done++;

      if (res.ok) {
        const sig = signalFromResponse(res.status, res.body);
        if (sig) {
          cooled.add(platform);
          await reportSignal(platform, sig);
          await setStatus({ estado: `${platform} enfriado (${sig})`, inserted, cuentas: done });
          continue; // nunca reintentar en la misma corrida
        }
        inserted += await pushItems(res.items || []);
        await setStatus({ inserted, cuentas: done });
      } else {
        errores.push(`${platform}:@${acc.handle}: ${res.error || "sin respuesta"}`);
      }
    } catch (e) {
      console.warn("colecta falló", platform, acc.handle, e);
      errores.push(`${platform}:@${acc.handle}: ${String(e && e.message || e)}`);
    }
  }

  // Búsquedas A/B: se ejecutan después de las cuentas, con el presupuesto que
  // quede. Cada búsqueda gasta 1 request del presupuesto de su plataforma y
  // produce candidatos a actor (cuentas vistas, no incorporadas automáticamente).
  const candidateLists = [];
  const searches = [...(plan.searches?.a || []).map((q) => ({ q, dir: "A" })), ...(plan.searches?.b || []).map((q) => ({ q, dir: "B" }))];
  let busquedas = 0;
  for (const { q } of searches) {
    for (const platform of ["instagram", "x", "facebook"]) {
      if (cooled.has(platform) || budget.remaining(platform) <= 0) continue;
      await setStatus({ estado: `búsqueda ${platform}: ${q}`, inserted, cuentas: done, busquedas });
      try {
        if (platform === "instagram") {
          const tab = await openIn("instagram", PLATFORM_HOME.instagram);
          const res = await send(tab.id, { type: "ig-search", query: q });
          await budget.spend(platform);
          const sig = res.ok ? signalFromResponse(res.status, res.body) : null;
          if (sig) { cooled.add(platform); await reportSignal(platform, sig); continue; }
          if (res.ok && res.json) candidateLists.push(candidatesFromIgSearch(res.json, q));
        } else {
          const tab = await openIn(platform, searchUrl(platform, q));
          const res = await send(tab.id, { type: "dom-collect", query: q });
          await budget.spend(platform);
          if (res.ok) {
            inserted += await pushItems(res.items || []);
            candidateLists.push(candidatesFromItems(res.items || [], q));
          }
        }
        busquedas++;
      } catch (e) {
        console.warn("búsqueda falló", platform, q, e);
        errores.push(`búsqueda ${platform} "${q}": ${String(e && e.message || e)}`);
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
      errores.push(`candidatos: ${String(e && e.message || e)}`);
    }
  }

  await setStatus({
    estado: `listo — ${inserted} nuevos · ${candidates.length} candidatos → ${sugeridos} sugeridos`,
    inserted, cuentas: done, busquedas, candidatos: candidates.length, sugeridos, errores, finishedAt: Date.now(),
  });
  chrome.notifications.create({
    type: "basic", iconUrl: "icons/icon128.png",
    title: "Monitor: corrida completa",
    message: `${done} cuentas, ${busquedas} búsquedas, ${inserted} menciones nuevas, ${sugeridos} actores sugeridos.`,
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
async function scheduleAlarm() {
  const { hora } = await chrome.storage.sync.get({ hora: "09:00" });
  const [h, m] = hora.split(":").map(Number);
  const next = new Date();
  next.setHours(h, (m || 0) + Math.floor(Math.random() * 40), 0, 0);
  if (next <= new Date()) next.setDate(next.getDate() + 1);
  chrome.alarms.create("corrida-diaria", { when: +next });
}
chrome.runtime.onInstalled.addListener(() => {
  scheduleAlarm();
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
});
chrome.runtime.onStartup.addListener(scheduleAlarm);
chrome.storage.onChanged.addListener((ch) => { if (ch.hora) scheduleAlarm(); });
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === "corrida-diaria") { runCollection().finally(scheduleAlarm); }
});
