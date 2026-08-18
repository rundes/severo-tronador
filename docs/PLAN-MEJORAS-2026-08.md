# Plan de mejoras — auditoría integral (agosto 2026)

Fuente: revisión a fondo con 5 auditorías paralelas (seguridad, datos/DB, conectores, frontend/UX, calidad/testing/infra) sobre v1.20.1. ~180 hallazgos consolidados y priorizados en 7 fases.

**Veredicto general:** base sólida — webhooks con firma constant-time, RLS deny-all real, anti-SSRF en RSS ejemplar, migraciones idempotentes bien documentadas, 83 archivos de test. Los problemas graves se concentran en: (1) integridad del pipeline de envío (opt-out y doble envío), (2) aislamiento multi-tenant incompleto, (3) escala (full-table a memoria), (4) observabilidad nula de crons.

---

## F0 — Hotfixes (esta semana, ~1 día) — ✅ hecho

> Entregado en `f66da89` + `1081d34`. El `values.batchUpdate` del punto 3 y la
> implementación real de `op === "remove"` quedaron para F3 (§6 Sheets API): el
> hotfix cortó el backlog (workflow cada 15 min, BATCH 200) y dejó `remove`
> marcado `unsupported` en vez de `done`, que era la divergencia silenciosa.

Bugs activos en producción, cada uno ≤30 líneas:

1. **Reconcile roto**: `lib/reconcile.ts:55` filtra por `envios.connector_id`, columna que **no existe** en ninguna migración → el cron `/api/cron/reconcile` da 500 en cada tick desde que se deployó. Fix: agregar la columna (+ escribirla en send-queue) o filtrar por `provider_message_id like 're_%'`.
2. **Listening congelado**: `lib/listening.ts:19` usa `const NOW = Date.UTC(2026, 4, 26)` fijo → toda la detección de temas emergentes degenerada (todo item es "reciente", prior siempre 0). Fix: `Date.now()`; el ancla fija solo para tests.
3. **Espejo Sheets sin drenaje**: único cron de Vercel es sheets-sync 1×/día con BATCH=50 y sin workflow de GitHub → una campaña de 1.300 envíos = ~26 días de backlog. Además `op === "remove"` se marca `done` sin tocar el Sheet (`app/api/cron/sheets-sync/route.ts:26`). Fix: workflow cada 10 min, `values.batchUpdate`, implementar remove.
4. **Server action sin guard**: `app/(dashboard)/contactos/[dni]/actions.ts` — `registrarLlamada` invocable por anónimo desde rutas públicas (las server actions se despachan por action-ID). Fix: `await requireMember("editor")` + `project_id`.
5. **Allowlist fail-open**: `lib/auth-guards.ts:29` — con `ALLOWED_EMAILS` vacío en prod, cualquier cuenta Google entra (solo warn). Fix: throw fail-closed como `assertAuthConfiguredInProd`.
6. **Doble click = doble campaña**: botón de lanzamiento (`app/(dashboard)/campanas/nueva/page.tsx:322`) y submit de encuesta pública sin estado pending. Fix: `SubmitButton` existente + idempotency key.

## F1 — Integridad del pipeline de envío (semana 1-2) — ✅ hecho

> Entregado en la rama `fix/pipeline-envio-integridad`, un commit por punto.
> Migraciones a aplicar antes del deploy: `0050_send_queue_claim.sql`,
> `0051_quota_org_sum.sql`, `0052_envio_queue_dead_letter.sql`.
>
> Desvíos respecto de lo planeado, con su razón:
> - **Sin `callWithRetry` dentro del connector** (punto 3). Reintentar en
>   proceso un POST que ya pudo haber salido reintroduce el doble envío que el
>   punto 2 elimina. El reintento vive donde puede ser idempotente: el cron,
>   con la fila de la cola como unidad. Lo que sí se unificó es la
>   clasificación (`lib/connectors/send-http.ts`) y el timeout.
> - **Sin columna `period_key`** (punto 4). El desajuste de clave se resolvió
>   exponiendo `quotaKey()` en `OutreachConnector`: el que contabiliza es quien
>   sabe bajo qué clave lo hace. Sin migración de datos y sin tocar
>   `increment_quota`.
> - **Reserva de cuota**: no se reserva antes del send porque el connector ya
>   incrementa con el RPC atómico al salir el envío — reservar además contaría
>   doble. Lo que se arregló es que el contador del tick dejara de sumar
>   intentos y reintentos.
> - **Extra**: una fila que muere en la dead-letter ahora deja registro en
>   `envios`, si no el envío desaparecía de las métricas de la campaña.

El riesgo legal/reputacional más alto del producto:

1. **Opt-out se ignora en despacho**. Solo se consulta al *encolar* (`lib/campaigns.ts:522`); una baja posterior no frena nada. Agravantes:
   - `startFlow` (`lib/flows.ts:258`) encola todos los steps con `scheduled_at` a días vista → baja del día 1 recibe steps del día 3/7/14.
   - `sendMail` de compose (`app/(dashboard)/mail/actions.ts:134`) no chequea opt-out, ni cuota, ni cooldown.
   - Responder "BAJA" a un mail de campaña se guarda como respuesta cualitativa (`lib/mailbox/reply-routing.ts:96` nunca corre `detectOptOut`); "BAJA" desde teléfono no matcheado en padrón se descarta (`lib/inbound.ts:112`).
   - Fix central: `optedOutSet(project_id)` en el loop del cron send-queue antes de `connector.send` + `detectOptOut` en email + registrar bajas no resueltas para revisión manual.
2. **Doble envío**. Tres causas que se combinan:
   - Sin claim: el cron lee `pending` y actualiza *después* de enviar (`app/api/cron/send-queue/route.ts:89`); ticks solapados o corte a mitad (BATCH=50 × 500ms sleep ≈ borde de maxDuration=60) reenvían. Fix: RPC de claim `UPDATE … SET status='processing', attempts=attempts+1 WHERE id IN (SELECT … FOR UPDATE SKIP LOCKED) RETURNING *`.
   - Rollback lógico tras éxito: si el insert en `envios` falla después de un send OK, el catch reprograma la fila como `pending` (:280-298). Fix: marcar `done` inmediatamente tras send OK; persistir `envios`/mirror fuera del try de reintento.
   - Sin clave de idempotencia: unique `(campaign_id, token)` en `envios` + `on conflict do nothing`.
3. **Retries de conectores**: solo Resend clasifica `retryable`; Meta WA, Brevo y Telegram marcan 429/5xx como fallo permanente, y el catch de red de los 4 tampoco marca retryable → un ECONNRESET quema la fila. Fix: helper `callWithRetry` en la capa base (`lib/connectors/types.ts`), respetar `retry_after` de Telegram, `fetchWithTimeout` en todos los conectores outreach (hoy 30 de 35 fetch sin timeout).
4. **Cuota**: `quota.used++` en memoria del tick (no el RPC atómico), se cuenta antes del envío y en cada retry; guard org-wide de Brevo siempre ve 0 por el mismatch de clave `brevo:YYYY-MM-DD` vs `brevo` (`lib/connectors/brevo.ts:107` + `route.ts:218`); `getOrgUsage` sin limit se trunca a 1000 filas. Fix: reservar vía RPC `increment_quota` antes del send; `sum()` en SQL; columna `period_key`.
5. **Dead-letter**: filas `failed` agotadas quedan mezcladas para siempre en `envio_queue` sin métrica ni reintento manual. Fix: `status='dead'` + índice parcial + conteo por tick en logs.

## F2 — Aislamiento multi-tenant (semana 2-3) — ✅ hecho

> Entregado en la rama `fix/aislamiento-multitenant`. Migraciones a aplicar
> antes del deploy: `0053_conector_config_por_proyecto.sql`,
> `0054_aislamiento_multitenant.sql`.
>
> Desvíos respecto de lo planeado, con su razón:
> - **`llamadas` (punto 3)** ya se había resuelto en los hotfixes de F0.
> - **Credenciales (punto 2)**: de las dos opciones que planteaba la auditoría
>   —scope por proyecto o restringir a un superadmin— se eligió una tercera que
>   las combina: la fila de organización sobrevive como fallback (la cuenta de
>   Resend/Meta es una sola y es de la org) pero desde el panel es de sólo
>   lectura, y lo único que se escribe es el override del proyecto. Así nadie
>   pisa credenciales ajenas sin obligar a cada proyecto a tener su propia
>   cuenta en cada proveedor.
> - **Mail entrante sin atribuir**: además de dejar de caer al proyecto
>   default, directamente no se guarda. Guardarlo en cualquier bandeja es
>   mostrarle el mail de alguien al equipo equivocado; queda el warn.
> - **Extra**: `lib/rate-limit.ts` (ventana deslizante en memoria) para los
>   topes del punto 7. No es distribuido — en serverless el techo real es
>   N_instancias × límite — y alcanza para lo que tiene que frenar: que una
>   acción de envío puntual se convierta en un canal de spam desde el panel.

1. **Templates cross-tenant** (fuga activa): `listTemplates()` sin filtro de proyecto, `createTemplate` sin `project_id` (cae al DEFAULT del proyecto 0001 y la ve todo el mundo), `getTemplate` con projectId opcional que el path de envío no pasa (`lib/templates.ts:173,200` + `lib/campaigns.ts:488` + `lib/flows.ts:233`). Fix: `projectId` obligatorio en las tres.
2. **Credenciales org-globales**: `conector_config` sin `project_id` → el owner de cualquier proyecto sobrescribe las API keys (Resend, Meta, Anthropic…) de todos (`lib/connectors/config.ts`). Decidir: scope por proyecto (PK compuesta) o restringir a un rol de superadmin.
3. **`llamadas` global**: única tabla vía `repo()` genérico sin scope; `listCallsFor(dni)` mezcla proyectos. Migrar al patrón project-scoped.
4. **Telegram cross-tenant**: `getChatByDni(dni)` sin projectId → puede mandar el mensaje al chat de otro proyecto con mismo DNI (`lib/connectors/telegram-bot.ts:133`).
5. **Otros IDOR/leaks**: `firmarAudioRadio` firma URLs GCS de path arbitrario (`app/(dashboard)/escucha/actions.ts:14`); `getEncuestaBySlug` con `.ilike` permite enumerar por wildcards `%`/`_` (`lib/encuestas.ts:115`); `previewGoogleSheet` sin guard (`contactos/actions.ts:173`); mail entrante no matcheado cae al proyecto default (`webhooks/mail-in:55`); dedupe de inbox por `message_id` global permite suprimir mail ajeno (`inbox-store.ts:82`).
6. **Red de seguridad estructural**: dropear el `DEFAULT '…0001'` de `project_id` en las 19 tablas (migración 0019) — hoy un write que olvida project_id contamina silenciosamente el tenant default en vez de fallar. Agregar FKs faltantes (`escucha_marcas`, `radio_runs`, `padron_field_defs`, `inbound_messages` → projects).
7. **Roles**: exports masivos de PII y envío de mail con rol viewer (`api/dashboard/export`, `api/segmentos/export`, `mail/actions.ts:149`, `templates/actions.ts`) → subir a editor/owner; envíos de prueba con `to` arbitrario → restringir a la propia casilla + rate limit.

## F3 — Escala de datos (semana 3-4) — ✅ hecho

> Entregado en la rama `perf/escala-datos`. Migraciones a aplicar antes del
> deploy: `0055_dashboard_agregados.sql`, `0056_retencion.sql`.
>
> Desvíos respecto de lo planeado, con su razón:
> - **Filtros de segmento a SQL (punto 1)**: se empujan a la DB los predicados
>   que son columna (barrio, sexo, grupo, afiliación, contactabilidad, lista de
>   DNIs corta). Los que dependen de la ficha de relación —health score,
>   actividad, canal preferido— y la edad —que se calcula sobre `fecha_nac`,
>   que es `text`— siguen en memoria: traducirlos exigiría materializar la
>   relación en SQL, que es un rediseño, no una optimización. El prefiltro es
>   estrictamente una optimización: el filtro completo se sigue aplicando
>   después, así que pasarlo o no da el mismo resultado.
> - **Sin keyset pagination**: con la ventana de 180 días sobre la actividad y
>   el prefiltro sobre el padrón, el volumen por request ya no crece con la
>   antigüedad del proyecto. La paginación por keyset queda para cuando el
>   padrón de un solo proyecto no entre en una respuesta.
> - **HTML por fila de `envio_queue`**: no se cambió el modelo (guardar
>   `template_id` + variables e interpolar al despachar). En su lugar, la
>   retención borra las filas terminadas a los 30 días, que ataca el mismo
>   problema —tabla que sólo crece— sin tocar el path de envío recién
>   estabilizado en F1. El cambio de modelo queda anotado como deuda.
> - **`op = "remove"` del espejo**: sigue sin implementarse (marca
>   `unsupported`). Borrar una fila en Sheets exige buscarla primero; con el
>   `_mirror_id` ya escrito es factible, pero es una feature del espejo, no un
>   problema de escala.

1. **Full-table a memoria** (el límite duro de crecimiento actual): `loadContacts` trae el padrón entero y filtra en JS en cada dashboard/segmento/campaña (`lib/campaigns.ts:508`, `lib/db/padron.ts:155`); `loadRawRelationships` pagina TODOS los envios+respuestas+opt_outs por request (`lib/db/relations.ts:44`). Fix: filtros de segmento a SQL (RPC), ventana temporal de 180 días para relaciones, keyset pagination.
2. **KPIs truncados en silencio**: `loadDashboard` sin `.limit()` → PostgREST corta en 1000 filas sin error; con >1000 envíos las métricas mienten (`lib/analytics.ts:159`). Fix: agregados vía RPC SQL (`count(*) filter (…)`).
3. **Índices**: `envios.provider_message_id` (cada webhook de entrega hace seq scan), `padron (project_id, apellido, nombre)` para paginación. `count: "exact"` del padrón en cada dashboard → `estimated`.
4. **Retención**: cero pruning en todo el esquema. Job pg_cron: `listening_items` >90d, `sheets_sync_queue` done >30d, `email_events` >180d, `envio_queue` done >30d. Además `envio_queue` guarda el HTML renderizado completo por destinatario (~40KB/fila) → guardar `template_id` + variables e interpolar al despachar.
5. **Payload por lotes**: `survey_tokens` se insertan en un solo insert de miles de filas sin chequear error → mails con links rotos si falla (`lib/survey.ts:75,114`). Batch de 500 + check de error. Igual `enqueueSheetSync` (`lib/db/mirror.ts:6`) ignora error.
6. **Sheets API**: append por fila sin backoff en 429; orden de columnas por `Object.values` (agregar un campo desplaza el histórico) → mapa explícito de columnas + `batchUpdate`.

## F4 — Observabilidad y CI (semana 4) — ✅ hecho

> Entregado en la rama `ops/observabilidad-ci`. Migración a aplicar antes del
> deploy: `0057_cron_heartbeats.sql`. Variable nueva y opcional:
> `ERROR_WEBHOOK_URL`.
>
> Desvíos respecto de lo planeado, con su razón:
> - **Sin Sentry**: el sink (`lib/error-sink.ts`) es zero-dep y postea a
>   cualquier endpoint que reciba JSON. Meter un SDK es una decisión de
>   dependencia que no hace falta tomar para dejar de perder los errores;
>   cambiar a `@sentry/nextjs` después es reemplazar una función.
> - **Alerting por issue de GitHub**: no había canal de notificación
>   configurado y un run en rojo vive en una pestaña que nadie mira. Un issue
>   sí notifica por los canales que el equipo ya tiene. Se reutiliza un issue
>   por job en vez de abrir uno por tick — un cron cada 5 minutos caído
>   generaría cientos.
> - **`npm audit` no bloquea** (`continue-on-error`): las vulnerabilidades de
>   dependencias se atienden en su propio ciclo, no frenando un fix no
>   relacionado.
> - **Umbral de cobertura calibrado sobre lo que hay** (statements 48%,
>   branches 40%, functions 58%, lines 50%), no sobre el 80% de la regla
>   general: sirve para que CI falle ante una regresión, no para exigir un
>   salto de golpe. Sube a medida que F6 cubra los módulos que faltan.
> - **Deploy gating**: el `next build` en CI es la mitad que se puede hacer
>   desde el repo. La otra mitad —marcar el check como required en la
>   protección de rama de main— es configuración de GitHub, no código.
> - **Zod en los bordes**: se cubrieron las rutas con cuerpo JSON propio
>   (radio-ingest y mail-in) más el helper `parseJsonBody`. Los webhooks de
>   Meta, Telegram y Telnyx reciben esquemas del proveedor con muchísimos
>   campos opcionales; validarlos con un esquema estricto rompería con cada
>   cambio de su lado. Sus handlers ya navegan el payload de forma defensiva.
>
> Nota para quien toque `lib/schemas.ts`: `parseJsonBody` es genérico sobre el
> SCHEMA (`S extends z.ZodTypeAny` + `z.infer<S>`), no sobre el tipo de salida
> (`z.ZodType<T>`). Esa segunda forma hace explotar la memoria del type-checker:
> `next build` moría con heap out of memory mientras `tsc --noEmit` suelto
> pasaba.

1. **Alerting de crons**: 7 workflows críticos fallan en silencio; GitHub deshabilita `schedule` tras 60 días sin actividad → la cola se para sin señal. Fix: step `if: failure()` con notificación + heartbeat (dead-man's switch sobre `/api/version` o cron-job.org).
2. **Error tracking**: sin Sentry ni `onRequestError` en `instrumentation.ts`. Agregar sink de errores agregado.
3. **CI**: agregar `next build` (hoy los fallos de build llegan directo a Vercel) + deploy gating (`ignoreCommand` o required checks en main) + coverage con threshold + `npm audit`/dependency review (next-auth beta en prod).
4. **CSP**: falta por completo; con `dangerouslySetInnerHTML` en render de mail es la segunda capa necesaria. Empezar en `Report-Only`.
5. Zod en bordes: 0 de 20 rutas API validan body (webhooks incluidos, el HMAC autentica origen, no forma); extender `lib/schemas.ts`.

## F5 — Frontend: adoptar el design system propio (semana 5-6) — ✅ hecho

> Entregado en la rama `feat/design-system`. Sin migraciones.
>
> Lo que se hizo, punto por punto:
> 1. **Controles** (`components/ui/field.tsx`): `Input`/`Textarea`/`Select`/
>    `Field`. Las 20 definiciones locales de `inputCls` pasan a apuntar al token
>    del sistema, así que los ~200 usos no se tocaron. Se eliminaron los
>    `focus:outline-none`, que anulaban el `:focus-visible` global de
>    globals.css y dejaban 12 controles sin ningún indicador de foco (WCAG
>    2.4.7). Única excepción documentada: el lienzo `contenteditable` del editor
>    visual, donde el outline encierra todo el área y el foco lo comunica el
>    cursor.
> 2. **Modal/ConfirmDialog** (`components/ui/modal.tsx`) con `role="dialog"`,
>    `aria-modal`, título asociado, trampa de foco, devolución del foco al
>    disparador y cierre con Escape. Migrados el modal de conectores y el de
>    borrado de respuestas. El drawer del sidebar lleva `inert` cuando está
>    cerrado en mobile: sus ~30 links se tabulaban igual estando fuera de
>    pantalla.
> 4. **EmptyState / Skeleton** + `global-error.tsx` y `not-found.tsx`, que
>    faltaban por completo. Los estados vacíos migrados ofrecen la salida
>    concreta en vez de sólo avisar. `/competencia` pasa a `<Suspense>`: la Meta
>    Ad Library frenaba el TTFB de la página entera, incluido el buscador que el
>    usuario acababa de usar.
> 5. **Contraste**: los 211 `text-zinc-400` usados como texto informativo pasan
>    a `text-zinc-500 dark:text-zinc-400` (2.6:1 → 4.6:1 en claro). Las
>    superficies con `dark:bg-zinc-950` sobre un fondo que también es zinc-950
>    —las tarjetas desaparecían en oscuro— pasan a zinc-900.
> 6. **Paleta**: `lib/channels.ts` unifica las cinco copias del mapa
>    canal→emoji; tres se habían quedado sin Telegram y el mismo canal aparecía
>    en una pantalla y no en otra. `tabular-nums` en las celdas numéricas
>    alineadas a la derecha.
> 7. **Performance**: el `import * as Icons from "lucide-react"` del sidebar
>    traía la librería entera al bundle de TODA ruta del panel (el nombre venía
>    como string desde el server, así que el bundler no podía saber cuáles se
>    usaban) → mapa explícito. `react-easy-crop` pasa a `next/dynamic`.
>    Waterfalls de awaits en la ficha de contacto y en /mail → `Promise.all`.
>    Las portadas de encuesta pasan a `next/image` (con `remotePatterns`
>    derivado de SUPABASE_URL).
>
> Desvíos respecto de lo planeado, con su razón:
> - **Sin `<DataTable>`** (punto 3). Se hizo lo que estaba mal: `scope="col"` en
>   los encabezados de las 6 tablas de datos y paginación de la lista de envíos
>   de campaña (renderizaba los 50.000 de una; el `key={e.dni}` además colapsaba
>   las filas repetidas de una campaña con variantes A/B). Un componente único
>   para 9 tablas que hoy no comparten estructura —una con selección múltiple,
>   otra con columnas dinámicas del padrón, otra con columna sticky— sería una
>   abstracción especulativa: cada una terminaría pasando su excepción por prop.
> - **Card sigue sin adoptarse en las ~100 copias del string**. Se corrigió el
>   `dark:bg` que la hacía invisible, pero reemplazar 100 sitios es un cambio
>   mecánico grande de riesgo visual alto y beneficio funcional nulo. Queda como
>   deuda, no como bug.
> - **Sin zod en cliente ni guard de cambios sin guardar** (punto 8). La
>   validación server-side con `redirect(?error=)` funciona; duplicar los
>   schemas en el cliente es mejora de UX, no corrección. El guard de "tenés
>   cambios sin guardar" necesita decidir qué hacer con los editores que
>   autoguardan en localStorage (ad-studio), y eso es diseño.

El sistema está definido (DESIGN.md) pero sin usar: `Card` tiene 0 imports y su string está copiado ~100 veces; 22 copias divergentes de `inputCls`. Orden de extracción (mayor ROI primero):

1. **`<Input>/<Select>/<Field>`** — mata las 22 copias, arregla los 12 controles sin foco visible (`focus:outline-none` que anula el `:focus-visible` global — WCAG 2.4.7) y unifica dark mode.
2. **`<Modal>/<ConfirmDialog>`** — hoy ningún modal tiene `role="dialog"`, focus trap, Escape ni aria; drawer del sidebar tabulable fuera de pantalla (falta `inert`).
3. **`<DataTable>`** — 9 tablas independientes, cero `scope="col"`; paginar la lista de envíos de campaña (hoy renderiza los 50k de una).
4. **`<EmptyState>` + `<Skeleton>` + loading/error por módulo** — hoy hay 1 solo `loading.tsx`/`error.tsx` para todo el dashboard; escucha/competencia/difusión bloquean TTFB completo → `<Suspense>` por bloque lento. Falta `global-error.tsx` y `not-found.tsx`.
5. **Contraste**: 227 usos de `text-zinc-400` como texto informativo (2.6:1, falla AA) → `zinc-500/600` en claro. `Card` dark usa el color del fondo (las tarjetas desaparecen en dark) → `dark:bg-zinc-900`.
6. **Paleta**: auditoría con 12 colores de acción, `sky/violet/fuchsia/blue` sueltos, naranja de "no leído" — reducir a zinc + índigo + estados. Métricas sin `tabular-nums`. 5 copias del mapa canal→emoji → `lib/channels.ts` con lucide.
7. **Performance**: `import * as Icons from "lucide-react"` en el sidebar rompe tree-shaking (toda ruta paga la librería); `react-easy-crop` estático; waterfalls de 5 awaits secuenciales en contactos/mail/campanas → `Promise.all`; `<img>` crudo en páginas públicas → `next/image`.
8. **Forms**: validación solo server-side vía `redirect(?error=)` — reusar schemas zod en cliente; editores largos sin guard de cambios sin guardar.

## F6 — Higiene y deuda (continuo) — 🔶 parcial

> Entregado en la rama `chore/higiene-deuda`. Migración a aplicar antes del
> deploy: `0058_constraints_e_higiene.sql`.
>
> **Hecho:**
> - **Telnyx retirado** (punto 1): el webhook seguía VIVO aceptando SMS
>   entrantes de un proveedor descartado en julio — superficie de ataque de algo
>   que ya nadie usa — y los conectores seguían visibles en /conectores,
>   invitando a configurar un canal inutilizable. `OUTREACH_BY_ID` los conserva
>   con fecha de expiración explícita (2027-01) para drenar cola legacy.
> - **`.env.example`** (punto 2): faltaban `AUTH_SECRET`,
>   `TELEGRAM_WEBHOOK_SECRET`, `GOOGLE_PICKER_API_KEY`, `META_ACCESS_TOKEN`,
>   `APP_TZ` y los knobs de la cola; sobraban las cinco `TELNYX_*`.
> - **Docs drift** (punto 3): PLAN.md declaraba F5 SMS/voz en producción.
> - **Un solo motor de interpolación** (punto 4): convivían dos, y los ASUNTOS
>   usaban el corto mientras los cuerpos usaban el completo — un `{{saludo}}` en
>   el asunto se renderizaba vacío mientras el mismo token funcionaba en el
>   cuerpo, y el editor ofrecía las derivadas sin distinguir dónde valían.
> - **Constraints DB** (punto 5): CHECKs de estado en `envios`, `envio_queue`,
>   `sheets_sync_queue` y `campanas` (NOT VALID: aplican a lo nuevo sin
>   re-verificar histórico); índice muerto `idx_padron_dni` —cubierto por
>   `padron_dni_project_uk` desde 0021— y sobrecarga legacy de
>   `increment_quota`, que escribía todo bajo el proyecto default. Las PKs text
>   pasan a `prefixedId`: `Date.now().toString(36)` colisiona entre dos
>   creaciones en el mismo milisegundo.
> - **Tests prioritarios** (punto 6): `csv` (formula injection), `email-sanitize`
>   (XSS), `contactos/mapping` (el punto donde un Sheet ajeno se convierte en el
>   padrón), `ids`. El `csvEscape` duplicado del export de segmentos se eliminó:
>   era el único sin la protección, y es el CSV que sale con nombres y teléfonos.
> - **Seguridad media** (punto 7): magic bytes en el upload (confiaba en el
>   `content-type` del cliente, sobre un bucket PÚBLICO); HKDF para el HMAC de
>   share-token, que reusaba la clave maestra del AES-GCM de credenciales;
>   tokens truncados en logs (son credenciales); "Borrar config" ya no reactiva
>   el conector al desaparecer la fila; el worker de Cloudflare baja su tope de
>   5MB a 4MB — por encima del límite de body de Vercel, un mail entre 4,5 y 5MB
>   se reintentaba en loop sin que nadie lo viera.
>
> **Pendiente**, y por qué se dejó:
> - **`ad-studio.tsx` a reducer + split** (1226 líneas, 24 `useState`) y **dedupe
>   de post-composer / difusion-board**: son refactors mecánicos grandes sobre UI
>   sin cobertura de componentes. El riesgo es de regresión visual y de
>   comportamiento, y el beneficio es de mantenibilidad, no funcional. Conviene
>   hacerlos con tests de componente delante, no a ciegas.
> - **`fecha_nac text` → `date`**: es migración de datos sobre una columna que
>   hoy acepta cualquier formato de cualquier Sheet importado. Requiere decidir
>   qué hacer con lo que no parsea antes de tocar nada.
> - ~~**`op = "remove"` del espejo a Sheets**: sigue marcando `unsupported`.~~
>   **Cerrado post-F6**: los removes van como tombstone a la hoja `bajas`
>   (el Sheet es un log append-only; el lector externo resta `bajas` de cada
>   hoja). `appendRows` además auto-crea hojas faltantes con encabezados —
>   la falta de la hoja `envios` tenía al espejo fallando 500 filas por tick.

1. **Telnyx post-retiro**: webhook vivo aceptando entrantes SMS, conectores en el registry visibles en /conectores, env vars en `.env.example` — borrar ruta y registry (dejar `OUTREACH_BY_ID` para drenar cola legacy con fecha de expiración).
2. **`.env.example` desincronizado**: faltan `TELEGRAM_WEBHOOK_SECRET`, `META_ACCESS_TOKEN`, `AUTH_SECRET`, `GOOGLE_PICKER_API_KEY`…; sobran `TELNYX_*`, `REDDIT_*`, claves que ya van por panel.
3. **Docs drift**: PLAN.md aún declara F5 SMS/voz "en producción".
4. **Duplicación**: dos motores de interpolación conviviendo (`lib/templates.ts:237` vs `lib/interpolate-vars.ts`); `post-composer` y `difusion-board` son el mismo compositor escrito dos veces (~400 líneas); `ad-studio.tsx` 1226 líneas / 24 useState → reducer + split.
5. **Constraints DB**: CHECKs de estado faltantes en tablas históricas, `fecha_nac text`, PKs text globales con `Date.now().toString(36)` (colisionable), índice muerto `idx_padron_dni`, sobrecarga legacy de `increment_quota`.
6. **Tests prioritarios** (52 módulos de lib sin cubrir): `email-sanitize` (XSS), conectores de envío reales (brevo/meta-wa/telegram — solo resend cubierto), `csv.ts` (formula injection: falta prefijar `'` en celdas `= + - @`), `contactos/mapping` (corrompe padrón), `auth.ts`, `google-sheets`.
7. **Misc seguridad media**: upload valida `file.type` del cliente (magic bytes), share-token reusa `CONFIG_MASTER_KEY` como HMAC (derivar con HKDF), tokens de encuesta logueados en claro, `isEnabled` default true para conector sin fila, token de Meta Content Library en query param, worker Cloudflare acepta 5MB > límite Vercel 4.5MB (loop de retries).

---

## Secuencia sugerida

| Fase | Esfuerzo | Riesgo que elimina |
|------|----------|--------------------|
| ✅ F0 hotfixes | ~1 día | Crons rotos, acceso anónimo, doble campaña |
| ✅ F1 pipeline envío | ~1 semana | Envíos a bajas (legal), duplicados, pérdida de envíos |
| ✅ F2 multi-tenant | ~1 semana | Fugas cross-tenant, credenciales pisables |
| ✅ F3 escala | ~1 semana | Timeouts/OOM al crecer padrón, KPIs falsos |
| ✅ F4 observabilidad/CI | ~3 días | Fallos invisibles, deploy sin gate |
| ✅ F5 frontend/DS | ~2 semanas | A11y, consistencia, bundles |
| 🔶 F6 higiene | continuo | Deuda acumulada |

F0-F2 son secuenciales (mismo código: send-queue, templates). F3, F4 y F5 son paralelizables entre sí.
