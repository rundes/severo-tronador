# Plan de estabilización

> Estado: el roadmap F0→F8 está completo como **scaffold funcional** (todo
> verificado en runtime, en modo mock). Este documento lista lo que falta para
> llevarlo a **producción confiable**, ordenado por prioridad, e incorpora los
> hallazgos de la revisión de código.

## Hallazgos de la revisión de código

Severidad: 🔴 alta · 🟠 media · 🟡 baja.

| # | Archivo | Hallazgo | Fix |
|---|---|---|---|
| 1 | `app/api/webhooks/meta/route.ts` | ✅ ~~🔴 No verifica la firma del webhook.~~ Resuelto en `26c704d`: `verifyHmacSha256` valida HMAC-SHA256 con `META_WA_APP_SECRET`. |
| 2 | `app/api/webhooks/meta/route.ts` | ✅ ~~🟠 Compara verify token con `===`.~~ Resuelto en `26c704d`: `constantTimeEqual` via `crypto.timingSafeEqual`. |
| 3 | `lib/survey.ts` | ✅ ~~🟠 Race entre `hasResponded` y `push`.~~ Resuelto en `0005_respuestas_token_unique.sql` + `addResponse` maps PG error 23505 → null (dedupe DB-level). |
| 4 | `app/(dashboard)/campanas/nueva/actions.ts` | ✅ ~~🟠 `executeCampaign` sin try/catch.~~ Resuelto en `f886d00`: validación zod redirige con `?error=validacion&detalle=...`. La UI lo muestra en banner. |
| 5 | `lib/segments.ts` (`loadContacts`) | ✅ ~~🟠 `readPadron` sin manejo de error.~~ Resuelto en `a510840`: error boundary `app/(dashboard)/error.tsx` + mensaje user-friendly en `readPadronFromDb`. |
| 6 | conectores outreach | 🟡 La cuota se incrementa tras el `fetch` OK aunque `providerMessageId` venga `undefined`. | Aceptable (el envío salió); registrar warning si falta el id. |
| 7 | `lib/connectors/claude-api.ts` | 🟡 Incrementa tokens estimados aun en mock (sin refund si falla). | Mover el incremento a post-éxito cuando se implemente la llamada real. |
| 8 | `app/(dashboard)/layout.tsx` | ✅ ~~🟡 Sin auth configurada el panel es accesible en prod.~~ Resuelto en `c4476ab` + `8154e3d`: middleware 503 si auth no configurada, `instrumentation.ts` aborta el boot, layout redirige a signin. |

## P0 — Bloqueantes de producción

1. ~~**Persistencia real.**~~ ✅ **Resuelto** (branch `supabase-persistence`,
   spec/plan 2026-05-27). Supabase (Postgres) es la base operativa vía la
   interfaz `Repository` (`lib/db/`); los stores `globalThis` quedan solo como
   fallback de dev. Google Sheets se espeja write-behind (`sheets_sync_queue` +
   cron `/api/cron/sheets-sync`). El padrón lo carga el usuario en `/padron`.
   RLS deny-all habilitada (`2863445`). Pendiente menor: dedupe fina al
   consolidar en Sheets (hoy append).
2. ~~**Webhook seguro.**~~ ✅ **Resuelto** (`26c704d`, v0.2.0). `lib/crypto.ts`
   suma `verifyHmacSha256` + `constantTimeEqual`. `app/api/webhooks/meta/route.ts`
   valida `x-hub-signature-256` con `META_WA_APP_SECRET` y compara el verify
   token con `timingSafeEqual`. Sin secret → 403. 11 tests en
   `tests/webhook-meta.test.ts`.
3. ~~**Auth obligatoria en producción.**~~ ✅ **Resuelto** (`c4476ab` +
   `8154e3d`, v0.2.0). `lib/auth-guards.ts` separa los guards del runtime
   NextAuth; `instrumentation.ts` aborta el boot si falta OAuth en prod;
   `middleware.ts` devuelve 503 si la auth no está configurada y redirige a
   `/api/auth/signin` sin sesión; el matcher excluye rutas públicas (`/api/auth`,
   `/api/cron`, `/api/webhooks`, `/api/version`, `/encuesta`). 9 tests en
   `tests/auth-guard.test.ts`.
4. ~~**Cola asíncrona.**~~ ✅ **Resuelto** (`d491da3`, v0.3.0). Migración
   `0003_envio_queue.sql` agrega la tabla `envio_queue` con índice parcial sobre
   `status='pending'`. En el path Supabase, `executeCampaign` encola en vez de
   enviar inline y deja la campaña en `estado='encolada'`. El cron
   `/api/cron/send-queue` (Bearer `CRON_SECRET`) procesa BATCH=20 por tick,
   re-chequea cuota antes de cada send (re-schedule +60s si llena), reintenta
   hasta 3 veces con backoff exponencial 2/4/8 min, e inserta cada resultado en
   `envios` mientras refresca `metrics`/`estado` de la campaña. 9 tests en
   `tests/send-queue.test.ts`.

   > **Hobby tier**: Vercel limita crons a 1/día. El endpoint queda accesible
   > vía Bearer y se dispara cada 5 min desde `.github/workflows/send-queue.yml`
   > (free para repos privados con ~2 000 min/mes — más que suficiente). Para
   > sub-minute usar Pro o Upstash QStash.

## P1 — Confiabilidad

5. **Tests.** No hay ninguno. Agregar Vitest + MSW: unit de `relationship`
   (health score, cooldowns), `segments`, `quota`, `survey` (dedupe),
   `optout`; contract tests de cada conector contra su API mockeada.
6. **Validación de entrada** en todas las server actions y rutas con `zod`
   (hoy hay parseo manual). Cubre `crearCampana`, `nuevaPlantilla`,
   `registrarLlamada`, `responderEncuesta`, webhook.
7. **Manejo de errores end-to-end** (hallazgos #4, #5): try/catch + estados de
   error en UI + reintentos con backoff en los `fetch` a providers.
8. **Reconciliación de estados.** Pull periódico para cubrir webhooks perdidos
   (divergencia > 2% → alerta), como dice ARCHITECTURE §12.
9. ~~**Feedback de la relación.**~~ ✅ **Resuelto** (v0.5.0). `lib/db/relations.ts`
   construye `RawRelationship` por DNI desde `envios` (sent), `respuestas`
   (match por token), y `opt_outs` (expandido a 4 canales) en 3 queries
   paralelas. `loadContacts` lo usa cuando hay DB; mock solo en dev.
10. ~~**Atomicidad de cuota.**~~ ✅ **Resuelto** (v0.5.0). Migración
    `0004_increment_quota_rpc.sql` agrega función `increment_quota(connector_id, n)`
    con `INSERT ... ON CONFLICT DO UPDATE SET used = used + EXCLUDED.used
    RETURNING used`. `incrementUsage` ahora llama `rpc()`. Atómico bajo envíos
    concurrentes — no se pasa del free tier.
11. ~~**Dedupe de respuesta a nivel DB.**~~ ✅ **Resuelto** (v0.5.0). Migración
    `0005_respuestas_token_unique.sql` agrega `UNIQUE(token)`. `addResponse`
    captura PG error code `23505` y devuelve `null` (mismo contrato que el
    check app-level). Cierra el race entre POSTs concurrentes al mismo token.

## P2 — Madurez

12. ~~**Plantillas WhatsApp aprobadas (infra).**~~ ✅ **Parcial** (v0.5.3).
    `OutreachMessage.template?: { name, lang, params }` definido en
    `lib/connectors/types.ts`. `metaWaCloudConnector.send` switches a
    `type=template` cuando recibe `template` y arma `components.parameters`
    desde `params`. Falta: UI/template store para asignar template aprobado
    por campaña + workflow de aprobación con Meta (operativo, no código).
13. ~~**Listening real**.~~ ✅ **Parcial** (v0.5.2). GDELT (sin auth) y X API
    (con `X_API_BEARER_TOKEN`) ahora hacen fetch real con fallback al mock
    si la API falla. Reddit sigue mock (OAuth client-credentials pendiente).
    Series temporales para baseline pendiente.
14. ~~**Validación de emails/teléfonos.**~~ ✅ **Resuelto** (v0.5.1, `a510840`).
    `isValidEmail` + `isValidPhone` en `lib/schemas.ts`; los 4 connectors
    outreach chequean antes de tocar el provider. Warm-up de dominio queda
    como práctica operativa, no código.
15. ~~**Observabilidad.**~~ ✅ **Parcial** (v0.5.2). `lib/logger.ts` emite
    JSON por línea a stdout (Vercel Logs lo ingesta). Niveles: debug/info/
    warn/error filtrados por `LOG_LEVEL` o `NODE_ENV`. Cron send-queue,
    webhook Meta, conectores de listening ya emiten. Pendiente: métricas
    agregadas + auditoría de quién creó cada campaña.
16. ~~**Lint/CI.**~~ ✅ **Resuelto** (v0.5.1, `a510840`).
    `.github/workflows/ci.yml` corre `tsc --noEmit` + `eslint` + `vitest`
    en cada PR y push a main. Cancela runs viejas del mismo branch.
17. ~~**Idempotencia del espejo a Sheets.**~~ ✅ **Parcial** (v0.5.3).
    `appendRow` ahora recibe `mirrorId` (UUID de la fila en
    `sheets_sync_queue`) y lo prepende como columna `_mirror_id` en el sheet.
    Permite dedupe off-band: comparar `sheets_sync_queue.id status='done'`
    contra la columna A del sheet. Falta: script de reconciliación que
    detecte duplicados periódicamente y los elimine del sheet.
18. ~~**Encriptación de credenciales**~~ ✅ **Resuelto** (feature #1, branch
    `connector-config`): la config de conectores se persiste en `conector_config`
    con los campos `secret` encriptados (AES-GCM, `lib/crypto.ts`) y se gestiona
    desde `/conectores → Configurar`. La UI nunca recibe los secretos.

## Orden sugerido

✅ P0 completo. ✅ P1 completo (#5 #6 #7 #8 #9 #10 #11). ✅ P2 cerrado en
infra (#14 #15 #16 done, #12 #13 #17 partial — esperan trabajo operativo:
templates aprobadas Meta, Reddit OAuth, sweep dedupe Sheets).

Pendientes operativos (no código):
- Aprobar templates WhatsApp con Meta (vertical Survey/Research)
- Setear Reddit OAuth app (client credentials)
- Domain warm-up + DNS DKIM/SPF para Resend
- AAIP — inscripción de la base ante autoridad de datos personales

Pendientes código (P3 / futuro):
- Pull real Meta Graph API para reconciliación con tráfico WA real
- Dedupe sweep periódico contra `_mirror_id` en Sheets
- Métricas agregadas + auditoría (quién creó cada campaña)
- Connector contract tests con MSW
