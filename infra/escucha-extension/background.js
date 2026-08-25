// Service worker: cola de envío al tablero + alarma del barrido diario.

async function cfg() {
  return chrome.storage.sync.get({ appUrl: "", token: "", hora: "09:00" });
}

async function api(path, options = {}) {
  const { appUrl, token } = await cfg();
  if (!appUrl || !token) throw new Error("Configurá URL y token en Opciones");
  const res = await fetch(`${appUrl.replace(/\/$/, "")}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "send-items") {
    api("/api/extension/items", { method: "POST", body: JSON.stringify({ items: msg.items }) })
      .then((r) => {
        chrome.action.setBadgeText({ text: String(r.inserted ?? "") });
        chrome.action.setBadgeBackgroundColor({ color: "#4f5bd5" });
        setTimeout(() => chrome.action.setBadgeText({ text: "" }), 5000);
        sendResponse({ ok: true, inserted: r.inserted });
      })
      .catch((e) => sendResponse({ ok: false, error: String(e.message || e) }));
    return true; // async
  }
  if (msg.type === "get-config") {
    api("/api/extension/config")
      .then((r) => {
        chrome.storage.local.set({ escenario: r, escenarioAt: Date.now() });
        sendResponse({ ok: true, config: r });
      })
      .catch((e) => sendResponse({ ok: false, error: String(e.message || e) }));
    return true;
  }
  return false;
});

// Alarma diaria: reprograma según la hora configurada.
async function scheduleAlarm() {
  const { hora } = await cfg();
  const [h, m] = (hora || "09:00").split(":").map(Number);
  const next = new Date();
  next.setHours(h, m || 0, 0, 0);
  if (next <= new Date()) next.setDate(next.getDate() + 1);
  chrome.alarms.create("barrido-diario", { when: +next, periodInMinutes: 24 * 60 });
}
chrome.runtime.onInstalled.addListener(scheduleAlarm);
chrome.runtime.onStartup.addListener(scheduleAlarm);
chrome.storage.onChanged.addListener((ch) => {
  if (ch.hora) scheduleAlarm();
});

function searchUrls(zona, keyword) {
  const q = encodeURIComponent([zona, keyword].filter(Boolean).join(" "));
  return [
    `https://news.google.com/search?q=${q}&hl=es-419&gl=AR&ceid=AR:es-419`,
    `https://x.com/search?q=${q}&f=live`,
    `https://www.facebook.com/search/posts?q=${q}`,
    `https://www.instagram.com/explore/search/keyword/?q=${q}`,
    `https://www.tiktok.com/search?q=${q}`,
  ];
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== "barrido-diario") return;
  const { escenario } = await chrome.storage.local.get("escenario");
  if (!escenario) return;
  const kw = (escenario.keywords || [])[0] || "";
  for (const url of searchUrls(escenario.zona, kw)) {
    chrome.tabs.create({ url, active: false });
  }
  chrome.notifications.create({
    type: "basic",
    iconUrl: "icon.png",
    title: "Barrido diario de escucha",
    message: `Búsquedas abiertas para ${escenario.zona || "el escenario"}. Recorré y capturá con el botón de la extensión.`,
  });
});
