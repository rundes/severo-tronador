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
