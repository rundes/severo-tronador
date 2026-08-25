// Popup: escenario + keywords del tablero, búsquedas complementarias y
// captura de la pestaña activa.

const $ = (id) => document.getElementById(id);

function urls(zona, kw) {
  const q = encodeURIComponent([zona, kw].filter(Boolean).join(" "));
  return {
    gnews: `https://news.google.com/search?q=${q}&hl=es-419&gl=AR&ceid=AR:es-419`,
    x: `https://x.com/search?q=${q}&f=live`,
    fb: `https://www.facebook.com/search/posts?q=${q}`,
    ig: `https://www.instagram.com/explore/search/keyword/?q=${q}`,
    tt: `https://www.tiktok.com/search?q=${q}`,
  };
}

let escenario = null;

function paint() {
  if (!escenario) return;
  $("proyecto").textContent = escenario.project || "Tronador Escucha";
  $("escenario").textContent = `Escenario: ${escenario.zona || "sin zona"} (${escenario.pais || "AR"})`;
  const kwBox = $("keywords");
  kwBox.textContent = "";
  for (const k of escenario.keywords || []) {
    const span = document.createElement("span");
    span.className = "kw";
    span.textContent = k;
    kwBox.appendChild(span);
  }
  const sel = $("kw-select");
  sel.textContent = "";
  const opts = [...(escenario.keywords || [])];
  if (opts.length === 0) opts.push("");
  for (const k of opts) {
    const o = document.createElement("option");
    o.value = k;
    o.textContent = k || "(solo zona)";
    sel.appendChild(o);
  }
}

async function init() {
  const { escenario: cached } = await chrome.storage.local.get("escenario");
  if (cached) { escenario = cached; paint(); }
  chrome.runtime.sendMessage({ type: "get-config" }, (r) => {
    if (r && r.ok) { escenario = r.config; paint(); }
    else if (!cached) {
      const err = (r && r.error) || "sin conexión";
      $("escenario").textContent = err.includes("Configurá")
        ? "Configurá URL y token en Opciones (click derecho → Opciones)."
        : `Error: ${err}`;
    }
  });
}

document.querySelectorAll(".grid button").forEach((btn) => {
  btn.addEventListener("click", () => {
    const kw = $("kw-select").value;
    const map = urls((escenario && escenario.zona) || "", kw);
    const sites = btn.dataset.site === "todos" ? Object.keys(map) : [btn.dataset.site];
    for (const s of sites) chrome.tabs.create({ url: map[s], active: sites.length === 1 });
  });
});

$("capturar").addEventListener("click", async () => {
  $("status").textContent = "Capturando…";
  $("status").className = "";
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  chrome.tabs.sendMessage(tab.id, { type: "capture" }, (r) => {
    if (chrome.runtime.lastError || !r) {
      $("status").textContent = "Esta página no es capturable (FB/IG/X/TikTok).";
      $("status").className = "err";
      return;
    }
    if (!r.items.length) {
      $("status").textContent = "No se encontraron posts visibles.";
      $("status").className = "err";
      return;
    }
    chrome.runtime.sendMessage({ type: "send-items", items: r.items }, (resp) => {
      if (resp && resp.ok) {
        $("status").textContent = `${r.items.length} capturados, ${resp.inserted} nuevos en el tablero.`;
        $("status").className = "ok";
      } else {
        $("status").textContent = `Error subiendo: ${(resp && resp.error) || "?"}`;
        $("status").className = "err";
      }
    });
  });
});

init();
