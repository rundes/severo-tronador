# Colecta profunda: perfiles, piezas, comentarios e historias por navegación

**Fecha:** 2026-08-26 · **Estado:** aprobado (diseño) · **Ámbito:** `infra/escucha-extension/{content.js,sw.js,core/*}`, `app/api/extension/{items,signal,plan}/route.ts`, `lib/monitor-metrics.ts`, `lib/daily-report.ts` (solo la línea por cuenta), panel Escenario (bloque Redes: estado de la última corrida). Sin DDL (`listening_items.meta` ya es jsonb).

## Problema (verificado el 26-ago en el navegador del operador)

- **Instagram nunca guardó un ítem** en Ferro: `GET /api/v1/users/web_profile_info/?username=…` devuelve **400** ("Asset … has been deleted"). Todo `ig-collect` dependía de ese endpoint para el `id` y los seguidores, y ante `user: null` respondía `ok: true, items: []` sin registrar el error en ningún lado.
- **Los demás endpoints internos de IG siguen vivos** desde una pestaña de instagram.com con `x-ig-app-id` + `credentials: include`: `GET /api/v1/feed/user/{username}/username/?count=N` (items con `pk, code, taken_at, like_count, comment_count, play_count, caption, user.pk`), `GET /api/v1/media/{pk}/comments/?can_support_threading=true&permalink_enabled=false` (`comments[].user.username, text, created_at, comment_like_count`, paginado por `next_min_id`), `GET /api/v1/feed/reels_media/?reel_ids={id}` (historias, no marca como vistas), `GET /api/v1/highlights/{id}/highlights_tray/`.
- **El DOM del perfil de IG** trae seguidores: `header` ("136 mil seguidores") y `meta[property=og:description]` ("136K seguidores, 216 seguidos, 16K publicaciones").
- **X por DOM** entrega todo desde el perfil: seguidores en `a[href$="/followers"]` ("38,2 mil Seguidores") y por tweet `[role="group"][aria-label]` = "7 respuestas, 6 reposts, 23 Me gusta, 1 elemento guardado, 1828 reproducciones". Hoy `domX` guarda texto/url/autor y **descarta las métricas**; el timeline carga solo 2 artículos sin scroll.
- **Nadie guarda comentarios** (`kind: "comment"`), así que densidad y tono (las métricas que ordenan a las listas "al revés que su tamaño") no se pueden calcular.
- Las cuentas cargadas en el monitor de Ferro (`@ferrocarriloeste`, `@ferrooesteoficial`) no existen; el brief documenta `@ferrooficial` (IG, 136k) y `@FerroOficial` (X, 38k). Eso es configuración del operador, fuera de alcance, pero explica el "0 seguidores" del informe.

## Decisiones

1. **La colecta es por navegación + parseo**, con la API interna de IG como *fuente de datos dentro de la pestaña* (es lo que el brief §5 prescribe) y el DOM como fuente cuando la API no alcanza o falla. Nunca conectores externos para redes.
2. **Unidad de colecta por cuenta** = perfil → piezas nuevas → comentarios de las piezas nuevas → historias (IG). Cada paso tiene su presupuesto y su fallback; un paso que falla no tira el resto.
3. **Instagram**
   - Perfil: navegar a `/{handle}/`; seguidores y cantidad de publicaciones del DOM (`header` + `og:description`, parser de "136 mil"/"136K"/"1.806"/"1,2 M"); `userId` del primer ítem del feed (`items[0].user.pk`) o, si el feed viene vacío, de los scripts de la página (`"profile_id":"…"`).
   - Feed: `feed/user/{username}/username/?count=12`. Piezas nuevas = `taken_at` posterior a la última pieza guardada de esa cuenta (el plan del server manda `since` por cuenta). `kind`: `post|reel`, `metrics`: likes, comentarios, vistas, `takenAt`, `followers`.
   - Comentarios: para cada pieza nueva (máx. 6 por cuenta y corrida) `media/{pk}/comments/`, hasta 2 páginas (≈40 comentarios). Se guardan como ítems `kind: "comment"`, `parentUrl` = url de la pieza, `author` = username del comentarista, `text`, `publishedAt`, `metrics.likeCount`.
   - Historias y destacadas: como hoy (`reels_media`, sin `POST media/seen`), con `userId` resuelto por el nuevo camino.
4. **X (DOM en el perfil)**: navegar a `/{handle}`, hacer 3 scrolls con pausa (2 s) para cargar ≥10 artículos, parsear por tweet: `url`, `text`, `time[datetime]`, autor, y del `[role="group"]` `aria-label`: respuestas, reposts, me gusta, reproducciones (parser tolerante a es/en: "Me gusta|likes", "reproducciones|views", "respuestas|replies", "reposts"). Seguidores del `a[href$="/followers"]`. Comentarios: para las **2 piezas con más respuestas** de la corrida, navegar a `/status/{id}` y leer los artículos de respuesta (autor, texto, fecha, likes) como `kind: "comment"` con `parentUrl`. Piezas nuevas = `publishedAt` posterior a `since`.
5. **Facebook (DOM)**: perfil/página: seguidores del texto del encabezado ("3,4 mil seguidores" / "3.4K followers"); por publicación: reacciones del `aria-label` de la barra de reacciones y conteo de comentarios/compartidos del texto ("12 comentarios"). Sin abrir comentarios (requiere clics) en esta iteración.
6. **TikTok (DOM)**: seguidores `[data-e2e="followers-count"]`; por video `[data-e2e="video-views"]`; sin comentarios en esta iteración.
7. **Números localizados**: `parseCount("38,2 mil") = 38200`, `"136K" = 136000`, `"1.806" = 1806`, `"1,2 M" = 1200000`, `"12"` = 12; función pura en `core/parse.js` con tests.
8. **Presupuesto**: cada navegación (perfil, post, búsqueda) cuesta 1 request del presupuesto de la plataforma (`Budget`), como hoy. Los llamados a la API de IG dentro de la pestaña cuestan 1 por cuenta (feed+historias) + 1 por cada pieza con comentarios. Los límites del brief (X ≤35, FB ≤25, IG ≤20 por día) se respetan vía `plan.budget` — no cambian acá.
9. **Errores visibles**: toda unidad que falle (HTTP ≠ 200, `user null`, selector sin match, timeout) se registra en `runStatus.errores` **y** se manda al server al final de la corrida: `POST /api/extension/signal` con `{ kind: "run-summary", cuentas, busquedas, items, candidatos, sugeridos, errores: [{ platform, handle, step, detail }] }` → se guarda en `conector_config` `extension-run:<pid>` y el bloque Redes del panel muestra "Última corrida de la extensión: hace 2 h · 6 cuentas · 41 ítems · 2 errores (ver)". Sin esto el operador y el soporte quedan a ciegas (hoy nadie vio que IG devolvía 400 durante días).
10. **`since` por cuenta en el plan**: `GET /api/extension/plan` devuelve por cuenta `since` (ISO de la última pieza guardada, o 7 días atrás). El content script filtra por fecha (`taken_at`/`datetime`), **nunca por posición** (los fijados van primero).
11. **Métricas server-side** (`lib/monitor-metrics.ts`): `densidad` = % de comentaristas que aparecen en ≥2 piezas de la misma cuenta (ya existe el cálculo; ahora tendrá datos); nuevo `comentarios: number` y `comentaristas: number` por cuenta; `tono` queda para el informe (el prompt recibe una muestra de comentarios por cuenta, ≤15, con autor anonimizado como `c1..cN`).
12. **Prompt del informe**: la línea por cuenta suma `com:N dens:X%`; nueva sección de datos "Comentarios recientes por cuenta (muestra)" para que 06 Tono y densidad tenga material.
13. **Fuera de alcance**: comentarios de FB/TikTok, likers (403), abrir el visor de historias, capturas de pantalla de historias, cuentas que no están en el plan (eso sigue viniendo por búsquedas A/B y Actores sugeridos).

## Mensajes content ↔ sw

```
ig-collect  { handle, since }        → { ok, status, items[], profile: { followers, posts, userId } | null, errors: [{step, detail}] }
ig-comments { pk, url, handle }      → { ok, status, items[] (kind comment) }
dom-profile { handle, since }        → { ok, items[], profile: { followers } | null, errors }   // X, FB, TikTok según hostname
dom-replies { url, handle }          → { ok, items[] (kind comment) }                            // X
ig-search / dom-collect (búsquedas)  → sin cambios
```

El sw decide el orden: por cuenta → `openIn` perfil → `dom-profile`/`ig-collect` → (X) elegir 2 piezas con más respuestas y `openIn(url)` + `dom-replies`; (IG) `ig-comments` por pieza nueva (máx. 6). Al final, `run-summary`.

## Datos

`ItemSchema` (`/api/extension/items`) suma en `metrics`: `replyCount?: int`, `commentLikeCount` no hace falta (va en `likeCount` del comentario). `kind` ya admite `comment`. `parentUrl` ya existe. Sin DDL.

`extension-run:<pid>` (conector_config): `{ at, cuentas, busquedas, items, candidatos, sugeridos, errores: [{platform, handle?, step, detail}] (≤50) }`.

## Errores

- `web_profile_info` 400 → ignorado (ya no se usa). Feed por username 4xx → error `feed` registrado; se intenta igual historias si hay `userId` de los scripts.
- Selector de X sin match (cambio de DOM) → `errores: [{step:"parse", detail:"0 artículos"}]`; la corrida sigue.
- Breaker: igual que hoy (429/checkpoint enfría la plataforma y salta sus cuentas y búsquedas).
- Pieza sin `time`/`taken_at` → se guarda con `publishedAt` undefined y **no** cuenta como nueva para `since`.

## Testing (vitest, módulos puros en `core/`)

- `core/parse.js`: `parseCount` (es/en, mil/K/M, puntos y comas), `parseXGroupLabel("7 respuestas, 6 reposts, 23 Me gusta, 1828 reproducciones")` → `{replies:7, reposts:6, likes:23, views:1828}`, `parseIgHeader("136 mil seguidores")`.
- `core/ig.js` (puro, recibe JSON): `itemsFromFeed(json, handle, followers, since)` filtra por `taken_at`, mapea métricas; `commentsFromJson(json, url, handle)`; `userIdFromFeed`.
- `core/xdom.js`: parseo sobre un DOM fixture (jsdom en el test) con dos artículos → métricas y filtrado por `since`.
- Route `items`: acepta `replyCount`; route `signal`: `run-summary` se guarda; route `plan`: `since` por cuenta.
- `monitor-metrics`: densidad con comentarios reales; `comentarios`/`comentaristas`.
- `daily-report`: la línea por cuenta y la muestra de comentarios.
- Smoke (Task final): reload extensión → corrida en Ferro con `@ferrooficial` (IG) y `@FerroOficial` (X) cargadas en Redes → ítems `post/reel/comment/story` en DB con `meta.followers/likeCount/viewCount`, `extension-run` con 0 errores, informe con densidad ≠ s/d.
