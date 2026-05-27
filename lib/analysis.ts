// Dashboard de cierre: corre el conector de análisis sobre las respuestas de
// una campaña y arma el debrief (tasa de respuesta, temas, sentiment).
// ARCHITECTURE §5b / §7 paso 7.
import {
  claudeApiConnector,
  type CodingOutput,
  type SentimentOutput,
} from "@/lib/connectors/claude-api";
import { getCampaign } from "@/lib/campaigns";
import { listResponses } from "@/lib/survey";

export interface Cierre {
  totalSent: number;
  totalResponses: number;
  responseRate: number; // 0..1
  themes: CodingOutput["themes"];
  sentiment: SentimentOutput;
  analyzed: number; // respuestas abiertas analizadas
  mode: string;
}

export async function analyzeCampaign(
  campaignId: string,
): Promise<Cierre | null> {
  const campaign = getCampaign(campaignId);
  if (!campaign) return null;

  const responses = listResponses(campaignId);
  const answers = responses
    .flatMap((r) => r.answers.map((a) => a.respuesta))
    .filter(Boolean);

  const coding = (
    await claudeApiConnector.analyze(answers, "coding_qualitative")
  ).output as CodingOutput;
  const sentiment = (await claudeApiConnector.analyze(answers, "sentiment"))
    .output as SentimentOutput;

  return {
    totalSent: campaign.metrics.sent,
    totalResponses: responses.length,
    responseRate: campaign.metrics.sent
      ? responses.length / campaign.metrics.sent
      : 0,
    themes: coding.themes,
    sentiment,
    analyzed: answers.length,
    mode: coding.mode,
  };
}
