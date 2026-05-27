// Encuestas tokenizadas (F6). Cada envío lleva un token único que abre la
// landing pública /encuesta/[token]. El token resuelve a {campaña, dni} sin
// exponer datos personales en la URL. Dedupe: una respuesta por token.
// F6: stores en memoria; en producción son hojas + columna token en `envios`.
import { randomUUID } from "crypto";

interface TokenRef {
  campaignId: string;
  dni: string;
}

interface TokenStore {
  byToken: Map<string, TokenRef>;
}

export interface SurveyResponse {
  token: string;
  campaignId: string;
  dni: string;
  answers: { pregunta: string; respuesta: string }[];
  at: string;
}

const g = globalThis as unknown as {
  __surveyTokens?: TokenStore;
  __surveyResponses?: SurveyResponse[];
};
const tokens: TokenStore = (g.__surveyTokens ??= { byToken: new Map() });
const responses: SurveyResponse[] = (g.__surveyResponses ??= []);

export function createToken(campaignId: string, dni: string): string {
  const token = randomUUID();
  tokens.byToken.set(token, { campaignId, dni });
  return token;
}

export function resolveToken(token: string): TokenRef | undefined {
  return tokens.byToken.get(token);
}

export function hasResponded(token: string): boolean {
  return responses.some((r) => r.token === token);
}

export function addResponse(
  token: string,
  answers: { pregunta: string; respuesta: string }[],
): SurveyResponse | null {
  const ref = resolveToken(token);
  if (!ref) return null;
  if (hasResponded(token)) return null; // dedupe: una respuesta por token
  const r: SurveyResponse = {
    token,
    campaignId: ref.campaignId,
    dni: ref.dni,
    answers,
    at: new Date().toISOString(),
  };
  responses.push(r);
  return r;
}

export function listResponses(campaignId?: string): SurveyResponse[] {
  const all = campaignId
    ? responses.filter((r) => r.campaignId === campaignId)
    : responses;
  return [...all].sort((a, b) => b.at.localeCompare(a.at));
}
