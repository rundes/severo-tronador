# Escucha — ingesta de radio (transcripción) — diseño

**Fecha:** 2026-06-11 · **Branch:** `feat/escucha-radio` · **Estado:** aprobado en brainstorming.

## Problema / pedido

Incorporar en Escucha la ingesta de **streams de radio**: grabar, transcribir y matchear keywords para trackear menciones, como una fuente más del feed.

## Decisiones (brainstorming)

- **Real-time continuo NO entra en Vercel** (serverless no sostiene audio largo). Se descarta para Fase 1; queda como Fase 2 (worker always-on + STT streaming OpenAI/Google).
- **Fase 1 = grabación programada + transcripción batch:**
  - **Un chunk = el programa completo**. Se define cada programa (estación, nombre, días, hora inicio/fin); se graba toda la franja y se transcribe de una.
  - **STT = Gemini** (`GOOGLE_AI_API_KEY` ya configurado): acepta audio, transcribe batch. Sin servicio/keys nuevas, costo ≈ free-tier.
  - **Corre en GitHub Actions** (no Vercel): el job graba el stream con `ffmpeg` durante la franja, transcribe con Gemini, matchea keywords y postea las menciones a un endpoint seguro.
  - **Se guarda el audio** en Supabase Storage (re-transcribir/auditar).
  - **Latencia** = fin del programa + transcripción (minutos). Captura el programa completo (sin huecos).
- **Costo:** GitHub Actions 2000 min/mes gratis (repo privado); grabar = minutos de Actions (excedente ~$0.008/min). Gemini por la key existente.

## Arquitectura

```
GitHub Actions (cron, p.ej. cada 15-30min)
  → tools/radio-pull.mjs:
      1. GET /api/cron/radio-config  → programas activos ahora (por proyecto) + keywords
      2. por programa "al aire": ffmpeg graba el stream hasta fin de franja (-t duración)
      3. sube el audio a Supabase Storage (bucket radio-audio)
      4. transcribe el audio con Gemini (Files API + generateContent)
      5. matchea keywords sobre el transcript
      6. POST /api/cron/radio-ingest  → upsert en listening_items (source = estación)
Downstream: feed / sentiment / topics / dashboard lo procesan sin cambios.
```

Vercel solo expone 2 endpoints rápidos (config GET, ingest POST), ambos con `CRON_SECRET`. Todo lo pesado (grabar + transcribir) vive en el runner de Actions.

### Archivos

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `supabase/migrations/0044_listening_radio.sql` | Crear | `listening_config` += `radio_streams jsonb` (array de programas). |
| `lib/listening-config.ts` | Modificar | Campo `radioStreams: RadioProgram[]` + mapeo a `radio_streams`. |
| `lib/radio.ts` | Crear | Tipos `RadioProgram`; helpers PUROS testeables: `programsActiveAt(programs, nowMs)`, `matchKeywords(text, keywords)`, `transcriptToItems(...)`. |
| `lib/radio-transcribe.ts` | Crear | Transcribe un audio con Gemini (Files API). Server-only. Mock-first sin key. |
| `app/api/cron/radio-config/route.ts` | Crear | GET (CRON_SECRET): programas + keywords activos por proyecto. |
| `app/api/cron/radio-ingest/route.ts` | Crear | POST (CRON_SECRET): {projectId, station, programa, transcript, startedAt} → keyword-match → upsert listening_items. |
| `tools/radio-pull.mjs` | Crear | Runner de Actions: config → ffmpeg record → Storage → Gemini → match → ingest. |
| `.github/workflows/radio-pull.yml` | Crear | Cron que corre el runner con secrets (`CRON_SECRET`, `GOOGLE_AI_API_KEY`, `SUPABASE_*`, `APP_URL`). |
| `components/escucha/config-form.tsx` | Modificar | Sección "Radios" para configurar programas (estación, url, nombre, días, inicio/fin). |
| `tests/radio.test.ts` | Crear | `programsActiveAt`, `matchKeywords`, `transcriptToItems`. |

## Tipos

```ts
export interface RadioProgram {
  url: string;       // stream HTTP (Icecast/Shoutcast mp3/aac)
  station: string;   // nombre de la radio (→ source / author)
  programa: string;  // nombre del programa
  days: number[];    // 0-6 (Dom-Sáb)
  start: string;     // "HH:MM" local
  end: string;       // "HH:MM" local
}
```

`listening_items` (sin cambios de schema): `connector_id="radio"`, `source=station`, `author=station`, `text=transcript` (o snippet por mención), `published_at=inicio del programa`, `url` sintética `radio://<station>/<fecha>T<start>` (dedup por (project_id,url)), `kind="broadcast"`.

## Detalle

- **`programsActiveAt(programs, nowMs)`**: devuelve los programas cuyo día/franja contiene `nowMs` (o que terminan dentro de la ventana de corrida). Puro (recibe `nowMs`, sin Date.now interno → testeable).
- **`matchKeywords(text, keywords)`**: igual que el resto de connectors (`text.toLowerCase().includes(kw)`), case-insensitive; devuelve keywords encontradas.
- **Transcripción Gemini**: subir audio (Files API) → `generateContent` con prompt "transcribí este audio en español; devolvé solo el texto". El runner trocea el transcript en menciones por keyword (oración/ventana alrededor del match) para que cada `listening_item` sea legible, o guarda el transcript completo como un item.
- **Mock/dev**: sin `GOOGLE_AI_API_KEY` → `radio-transcribe` devuelve "" ; sin Supabase → endpoints no-op. El connector de radio NO corre en `runListening` (no es fetch síncrono); la ingesta es externa (Actions).
- **Seguridad**: endpoints con `CRON_SECRET` (patrón de `listening-pull`). El audio en Storage en bucket privado.
- **Cron alignment**: Actions cron tiene granularidad ~5min y puede demorar; se padea la ventana (grabar desde unos min antes / hasta unos después) para no perder bordes.

## Fase 2 (deferida)

Worker always-on (`infra/radio-worker/`, estilo `twikit-worker`) + STT streaming (OpenAI `gpt-4o-transcribe` recomendado por costo, o Google Cloud STT) → menciones segundo-a-segundo. Requiere host always-on (Railway/Fly/VPS).

## Testing

`tests/radio.test.ts`: `programsActiveAt` (día/hora dentro y fuera de franja, multi-día), `matchKeywords` (case-insensitive, múltiples), `transcriptToItems` (genera items con url sintética dedup-able). Resto: tsc + lint + build; el end-to-end (record→transcribe→ingest) se valida en prod con el workflow.
