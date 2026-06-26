# NVIDIA NIM como proveedor primario de IA — Diseño

> Fecha: 2026-06-26
> Estado: aprobado para plan de implementación
> Contexto: [AI-STRATEGY.md](../../../AI-STRATEGY.md), [PROVIDERS.md](../../../PROVIDERS.md), [ARCHITECTURE.md](../../../ARCHITECTURE.md)

## 1. Objetivo

Hacer de **NVIDIA NIM** (`integrate.api.nvidia.com/v1`, OpenAI-compatible, 121 modelos)
el proveedor **primario** de generación de texto asistida, manteniendo Claude,
Gemini y SiliconFlow como **fallback**. Exponer a los operadores un selector de
modelo **por capacidad** y **por tier (rápido / profundo)** para alimentar las
features de IA existentes (no se agrega un playground nuevo).

Decisiones de scope (confirmadas con el usuario):

| Decisión | Elección |
|---|---|
| Objetivo | Backend swap **y** selector visible para el operador |
| Proveedores viejos | NVIDIA primario, **se conservan como fallback** |
| Valor al usuario | Potenciar features existentes (sin playground) |
| Granularidad del picker | **Tiered: modelo rápido vs profundo** |
| Set de modelos | **Curado por capacidad** |
| Alcance del refactor | **Full: los 4 call sites pasan por el dispatcher** |
| Manejo de la key | **Env var global + override por proyecto** en Conectores |

## 2. Estado actual (verificado en código)

- **No hay router central de IA.** Cada call site arma su propia cadena inline
  de proveedores con `try`/fallback. Ejemplo real en `lib/media-gen.ts`:
  Gemini → SiliconFlow.
- Clientes de texto, los tres con la misma forma
  `{ apiKey, system, prompt, model, maxTokens } → texto`:
  - `lib/anthropic.ts` → `generateText()` (Claude Messages API).
  - `lib/gemini.ts` → `generateGeminiText()` (+ `analyzeImagesGemini()` visión,
    `generateGeminiImage()` imagen).
  - `lib/siliconflow.ts` → `siliconflowChat()` (**OpenAI-compatible**) +
    `siliconflowImage()` + video submit/status.
- El conector `lib/connectors/claude-api.ts` es **mock**: aun con key, `analyze()`
  corre heurística local. La llamada real a Claude nunca se implementó. Las
  llamadas pagas reales viven en los 3 clientes de arriba, invocadas desde:
  `app/(dashboard)/publicaciones/actions.ts`, `app/(dashboard)/templates/actions.ts`,
  `app/(dashboard)/segmentos/actions.ts`, `lib/ad-proposals.ts`, `lib/media-gen.ts`.
- **Verificado** contra la API de NVIDIA con la key del usuario:
  - `GET /v1/models` → 200, 121 modelos. Cada objeto trae solo
    `{ id, object, created, owned_by }` — **sin metadata de capacidad**.
  - `POST /v1/chat/completions` (`meta/llama-3.3-70b-instruct`) → 200, forma
    OpenAI estándar: `choices[0].message.content`, `usage.total_tokens`.
    Idéntica a SiliconFlow.

## 3. Arquitectura propuesta

Encaja en el modelo de conectores existente (`ConnectorCategory = "analysis"`).
El core no se toca; la IA sigue siendo una capa de asistencia con fallback a
heurística local (principio "nunca rompe" de AI-STRATEGY.md).

```
features (templates, segmentos, ad-studio, publicaciones)
        │  generateAssist({ system, prompt, tier })
        ▼
lib/ai/generate.ts  ── dispatcher único ──────────────────────────
   orden de proveedor: NVIDIA → Gemini → Claude → SiliconFlow → heurística
   resuelve modelo según tier (fast|deep) desde la config del conector
   trackea tokens vía lib/quota.ts (unidad "tokens", por project_id)
        │
        ├── lib/nvidia.ts          nvidiaChat() + listNvidiaModels()
        ├── lib/gemini.ts          (existente)
        ├── lib/anthropic.ts       (existente)
        └── lib/siliconflow.ts     (existente)

lib/ai/nvidia-models.ts  ── clasificador estático id → capacidad
lib/connectors/nvidia.ts ── conector "analysis", config + quota
```

### 3.1 `lib/nvidia.ts` — cliente OpenAI-compatible

Casi-clon de `siliconflowChat`, distinto `BASE` y auth Bearer.

```ts
const BASE = (process.env.NVIDIA_BASE || "https://integrate.api.nvidia.com/v1").replace(/\/$/, "");

export async function nvidiaChat({ apiKey, model, system, prompt, maxTokens = 2048 }: {
  apiKey: string; model: string; system?: string; prompt: string; maxTokens?: number;
}): Promise<{ text: string; inputTokens: number; outputTokens: number }>;

// Cacheado (revalida cada ~6h). Devuelve los ids crudos de /v1/models.
export async function listNvidiaModels(apiKey: string): Promise<string[]>;
```

- Parsea `choices[0].message.content` y `usage.{prompt_tokens,completion_tokens}`.
- Errores: mismo patrón que los otros clientes (extrae `error.message`, fallback
  a `HTTP <status>`).

### 3.2 `lib/ai/nvidia-models.ts` — clasificador por capacidad

La API no tipa los modelos, así que mantenemos un clasificador estático.

```ts
export type ModelCapability =
  | "text" | "code" | "vision" | "embedding" | "rerank" | "safety" | "translate" | "other";

export interface NvidiaModel { id: string; capability: ModelCapability; label: string; }

// Clasifica por patrones de id/owned_by (ej: /embed|nv-embed|bge|arctic-embed/ → embedding;
// /vision|vila|neva|deplot|fuyu|kosmos|nemoretriever-parse|nemotron-parse|-vl-/ → vision;
// /guard|content-safety|topic-control|reward/ → safety;
// /code|codestral|codegemma|starcoder|granite-.*code/ → code;
// /riva-translate/ → translate; resto instruct/chat → text; desconocido → other).
export function classify(id: string): ModelCapability;

// Live = /v1/models ∩ clasificador. Ids nuevos aparecen; "other" se ocultan del picker.
export async function curatedModels(apiKey: string): Promise<NvidiaModel[]>;
```

- **Picker muestra**: `text`, `code`, `vision`. Oculta `embedding`, `rerank`,
  `safety`, `other`.
- **Embeddings**: se auto-seleccionan para clustering/dedupe (fase futura de
  AI-STRATEGY), no van al picker de chat.
- Modelo desconocido → `other` → oculto. Nunca se ofrece un modelo no-chat para
  una tarea de chat (evita el modo de fallo de "expose all 121 raw").

### 3.3 `lib/ai/generate.ts` — dispatcher único

```ts
export type AssistTier = "fast" | "deep";

export async function generateAssist({ system, prompt, tier = "fast", maxTokens }: {
  system?: string; prompt: string; tier?: AssistTier; maxTokens?: number;
}): Promise<{ text: string; provider: string; model: string }>;
```

- **Orden de proveedor**: NVIDIA → Gemini → Claude → SiliconFlow → heurística local.
  Cada uno se intenta solo si su conector tiene key; ante error transitorio cae al
  siguiente (mismo espíritu que las cadenas inline actuales, ahora centralizado).
- **Modelo por tier**: lee `NVIDIA_MODEL_FAST` / `NVIDIA_MODEL_DEEP` de la config
  del conector NVIDIA (o sus defaults). Para los proveedores de fallback usa el
  modelo configurado de cada uno.
- **Tokens**: chequea cuota **antes** (igual que envíos) e incrementa después vía
  `incrementUsage("nvidia", tokens, projectId)`.
- **Privacidad**: el dispatcher no anonimiza por sí mismo; los callers siguen
  mandando solo lo permitido (placeholders de plantilla, esquema de campos, texto
  público). La regla de §4 se mantiene en los call sites.

### 3.4 `lib/connectors/nvidia.ts` — conector `analysis`

```ts
id: "nvidia", name: "NVIDIA NIM", vendor: "NVIDIA", category: "analysis"
configSchema:
  - NVIDIA_API_KEY     (secret, required)
  - NVIDIA_MODEL_FAST  (text, optional, default meta/llama-3.3-70b-instruct)
  - NVIDIA_MODEL_DEEP  (text, optional, default nvidia/llama-3.1-nemotron-ultra-253b-v1)
test():     hace un chat completion mínimo y reporta ok/modelo.
getStatus(): quota_exhausted si usage ≥ TOKEN_CAP, si no enabled.
getQuota():  tokens, period month, como claude-api.
```

Registrado con una línea en `lib/connectors/registry.ts`.

### 3.5 UI — selector tiered en el modal de Conectores

Dos `<select>` en el form de config del conector NVIDIA: **Modelo rápido** y
**Modelo profundo**, poblados desde `curatedModels()` agrupados por capacidad
(`text`/`code`/`vision`). Defaults preseleccionados. Si no hay key todavía, el
form acepta texto libre (las opciones aparecen tras guardar la key).

### 3.6 Refactor de los 4 call sites (full)

`templates/actions.ts`, `segmentos/actions.ts`, `publicaciones/actions.ts`,
`ad-proposals.ts`: reemplazar sus cadenas inline de proveedor por
`generateAssist({ system, prompt, tier })`. Elegir `tier` por tarea:
redacción/segmento → `fast`; resúmenes/análisis largos → `deep`.
`lib/media-gen.ts` **no se toca** (es imagen/video, ver §5).

## 4. Privacidad y gobernanza (sin cambios de regla)

NVIDIA es **un tercero más**, así que aplica idéntico el régimen de AI-STRATEGY.md §4:

- DNI, nombre, teléfono, email, dirección **nunca** salen a la API.
- Respuestas abiertas y features de contacto se anonimizan antes de salir.
- Toda salida de IA es borrador editable; la IA nunca ejecuta una acción.
- Las generaciones que afectan decisiones se loguean (`lib/audit.ts`): hash de
  input, modelo, tokens, usuario que confirmó.
- Se documenta NVIDIA como proveedor `analysis` en AI-STRATEGY.md §3 y PROVIDERS.md.

## 5. Fuera de alcance (YAGNI)

- **Imagen / video**: el endpoint de chat no hace text-to-image general
  (`diffusiongemma` usa otra API). `lib/media-gen.ts` sigue con Gemini + SiliconFlow.
- **Playground nuevo**: no se crea página de prompteo libre. Los modelos potencian
  las features existentes.
- **Borrar Claude/Gemini/SiliconFlow**: se conservan como fallback.
- **Embeddings / clustering semántico**: el clasificador los reconoce y reserva,
  pero su cableado es fase futura (AI-F4 de AI-STRATEGY.md), no parte de este spec.

## 6. Manejo de la key

- `NVIDIA_API_KEY` como default global en `.env` (gitignored; agregar a
  `.env.example` sin valor). Override por proyecto en Conectores (mismo patrón que
  los demás conectores, vía `lib/connectors/config.ts`).
- **Rotar la key filtrada**: la key se pegó en texto plano en el chat; rotarla en
  build.nvidia.com antes de productivizar y cargar la nueva solo por env/Conectores.

## 7. Defaults de modelo (verificados presentes en `/v1/models`)

| Rol | Modelo | Por qué |
|---|---|---|
| Fast (default) | `meta/llama-3.3-70b-instruct` | Rápido, barato, buen español, verificado 200 |
| Deep | `nvidia/llama-3.1-nemotron-ultra-253b-v1` | Razonamiento fuerte para resúmenes/análisis |
| Deep (alt) | `qwen/qwen3.5-397b-a17b` | Alternativa MoE grande |
| Visión | `meta/llama-3.2-90b-vision-instruct` | Para análisis de imágenes de referencia |
| Embeddings (futuro) | `nvidia/nv-embedqa-e5-v5` / `baai/bge-m3` | Clustering/dedupe AI-F4 |

## 8. Testing

- **`lib/nvidia.ts`**: unit con fetch mockeado — parseo OK, manejo de error,
  cache de modelos.
- **`lib/ai/nvidia-models.ts`**: unit del clasificador sobre una muestra fija de
  ids reales (text/vision/embedding/safety/code) → capacidad esperada; id
  desconocido → `other`.
- **`lib/ai/generate.ts`**: unit del orden de fallback (sin key NVIDIA → cae a
  Gemini; sin ninguna key → heurística), y del ruteo de tier → modelo.
- **Conector `nvidia`**: `test()` con fetch mock (ok / error / sin key).
- **Regresión**: los call sites refactorizados siguen devolviendo borrador
  editable; sin keys, degradan a heurística (no rompen) — cubrir con un test por
  call site o uno de integración del dispatcher.

## 9. Plan de entrega (orden sugerido)

1. `lib/nvidia.ts` + tests.
2. `lib/ai/nvidia-models.ts` clasificador + tests.
3. `lib/connectors/nvidia.ts` + registry + tests.
4. `lib/ai/generate.ts` dispatcher + tests.
5. Refactor de los 4 call sites a `generateAssist`.
6. UI: selector tiered en el modal de Conectores.
7. Docs: AI-STRATEGY.md §3 + PROVIDERS.md (NVIDIA como `analysis` primario);
   `.env.example`.
