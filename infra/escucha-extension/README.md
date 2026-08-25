# Tronador Monitor — extensión de Chrome (v0.2, server-first)

El plugin **solo navega y colecta**. El escenario de cada cliente (cuentas a
monitorear, búsquedas simétricas, calendario, memoria de errores, presupuesto)
vive en el servidor; el plugin lo baja como **plan de colecta** y lo ejecuta en
el navegador del operador (su sesión, su IP). Las métricas y el informe se
calculan server-side. Correr desde la nube con las cookies del usuario es el
error de arquitectura que esto evita (spec §7.1).

## Qué hace una corrida

1. `GET /api/extension/plan` — baja cuentas + búsquedas + presupuesto + qué
   plataformas están enfriadas por el circuit breaker.
2. Recorre las cuentas **barajadas**, una plataforma por vez, con la disciplina
   anti-bloqueo (spec §3): presupuesto duro por plataforma/día, pausa aleatoria
   6–20 s entre cuentas, pausa larga cada 15, horario plausible 08:00–01:00,
   **concurrencia 1**.
3. Instagram: API interna de solo lectura (perfil, feed, historias) desde una
   pestaña de instagram.com. X/Facebook/TikTok: lectura del DOM. **Nunca** un
   endpoint de escritura (lista negra dura: like, follow, `media/seen`…).
4. Ante 429 / checkpoint / captcha: corta la plataforma y reporta la señal a
   `POST /api/extension/signal`; el server la enfría. Nunca reintenta.
5. Sube lo relevado (con métricas) a `POST /api/extension/items`.

## Instalación

1. `chrome://extensions` → Modo desarrollador → Cargar descomprimida → esta
   carpeta.
2. App: `Escucha → Informe → Generar token de extensión` (owner) y cargá el
   escenario en el editor de monitoreo.
3. Click derecho al ícono → Opciones → URL de la app + token → Guardar y probar.
4. Abrí el panel lateral (ícono) → "Correr colecta ahora", o dejá la corrida
   diaria con deriva horaria.

## Cuenta a usar

Usar una **cuenta secundaria quemable** logueada en el navegador, no la
principal. El uso de la API interna de Instagram contradice sus ToS aunque el
contenido sea público y la operación de solo lectura; la disciplina reduce
mucho el riesgo pero no lo elimina (spec §3.6).
