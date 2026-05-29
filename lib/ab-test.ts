// A/B testing helpers (Plan 03 F5). Cada campaña puede declarar N
// variantes con peso porcentual. La asignación es determinística por
// hash(dni + campaign_id) → mismo destinatario siempre cae en la misma
// variante (incluso si re-corremos la campaña).
//
// Significance test: chi-cuadrado 2x2 de dos colas. Para campañas con
// ≥30 envíos por variante reporta p-value aproximado.

import { createHash } from "node:crypto";

export interface Variant {
  id: string; // "A" | "B" | etc. Único dentro de la campaña.
  template_id: string;
  weight: number; // 0..100. Pesos no necesitan sumar 100; se normalizan.
  label?: string; // Para mostrar en UI ("Versión corta", "Tono formal").
}

export interface VariantMetrics {
  variantId: string;
  sent: number;
  responses: number;
  responseRate: number;
}

// Hash determinístico → 0..99. Misma combinación siempre mismo bucket.
export function pickVariant(
  variants: Variant[],
  dni: string,
  campaignId: string,
): Variant | null {
  if (variants.length === 0) return null;
  if (variants.length === 1) return variants[0];

  const totalWeight = variants.reduce((s, v) => s + Math.max(0, v.weight), 0);
  if (totalWeight <= 0) return variants[0];

  const hash = createHash("sha1")
    .update(`${dni}|${campaignId}`)
    .digest("hex");
  // Primeros 8 hex chars → entero 0..2^32-1 → módulo total.
  const bucket = parseInt(hash.slice(0, 8), 16) % totalWeight;

  let cumulative = 0;
  for (const v of variants) {
    cumulative += Math.max(0, v.weight);
    if (bucket < cumulative) return v;
  }
  return variants[variants.length - 1];
}

// ── Chi-cuadrado 2x2 ─────────────────────────────────────────────────────
// H0: la tasa de respuesta es igual entre dos variantes.
// Devuelve estadístico χ² + p-value aproximado (1 grado de libertad).

export interface ChiSquareResult {
  chi2: number;
  pValue: number;
  significant: boolean; // p < 0.05
  sampleTooSmall: boolean; // alguna celda esperada < 5
}

export function chiSquare2x2(
  a: { sent: number; responses: number },
  b: { sent: number; responses: number },
): ChiSquareResult {
  const aResp = a.responses;
  const aNo = a.sent - a.responses;
  const bResp = b.responses;
  const bNo = b.sent - b.responses;

  const total = a.sent + b.sent;
  if (total === 0) {
    return { chi2: 0, pValue: 1, significant: false, sampleTooSmall: true };
  }

  const totalResp = aResp + bResp;
  const totalNo = aNo + bNo;
  const expectedAResp = (a.sent * totalResp) / total;
  const expectedANo = (a.sent * totalNo) / total;
  const expectedBResp = (b.sent * totalResp) / total;
  const expectedBNo = (b.sent * totalNo) / total;

  const expected = [expectedAResp, expectedANo, expectedBResp, expectedBNo];
  const sampleTooSmall = expected.some((e) => e < 5);

  function term(observed: number, expectedV: number): number {
    if (expectedV === 0) return 0;
    return ((observed - expectedV) ** 2) / expectedV;
  }

  const chi2 =
    term(aResp, expectedAResp) +
    term(aNo, expectedANo) +
    term(bResp, expectedBResp) +
    term(bNo, expectedBNo);

  // Aproximación del p-value para χ² con 1 grado de libertad:
  // p = erfc(sqrt(chi2 / 2)). Sin libs de matemática usamos serie/
  // aproximación de erfc.
  const pValue = chi2Pvalue(chi2);
  return {
    chi2,
    pValue,
    significant: pValue < 0.05 && !sampleTooSmall,
    sampleTooSmall,
  };
}

// Aproximación de erfc para p-value de chi-square con 1 df.
function chi2Pvalue(chi2: number): number {
  if (chi2 <= 0) return 1;
  return erfc(Math.sqrt(chi2 / 2));
}

// Aproximación numérica de erfc (Abramowitz & Stegun 7.1.26).
function erfc(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * absX);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) *
      t +
      0.254829592) *
      t *
      Math.exp(-absX * absX);
  return 1 - sign * y;
}
