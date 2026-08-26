const $ = (id) => document.getElementById(id);
const MAX_ERRORES_VISIBLES = 12;

$("opts").addEventListener("click", (e) => { e.preventDefault(); chrome.runtime.openOptionsPage(); });

// Lista de errores de la corrida: el contador solo, sin el detalle, no alcanza
// para saber qué plataforma viene fallando.
function renderErrores(errores) {
  const lista = $("errores-lista");
  const box = $("errores-box");
  lista.textContent = "";
  const items = Array.isArray(errores) ? errores : [];
  box.hidden = items.length === 0;
  for (const e of items.slice(0, MAX_ERRORES_VISIBLES)) {
    const li = document.createElement("li");
    const who = e && e.handle ? `${e.platform}:@${e.handle}` : String((e && e.platform) || "?");
    li.textContent = `${who} · ${(e && e.step) || "?"}: ${(e && e.detail) || ""}`;
    lista.appendChild(li);
  }
  if (items.length > MAX_ERRORES_VISIBLES) {
    const li = document.createElement("li");
    li.textContent = `… y ${items.length - MAX_ERRORES_VISIBLES} más`;
    lista.appendChild(li);
  }
}

async function refresh() {
  const { runStatus } = await chrome.storage.local.get("runStatus");
  if (runStatus) {
    $("estado").textContent = runStatus.estado || "en reposo";
    $("inserted").textContent = runStatus.inserted != null ? runStatus.inserted : 0;
    $("cuentas").textContent = runStatus.cuentas != null ? runStatus.cuentas : 0;
    $("busquedas").textContent = runStatus.busquedas != null ? runStatus.busquedas : 0;
    $("candidatos").textContent = runStatus.candidatos != null ? runStatus.candidatos : 0;
    $("sugeridos").textContent = runStatus.sugeridos != null ? runStatus.sugeridos : 0;
    $("errores").textContent = Array.isArray(runStatus.errores) ? runStatus.errores.length : 0;
    renderErrores(runStatus.errores);
  }
  const { escenario } = await chrome.storage.local.get("escenario");
  if (escenario && escenario.project) $("proyecto").textContent = `Proyecto: ${escenario.project}`;
}

$("run").addEventListener("click", () => {
  $("run").disabled = true;
  $("estado").textContent = "iniciando…";
  chrome.runtime.sendMessage({ type: "run-now" }, (r) => {
    $("run").disabled = false;
    if (r && !r.ok) $("estado").textContent = `error: ${r.error}`;
  });
});

setInterval(refresh, 2000);
refresh();
