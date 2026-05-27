# Diseño — Configuración de conectores desde el panel (feature #1)

- **Fecha**: 2026-05-27
- **Estado**: aprobado (brainstorming)
- **Depende de**: la fundación de persistencia Supabase (tabla `conector_config`,
  `lib/crypto.ts`) ya mergeada en `main`.

## 1. Problema

Hoy los conectores se configuran **solo por env var** y el panel `/conectores`
es de solo lectura. Se quiere configurarlos desde la UI: un botón por conector
abre un modal que muestra qué datos cargar y **cómo obtenerlos**, guarda la
config (credenciales encriptadas) en Supabase, permite probar la conexión, y
activar/desactivar el conector — sin redeploy.

## 2. Decisiones (cerradas en brainstorming)

| Tema | Decisión |
|---|---|
| Precedencia | **UI (Supabase) gana sobre env**; env queda como bootstrap/fallback. Sin config ni env → modo mock. |
| Ayuda "cómo obtener" | `help` por campo (ya en `configSchema`) + link a la sección del conector en `docs/INTEGRATIONS` (GitHub Pages). Una sola fuente de verdad. |
| Catálogo | Fijo (definido en código/registry). No hay "agregar tipo nuevo" en runtime → el botón pasa a **"Configurar" por conector**; se quita el "+ Agregar conector" global. |
| Secretos | Encriptados at-rest (`lib/crypto.ts`), **nunca** se devuelven al cliente (se enmascaran). |
| Borrar config | Acción "Borrar config" → elimina la fila `conector_config` → el conector vuelve a env/mock. |

## 3. Arquitectura

Los `configSchema[].key` **ya** son los nombres de env (`RESEND_API_KEY`,
`META_WA_PHONE_NUMBER_ID`, …). Por eso el resolver devuelve un mapa keyed por
esos nombres y el refactor de cada conector es mecánico: `process.env.X` → `cfg.X`.

```
Modal (client) ──server action──► saveConnectorConfig (encripta secrets)
                                         │ upsert
                                         ▼
                                   conector_config (Supabase)
Conector.send()/test()/getStatus()
   └─ getConnectorConfig(id) ──► merge: conector_config (desencriptado) sobre env
                                  (UI gana). Sin nada → {} → modo mock.
```

## 4. Componentes

### 4.1 `lib/connectors/config.ts`
```ts
export type ConnectorConfigValues = Record<string, string>;

// Config efectiva: Supabase (desencriptada) sobre defaults de env. Cache por request.
export async function getConnectorConfig(connectorId: string): Promise<ConnectorConfigValues>;

// Guarda: encripta los campos marcados `secret` en el configSchema, upsert.
export async function saveConnectorConfig(connectorId: string, values: ConnectorConfigValues): Promise<void>;

export async function deleteConnectorConfig(connectorId: string): Promise<void>;
export async function setEnabled(connectorId: string, enabled: boolean): Promise<void>;
export async function isEnabled(connectorId: string): Promise<boolean>;

// Para la UI: estado de cada campo sin exponer secretos.
//  -> { key, hasValue, source: 'ui' | 'env' | 'none' } por campo.
export async function configFieldStatus(connectorId: string): Promise<FieldStatus[]>;
```
- Sin Supabase configurado: `getConnectorConfig` devuelve solo los defaults de env (no rompe). `saveConnectorConfig` lanza un error claro ("Supabase/CONFIG_MASTER_KEY no configurado") que la UI muestra.
- Los valores `secret` se guardan vía `encryptJson`; los no-secret en claro.
- Defaults de env: para cada `key` del `configSchema`, leer `process.env[key]`.

### 4.2 Refactor de conectores
Cada conector reemplaza lecturas directas de `process.env` y su `hasKey()`/`hasCreds()`
por la config resuelta:
```ts
const cfg = await getConnectorConfig(ID);
const hasKey = Boolean(cfg.RESEND_API_KEY);
// ...usar cfg.RESEND_FROM, etc.
```
Conectores afectados: `resend`, `meta-wa-cloud`, `telnyx-sms`, `telnyx-voice`,
`claude-api`, `google-sheets`, `x-api` (los `gdelt`/`reddit` sin secret real
también pueden leer su config aunque hoy no la usen). `getStatus`, `getQuota`,
`test`, `send`, `fetch`, `analyze`, `readPadron` ya son async → leer config async
es directo. **Defaults de env preservados** → modo mock intacto.

### 4.3 UI `/conectores`
- La card de cada conector suma un botón **"Configurar"** (client) que abre un modal.
- **Modal** (`components/connectors/config-modal.tsx`, client):
  - Un input por `configSchema` field. Tipo `secret` → input password; si ya hay
    valor guardado, placeholder "configurado ••••" y vacío = no cambiar.
  - Por campo: el `help` + link **"Cómo obtener →"** a `INTEGRATIONS#<anchor>`.
  - Botones: **Probar conexión**, **Guardar**, y un toggle **Activar/Desactivar**.
    Enlace **"Borrar config"**.
- Se elimina el botón "+ Agregar conector" global.
- El mapa connectorId → anchor de INTEGRATIONS vive en la UI (constante).

### 4.4 Server actions `app/(dashboard)/conectores/actions.ts`
```ts
"use server";
guardarConfig(connectorId, formData)  // valida, saveConnectorConfig, revalidatePath
probarConexion(connectorId, formData) // construye config temporal + connector.test() → {ok,message}
toggleConector(connectorId, enabled)
borrarConfig(connectorId)
```
- Nunca devuelven valores `secret`. Validan `connectorId` contra el registry.

## 5. Seguridad
- Secrets encriptados con `CONFIG_MASTER_KEY` (AES-GCM, `lib/crypto.ts`).
- El cliente nunca recibe secretos: `configFieldStatus` solo informa `hasValue`/`source`.
- Acciones server-only (service-role). Validación de `connectorId`.

## 6. Estado y enabled
- `enabled` en `conector_config` permite apagar un conector aunque tenga creds.
  El panel y la cola de campañas respetan `isEnabled` (un conector `paused` no
  envía). Por defecto, si hay creds válidas y no se seteó `enabled`, se considera
  activo (retrocompatibilidad con el comportamiento actual basado en env).

## 7. Testing
- Unit: `getConnectorConfig` (merge UI-sobre-env, enmascarado), `saveConnectorConfig`
  (encripta solo secrets), `configFieldStatus` (no filtra secretos), `isEnabled`.
- Con `memoryRepo`/sin Supabase: el resolver devuelve env-only y `saveConnectorConfig`
  avisa.
- Regresión: los conectores en modo mock (sin config) siguen comportándose igual.

## 8. Fuera de alcance
- Agregar tipos de conector nuevos en runtime (catálogo fijo en código).
- OAuth flows interactivos dentro del modal (las creds se pegan).
- Rotación/expiración automática de credenciales.
- Feature #2 (config de escucha) — spec aparte.
