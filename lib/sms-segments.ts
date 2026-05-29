// Conteo de segmentos SMS (Plan 02 — F2.3). Las operadoras cobran por
// "parte" de SMS, no por mensaje conceptual. Una parte = 160 chars GSM-7 o
// 70 chars UCS-2 (si hay emoji/acento/no-GSM).
//
// Para texto > 1 parte el header de concatenación recorta a 153 (GSM-7) o
// 67 (UCS-2) chars por parte.

// Caracteres del set GSM-7 (subset reducido para el chequeo). Si todos los
// chars del mensaje están acá, se codifica GSM-7. Si alguno se sale, todo el
// mensaje pasa a UCS-2.
const GSM_7 =
  // Letras ASCII básicas + dígitos
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789" +
  // Puntuación
  " !\"#$%&'()*+,-./:;<=>?@_¡¿\n\r" +
  // Letras con acento permitidas en GSM-7 (subset)
  "ÄÅÆÇÉÑÖØÜßäåæçèéìñòöùüΓΔΘΛΞΠΣΦΨΩ" +
  // Símbolos extendidos (cuentan doble en GSM-7)
  "^{}[]~|€\\";

// Símbolos extendidos GSM-7 — cuentan como 2 caracteres.
const GSM_7_EXTENDED = "^{}[]~|€\\";

export type SmsEncoding = "GSM-7" | "UCS-2";

export interface SmsSegments {
  encoding: SmsEncoding;
  length: number; // chars contados (extendidos cuentan doble en GSM-7)
  parts: number; // 1, 2, 3…
  perPart: number; // 160/153 GSM-7, 70/67 UCS-2
  remaining: number; // chars restantes en la parte actual
}

export function countSmsSegments(text: string): SmsSegments {
  // Encoding: si TODO el texto está en GSM_7, GSM-7. Sino UCS-2.
  let isGsm = true;
  for (const ch of text) {
    if (!GSM_7.includes(ch)) {
      isGsm = false;
      break;
    }
  }
  if (isGsm) {
    // Sumar 2 por cada char extendido.
    let length = 0;
    for (const ch of text) length += GSM_7_EXTENDED.includes(ch) ? 2 : 1;
    if (length <= 160) {
      return {
        encoding: "GSM-7",
        length,
        parts: 1,
        perPart: 160,
        remaining: 160 - length,
      };
    }
    const parts = Math.ceil(length / 153);
    return {
      encoding: "GSM-7",
      length,
      parts,
      perPart: 153,
      remaining: parts * 153 - length,
    };
  }
  // UCS-2: cuenta visual de chars (no graphemes — emoji compuesto puede
  // contar como 2). Suficiente para estimación operativa.
  const length = [...text].length;
  if (length <= 70) {
    return { encoding: "UCS-2", length, parts: 1, perPart: 70, remaining: 70 - length };
  }
  const parts = Math.ceil(length / 67);
  return {
    encoding: "UCS-2",
    length,
    parts,
    perPart: 67,
    remaining: parts * 67 - length,
  };
}
