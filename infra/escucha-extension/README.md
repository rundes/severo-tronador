# Tronador Escucha — extensión de Chrome

Corre en el navegador del operador (su sesión, su IP): lo que el scraping
server-side no puede ver de FB/IG/X/TikTok, el operador lo ve navegando — la
extensión lo captura y lo suma al historial de escucha del proyecto, que es
el contexto que consume Claude para el informe diario.

## Qué hace

- **Escenario en el popup**: zona + keywords definidas en el tablero
  (`/escucha → Configurar`), siempre sincronizadas.
- **Búsquedas complementarias**: abre la búsqueda de zona+keyword en Google
  News, X, Facebook, Instagram y TikTok (una o todas). Alarma diaria opcional
  que abre las búsquedas a la hora configurada.
- **Captura**: botón "Capturar esta página" en FB / IG / X / TikTok toma los
  posts (y comentarios en FB/TikTok) visibles y los sube al tablero
  (dedupe por URL; entra a `/escucha` y al informe diario).

## Instalación

1. `chrome://extensions` → activar "Modo desarrollador" → "Cargar
   descomprimida" → elegir esta carpeta (`infra/escucha-extension`).
2. En la app: `Escucha → Informe → Generar token de extensión` (rol owner).
3. Click derecho al ícono → Opciones → pegar URL de la app + token →
   "Guardar y probar".

## Límites

- Captura solo lo **visible** en la página: scrolleá antes de capturar.
- Solo contenido público al que el operador accede legítimamente.
- El informe diario se genera server-side (cron 09:00 + botón en el panel);
  la extensión no llama a Claude ni guarda API keys.
