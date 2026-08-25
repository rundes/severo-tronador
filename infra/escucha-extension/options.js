const $ = (id) => document.getElementById(id);

chrome.storage.sync.get({ appUrl: "", token: "", hora: "09:00" }).then((v) => {
  $("appUrl").value = v.appUrl; $("token").value = v.token; $("hora").value = v.hora;
});

$("guardar").addEventListener("click", async () => {
  await chrome.storage.sync.set({
    appUrl: $("appUrl").value.trim(), token: $("token").value.trim(), hora: $("hora").value || "09:00",
  });
  $("status").textContent = "Probando…"; $("status").className = "";
  try {
    const { appUrl, token } = await chrome.storage.sync.get({ appUrl: "", token: "" });
    const res = await fetch(`${appUrl.replace(/\/$/, "")}/api/extension/plan`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const plan = await res.json();
    $("status").textContent = `Conectado: ${plan.accounts.length} cuentas en el plan, ${(plan.searches.a.length + plan.searches.b.length)} búsquedas.`;
    $("status").className = "ok";
  } catch (e) {
    $("status").textContent = `Error: ${e.message}`; $("status").className = "err";
  }
});
