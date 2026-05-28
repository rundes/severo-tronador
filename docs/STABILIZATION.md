# Plan de estabilización

> Estado: el roadmap F0→F8 está completo como **scaffold funcional** (todo
> verificado en runtime, en modo mock). Este documento lista lo que falta para
> llevarlo a **producción confiable**, ordenado por prioridad, e incorpora los
> hallazgos de la revisión de código.

## Hallazgos de la revisión de código

Severidad: 🔴 alta · 🟠 media · 🟡 baja.

| # | Archivo | Hallazgo | Fix |
|---|---|---|---|
| 1 | `app/api/webhooks/meta/route.ts` | 🔴 No verifica la firma del webhook (`X-Hub-Signature-256`); acepta cualquier POST. | Validar HMAC-SHA256 con el App Secret de Meta antes de procesar. |
| 2 | `app/api/webhooks/meta/route.ts` | 🟠 Compara el verify token con `===` (no timing-safe). | Usar `crypto.timingSafeEqual`. |
| 3 | `lib/survey.ts` | 🟠 Race entre `hasResponded` y `push` (dos POST concurrentes podrían duplicar). | Check-and-insert atómico (Set por token) — se resuelve solo al migrar a una DB con constraint único. |
| 4 | `app/(dashboard)/campanas/nueva/actions.ts` | 🟠 `executeCampaign` no está en try/catch; si lanza, no hay feedback al usuario. | Envolver y redirigir con `?error=interno`. |
| 5 | `lib/segments.ts` (`loadContacts`) | 🟠 `readPadron` sin manejo de error; una caída de Sheets rompe el render. | try/catch + estado de error en la UI. |
| 6 | conectores outreach | 🟡 La cuota se incrementa tras el `fetch` OK aunque `providerMessageId` venga `undefined`. | Aceptable (el envío salió); registrar warning si falta el id. |
| 7 | `lib/connectors/claude-api.ts` | 🟡 Incrementa tokens estimados aun en mock (sin refund si falla). | Mover el incremento a post-éxito cuando se implemente la llamada real. |
| 8 | `app/(dashboard)/layout.tsx` | 🟡 Sin auth configurada, el panel es accesible (intencional en dev). | Forzar `authConfigured` obligatorio en producción (chequeo en build/runtime). |

## P0 — Bloqueantes de producción

1. ~~**Persistencia real.**~~ ✅ **Resuelto** (branch `supabase-persistence`,
   spec/plan 2026-05-27). Supabase (Postgres) es la base operativa vía la
   interfaz `Repository` (`lib/db/`); los stores `globalThis` quedan solo como
   fallback de dev. Google Sheets se espeja write-behind (`sheets_sync_queue` +
   cron `/api/cron/sheets-sync`). El padrón lo carga el usuario en `/padron`.
   Pendiente menor: dedupe fina al consolidar en Sheets (hoy append).
2. **Webhook seguro** (hallazgo #1, #2): firma + timing-safe.
3. **Auth obligatoria en producción** (hallazgo #8): si `NODE_ENV=production` y
   falta OAuth, abortar el arranque en vez de servir sin login.
4. **Cola asíncrona con Vercel Cron.** Hoy el envío es síncrono dentro del
   server action; con segmentos grandes se corta por timeout. Mover a una cola
   (`pendientes_envio`) procesada por `/api/cron` cada minuto, respetando rate
   limit por conector.

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
9. **Feedback de la relación.** Hoy `deriveRelationship` solo usa el historial
   mock; los envíos reales no actualizan cooldowns ni health score. Conectar
   los `envios`/`respuestas` reales a la ficha de relación.
10. **Atomicidad de cuota** (review post-migración): `incrementUsage` hace
    read-then-write → carrera con envíos concurrentes (podría sub-contar y
    pasarse del free tier). Usar un `UPDATE … RETURNING` atómico (RPC de
    Postgres) en vez de leer y reescribir.
11. **Dedupe de respuesta a nivel DB**: agregar `unique` en `respuestas(token)`
    y manejar el conflicto en `addResponse` (hoy el check-then-insert puede
    correr en concurrencia). El check app-level cubre el caso común.

## P2 — Madurez

12. **Plantillas WhatsApp aprobadas**: mapear `template` con componentes Meta
    (hoy se manda `type=text`, válido solo en ventana 24h).
13. **Listening real**: implementar `fetch` de GDELT/X/Reddit (hoy mock) y
    persistir series temporales para el baseline de temas emergentes.
14. **Validación de emails/teléfonos** antes de enviar (regex + verifier
    opcional) y warm-up de dominio para deliverabilidad.
15. **Observabilidad**: logging estructurado, métricas de cuota/envío, y
    auditoría (quién creó cada campaña) persistida.
16. **Lint/CI**: correr `next lint` + `tsc --noEmit` + tests en CI por PR.
17. **Idempotencia del espejo a Sheets**: si el cron cae entre `appendRow` y
    marcar `done`, reintenta y duplica la fila. Consolidar por clave (upsert por
    id en la hoja) en vez de append, o marcar `done` antes del append con
    compensación.
18. ~~**Encriptación de credenciales**~~ ✅ **Resuelto** (feature #1, branch
    `connector-config`): la config de conectores se persiste en `conector_config`
    con los campos `secret` encriptados (AES-GCM, `lib/crypto.ts`) y se gestiona
    desde `/conectores → Configurar`. La UI nunca recibe los secretos.

## Orden sugerido

P0.1 (persistencia) desbloquea casi todo lo demás → P0.2/P0.3 (seguridad) →
P0.4 (cola) → P1 (tests + validación + errores) → P2.
