// Estimación de duración de un guion TTS (Plan 02 — F2.4). Aproximación
// pragmática: español neutro ~150 palabras/min en TTS. Sirve para mostrar
// "guion de 80 palabras → ~32 segundos" y catchar guiones absurdamente
// largos para llamadas.

const WORDS_PER_MINUTE = 150;
const SECONDS_PER_WORD = 60 / WORDS_PER_MINUTE; // 0.4

export interface VoiceEstimate {
  words: number;
  seconds: number;
  // Pausas explícitas (<pause/>, …) suman 1s cada una.
  pauses: number;
}

export function estimateVoiceScript(text: string): VoiceEstimate {
  const pauses = (text.match(/<pause\s*\/?>/gi) ?? []).length +
    (text.match(/\.\.\./g) ?? []).length;
  const stripped = text
    .replace(/<[^>]+>/g, "")
    .replace(/[.,;:!?¿¡]/g, " ");
  const words = stripped
    .split(/\s+/)
    .filter((w) => w.length > 0).length;
  const seconds = Math.round(words * SECONDS_PER_WORD + pauses);
  return { words, seconds, pauses };
}
