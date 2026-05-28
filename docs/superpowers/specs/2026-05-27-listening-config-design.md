# Diseño — Configuración de escucha (feature #2)

- **Fecha**: 2026-05-27
- **Estado**: aprobado (brainstorming)
- **Depende de**: fundación Supabase (tabla `listening_config`, single row) ya en `main`.

## 1. Problema
`runListening()` corre hoy con `keywords: []` fijo. Se quiere configurar la
escucha desde `/escucha`: una **zona geográfica** (texto libre + país + radio),
**keywords**, y qué **fuentes** (conectores de listening) usar — para captar el
buzz de una zona. Esa config alimenta el filtro de las APIs.

## 2. Decisiones (brainstorming)
| Tema | Decisión |
|---|---|
| Geo | Texto libre `zona` + `pais` (default AR) + `radioKm` opcional. Cada conector la traduce como puede. |
| Config | **Una sola, global** (`listening_config` id=1). |
| Fuentes | Toggles por conector de listening (gdelt / x-api / reddit-api). Vacío → todos. |
| Mapeo geo | GDELT: `sourcecountry`+location (real). X: place/keyword. Reddit: keyword (sin geo). En **mock**, los conectores filtran por keywords; la geo se pasa pero el dataset mock no la simula. |
| Baseline | La detección de tema emergente (recent-vs-baseline) **no cambia**; la config solo alimenta el query. |

## 3. Componentes
- **`lib/listening-config.ts`**: `getListeningConfig(): Promise<ListeningConfig>` (lee `listening_config` id=1 vía Supabase directo; sin Supabase → default), `saveListeningConfig(cfg): Promise<void>`.
  ```ts
  export interface ListeningConfig {
    zona: string; pais: string; radioKm: number | null;
    keywords: string[]; fuentes: string[];
  }
  ```
  Default: `{ zona: "", pais: "AR", radioKm: null, keywords: [], fuentes: [] }`.
- **`ListenQuery`** (en `lib/connectors/types.ts`) suma `zona?`, `pais?`, `radioKm?` (además de `keywords`, `geo?`, `since?` que ya tiene).
- **`lib/listening.ts`** `runListening()`: lee la config, arma el `ListenQuery`, corre solo los conectores cuyo id está en `fuentes` (si `fuentes` vacío → todos), pasa el query a `fetch()`.
- **UI `/escucha`**: sección "Configurar escucha" (form) → server action `guardarEscucha` → `saveListeningConfig`. Muestra la config activa (zona, país, keywords, fuentes).

## 4. Flujo
`/escucha` → form guarda `listening_config` → `runListening()` lee la config →
arma query (zona/pais/radio/keywords) → fetch por fuente activa → coding/temas
(igual que hoy).

## 5. Seguridad / degradación
- Sin secrets → sin encriptación.
- Sin Supabase: `getListeningConfig` devuelve el default; `saveListeningConfig` avisa (no rompe). `runListening` con config default (keywords vacías) se comporta como hoy (trae todo el mock).

## 6. Testing
- `getListeningConfig` default sin Supabase; `runListening` filtra por `fuentes` y pasa keywords al query. Regresión: sin config, `/escucha` sigue mostrando temas (mock).

## 7. Fuera de alcance
- Implementar el `fetch` real de GDELT/X/Reddit (siguen mock; P2 en STABILIZATION).
- Múltiples configs nombradas; subreddits explícitos de Reddit; ventana de baseline configurable.
