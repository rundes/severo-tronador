// Helpers puros para la ingesta de radio (programas, ventanas horarias,
// matcheo de keywords, transcript → items). Sin imports de servidor →
// testeables y usables en el runner de GitHub Actions y en los endpoints.

export interface RadioProgram {
  url: string; // stream HTTP (Icecast/Shoutcast mp3/aac)
  station: string; // nombre de la radio (→ source / author)
  programa: string; // nombre del programa
  days: number[]; // 0-6 (Dom..Sáb)
  start: string; // "HH:MM" local
  end: string; // "HH:MM" local
}

// URL de stream segura: http(s) y host NO interno/privado. Evita SSRF/LFI
// cuando el url va a ffmpeg/fetch (file:, metadata cloud, redes internas).
// Nota: no resuelve DNS (no cubre DNS-rebinding); el url lo carga un editor
// autenticado, esto es defensa en profundidad estática.
export function isPublicHttpUrl(u: string): boolean {
  let url: URL;
  try {
    url = new URL(u);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (host === "localhost" || host === "0.0.0.0" || host === "::1" || host === "[::1]") return false;
  if (/^127\./.test(host)) return false; // loopback
  if (/^10\./.test(host)) return false; // privada
  if (/^192\.168\./.test(host)) return false; // privada
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return false; // privada
  if (/^169\.254\./.test(host)) return false; // link-local / metadata cloud
  return true;
}

// Minutos desde medianoche de "HH:MM" (NaN si inválido).
export function hhmmToMinutes(s: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return NaN;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return NaN;
  return h * 60 + min;
}

// Programas "al aire" en el instante nowMs (en la TZ implícita del runner; se
// le pasa nowMs + offset de minutos ya resueltos por el caller para pureza).
// dayOfWeek 0-6, minutesOfDay 0-1439 se derivan del caller y se pasan acá.
export function programsActiveAt(
  programs: RadioProgram[],
  dayOfWeek: number,
  minutesOfDay: number,
): RadioProgram[] {
  return programs.filter((p) => {
    if (!p.days.includes(dayOfWeek)) return false;
    const s = hhmmToMinutes(p.start);
    const e = hhmmToMinutes(p.end);
    if (Number.isNaN(s) || Number.isNaN(e)) return false;
    if (e <= s) return false; // no soportamos cruces de medianoche
    return minutesOfDay >= s && minutesOfDay < e;
  });
}

// Programas que ARRANCARON dentro de los últimos `windowMin` minutos (y siguen
// al aire). Pensado para el trigger por cron: cada programa se captura una sola
// vez (en la corrida cercana a su inicio), no en cada tick mientras está al aire.
export function programsStartingNow(
  programs: RadioProgram[],
  dayOfWeek: number,
  minutesOfDay: number,
  windowMin: number,
): RadioProgram[] {
  return programs.filter((p) => {
    if (!p.days.includes(dayOfWeek)) return false;
    const s = hhmmToMinutes(p.start);
    const e = hhmmToMinutes(p.end);
    if (Number.isNaN(s) || Number.isNaN(e) || e <= s) return false;
    return minutesOfDay >= s && minutesOfDay < s + windowMin && minutesOfDay < e;
  });
}

// Programas a grabar AHORA con pre-roll: desde `leadMin` antes del inicio y
// hasta el fin. Combinado con dedup (radio_runs), el primer tick del cron que
// caiga en esa ventana arranca la grabación → captura el programa completo
// aunque su horario no coincida con el cron.
export function programsToRecord(
  programs: RadioProgram[],
  dayOfWeek: number,
  minutesOfDay: number,
  leadMin: number,
): RadioProgram[] {
  return programs.filter((p) => {
    if (!p.days.includes(dayOfWeek)) return false;
    const s = hhmmToMinutes(p.start);
    const e = hhmmToMinutes(p.end);
    if (Number.isNaN(s) || Number.isNaN(e) || e <= s) return false;
    return minutesOfDay >= s - leadMin && minutesOfDay < e;
  });
}

// Próximas ocurrencias de los programas (para la agenda visual). Puro: recibe
// `fromMs` y el offset de TZ (min) ya resueltos. Devuelve ocurrencias futuras
// dentro de `horizonDays`, ordenadas por inicio.
export function nextOccurrences(
  programs: RadioProgram[],
  fromMs: number,
  horizonDays: number,
  tzOffsetMin: number,
): Array<{ station: string; programa: string; startMs: number; endMs: number }> {
  const out: Array<{ station: string; programa: string; startMs: number; endMs: number }> = [];
  const offMs = tzOffsetMin * 60_000;
  const local = new Date(fromMs + offMs); // "ahora" en hora local
  const baseY = local.getUTCFullYear();
  const baseM = local.getUTCMonth();
  const baseD = local.getUTCDate();
  for (let d = 0; d <= horizonDays; d++) {
    const dayLocalMidnightUtc = Date.UTC(baseY, baseM, baseD + d, 0, 0, 0);
    const dow = new Date(dayLocalMidnightUtc).getUTCDay();
    for (const p of programs) {
      if (!p.days.includes(dow)) continue;
      const s = hhmmToMinutes(p.start);
      const e = hhmmToMinutes(p.end);
      if (Number.isNaN(s) || Number.isNaN(e) || e <= s) continue;
      const startMs = dayLocalMidnightUtc + s * 60_000 - offMs;
      const endMs = dayLocalMidnightUtc + e * 60_000 - offMs;
      if (endMs <= fromMs) continue; // ya pasó
      out.push({ station: p.station, programa: p.programa, startMs, endMs });
    }
  }
  return out.sort((a, b) => a.startMs - b.startMs);
}

// Segundos restantes hasta el fin del programa desde minutesOfDay. 0 si terminó.
export function secondsUntilEnd(p: RadioProgram, minutesOfDay: number): number {
  const e = hhmmToMinutes(p.end);
  if (Number.isNaN(e)) return 0;
  return Math.max(0, (e - minutesOfDay) * 60);
}

// Duración del programa en segundos (para el -t de ffmpeg). 0 si inválido.
export function programDurationSec(p: RadioProgram): number {
  const s = hhmmToMinutes(p.start);
  const e = hhmmToMinutes(p.end);
  if (Number.isNaN(s) || Number.isNaN(e) || e <= s) return 0;
  return (e - s) * 60;
}

// Keywords presentes en el texto (case-insensitive, substring).
export function matchKeywords(text: string, keywords: string[]): string[] {
  const lower = text.toLowerCase();
  const out: string[] = [];
  for (const kw of keywords) {
    const k = kw.trim().toLowerCase();
    if (k && lower.includes(k) && !out.includes(kw)) out.push(kw);
  }
  return out;
}

export interface RadioItem {
  source: string; // estación
  text: string; // snippet alrededor de la mención (o transcript)
  url: string; // sintética, dedup-able
  author: string; // estación
  publishedAt: string; // ISO (inicio del programa)
  matched: string[]; // keywords encontradas
}

// URL sintética estable para dedup por (project_id, url).
export function radioItemUrl(station: string, isoStart: string): string {
  return `radio://${encodeURIComponent(station)}/${isoStart}`;
}

// Trocea el transcript en menciones: una por oración que contenga alguna
// keyword. Si no hay keywords configuradas, devuelve un único item con el
// transcript completo. Si hay keywords pero ninguna matchea, devuelve [].
export function transcriptToItems(
  transcript: string,
  keywords: string[],
  meta: { station: string; programa: string; isoStart: string },
): RadioItem[] {
  const baseUrl = radioItemUrl(meta.station, meta.isoStart);
  const clean = transcript.trim();
  if (!clean) return [];
  if (keywords.filter((k) => k.trim()).length === 0) {
    return [
      {
        source: meta.station,
        text: `[${meta.programa}] ${clean}`.slice(0, 2000),
        url: baseUrl,
        author: meta.station,
        publishedAt: meta.isoStart,
        matched: [],
      },
    ];
  }
  const sentences = clean.split(/(?<=[.!?])\s+/);
  const items: RadioItem[] = [];
  sentences.forEach((sentence, i) => {
    const matched = matchKeywords(sentence, keywords);
    if (matched.length === 0) return;
    items.push({
      source: meta.station,
      text: `[${meta.programa}] ${sentence.trim()}`.slice(0, 2000),
      url: `${baseUrl}#${i}`,
      author: meta.station,
      publishedAt: meta.isoStart,
      matched,
    });
  });
  return items;
}
