# Escucha: Escenario por canal + audio y video — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/escucha` pasa a 3 tabs (Escenario · Monitorear · Informe); Escenario agrupa lo que se escucha por canal con Guardar por bloque y propuesta de IA aplicable por bloque; radio y streaming (YouTube, Kick) comparten el modelo `AudioProgram` y el worker de grabación/transcripción.

**Architecture:** `lib/audio-programs.ts` generaliza `RadioProgram` (`kind`, franja opcional, `nota`) sobre la misma columna jsonb. `ScenarioProposal` gana `audio` y `applied` por bloque. Las acciones por bloque leen la config vigente, pisan solo sus campos y marcan `applied.<bloque>`. La UI se reparte en componentes `bloque-*.tsx` compuestos por `escenario-tab.tsx`; `config-form.tsx` y `monitor-editor.tsx` desaparecen. El worker resuelve la URL de vivo con `yt-dlp` para youtube/kick y reporta `no_live`.

**Tech Stack:** Next.js 15 App Router (server actions), TypeScript, Supabase (`@/lib/db/supabase`), zod, vitest, GitHub Actions (`tools/radio-pull.mjs`, ffmpeg, yt-dlp).

**Spec:** `docs/superpowers/specs/2026-08-25-escucha-escenario-audio-video-design.md`

---

## Convenciones

- Tests `npx vitest run <archivo>`; suite `npx vitest run`; tipos `npx tsc --noEmit`; lint `npx eslint <archivos>`.
- Componentes: vitest solo incluye `tests/**/*.test.ts`; los componentes no se testean en unit (política del repo). Lógica que quieras testear va a `lib/`.
- Persistencia sin DDL: `conector_config` filas sintéticas vía `upsertConectorConfig` (`@/lib/db/conector-config`). `listening_config` tiene PK `project_id` y se guarda entera con `saveListeningConfig(projectId, cfg)`.
- Server actions en `app/(dashboard)/escucha/actions.ts`: `requireMember("editor")`, `revalidatePath("/escucha")`, `redirect("/escucha?tab=…&…")`.
- Commits: conventional, cuerpo en español, trailers
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` y
  `Claude-Session: https://claude.ai/code/session_01XW7g7dSqmfsaVwruSZ87N8`.
- **Desviación aceptada respecto del spec:** el editor de Audio y video reutiliza el editor estructurado existente `components/escucha/radio-config.tsx` (cards con días/horas) sumándole `kind` y `nota`, en vez de un editor por líneas. Menos riesgo y mejor UX; el formato de línea del spec no se implementa.

## File Structure

| Archivo | Acción | Responsabilidad |
| --- | --- | --- |
| `lib/audio-programs.ts` | crear | `AudioKind`, `AudioProgram`, `normalizeAudioProgram`, `hasValidSlot`, `isValidUrlFor`, `KIND_LABEL` |
| `lib/radio.ts` | modificar | `RadioProgram = AudioProgram` (re-export); helpers de franja ignoran franja vacía (ya lo hacen vía NaN) |
| `lib/schemas.ts` | modificar | `RadioProgramSchema` → `AudioProgramSchema` (kind, start/end vacíos, nota, url por kind); `GuardarEscuchaSchema` lo usa |
| `lib/listening-config.ts` | modificar | `radio_streams` → `normalizeAudioProgram` al leer |
| `lib/client-brief.ts` | modificar | `ScenarioProposal.audio`, `applied` por bloque, lectura tolerante, `appliedCount` |
| `lib/scenario-ai.ts` | modificar | `audio` en esquema/prompt; programa inválido descartado individualmente |
| `lib/scenario-examples.ts` | modificar | programa de ejemplo en FERRO |
| `lib/escucha-tab.ts` | crear | `resolveTab(param)` puro |
| `lib/radio-runs.ts` | modificar | doc de `status` incluye `no_live` (sin cambio de tipo) |
| `app/(dashboard)/escucha/actions.ts` | modificar | `guardarTerritorio`, `guardarPrensa`, `guardarRedes`, `guardarAudio`, `guardarReglas`; `guardarEscucha`/`guardarMonitor` eliminados |
| `app/(dashboard)/escucha/page.tsx` | modificar | tabs + redirect + carga por tab |
| `components/escucha/radio-config.tsx` | modificar | `kind` select + `nota`; nombre del campo oculto pasa a `audioPrograms` |
| `components/escucha/bloque.tsx` | crear | wrapper `<details>` con summary/badge/FormStatus común |
| `components/escucha/bloque-territorio.tsx` | crear | zona/país/mapa/keywords |
| `components/escucha/bloque-prensa.tsx` | crear | medios RSS + toggles Google News/GDELT + SourceRows |
| `components/escucha/bloque-redes.tsx` | crear | FB/Telegram/X + toggle X + cuentas del plan + búsquedas A/B |
| `components/escucha/bloque-audio.tsx` | crear | RadioConfig + toggle Radio + RadioAgenda |
| `components/escucha/bloque-reglas.tsx` | crear | entidades, calendario, no repetir |
| `components/escucha/source-rows.tsx` | crear | `SourceRows`, `AutoRow`, `timeAgo` extraídos de config-form |
| `components/escucha/escenario-tab.tsx` | crear | compone brief + actores + 6 bloques |
| `components/escucha/brief-panel.tsx` | modificar | banner "aplicada N/4 (faltan …)" |
| `components/escucha/informe-panel.tsx` | modificar | quita brief/actores/escenario |
| `components/escucha/al-aire.tsx` | crear | carril "Al aire" |
| `components/escucha/monitor.tsx` | modificar | renderiza `AlAire` |
| `components/escucha/config-form.tsx`, `monitor-editor.tsx` | eliminar | repartidos |
| `app/api/cron/radio-config/route.ts` | modificar | expone `kind`; filtra `hasValidSlot` |
| `lib/schemas.ts` (`RadioIngestSchema`) | modificar | `status: "no_live"` opcional |
| `app/api/cron/radio-ingest/route.ts` | modificar | `no_live` → `markRunDone(status:"no_live")` |
| `tools/stream-url.mjs` | crear | `resolveStreamUrl(program, exec)` puro-ish |
| `tools/radio-pull.mjs` | modificar | usa `resolveStreamUrl`, reporta `no_live` |
| `.github/workflows/radio-pull.yml` | modificar | `pip install yt-dlp` |
| tests | crear/modificar | `audio-programs`, `client-brief`, `scenario-ai`, `escucha-tab`, `escucha-bloques-actions`, `stream-url` |

---

### Task 1: `lib/audio-programs.ts`, esquema y lectura de config

**Files:**
- Create: `lib/audio-programs.ts`
- Modify: `lib/radio.ts` (interfaz `RadioProgram`), `lib/schemas.ts:129-138`, `lib/listening-config.ts` (import + mapeo `radio_streams`)
- Test: `tests/audio-programs.test.ts`

- [ ] **Step 1: Test que falla**

```ts
// tests/audio-programs.test.ts
import { describe, it, expect } from "vitest";
import {
  normalizeAudioProgram,
  hasValidSlot,
  isValidUrlFor,
  type AudioProgram,
} from "@/lib/audio-programs";
import { programsToRecord, nextOccurrences } from "@/lib/radio";
import { AudioProgramSchema } from "@/lib/schemas";

const base: AudioProgram = {
  kind: "radio", url: "https://stream.lu30.com/live.mp3", station: "LU30", programa: "La mañana",
  days: [1, 2, 3, 4, 5], start: "08:00", end: "10:00",
};

describe("audio-programs", () => {
  it("normaliza filas viejas sin kind como radio y recorta strings", () => {
    const p = normalizeAudioProgram({ url: " https://x/y ", station: " R ", programa: "P", days: [1], start: "08:00", end: "09:00" });
    expect(p.kind).toBe("radio");
    expect(p.url).toBe("https://x/y");
    expect(p.station).toBe("R");
  });

  it("hasValidSlot: franja vacía o invertida no es válida", () => {
    expect(hasValidSlot(base)).toBe(true);
    expect(hasValidSlot({ ...base, start: "", end: "" })).toBe(false);
    expect(hasValidSlot({ ...base, start: "10:00", end: "08:00" })).toBe(false);
    expect(hasValidSlot({ ...base, days: [] })).toBe(false);
  });

  it("isValidUrlFor por kind", () => {
    expect(isValidUrlFor("radio", "https://stream.lu30.com/live.mp3")).toBe(true);
    expect(isValidUrlFor("radio", "http://127.0.0.1/x")).toBe(false);
    expect(isValidUrlFor("youtube", "https://www.youtube.com/@canal/live")).toBe(true);
    expect(isValidUrlFor("youtube", "https://kick.com/canal")).toBe(false);
    expect(isValidUrlFor("kick", "https://kick.com/canal")).toBe(true);
    expect(isValidUrlFor("kick", "https://youtu.be/abc")).toBe(false);
  });

  it("los helpers de franja ignoran programas sin franja", () => {
    const sinFranja = { ...base, start: "", end: "" };
    expect(programsToRecord([sinFranja], 1, 8 * 60, 15)).toEqual([]);
    expect(nextOccurrences([sinFranja], Date.UTC(2026, 7, 24, 12), 2, -180)).toEqual([]);
  });

  it("AudioProgramSchema acepta franja vacía, kind default radio y nota; rechaza url de otro kind", () => {
    const ok = AudioProgramSchema.safeParse({ url: "https://kick.com/canal", station: "K", programa: "Vivo", days: [1], start: "", end: "", kind: "kick", nota: "verificar url" });
    expect(ok.success).toBe(true);
    const legacy = AudioProgramSchema.safeParse({ url: "https://stream/x", station: "R", programa: "P", days: [1], start: "08:00", end: "09:00" });
    expect(legacy.success && legacy.data.kind).toBe("radio");
    const bad = AudioProgramSchema.safeParse({ ...base, kind: "youtube", url: "https://kick.com/canal" });
    expect(bad.success).toBe(false);
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run tests/audio-programs.test.ts` — Expected: FAIL (`Cannot find module '@/lib/audio-programs'`).

- [ ] **Step 3: Crear `lib/audio-programs.ts`**

```ts
// Programas de audio/video a grabar y transcribir: radio (stream Icecast),
// YouTube y Kick (vivos resueltos con yt-dlp en el worker). Un solo modelo:
// franja horaria + fuente. Misma columna listening_config.radio_streams;
// filas viejas sin `kind` son radio.
import { hhmmToMinutes, isPublicHttpUrl } from "@/lib/radio";

export type AudioKind = "radio" | "youtube" | "kick";

export interface AudioProgram {
  kind: AudioKind;
  url: string; // radio: stream · youtube: canal o /live · kick: canal
  station: string; // radio o canal (→ source / author)
  programa: string;
  days: number[]; // 0-6 (Dom..Sáb)
  start: string; // "HH:MM"; "" = franja incompleta (no se graba)
  end: string;
  nota?: string; // "verificar url" / "completar franja" cuando lo propone la IA
}

export const KIND_LABEL: Record<AudioKind, string> = {
  radio: "Radio",
  youtube: "YouTube",
  kick: "Kick",
};

const KINDS: AudioKind[] = ["radio", "youtube", "kick"];

export function normalizeAudioProgram(raw: Partial<AudioProgram>): AudioProgram {
  const kind = KINDS.includes(raw.kind as AudioKind) ? (raw.kind as AudioKind) : "radio";
  return {
    kind,
    url: (raw.url ?? "").trim(),
    station: (raw.station ?? "").trim(),
    programa: (raw.programa ?? "").trim(),
    days: Array.isArray(raw.days) ? raw.days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6) : [],
    start: (raw.start ?? "").trim(),
    end: (raw.end ?? "").trim(),
    ...(raw.nota?.trim() ? { nota: raw.nota.trim() } : {}),
  };
}

// Franja completa y coherente: días, HH:MM válidos, start < end.
export function hasValidSlot(p: Pick<AudioProgram, "days" | "start" | "end">): boolean {
  if (p.days.length === 0) return false;
  const s = hhmmToMinutes(p.start);
  const e = hhmmToMinutes(p.end);
  return !Number.isNaN(s) && !Number.isNaN(e) && e > s;
}

// URL admisible por plataforma. Radio: cualquier http(s) público (va a ffmpeg).
// YouTube/Kick: host de la plataforma (yt-dlp resuelve el vivo).
export function isValidUrlFor(kind: AudioKind, url: string): boolean {
  if (!isPublicHttpUrl(url)) return false;
  if (kind === "radio") return true;
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return false;
  }
  if (kind === "youtube") return host === "youtube.com" || host === "m.youtube.com" || host === "youtu.be";
  return host === "kick.com";
}
```

- [ ] **Step 4: `lib/radio.ts` — alias**

Reemplazar la `export interface RadioProgram { … }` por:

```ts
// El modelo pasó a lib/audio-programs (radio + YouTube + Kick). Se mantiene el
// nombre para el worker y los endpoints que ya lo importan.
import type { AudioProgram } from "@/lib/audio-programs";
export type RadioProgram = AudioProgram;
```

(No hay ciclo: `audio-programs` importa solo funciones de `radio.ts`, y `radio.ts` importa solo el tipo — `import type` se borra en runtime.)

- [ ] **Step 5: `lib/schemas.ts` — `AudioProgramSchema`**

Reemplazar `RadioProgramSchema` (líneas 129-138) por:

```ts
export const AudioKindSchema = z.enum(["radio", "youtube", "kick"]);

// Radio + YouTube + Kick (lib/audio-programs). start/end vacíos = franja
// incompleta: se guarda pero no se graba (hasValidSlot). La url se valida
// según la plataforma (radio → ffmpeg; youtube/kick → yt-dlp).
export const AudioProgramSchema = z
  .object({
    kind: AudioKindSchema.default("radio"),
    url: z.string().trim().url(),
    station: z.string().trim().min(1).max(80),
    programa: z.string().trim().min(1).max(120),
    days: z.array(z.number().int().min(0).max(6)).max(7).default([]),
    start: z.string().trim().regex(/^(\d{1,2}:\d{2})?$/, "Hora HH:MM"),
    end: z.string().trim().regex(/^(\d{1,2}:\d{2})?$/, "Hora HH:MM"),
    nota: z.string().trim().max(120).optional(),
  })
  .refine((p) => isValidUrlFor(p.kind, p.url), {
    message: "URL inválida para la plataforma (radio: stream http(s) público; youtube/kick: URL del canal)",
    path: ["url"],
  });
// Compat con imports existentes.
export const RadioProgramSchema = AudioProgramSchema;
```

Agregar el import `import { isValidUrlFor } from "@/lib/audio-programs";` y quitar `isPublicHttpUrl` del import si queda sin uso. En `GuardarEscuchaSchema` (línea ~166) `radioStreams: z.array(AudioProgramSchema).max(30).default([])`.

- [ ] **Step 6: `lib/listening-config.ts` — normalizar al leer**

Cambiar `import type { RadioProgram } from "@/lib/radio";` por `import { normalizeAudioProgram, type AudioProgram } from "@/lib/audio-programs";`, el tipo del campo a `radioStreams: AudioProgram[]` (y la fila `radio_streams: AudioProgram[] | null`), y el mapeo de lectura a `radioStreams: (r.radio_streams ?? []).map(normalizeAudioProgram),`.

- [ ] **Step 7: Verificar**

Run: `npx vitest run tests/audio-programs.test.ts tests/radio.test.ts && npx tsc --noEmit && npx eslint lib/audio-programs.ts lib/radio.ts lib/schemas.ts lib/listening-config.ts`
Expected: PASS; `tests/radio.test.ts` sigue verde; sin errores.

- [ ] **Step 8: Commit**

```bash
git add lib/audio-programs.ts lib/radio.ts lib/schemas.ts lib/listening-config.ts tests/audio-programs.test.ts
git commit -m "feat(escucha): AudioProgram (radio, youtube, kick) sobre radio_streams

kind con default radio para filas viejas, franja vacía admitida (no se
graba), url validada por plataforma, nota para propuestas de IA.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XW7g7dSqmfsaVwruSZ87N8"
```

---

### Task 2: Propuesta con `audio` y `applied` por bloque; IA propone audio

**Files:**
- Modify: `lib/client-brief.ts`, `lib/scenario-ai.ts`, `lib/scenario-examples.ts`, `app/(dashboard)/escucha/actions.ts` (solo los dos usos de `appliedKeywordsAt`/`appliedMonitorAt`, que en Task 3 se reescriben), `components/escucha/brief-panel.tsx`, `components/escucha/monitor-editor.tsx`, `app/(dashboard)/escucha/page.tsx` (`proposedKeywordsFor`)
- Test: `tests/client-brief.test.ts` (agregar), `tests/scenario-ai.test.ts` (agregar)

- [ ] **Step 1: Tests que fallan**

Agregar a `tests/client-brief.test.ts`:

```ts
describe("client-brief · propuesta por bloque", () => {
  it("getClientBrief mapea propuestas viejas (appliedKeywordsAt/appliedMonitorAt) a applied.*", async () => {
    stored = {
      entries: [],
      proposal: {
        at: NOW, briefHash: "h", tipo: "territorial", resumen: "r", keywords: ["k"], searchesA: [], searchesB: [],
        accounts: [], entidades: {}, calendar: [], appliedKeywordsAt: "2026-08-25T01:00:00.000Z", appliedMonitorAt: "2026-08-25T02:00:00.000Z",
      },
    };
    const b = await getClientBrief("p1");
    expect(b.proposal?.applied).toEqual({
      territorio: "2026-08-25T01:00:00.000Z", redes: "2026-08-25T02:00:00.000Z", reglas: "2026-08-25T02:00:00.000Z",
    });
    expect(b.proposal?.audio).toEqual([]);
  });

  it("appliedCount cuenta bloques aplicados de 4 y lista los faltantes", () => {
    const p = { audio: [], keywords: ["k"], accounts: [], searchesA: [], searchesB: [], entidades: {}, calendar: [], applied: { territorio: NOW } } as unknown as import("@/lib/client-brief").ScenarioProposal;
    expect(appliedCount(p)).toEqual({ done: 1, total: 4, faltan: ["redes", "audio", "reglas"] });
  });
});
```

(agregar `appliedCount` al import). Agregar a `tests/scenario-ai.test.ts`, dentro de `describe("parseScenarioJson")`:

```ts
  it("audio: acepta programas, descarta individualmente los inválidos, franja vacía con nota", () => {
    const withAudio = {
      ...VALID,
      audio: [
        { kind: "radio", url: "https://stream.lu30.com/live.mp3", station: "LU30", programa: "La mañana", days: [1, 2, 3, 4, 5], start: "08:00", end: "10:00" },
        { kind: "youtube", url: "https://www.youtube.com/@canalibicuy/live", station: "Canal Ibicuy", programa: "Noticiero", days: [], start: "", end: "" },
        { kind: "threads", url: "https://x/y", station: "X", programa: "Y", days: [], start: "", end: "" },
      ],
    };
    const r = parseScenarioJson(fence(withAudio));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.audio.map((a) => a.kind)).toEqual(["radio", "youtube"]);
    expect(r.data.audio[1].nota).toBe("completar franja");
  });

  it("audio ausente → []", () => {
    const r = parseScenarioJson(fence(VALID));
    expect(r.ok && r.data.audio).toEqual([]);
  });
```

Y en `describe("buildScenarioPrompt")` sumar `expect(prompt).toMatch(/Audio y video/);` (pasar `audio: []` en `current`).

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run tests/client-brief.test.ts tests/scenario-ai.test.ts` — Expected: FAIL (`appliedCount` no existe; `audio` undefined; tipo `current` sin `audio`).

- [ ] **Step 3: `lib/client-brief.ts`**

Reemplazar la interfaz `ScenarioProposal` por:

```ts
import type { AudioProgram } from "@/lib/audio-programs";

export type ProposalBlock = "territorio" | "redes" | "audio" | "reglas";
export const PROPOSAL_BLOCKS: ProposalBlock[] = ["territorio", "redes", "audio", "reglas"];

export interface ScenarioProposal {
  at: string;
  briefHash: string;
  tipo: "electoral" | "territorial";
  resumen: string;
  keywords: string[];
  searchesA: string[];
  searchesB: string[];
  accounts: MonitorAccount[];
  entidades: Record<string, string>;
  calendar: CalendarEvent[];
  audio: AudioProgram[];
  // Fecha en que cada bloque de Escenario aplicó la propuesta con su Guardar.
  applied: Partial<Record<ProposalBlock, string>>;
}

// Bloques aplicados de 4; `faltan` en orden de la UI.
export function appliedCount(p: ScenarioProposal): { done: number; total: number; faltan: ProposalBlock[] } {
  const faltan = PROPOSAL_BLOCKS.filter((b) => !p.applied[b]);
  return { done: PROPOSAL_BLOCKS.length - faltan.length, total: PROPOSAL_BLOCKS.length, faltan };
}

export function isProposalPending(p: ScenarioProposal | undefined): p is ScenarioProposal {
  return Boolean(p) && appliedCount(p as ScenarioProposal).done < PROPOSAL_BLOCKS.length;
}

export function markApplied(p: ScenarioProposal, block: ProposalBlock, at = new Date().toISOString()): ScenarioProposal {
  return p.applied[block] ? p : { ...p, applied: { ...p.applied, [block]: at } };
}
```

En `getClientBrief`, reemplazar `proposal: cfg.proposal,` por `proposal: cfg.proposal ? normalizeProposal(cfg.proposal) : undefined,` y agregar:

```ts
// Propuestas guardadas antes de "applied por bloque" traían
// appliedKeywordsAt (→ territorio) y appliedMonitorAt (→ redes + reglas, que
// se guardaban juntas). audio no existía.
function normalizeProposal(raw: Partial<ScenarioProposal> & { appliedKeywordsAt?: string; appliedMonitorAt?: string }): ScenarioProposal {
  const applied: Partial<Record<ProposalBlock, string>> = { ...(raw.applied ?? {}) };
  if (raw.appliedKeywordsAt && !applied.territorio) applied.territorio = raw.appliedKeywordsAt;
  if (raw.appliedMonitorAt) {
    applied.redes ??= raw.appliedMonitorAt;
    applied.reglas ??= raw.appliedMonitorAt;
  }
  return {
    at: raw.at ?? "",
    briefHash: raw.briefHash ?? "",
    tipo: raw.tipo ?? "territorial",
    resumen: raw.resumen ?? "",
    keywords: raw.keywords ?? [],
    searchesA: raw.searchesA ?? [],
    searchesB: raw.searchesB ?? [],
    accounts: raw.accounts ?? [],
    entidades: raw.entidades ?? {},
    calendar: raw.calendar ?? [],
    audio: raw.audio ?? [],
    applied,
  };
}
```

- [ ] **Step 4: `lib/scenario-ai.ts`**

Agregar al esquema (antes de `ScenarioSchema`):

```ts
import { normalizeAudioProgram, isValidUrlFor, type AudioProgram } from "@/lib/audio-programs";

const AudioItemSchema = z.object({
  kind: z.enum(["radio", "youtube", "kick"]),
  url: z.string().min(1),
  station: z.string().min(1),
  programa: z.string().min(1),
  days: z.array(z.number().int().min(0).max(6)).default([]),
  start: z.string().default(""),
  end: z.string().default(""),
  nota: z.string().optional(),
});
```

En `ScenarioSchema` agregar el campo (dentro del `z.object`, antes del `.refine`):

```ts
    // Programas inválidos se descartan uno a uno: no tiran la propuesta.
    audio: z
      .array(z.unknown())
      .default([])
      .transform((arr) =>
        arr.flatMap((raw): AudioProgram[] => {
          const r = AudioItemSchema.safeParse(raw);
          if (!r.success || !isValidUrlFor(r.data.kind, r.data.url)) return [];
          const p = normalizeAudioProgram(r.data);
          const complete = p.days.length > 0 && p.start && p.end;
          return [complete ? p : { ...p, nota: p.nota || "completar franja" }];
        }),
      ),
```

`CurrentScenario` suma `audio: AudioProgram[]`. En `buildScenarioPrompt` agregar, después del bloque "Escenario vigente":

```
## Audio y video vigente (radio / YouTube / Kick que ya se graban)
\`\`\`json
${JSON.stringify(input.current.audio, null, 2)}
\`\`\`
```

y en "Reglas de salida" la línea:

```
- audio: solo radios o canales de YouTube/Kick que el brief o el vigente nombren. kind según la plataforma. Si no conocés la franja, days [] y start/end "" con "nota": "completar franja". Nunca inventes URLs de stream: si no la sabés, poné la URL del canal y "nota": "verificar url".
```

y en el esquema JSON del prompt: `"audio": [{ "kind": "radio|youtube|kick", "url": "", "station": "", "programa": "", "days": [], "start": "HH:MM", "end": "HH:MM", "nota": "" }]`.

En `proposeScenario`: `current` suma `audio: cfg.radioStreams,` y el `proposal` se construye con `applied: {}`:

```ts
  const proposal: ScenarioProposal = {
    at: new Date().toISOString(),
    briefHash: briefHash(brief),
    ...parsed.data,
    applied: {},
  };
```

- [ ] **Step 5: `lib/scenario-examples.ts`** — en `FERRO_EXAMPLE_JSON` agregar:

```ts
  audio: [
    { kind: "radio", url: "https://stream.radiodelclub.com.ar/live", station: "Radio del Club", programa: "La voz verdolaga", days: [1, 3, 5], start: "19:00", end: "20:00", nota: "verificar url" },
  ],
```

y una línea al brief de ejemplo: `[2026-08-12 · operador] Los lunes, miércoles y viernes de 19 a 20 sale "La voz verdolaga" por Radio del Club; conviene grabarlo.`

- [ ] **Step 6: Reemplazar usos viejos** (para que compile; Task 3/4 los rehacen)

- `actions.ts`: en `guardarEscucha` cambiar el bloque `appliedKeywordsAt` por `if (brief.proposal && !brief.proposal.applied.territorio) await saveClientBrief(projectId, { ...brief, proposal: markApplied(brief.proposal, "territorio") });` y en `guardarMonitor` lo mismo con `"redes"` y luego `"reglas"` (`markApplied(markApplied(p, "redes"), "reglas")`). Importar `markApplied`.
- `brief-panel.tsx`: `pendiente = isProposalPending(p)`; `parcial = p && appliedCount(p).done > 0`; el párrafo de conteo pasa a `{`Aplicada ${appliedCount(p).done}/${appliedCount(p).total}`}{faltan.length ? ` · faltan: ${faltan.join(", ")}` : ""}` (calcular `const { faltan } = p ? appliedCount(p) : { faltan: [] }`). Importar `appliedCount`, `isProposalPending`.
- `monitor-editor.tsx`: `const p = proposal && !proposal.applied.redes ? proposal : undefined;`
- `page.tsx`: `proposedKeywordsFor` → `proposal && !proposal.applied.territorio ? proposal.keywords : undefined`.

- [ ] **Step 7: Verificar**

Run: `npx vitest run tests/client-brief.test.ts tests/scenario-ai.test.ts tests/escucha-brief-actions.test.ts && npx tsc --noEmit && npx eslint lib/client-brief.ts lib/scenario-ai.ts lib/scenario-examples.ts components/escucha/brief-panel.tsx components/escucha/monitor-editor.tsx "app/(dashboard)/escucha/actions.ts" "app/(dashboard)/escucha/page.tsx"`
Expected: PASS; sin errores. Si `tests/escucha-brief-actions.test.ts` rompe por el shape de `brief`, agregar `proposal: undefined` al mock — no debería.

- [ ] **Step 8: Commit**

```bash
git add lib/client-brief.ts lib/scenario-ai.ts lib/scenario-examples.ts components/escucha/brief-panel.tsx components/escucha/monitor-editor.tsx "app/(dashboard)/escucha/actions.ts" "app/(dashboard)/escucha/page.tsx" tests/client-brief.test.ts tests/scenario-ai.test.ts
git commit -m "feat(escucha): la propuesta de IA incluye audio y se aplica por bloque

applied {territorio, redes, audio, reglas} reemplaza appliedKeywordsAt /
appliedMonitorAt (lectura tolerante de propuestas viejas). La IA propone
programas de radio/YouTube/Kick que el brief nombre, sin inventar franjas.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XW7g7dSqmfsaVwruSZ87N8"
```

---

### Task 3: Acciones por bloque

**Files:**
- Modify: `app/(dashboard)/escucha/actions.ts`
- Create: `lib/escucha-tab.ts`
- Test: `tests/escucha-bloques-actions.test.ts`, `tests/escucha-tab.test.ts`

- [ ] **Step 1: Tests que fallan**

```ts
// tests/escucha-tab.test.ts
import { describe, it, expect } from "vitest";
import { resolveTab } from "@/lib/escucha-tab";

describe("resolveTab", () => {
  it("config es alias de escenario; desconocido → monitor", () => {
    expect(resolveTab("escenario")).toBe("escenario");
    expect(resolveTab("config")).toBe("escenario");
    expect(resolveTab("informe")).toBe("informe");
    expect(resolveTab("monitor")).toBe("monitor");
    expect(resolveTab(undefined)).toBe("monitor");
    expect(resolveTab("x")).toBe("monitor");
  });
});
```

```ts
// tests/escucha-bloques-actions.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const redirect = vi.fn((url: string) => { throw new Error(`REDIRECT ${url}`); });
vi.mock("next/navigation", () => ({ redirect: (u: string) => redirect(u) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ after: (fn: () => void) => fn() }));
vi.mock("@/lib/workspace", () => ({
  requireMember: async () => ({ id: "p1", nombre: "P", role: "owner" }),
  requireProject: async () => ({ id: "p1", nombre: "P", role: "owner" }),
  currentUserEmail: async () => "ana@x.ar",
}));
vi.mock("@/lib/db/supabase", () => ({ dbConfigured: () => true, getSupabase: () => ({}) }));
vi.mock("@/lib/listening-cache", () => ({ pullAllSources: vi.fn(async () => ({ total: 0, bySource: {}, errors: [] })), savePullSummary: vi.fn() }));
vi.mock("@/lib/x-queue", () => ({ enqueueXHandles: vi.fn() }));

const NOW = "2026-08-25T00:00:00.000Z";
let cfg: Record<string, unknown> = {
  zona: "Ibicuy", pais: "AR", radioKm: null, lat: null, lng: null, keywords: ["viejo"], fuentes: [], rssFeeds: ["https://m.ar"], xHandles: [], radioStreams: [],
};
const saveListeningConfig = vi.fn(async (_p: string, c: typeof cfg) => { cfg = c; });
vi.mock("@/lib/listening-config", () => ({
  getListeningConfig: async () => cfg,
  saveListeningConfig: (p: string, c: typeof cfg) => saveListeningConfig(p, c),
}));
let monitor: Record<string, unknown> = { accounts: [], searchesA: [], searchesB: [], calendar: [], noRepetir: ["n"], budget: {}, entidades: {} };
const saveMonitorConfig = vi.fn(async (_p: string, m: typeof monitor) => { monitor = m; });
vi.mock("@/lib/monitor-config", async (orig) => ({
  ...(await orig<typeof import("@/lib/monitor-config")>()),
  getMonitorConfig: async () => monitor,
  saveMonitorConfig: (p: string, m: typeof monitor) => saveMonitorConfig(p, m),
}));
let brief: Record<string, unknown> = {
  entries: [], suggestions: [],
  proposal: { at: NOW, briefHash: "h", tipo: "territorial", resumen: "", keywords: [], searchesA: [], searchesB: [], accounts: [], entidades: {}, calendar: [], audio: [], applied: {} },
};
const saveClientBrief = vi.fn(async (_p: string, b: typeof brief) => { brief = b; });
vi.mock("@/lib/client-brief", async (orig) => ({
  ...(await orig<typeof import("@/lib/client-brief")>()),
  getClientBrief: async () => brief,
  saveClientBrief: (p: string, b: typeof brief) => saveClientBrief(p, b),
}));

import { guardarTerritorio, guardarPrensa, guardarAudio, guardarReglas } from "@/app/(dashboard)/escucha/actions";

const fd = (o: Record<string, string | string[]>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) (Array.isArray(v) ? v : [v]).forEach((x) => f.append(k, x));
  return f;
};
const run = (p: Promise<unknown>) => p.catch((e: Error) => e.message);

describe("acciones por bloque", () => {
  beforeEach(() => { redirect.mockClear(); saveListeningConfig.mockClear(); saveClientBrief.mockClear(); });

  it("guardarTerritorio pisa solo zona/pais/keywords y marca applied.territorio", async () => {
    const r = await run(guardarTerritorio(fd({ zona: "Ibicuy, ER", pais: "ar", keywords: "a\nb", radioKm: "", lat: "", lng: "" })));
    expect(r).toBe("REDIRECT /escucha?tab=escenario&ok=territorio");
    expect(cfg.keywords).toEqual(["a", "b"]);
    expect(cfg.rssFeeds).toEqual(["https://m.ar"]); // intacto
    expect((brief.proposal as { applied: Record<string, string> }).applied.territorio).toBeTruthy();
  });

  it("guardarPrensa pisa medios y toggles, conserva FB/Telegram", async () => {
    cfg = { ...cfg, rssFeeds: ["https://m.ar", "https://www.facebook.com/muni"], fuentes: ["gdelt", "x-api"] };
    const r = await run(guardarPrensa(fd({ rssFeeds: "https://nuevo.ar", fuentesPrensa: ["gdelt"] })));
    expect(r).toBe("REDIRECT /escucha?tab=escenario&ok=prensa");
    expect(cfg.rssFeeds).toEqual(["https://nuevo.ar", "https://www.facebook.com/muni"]);
    expect(cfg.fuentes).toEqual(["x-api", "gdelt"]);
  });

  it("guardarAudio rechaza franja inválida sin persistir; acepta franja vacía", async () => {
    const bad = JSON.stringify([{ kind: "radio", url: "https://s/x", station: "R", programa: "P", days: [1], start: "10:00", end: "08:00" }]);
    const r1 = await run(guardarAudio(fd({ audioPrograms: bad, fuentesAudio: ["radio"] })));
    expect(r1).toMatch(/error=audio:/);
    expect(saveListeningConfig).not.toHaveBeenCalled();
    const ok = JSON.stringify([{ kind: "kick", url: "https://kick.com/canal", station: "K", programa: "Vivo", days: [], start: "", end: "" }]);
    const r2 = await run(guardarAudio(fd({ audioPrograms: ok, fuentesAudio: ["radio"] })));
    expect(r2).toBe("REDIRECT /escucha?tab=escenario&ok=audio");
    expect((cfg.radioStreams as { kind: string }[])[0].kind).toBe("kick");
    expect((brief.proposal as { applied: Record<string, string> }).applied.audio).toBeTruthy();
  });

  it("guardarReglas pisa entidades/calendario/noRepetir y marca applied.reglas", async () => {
    const r = await run(guardarReglas(fd({ entidades: "Ibicuy: localidad", calendar: "Fiesta, 2026-09-14", noRepetir: "x" })));
    expect(r).toBe("REDIRECT /escucha?tab=escenario&ok=reglas");
    expect(monitor.entidades).toEqual({ Ibicuy: "localidad" });
    expect(monitor.calendar).toEqual([{ label: "Fiesta", date: "2026-09-14" }]);
    expect((brief.proposal as { applied: Record<string, string> }).applied.reglas).toBeTruthy();
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run tests/escucha-tab.test.ts tests/escucha-bloques-actions.test.ts` — Expected: FAIL (módulos/exports inexistentes).

- [ ] **Step 3: `lib/escucha-tab.ts`**

```ts
// Tab activa de /escucha. "config" quedó como alias de "escenario" para links
// viejos (favoritos, mails).
export type EscuchaTab = "escenario" | "monitor" | "informe";

export function resolveTab(param: string | undefined): EscuchaTab {
  if (param === "escenario" || param === "config") return "escenario";
  if (param === "informe") return "informe";
  return "monitor";
}
```

- [ ] **Step 4: `actions.ts` — helpers y acciones por bloque**

Agregar imports: `import { markApplied, type ProposalBlock } from "@/lib/client-brief";`, `import { AudioProgramSchema } from "@/lib/schemas";` (junto a `GuardarEscuchaSchema`), `import { hasValidSlot } from "@/lib/audio-programs";`, `import { partitionFeeds } from "@/lib/escucha-fuentes";` (ya importa `normalizeFbUrl`/`normalizeTgChannel`).

Helpers (arriba de las acciones nuevas):

```ts
// ── Escenario por bloque ────────────────────────────────────────────────

const lines = (formData: FormData, name: string) =>
  String(formData.get(name) ?? "").split("\n").map((l) => l.trim()).filter(Boolean);

async function applyBlock(projectId: string, block: ProposalBlock) {
  const brief = await getClientBrief(projectId);
  if (brief.proposal && !brief.proposal.applied[block]) {
    await saveClientBrief(projectId, { ...brief, proposal: markApplied(brief.proposal, block) });
  }
}

function okRedirect(block: ProposalBlock | "prensa"): never {
  revalidatePath("/escucha");
  redirect(`/escucha?tab=escenario&ok=${block}`);
}

function errRedirect(block: string, motivo: string): never {
  redirect(`/escucha?tab=escenario&error=${block}:${encodeURIComponent(motivo.slice(0, 80))}`);
}

// Conectores que gobierna cada bloque (los demás se conservan tal cual).
const PRENSA_IDS = ["gdelt", "rss-medios", "meta-content-library"] as const;
const REDES_IDS = ["x-api"] as const;
const AUDIO_IDS = ["radio"] as const;

// Pisa en cfg.fuentes solo los ids del bloque: quita los que gobierna y suma
// los marcados. `fuentes` vacío significa "todas": si el usuario desmarca
// todo un bloque partiendo de vacío, materializamos la lista completa.
function mergeFuentes(current: string[], owned: readonly string[], checked: string[], allIds: string[]): string[] {
  const base = current.length === 0 ? allIds : current;
  return [...base.filter((id) => !owned.includes(id)), ...checked.filter((id) => owned.includes(id))];
}
```

`allIds` = ids de `sourceStatuses(...)`; para no depender de la UI, definir `const ALL_SOURCE_IDS = [...PRENSA_IDS, ...REDES_IDS, ...AUDIO_IDS];` — si `connectors` de listening tuviera otros ids togglables, agregarlos aquí (revisar `sourceStatuses` en `app/(dashboard)/escucha/page.tsx` / `lib/escucha-fuentes.ts` y copiar la lista).

Acciones:

```ts
export async function guardarTerritorio(formData: FormData) {
  if (!dbConfigured()) redirect("/escucha?tab=escenario&error=territorio:no_db");
  const { id: projectId } = await requireMember("editor");
  const cur = await getListeningConfig(projectId);
  const raw = formToObject(formData);
  const parsed = GuardarEscuchaSchema.safeParse({
    ...cur,
    zona: raw.zona, pais: raw.pais, radioKm: raw.radioKm, lat: raw.lat, lng: raw.lng,
    keywords: lines(formData, "keywords"),
  });
  if (!parsed.success) errRedirect("territorio", "datos inválidos");
  await saveListeningConfig(projectId, parsed.data);
  await applyBlock(projectId, "territorio");
  after(async () => {
    try {
      const summary = await pullAllSources(projectId);
      await savePullSummary(projectId, summary);
    } catch (e) {
      log.warn("listening.initial_pull.failed", { projectId, error: (e as Error).message });
    }
  });
  okRedirect("territorio");
}

export async function guardarPrensa(formData: FormData) {
  if (!dbConfigured()) redirect("/escucha?tab=escenario&error=prensa:no_db");
  const { id: projectId } = await requireMember("editor");
  const cur = await getListeningConfig(projectId);
  const parts = partitionFeeds(cur.rssFeeds);
  const medios = lines(formData, "rssFeeds");
  const rssFeeds = [...new Set([...medios, ...parts.facebook, ...parts.telegram])];
  const fuentes = mergeFuentes(cur.fuentes, PRENSA_IDS, formData.getAll("fuentesPrensa").map(String), ALL_SOURCE_IDS);
  const parsed = GuardarEscuchaSchema.safeParse({ ...cur, rssFeeds, fuentes });
  if (!parsed.success) errRedirect("prensa", "datos inválidos");
  await saveListeningConfig(projectId, parsed.data);
  after(async () => {
    try {
      const summary = await pullAllSources(projectId);
      await savePullSummary(projectId, summary);
    } catch (e) {
      log.warn("listening.initial_pull.failed", { projectId, error: (e as Error).message });
    }
  });
  okRedirect("prensa");
}

export async function guardarRedes(formData: FormData) {
  if (!dbConfigured()) redirect("/escucha?tab=escenario&error=redes:no_db");
  const { id: projectId } = await requireMember("editor");
  const cur = await getListeningConfig(projectId);
  const parts = partitionFeeds(cur.rssFeeds);
  const fbUrls = lines(formData, "fbUrls").map(normalizeFbUrl).filter((u): u is string => Boolean(u));
  const tgChannels = String(formData.get("tgChannels") ?? "").split(/[\n,]/).map(normalizeTgChannel).filter((u): u is string => Boolean(u));
  const rssFeeds = [...new Set([...parts.medios, ...fbUrls, ...tgChannels])];
  const xHandles = Array.from(new Set(String(formData.get("xHandles") ?? "").split(/[\n,]/).map(normalizeHandle).filter(Boolean)));
  const fuentes = mergeFuentes(cur.fuentes, REDES_IDS, formData.getAll("fuentesRedes").map(String), ALL_SOURCE_IDS);
  const parsed = GuardarEscuchaSchema.safeParse({ ...cur, rssFeeds, xHandles, fuentes });
  if (!parsed.success) errRedirect("redes", "datos inválidos");
  await saveListeningConfig(projectId, parsed.data);
  if (parsed.data.xHandles.length > 0) await enqueueXHandles(projectId, parsed.data.xHandles);

  // Cuentas del plan + búsquedas A/B (monitor-config); entidades/calendario/
  // noRepetir son del bloque Reglas y se conservan.
  const { getMonitorConfig, saveMonitorConfig } = await import("@/lib/monitor-config");
  const prev = await getMonitorConfig(projectId);
  const PLAT = new Set(["instagram", "x", "facebook", "tiktok"]);
  const CAT = new Set(["organizacion", "medio", "individual", "institucional", "opera"]);
  const accounts = lines(formData, "accounts").flatMap((l) => {
    const [handle, platform, category, ...rest] = l.split(",").map((s) => s.trim());
    if (!handle || !PLAT.has(platform) || !CAT.has(category)) return [];
    return [{ handle: handle.replace(/^@/, ""), platform: platform as "instagram" | "x" | "facebook" | "tiktok", category: category as "organizacion" | "medio" | "individual" | "institucional" | "opera", vinculo: rest.join(",").trim() || undefined }];
  });
  await saveMonitorConfig(projectId, { ...prev, accounts, searchesA: lines(formData, "searchesA"), searchesB: lines(formData, "searchesB") });
  await applyBlock(projectId, "redes");
  okRedirect("redes");
}

export async function guardarAudio(formData: FormData) {
  if (!dbConfigured()) redirect("/escucha?tab=escenario&error=audio:no_db");
  const { id: projectId } = await requireMember("editor");
  const cur = await getListeningConfig(projectId);
  let raw: unknown = [];
  try {
    raw = JSON.parse(String(formData.get("audioPrograms") ?? "[]"));
  } catch {
    errRedirect("audio", "JSON inválido");
  }
  const list = Array.isArray(raw) ? raw : [];
  const programs = [];
  for (let i = 0; i < list.length; i++) {
    const r = AudioProgramSchema.safeParse(list[i]);
    if (!r.success) errRedirect("audio", `programa ${i + 1}: ${r.error.issues[0]?.message ?? "inválido"}`);
    const p = r.data;
    // Franja vacía se admite (queda "por completar"); franja parcial o invertida no.
    const empty = !p.start && !p.end;
    if (!empty && !hasValidSlot(p)) errRedirect("audio", `programa ${i + 1}: franja inválida (inicio < fin, HH:MM)`);
    programs.push(p);
  }
  const fuentes = mergeFuentes(cur.fuentes, AUDIO_IDS, formData.getAll("fuentesAudio").map(String), ALL_SOURCE_IDS);
  await saveListeningConfig(projectId, { ...cur, radioStreams: programs, fuentes });
  await applyBlock(projectId, "audio");
  okRedirect("audio");
}

export async function guardarReglas(formData: FormData) {
  const { id: projectId } = await requireMember("editor");
  const { getMonitorConfig, saveMonitorConfig } = await import("@/lib/monitor-config");
  const prev = await getMonitorConfig(projectId);
  const calendar = lines(formData, "calendar").flatMap((l) => {
    const [label, date] = l.split(",").map((s) => s.trim());
    if (!label || !date || Number.isNaN(+new Date(date))) return [];
    return [{ label, date }];
  });
  const entidades: Record<string, string> = {};
  for (const l of lines(formData, "entidades")) {
    const i = l.indexOf(":");
    if (i > 0) entidades[l.slice(0, i).trim()] = l.slice(i + 1).trim();
  }
  await saveMonitorConfig(projectId, { ...prev, calendar, entidades, noRepetir: lines(formData, "noRepetir") });
  await applyBlock(projectId, "reglas");
  okRedirect("reglas");
}
```

Eliminar `guardarEscucha` y `guardarMonitor` (sus consumidores desaparecen en Task 4; si `tsc` se queja hasta entonces, dejar `guardarMonitor` como `export const guardarMonitor = guardarRedes;` provisorio y borrarlo en Task 4).

- [ ] **Step 5: Verificar**

Run: `npx vitest run tests/escucha-tab.test.ts tests/escucha-bloques-actions.test.ts tests/escucha-brief-actions.test.ts && npx tsc --noEmit && npx eslint "app/(dashboard)/escucha/actions.ts" lib/escucha-tab.ts`
Expected: PASS. Si `x-queue` no es el módulo real de `enqueueXHandles`, ajustar el `vi.mock` al import real de `actions.ts`.

- [ ] **Step 6: Commit**

```bash
git add "app/(dashboard)/escucha/actions.ts" lib/escucha-tab.ts tests/escucha-tab.test.ts tests/escucha-bloques-actions.test.ts
git commit -m "feat(escucha): acciones por bloque (territorio, prensa, redes, audio, reglas)

Cada Guardar pisa solo sus campos y marca applied.<bloque> en la propuesta
de IA. guardarAudio valida franjas (vacía ok, invertida no).

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XW7g7dSqmfsaVwruSZ87N8"
```

---

### Task 4: UI — bloques, Escenario tab, page, Informe recortado

**Files:**
- Create: `components/escucha/bloque.tsx`, `source-rows.tsx`, `bloque-territorio.tsx`, `bloque-prensa.tsx`, `bloque-redes.tsx`, `bloque-audio.tsx`, `bloque-reglas.tsx`, `escenario-tab.tsx`
- Modify: `components/escucha/radio-config.tsx`, `informe-panel.tsx`, `app/(dashboard)/escucha/page.tsx`
- Delete: `components/escucha/config-form.tsx`, `components/escucha/monitor-editor.tsx`

- [ ] **Step 1: `bloque.tsx`** — wrapper común

```tsx
// Bloque de Escenario: <details> con título, resumen de estado, badge de
// propuesta pendiente y estado del último Guardar (?ok=/?error=).
import { FormStatus } from "@/components/ui/submit-button";

export function Bloque({
  id,
  titulo,
  resumen,
  pendiente,
  open,
  params,
  children,
}: {
  id: string; // "territorio" | "prensa" | "redes" | "audio" | "reglas"
  titulo: string;
  resumen: string;
  pendiente?: boolean;
  open?: boolean;
  params: Record<string, string | undefined>;
  children: React.ReactNode;
}) {
  const ok = params.ok === id;
  const err = params.error?.startsWith(`${id}:`) ? decodeURIComponent(params.error.slice(id.length + 1)) : null;
  return (
    <details id={id} open={open || ok || Boolean(err) || pendiente} className="rounded-lg border border-zinc-200 p-5 shadow-[var(--shadow-rest)] dark:border-zinc-800">
      <summary className="cursor-pointer text-sm font-semibold text-zinc-800 dark:text-zinc-100">
        {titulo}
        <span className="ml-2 text-xs font-normal text-zinc-500">{resumen}</span>
        {pendiente && (
          <span className="ml-2 text-xs font-normal text-amber-700 dark:text-amber-300">· propuesta de IA prellenada — revisá y guardá</span>
        )}
      </summary>
      <div className="mt-4 space-y-5">
        {children}
        <FormStatus ok={ok ? "Guardado." : null} error={err ? (err === "no_db" ? "Supabase no configurado." : err) : null} />
      </div>
    </details>
  );
}
```

- [ ] **Step 2: `source-rows.tsx`** — mover `timeAgo`, `SourceRows`, `AutoRow` y `Field` desde `config-form.tsx` tal cual (exportados). `Field` acepta `diff?: string` como en monitor-editor (mostrar en ámbar junto al label). También mover `export interface SourceStatus` acá.

- [ ] **Step 3: `bloque-territorio.tsx`**

```tsx
import { guardarTerritorio } from "@/app/(dashboard)/escucha/actions";
import { SubmitButton } from "@/components/ui/submit-button";
import { MapPicker } from "@/components/escucha/map-picker";
import { Bloque } from "@/components/escucha/bloque";
import { Field } from "@/components/escucha/source-rows";
import { controlClassName as inputCls } from "@/components/ui/field";
import type { ListeningConfig } from "@/lib/listening-config";
import type { ScenarioProposal } from "@/lib/client-brief";

export function BloqueTerritorio({ cfg, proposal, persistOk, params }: {
  cfg: ListeningConfig; proposal?: ScenarioProposal; persistOk: boolean; params: Record<string, string | undefined>;
}) {
  const p = proposal && !proposal.applied.territorio ? proposal : undefined;
  const keywords = p?.keywords ?? cfg.keywords;
  return (
    <Bloque id="territorio" titulo="Territorio" resumen={`${cfg.zona || "sin zona"} · ${cfg.keywords.length} keywords`} pendiente={Boolean(p)} params={params}>
      <form key={p?.at ?? "vigente"} action={guardarTerritorio} className="space-y-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Zona"><input name="zona" defaultValue={cfg.zona} placeholder="Ibicuy, Entre Ríos" className={inputCls} /></Field>
          <Field label="País (código de 2 letras)"><input name="pais" defaultValue={cfg.pais} maxLength={2} className={`${inputCls} uppercase`} /></Field>
        </div>
        <Field
          label="Keywords (una por línea)"
          diff={p ? `vigente ${cfg.keywords.length} → propuesto ${p.keywords.length}` : undefined}
          hint="Temas a rastrear en todas las fuentes. La zona + estas keywords arman también las búsquedas automáticas de Google News y GDELT. El worker de GDELT lotea de a 7: las amplias primero."
        >
          <textarea name="keywords" rows={p ? 8 : 4} defaultValue={keywords.join("\n")} placeholder={"obras\nseguridad\nsalud"} className={`${inputCls} font-mono`} />
        </Field>
        <MapPicker defaultLat={cfg.lat} defaultLng={cfg.lng} defaultRadio={cfg.radioKm} />
        <SubmitButton variant="accent" disabled={!persistOk} pendingLabel="Guardando…">Guardar territorio</SubmitButton>
      </form>
    </Bloque>
  );
}
```

(`MapPicker` produce los inputs `lat`/`lng`/`radioKm` — verificar sus `name` en `map-picker.tsx` y que coincidan con lo que lee `guardarTerritorio` vía `formToObject`.)

- [ ] **Step 4: `bloque-prensa.tsx`**

```tsx
import { guardarPrensa } from "@/app/(dashboard)/escucha/actions";
import { SubmitButton } from "@/components/ui/submit-button";
import { Bloque } from "@/components/escucha/bloque";
import { Field, SourceRows, AutoRow, type SourceStatus } from "@/components/escucha/source-rows";
import { controlClassName as inputCls } from "@/components/ui/field";
import type { ListeningConfig } from "@/lib/listening-config";
import type { PullSummary, SourceCounts } from "@/lib/listening-cache";
import { partitionFeeds } from "@/lib/escucha-fuentes";

const PRENSA_IDS = ["gdelt", "rss-medios", "meta-content-library"];

export function BloquePrensa({ cfg, sources, summary, counts, now, persistOk, params }: {
  cfg: ListeningConfig; sources: SourceStatus[]; summary: PullSummary | null; counts: SourceCounts; now: number; persistOk: boolean; params: Record<string, string | undefined>;
}) {
  const parts = partitionFeeds(cfg.rssFeeds);
  const toggles = sources.filter((s) => PRENSA_IDS.includes(s.id));
  return (
    <Bloque id="prensa" titulo="Prensa" resumen={`${parts.medios.length} medios · GDELT ${cfg.fuentes.length === 0 || cfg.fuentes.includes("gdelt") ? "activo" : "apagado"}`} params={params}>
      <form action={guardarPrensa} className="space-y-5">
        <div className="space-y-2">
          <Field label="Medios y sitios de noticias" hint={<>Una URL por línea. Sirve el <strong>feed RSS</strong>, la <strong>portada del sitio</strong> o un <strong>canal de YouTube</strong> (<code>youtube.com/feeds/videos.xml?channel_id=…</code>).</>}>
            <textarea name="rssFeeds" rows={4} defaultValue={parts.medios.join("\n")} placeholder={"https://analisisdigital.com.ar\nhttps://lacalle.com.ar"} className={`${inputCls} font-mono`} />
          </Field>
          <SourceRows urls={parts.medios} counts={counts} summary={summary} now={now} />
        </div>
        <ul className="divide-y divide-zinc-100 rounded-md border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          <AutoRow label="Google News" detail="prensa por búsqueda de zona y keywords" stat={counts.bySource["news.google.com"]} now={now} />
          <AutoRow label="GDELT" detail="prensa mundial geo-codificada (worker cada 3 h)" stat={counts.byConnector["gdelt"]} error={summary?.bySource["gdelt"]?.error} now={now} />
        </ul>
        <fieldset className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
          <legend className="sr-only">Conectores de prensa</legend>
          {toggles.map((s) => (
            <label key={s.id} className="flex items-center gap-2 text-zinc-700 dark:text-zinc-200">
              <input type="checkbox" name="fuentesPrensa" value={s.id} defaultChecked={cfg.fuentes.length === 0 || cfg.fuentes.includes(s.id)} className="h-3.5 w-3.5" />
              {s.label}<span className="text-[10px] uppercase tracking-wider text-zinc-500">{s.reason}</span>
            </label>
          ))}
        </fieldset>
        <SubmitButton variant="accent" disabled={!persistOk} pendingLabel="Guardando…">Guardar prensa</SubmitButton>
      </form>
    </Bloque>
  );
}
```

- [ ] **Step 5: `bloque-redes.tsx`** — FB/Telegram/X (campos y hints de `config-form.tsx` líneas 296-363, con `SourceRows`), toggle `fuentesRedes` (ids `x-api`), y debajo los campos de `monitor-editor.tsx` **solo** `accounts`, `searchesA`, `searchesB` con `diffLabel` (mover `diffLabel`, `accLine` a `lib/escenario-diff.ts` para poder testearlos). Prellenar desde `proposal` si `!proposal.applied.redes`; `key={p?.at ?? "vigente"}` en el form; botón "Guardar redes". `resumen`: `${parts.facebook.length} FB · ${cfg.xHandles.length} X · ${monitor.accounts.length} cuentas del plan`. Props: `{ cfg, monitor, proposal, sources, summary, counts, now, persistOk, params }`.

- [ ] **Step 6: `radio-config.tsx`** — `kind` + `nota`

Cambios: `import { KIND_LABEL, type AudioProgram, type AudioKind } from "@/lib/audio-programs"` (tipo `AudioProgram` en vez de `RadioProgram`); `NEW` gana `kind: "radio"`; el input oculto pasa a `name="audioPrograms"`; en cada card, arriba de estación/programa, un `<select>`:

```tsx
          <div className="flex flex-wrap items-center gap-2">
            <select className={inputCls} value={p.kind} onChange={(e) => patch(i, { kind: e.target.value as AudioKind })} aria-label="Plataforma">
              {(Object.keys(KIND_LABEL) as AudioKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
            </select>
            {p.nota && <span className="text-xs text-amber-700 dark:text-amber-300">{p.nota}</span>}
          </div>
```

placeholder de URL según kind: radio `URL del stream (https://…/stream.mp3)`, youtube `https://www.youtube.com/@canal/live`, kick `https://kick.com/canal`. El botón de agregar pasa a "+ Programa". Los inputs `time` aceptan vacío (ya lo hacen). Prop `initial: AudioProgram[]` y nueva prop opcional `proposed?: AudioProgram[]`: si viene, el estado inicial es `proposed` (prellenado).

- [ ] **Step 7: `bloque-audio.tsx`**

```tsx
import { guardarAudio } from "@/app/(dashboard)/escucha/actions";
import { SubmitButton } from "@/components/ui/submit-button";
import { Bloque } from "@/components/escucha/bloque";
import { RadioConfig } from "@/components/escucha/radio-config";
import { RadioAgenda } from "@/components/escucha/radio-agenda";
import { AutoRow, type SourceStatus } from "@/components/escucha/source-rows";
import type { ListeningConfig } from "@/lib/listening-config";
import type { ScenarioProposal } from "@/lib/client-brief";
import type { RadioRun } from "@/lib/radio-runs";
import type { SourceCounts } from "@/lib/listening-cache";
import { hasValidSlot } from "@/lib/audio-programs";

export function BloqueAudio({ cfg, proposal, sources, counts, now, upcoming, runs, persistOk, params }: {
  cfg: ListeningConfig; proposal?: ScenarioProposal; sources: SourceStatus[]; counts: SourceCounts; now: number;
  upcoming: Array<{ station: string; programa: string; startMs: number; endMs: number }>; runs: RadioRun[];
  persistOk: boolean; params: Record<string, string | undefined>;
}) {
  const p = proposal && !proposal.applied.audio && proposal.audio.length > 0 ? proposal : undefined;
  const sinFranja = cfg.radioStreams.filter((x) => !hasValidSlot(x)).length;
  const radioToggle = sources.find((s) => s.id === "radio");
  return (
    <Bloque id="audio" titulo="Audio y video" resumen={`${cfg.radioStreams.length} programas${sinFranja ? ` · ${sinFranja} sin franja` : ""}`} pendiente={Boolean(p)} params={params}>
      <p className="max-w-[70ch] text-xs text-zinc-500">
        Radio, YouTube y Kick con el mismo modelo: cada programa se graba en su franja, se transcribe con IA y se filtra por tus keywords. Un programa sin franja se guarda pero no se graba.
      </p>
      <form key={p?.at ?? "vigente"} action={guardarAudio} className="space-y-5">
        <RadioConfig initial={cfg.radioStreams} proposed={p?.audio} />
        {radioToggle && (
          <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-200">
            <input type="checkbox" name="fuentesAudio" value="radio" defaultChecked={cfg.fuentes.length === 0 || cfg.fuentes.includes("radio")} className="h-3.5 w-3.5" />
            Grabar y transcribir <span className="text-[10px] uppercase tracking-wider text-zinc-500">{radioToggle.reason}</span>
          </label>
        )}
        <ul className="divide-y divide-zinc-100 rounded-md border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          <AutoRow label="Menciones transcriptas" detail="radio + streaming" stat={counts.byConnector["radio"]} now={now} />
        </ul>
        <SubmitButton variant="accent" disabled={!persistOk} pendingLabel="Guardando…">Guardar audio y video</SubmitButton>
      </form>
      <RadioAgenda upcoming={upcoming} runs={runs} />
    </Bloque>
  );
}
```

`RadioAgenda`: en la lista de corridas, mostrar `status === "no_live"` como "sin vivo" (ámbar) — revisar cómo renderiza `status` hoy y agregar el caso.

- [ ] **Step 8: `bloque-reglas.tsx`** — entidades, calendario, noRepetir (campos de `monitor-editor.tsx`), prellenado de entidades/calendario desde `proposal` si `!proposal.applied.reglas`, `diffLabel`, botón "Guardar reglas", `resumen`: `${Object.keys(monitor.entidades).length} entidades · ${monitor.calendar.length} hitos`.

- [ ] **Step 9: `escenario-tab.tsx`**

```tsx
import { BriefPanel } from "@/components/escucha/brief-panel";
import { ActorSuggestions } from "@/components/escucha/actor-suggestions";
import { BloqueTerritorio } from "@/components/escucha/bloque-territorio";
import { BloquePrensa } from "@/components/escucha/bloque-prensa";
import { BloqueRedes } from "@/components/escucha/bloque-redes";
import { BloqueAudio } from "@/components/escucha/bloque-audio";
import { BloqueReglas } from "@/components/escucha/bloque-reglas";
import type { SourceStatus } from "@/components/escucha/source-rows";
import type { ListeningConfig } from "@/lib/listening-config";
import type { MonitorConfig } from "@/lib/monitor-config";
import type { ClientBrief } from "@/lib/client-brief";
import type { PullSummary, SourceCounts } from "@/lib/listening-cache";
import type { RadioRun } from "@/lib/radio-runs";

export function EscenarioTab(props: {
  cfg: ListeningConfig; monitor: MonitorConfig; brief: ClientBrief; canGenerate: boolean;
  sources: SourceStatus[]; summary: PullSummary | null; counts: SourceCounts; now: number;
  upcoming: Array<{ station: string; programa: string; startMs: number; endMs: number }>; runs: RadioRun[];
  persistOk: boolean; params: Record<string, string | undefined>;
}) {
  const { brief, params } = props;
  const proposal = brief.proposal;
  return (
    <div className="space-y-6">
      <BriefPanel brief={brief} canGenerate={props.canGenerate} flags={{ saved: params.brief === "1", generated: params.ia === "1", iaError: params.ia_error, briefError: params.brief_error }} />
      <ActorSuggestions suggestions={brief.suggestions} />
      <BloqueTerritorio cfg={props.cfg} proposal={proposal} persistOk={props.persistOk} params={params} />
      <BloquePrensa cfg={props.cfg} sources={props.sources} summary={props.summary} counts={props.counts} now={props.now} persistOk={props.persistOk} params={params} />
      <BloqueRedes cfg={props.cfg} monitor={props.monitor} proposal={proposal} sources={props.sources} summary={props.summary} counts={props.counts} now={props.now} persistOk={props.persistOk} params={params} />
      <BloqueAudio cfg={props.cfg} proposal={proposal} sources={props.sources} counts={props.counts} now={props.now} upcoming={props.upcoming} runs={props.runs} persistOk={props.persistOk} params={params} />
      <BloqueReglas monitor={props.monitor} proposal={proposal} params={params} />
    </div>
  );
}
```

- [ ] **Step 10: `page.tsx`**

- Imports: quitar `ConfigForm`, `RadioAgenda`, `SourceStatus` de config-form; agregar `EscenarioTab`, `resolveTab`, `redirect` de `next/navigation`, `type SourceStatus` desde `source-rows`.
- `const tab = resolveTab(params.tab); if (params.tab === "config") redirect("/escucha?tab=escenario");`
- Carga: `tab === "escenario"` para `readPullSummary`/`countsBySource`; sumar `getMonitorConfig`, `getClientBrief`, `getConnectorConfig("claude-api")`, `listRecentRuns`, `agendaUpcoming(cfg.radioStreams)` cuando `tab === "escenario"`; para `tab === "monitor"` también `listRecentRuns` + `agendaUpcoming` (para "Al aire", Task 5).
- Nav: `escenario` ("Escenario"), `monitor` ("Monitorear"), `informe` ("Informe"), en ese orden.
- Ramas: `escenario` → `<EscenarioTab … />`; `informe` → `<InformePanel {...await readDailyReports(projectId)} generado={params.generado === "1"} />`; `monitor` → como hoy.
- Eliminar `proposedKeywordsFor`.
- Los redirects de las acciones de brief (`agregarAporteBrief`, etc., Task 6 del plan anterior) apuntan a `?tab=informe…`: cambiarlos a `?tab=escenario…` en `actions.ts` (5 ocurrencias).

- [ ] **Step 11: `informe-panel.tsx`** — quitar props/imports de `brief`, `canGenerate`, `briefFlags`, `monitor`, `monitorSaved`, `BriefPanel`, `ActorSuggestions`, `MonitorEditor`; queda `{ latest, history, generado }`. Agregar arriba un aviso corto: "El brief, los actores sugeridos y el escenario se editan en la pestaña Escenario →" con link.

- [ ] **Step 12: `brief-panel.tsx`** — el texto de "Keywords: Configurar → Guardar. Escenario: abajo → Guardar escenario." pasa a: `Faltan: {faltan.map(label).join(", ")}` con `label = { territorio: "Territorio", redes: "Redes", audio: "Audio y video", reglas: "Reglas" }`, y "Descartar propuesta" igual.

- [ ] **Step 13: Borrar** `components/escucha/config-form.tsx`, `components/escucha/monitor-editor.tsx` y el alias provisorio `guardarMonitor` si quedó. `grep -rn "config-form\|monitor-editor\|guardarEscucha\|guardarMonitor" app components lib` debe dar 0.

- [ ] **Step 14: Verificar**

Run: `npx tsc --noEmit && npx eslint components/escucha/*.tsx "app/(dashboard)/escucha/page.tsx" "app/(dashboard)/escucha/actions.ts" && npx vitest run`
Expected: sin errores; suite verde.

- [ ] **Step 15: Commit**

```bash
git add -A components/escucha "app/(dashboard)/escucha" lib/escenario-diff.ts
git commit -m "feat(escucha): pestaña Escenario por canal; Configurar desaparece

Territorio, Prensa, Redes, Audio y video, Reglas con Guardar propio y
propuesta de IA aplicable por bloque. Informe queda con informe + extensión.
?tab=config redirige a escenario.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XW7g7dSqmfsaVwruSZ87N8"
```

---

### Task 5: "Al aire" en Monitorear

**Files:**
- Create: `components/escucha/al-aire.tsx`, `lib/al-aire.ts`
- Modify: `components/escucha/monitor.tsx`, `app/(dashboard)/escucha/page.tsx` (props)
- Test: `tests/al-aire.test.ts`

- [ ] **Step 1: Test que falla**

```ts
// tests/al-aire.test.ts
import { describe, it, expect } from "vitest";
import { alAireState } from "@/lib/al-aire";

const NOW = Date.UTC(2026, 7, 25, 12, 0, 0);
const occ = (station: string, startMin: number, endMin: number) => ({ station, programa: "P", startMs: NOW + startMin * 60_000, endMs: NOW + endMin * 60_000 });

describe("alAireState", () => {
  it("grabando ahora, próximo y último", () => {
    const s = alAireState(
      [occ("LU30", -30, 30), occ("Canal", 40, 100)],
      [{ id: "1", station: "R", programa: "X", status: "done", mentions: 3, scheduledStart: new Date(NOW - 3 * 3600_000).toISOString() } as never],
      NOW,
    );
    expect(s.grabando?.station).toBe("LU30");
    expect(s.proximo?.station).toBe("Canal");
    expect(s.proximo?.enMin).toBe(40);
    expect(s.ultimo?.station).toBe("R");
    expect(s.ultimo?.mentions).toBe(3);
  });

  it("sin datos → null", () => {
    expect(alAireState([], [], NOW)).toBeNull();
  });
});
```

- [ ] **Step 2: `lib/al-aire.ts`**

```ts
import type { RadioRun } from "@/lib/radio-runs";

type Occ = { station: string; programa: string; startMs: number; endMs: number };

export interface AlAire {
  grabando: (Occ & { hastaMs: number }) | null;
  proximo: (Occ & { enMin: number }) | null;
  ultimo: { station: string; programa: string; status: string; mentions: number; atMs: number } | null;
}

export function alAireState(upcoming: Occ[], runs: RadioRun[], nowMs: number): AlAire | null {
  const grabandoOcc = upcoming.find((o) => o.startMs <= nowMs && o.endMs > nowMs) ?? null;
  const proximoOcc = upcoming.filter((o) => o.startMs > nowMs).sort((a, b) => a.startMs - b.startMs)[0] ?? null;
  const done = runs
    .filter((r) => r.status !== "recording")
    .sort((a, b) => +new Date(b.scheduledStart) - +new Date(a.scheduledStart))[0];
  const out: AlAire = {
    grabando: grabandoOcc ? { ...grabandoOcc, hastaMs: grabandoOcc.endMs } : null,
    proximo: proximoOcc ? { ...proximoOcc, enMin: Math.round((proximoOcc.startMs - nowMs) / 60_000) } : null,
    ultimo: done ? { station: done.station, programa: done.programa, status: done.status, mentions: done.mentions ?? 0, atMs: +new Date(done.scheduledStart) } : null,
  };
  return out.grabando || out.proximo || out.ultimo ? out : null;
}
```

(Revisar los nombres reales de los campos de `RadioRun` en `lib/radio-runs.ts:17-30` — `scheduledStart`, `mentions`, `status`, `station`, `programa` — y ajustar si difieren.)

- [ ] **Step 3: `components/escucha/al-aire.tsx`**

```tsx
import Link from "next/link";
import type { AlAire } from "@/lib/al-aire";

const hhmm = (ms: number) => new Date(ms).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
const STATUS: Record<string, string> = { done: "transcripto", failed: "falló", no_live: "sin vivo", recording: "grabando" };

export function AlAireBar({ state }: { state: AlAire | null }) {
  if (!state) return null;
  return (
    <section aria-label="Al aire" className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-lg border border-zinc-200 bg-zinc-50/60 px-4 py-2 text-xs text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-200">
      <span className="font-semibold uppercase tracking-[0.16em] text-zinc-500">Al aire</span>
      {state.grabando ? (
        <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-red-600" aria-hidden />Grabando: {state.grabando.station} · {state.grabando.programa} · hasta {hhmm(state.grabando.hastaMs)}</span>
      ) : state.proximo ? (
        <span>Próximo: {state.proximo.station} · {state.proximo.programa} en {state.proximo.enMin} min</span>
      ) : null}
      {state.ultimo && (
        <span className="text-zinc-500">Último: {state.ultimo.station} · {STATUS[state.ultimo.status] ?? state.ultimo.status}{state.ultimo.status === "done" ? ` (${state.ultimo.mentions} menciones)` : ""}</span>
      )}
      <Link href="/escucha?tab=escenario#audio" className="ml-auto underline">Configurar →</Link>
    </section>
  );
}
```

- [ ] **Step 4: Cablear** — `monitor.tsx` acepta `alAire: AlAire | null` y renderiza `<AlAireBar state={alAire} />` arriba de `LiveMonitor`; `page.tsx` en la rama monitor pasa `alAire={alAireState(agendaUpcoming(cfg.radioStreams), runs, Date.now())}` (con `runs = persistOk ? await listRecentRuns(projectId) : []`).

- [ ] **Step 5: Verificar y commit**

Run: `npx vitest run tests/al-aire.test.ts && npx tsc --noEmit && npx eslint lib/al-aire.ts components/escucha/al-aire.tsx components/escucha/monitor.tsx`

```bash
git add lib/al-aire.ts components/escucha/al-aire.tsx components/escucha/monitor.tsx "app/(dashboard)/escucha/page.tsx" tests/al-aire.test.ts
git commit -m "feat(escucha): carril Al aire en Monitorear (grabando / próximo / último)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XW7g7dSqmfsaVwruSZ87N8"
```

---

### Task 6: Worker — YouTube/Kick con yt-dlp, `no_live`

**Files:**
- Create: `tools/stream-url.mjs`
- Modify: `tools/radio-pull.mjs`, `.github/workflows/radio-pull.yml`, `app/api/cron/radio-config/route.ts`, `lib/schemas.ts` (`RadioIngestSchema`), `app/api/cron/radio-ingest/route.ts`, `components/escucha/radio-agenda.tsx` (status `no_live`)
- Test: `tests/stream-url.test.ts`

- [ ] **Step 1: Test que falla**

```ts
// tests/stream-url.test.ts
import { describe, it, expect, vi } from "vitest";
import { resolveStreamUrl } from "../tools/stream-url.mjs";

describe("resolveStreamUrl", () => {
  it("radio → la misma url sin ejecutar nada", async () => {
    const exec = vi.fn();
    await expect(resolveStreamUrl({ kind: "radio", url: "https://s/x.mp3" }, exec)).resolves.toEqual({ ok: true, url: "https://s/x.mp3" });
    expect(exec).not.toHaveBeenCalled();
  });

  it("youtube/kick → yt-dlp -g devuelve la url del vivo", async () => {
    const exec = vi.fn(async () => ({ stdout: "https://manifest.googlevideo.com/x.m3u8\n", code: 0 }));
    const r = await resolveStreamUrl({ kind: "youtube", url: "https://www.youtube.com/@c/live" }, exec);
    expect(r).toEqual({ ok: true, url: "https://manifest.googlevideo.com/x.m3u8" });
    expect(exec).toHaveBeenCalledWith("yt-dlp", ["-g", "--no-playlist", "--no-warnings", "https://www.youtube.com/@c/live"]);
  });

  it("sin vivo (yt-dlp falla o no imprime url) → no_live", async () => {
    const exec = vi.fn(async () => ({ stdout: "", code: 1, stderr: "ERROR: The channel is not currently live" }));
    await expect(resolveStreamUrl({ kind: "kick", url: "https://kick.com/c" }, exec)).resolves.toEqual({ ok: false, reason: "no_live" });
  });

  it("kind desconocido → error", async () => {
    await expect(resolveStreamUrl({ kind: "threads", url: "https://x" }, vi.fn())).resolves.toEqual({ ok: false, reason: "unsupported_kind" });
  });
});
```

Si vitest no resuelve `.mjs` desde `tests/`, agregar `tools/**/*.mjs` a `include`/`server.deps` no hace falta: el import relativo funciona con ESM. Si falla el tipado (`implicitly has any`), agregar `// @ts-expect-error mjs sin tipos` sobre el import.

- [ ] **Step 2: `tools/stream-url.mjs`**

```js
// Resuelve la URL que ffmpeg puede grabar según la plataforma del programa.
// radio: el stream tal cual. youtube/kick: yt-dlp -g devuelve la URL del vivo
// (HLS) si el canal está transmitiendo; si no, el programa se marca no_live.
// `exec(cmd, args) → { stdout, stderr, code }` se inyecta para testear.
export async function resolveStreamUrl(program, exec) {
  if (program.kind === "radio" || !program.kind) return { ok: true, url: program.url };
  if (program.kind !== "youtube" && program.kind !== "kick") return { ok: false, reason: "unsupported_kind" };
  const r = await exec("yt-dlp", ["-g", "--no-playlist", "--no-warnings", program.url]);
  const url = (r.stdout || "").split("\n").map((s) => s.trim()).find((s) => /^https?:\/\//.test(s));
  if (r.code !== 0 || !url) return { ok: false, reason: "no_live" };
  return { ok: true, url };
}
```

- [ ] **Step 3: `tools/radio-pull.mjs`**

- `import { resolveStreamUrl } from "./stream-url.mjs";`
- Agregar un `execCapture(cmd, args)` que use `child_process.spawn` y devuelva `{ stdout, stderr, code }` (el `run` existente no captura stdout; no tocarlo).
- En `main`, antes de `record(...)`:

```js
      const resolved = await resolveStreamUrl(p, execCapture);
      if (!resolved.ok) {
        console.log(`Sin vivo: ${p.station} · ${p.programa} (${resolved.reason})`);
        await ingest({ projectId: p.projectId, runId: p.runId, station: p.station, programa: p.programa, isoStart: p.isoStart, transcript: "", status: "no_live" });
        continue;
      }
      assertHttpUrl(resolved.url);
      await record(resolved.url, p.durationSec, out);
```

(`continue` dentro del `try`: mover el `mkdtemp`/`unlink` para que el `finally` no rompa — o hacer el resolve antes del `try`.)

- [ ] **Step 4: Endpoints**

- `radio-config/route.ts`: en `out.push` agregar `kind: prog.kind,`; filtrar `programsToRecord(cfg.radioStreams.filter(hasValidSlot), …)` (import `hasValidSlot` de `@/lib/audio-programs`).
- `lib/schemas.ts` `RadioIngestSchema`: agregar `status: z.enum(["no_live"]).optional(),`.
- `radio-ingest/route.ts`: después del bloque `failed`:

```ts
  if (parsed.data.status === "no_live") {
    if (runId) await markRunDone(runId, { status: "no_live" });
    return NextResponse.json({ ok: true, noLive: true });
  }
```

- `radio-agenda.tsx`: donde se muestra `status`, agregar el caso `no_live` → "sin vivo" (ámbar, con texto).

- [ ] **Step 5: `.github/workflows/radio-pull.yml`** — en el paso de instalación de dependencias agregar `pip install --quiet yt-dlp` (junto a whisper). Verificar con `yt-dlp --version` en el mismo step.

- [ ] **Step 6: Verificar y commit**

Run: `npx vitest run tests/stream-url.test.ts tests/radio.test.ts && npx tsc --noEmit && node --check tools/radio-pull.mjs && node --check tools/stream-url.mjs`

```bash
git add tools/stream-url.mjs tools/radio-pull.mjs .github/workflows/radio-pull.yml app/api/cron/radio-config/route.ts app/api/cron/radio-ingest/route.ts lib/schemas.ts components/escucha/radio-agenda.tsx tests/stream-url.test.ts
git commit -m "feat(radio-pull): YouTube y Kick vía yt-dlp; estado no_live

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XW7g7dSqmfsaVwruSZ87N8"
```

---

### Task 7: Deploy y smoke

- [ ] **Step 1: Suite completa, tsc, lint del diff, push, deploy**

```bash
npx vitest run && npx tsc --noEmit && npx eslint $(git diff --name-only main~0..HEAD | grep -E "\.(ts|tsx)$")
git push origin main   # o merge de la rama de trabajo a main + push
# esperar deploy de Production: gh api repos/rundes/severo-tronador/deployments?per_page=3
curl -s https://severo-tronador.vercel.app/api/version
```

- [ ] **Step 2: Smoke (proyecto Ibicuy)**
  1. `/escucha?tab=config` → redirige a `?tab=escenario`. Tabs: Escenario · Monitorear · Informe.
  2. Escenario: Contexto del cliente arriba con la propuesta pendiente "aplicada 0/4 · faltan: Territorio, Redes, Audio y video, Reglas"; bloques Territorio/Redes/Reglas abiertos con badge ámbar; Audio y video abierto solo si la propuesta trae programas.
  3. Guardar territorio → `?ok=territorio`, banner pasa a "1/4".
  4. Audio y video: agregar un programa `youtube` con URL de canal y franja vacía → guarda ("sin franja"); poner franja invertida → `error=audio:programa 1: franja inválida…`.
  5. Monitorear: carril "Al aire" visible si hay programas con franja; link "Configurar →" abre Escenario en `#audio`.
  6. Informe: solo informe + extensión; aviso con link a Escenario.
  7. `gh workflow run radio-pull.yml` → el job instala `yt-dlp` y, si hay un programa youtube/kick en franja sin vivo, la agenda muestra "sin vivo".

- [ ] **Step 3: Si algo falla** — revisar logs de Vercel por `listening.initial_pull.failed`, `client_brief.save_failed`, `scenario_ai.parse_failed`; para el worker, el log del run de Actions.

---

## Self-review

- **Cobertura del spec**: tabs+redirect (T3, T4), bloques por canal con Guardar propio (T3, T4), `AudioProgram` + compat (T1), propuesta con `audio` y `applied` por bloque + lectura tolerante (T2), IA propone audio (T2), "Al aire" (T5), worker yt-dlp + `no_live` (T6), Informe recortado (T4), borrado de config-form/monitor-editor (T4), tests por módulo (T1-T6), smoke (T7). Desviación declarada: editor estructurado en lugar de líneas.
- **Tipos**: `AudioProgram` (T1) usado en T2 (`ScenarioProposal.audio`, `CurrentScenario.audio`), T3 (`guardarAudio`), T4 (`RadioConfig`), T6 (`kind` en config route). `ProposalBlock` y `applied` (T2) usados en T3 (`applyBlock`, `markApplied`) y T4 (`proposal.applied.<bloque>`). `resolveTab` (T3) usado en T4. `alAireState` (T5) con `RadioRun` — campos a confirmar en `radio-runs.ts`.
- **Sin placeholders**: los pasos de UI de T4 (redes, reglas) describen campos exactos a mover desde archivos existentes con líneas citadas; el resto trae código completo.
