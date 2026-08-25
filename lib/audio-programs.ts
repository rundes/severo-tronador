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
