// Service worker (módulo): orquestador de la corrida. Baja el plan del server,
// respeta el presupuesto/jitter/concurrencia-1/breaker y horario plausible,
// navega cada cuenta en una pestaña de su plataforma, pide al content script
// que colecte, y sube lo relevado. Reporta señales anti-bloqueo al server.
import { Budget, plausibleHour, shuffle, sleep } from "./core/budget.js";
import { signalFromResponse } from "./core/breaker.js";

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

// Abre (o reusa) una pestaña de la plataforma y espera a que cargue.
async function tabFor(platform) {
  const home = PLATFORM_HOME[platform];
  const host = new URL(home).hostname.replace("www.", "");
  const existing = (await chrome.tabs.query({})).find(
    (t) => t.url && t.url.includes(host),
  );
  if (existing) return existing;
  const tab = await chrome.tabs.create({ url: home, active: false });
  await new Promise((r) => setTimeout(r, 6000));
  return tab;
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

// Una corrida completa: recorre las cuentas del plan dentro del presupuesto.
async function runCollection() {
  if (!plausibleHour()) {
    await setStatus({ estado: "fuera de horario (08:00–01:00)" });
    return;
  }
  await setStatus({ estado: "bajando plan…", inserted: 0 });
  const plan = await api("/api/extension/plan");
  const budget = new Budget(plan.budget);
  const cooled = new Set(Object.keys(plan.cooldowns || {}));
  const accounts = shuffle(plan.accounts).filter((a) => !cooled.has(a.platform));

  let inserted = 0;
  let done = 0;
  for (const acc of accounts) {
    const platform = acc.platform;
    if (cooled.has(platform)) continue;
    if (budget.remaining(platform) <= 0) continue;
    await setStatus({ estado: `${platform}: @${acc.handle} (${done + 1}/${accounts.length})`, inserted });

    try {
      const tab = await tabFor(platform);
      const handle = acc.handle.replace(/^@/, "");
      const msg = platform === "instagram"
        ? { type: "ig-collect", handle }
        : { type: "dom-collect", handle };
      const res = await send(tab.id, msg);
      await budget.spend(platform);
      done++;

      if (res.ok) {
        const sig = signalFromResponse(res.status, res.body);
        if (sig) {
          cooled.add(platform);
          await reportSignal(platform, sig);
          await setStatus({ estado: `${platform} enfriado (${sig})`, inserted });
          continue; // nunca reintentar en la misma corrida
        }
        inserted += await pushItems(res.items || []);
        await setStatus({ inserted });
      }
    } catch (e) {
      console.warn("colecta falló", platform, acc.handle, e);
    }
  }
  await setStatus({ estado: `listo — ${inserted} nuevos`, inserted, finishedAt: Date.now() });
  chrome.notifications.create({
    type: "basic", iconUrl: "icons/icon128.png",
    title: "Monitor: corrida completa",
    message: `${done} cuentas relevadas, ${inserted} menciones nuevas.`,
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
