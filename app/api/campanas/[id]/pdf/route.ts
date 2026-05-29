// PDF de la campaña (Plan 03 F6.1). GET autenticado vía middleware.
// Reusa el shape de /campanas/[id]/page: getCampaign + template + responses
// + variant breakdown.
import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { getCampaign } from "@/lib/campaigns";
import { getTemplate } from "@/lib/templates";
import { listResponses } from "@/lib/survey";
import { CampaignPdfDocument } from "@/lib/pdf/campaign-pdf";
import { log } from "@/lib/logger";

export const runtime = "nodejs"; // react-pdf necesita node, no edge.

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const campaign = await getCampaign(id);
  if (!campaign) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const [template, respuestasList] = await Promise.all([
    getTemplate(campaign.templateId),
    listResponses(campaign.id),
  ]);
  const responses = respuestasList.length;

  // Variant breakdown si A/B activo.
  const responseTokens = new Set(respuestasList.map((r) => r.token));
  const variantBreakdown =
    campaign.variants.length >= 2
      ? campaign.variants.map((v) => {
          const enviosV = campaign.envios.filter(
            (e) => e.variantId === v.id && e.estado === "sent",
          );
          const respV = enviosV.filter(
            (e) => e.token && responseTokens.has(e.token),
          ).length;
          return {
            id: v.id,
            label: v.label,
            sent: enviosV.length,
            responses: respV,
            responseRate: enviosV.length > 0 ? respV / enviosV.length : 0,
          };
        })
      : [];

  // Sample envío: primero sent con respuesta, sino primero sent.
  const respondedFirst = campaign.envios.find(
    (e) =>
      e.estado === "sent" && e.token && responseTokens.has(e.token),
  );
  const sampleEnvio =
    respondedFirst ?? campaign.envios.find((e) => e.estado === "sent") ?? null;

  try {
    const buffer = await renderToBuffer(
      CampaignPdfDocument({
        campaign,
        template: template
          ? {
              nombre: template.nombre,
              asunto: template.asunto ?? null,
              cuerpo: template.cuerpo,
            }
          : null,
        responses,
        sampleEnvio,
        generatedAt: new Date().toLocaleString("es-AR"),
        variantBreakdown,
      }),
    );
    log.info("pdf.campaign.generated", {
      campaign_id: campaign.id,
      bytes: buffer.length,
    });
    const filename = `tronador-${slug(campaign.nombre)}-${campaign.id.slice(0, 8)}.pdf`;
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    log.error("pdf.campaign.failed", {
      campaign_id: campaign.id,
      msg: (err as Error).message,
    });
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "")
    .slice(0, 40);
}
