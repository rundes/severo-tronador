const $ = (id) => document.getElementById(id);

chrome.storage.sync.get({ appUrl: "", token: "", hora: "09:00" }).then((v) => {
  $("appUrl").value = v.appUrl;
  $("token").value = v.token;
  $("hora").value = v.hora;
});

$("guardar").addEventListener("click", async () => {
  await chrome.storage.sync.set({
    appUrl: $("appUrl").value.trim(),
    token: $("token").value.trim(),
    hora: $("hora").value || "09:00",
  });
  $("status").textContent = "Probando conexión…";
  $("status").className = "";
  chrome.runtime.sendMessage({ type: "get-config" }, (r) => {
    if (r && r.ok) {
      $("status").textContent = `Conectado: ${r.config.project} — zona ${r.config.zona || "sin definir"}, ${r.config.keywords.length} keywords.`;
      $("status").className = "ok";
    } else {
      $("status").textContent = `Error: ${(r && r.error) || "sin respuesta"}`;
      $("status").className = "err";
    }
  });
});
