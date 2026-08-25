const $ = (id) => document.getElementById(id);

$("opts").addEventListener("click", (e) => { e.preventDefault(); chrome.runtime.openOptionsPage(); });

async function refresh() {
  const { runStatus } = await chrome.storage.local.get("runStatus");
  if (runStatus) {
    $("estado").textContent = runStatus.estado || "en reposo";
    $("inserted").textContent = runStatus.inserted != null ? runStatus.inserted : 0;
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
