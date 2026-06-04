// Vista pública read-only de una campaña, accesible via token firmado
// (Plan 03 F6.3). Sin auth: el HMAC garantiza la integridad del
// campaign_id + expiry, no se necesita sesión del panel.
import Link from "next/link";
import { notFound } from "next/navigation";
import Image from "next/image";
import { verifyShareToken } from "@/lib/share-token";
import { getCampaign } from "@/lib/campaigns";
import { getTemplate } from "@/lib/templates";
import { listResponses } from "@/lib/survey";
import { chiSquare2x2 } from "@/lib/ab-test";
import { DEFAULT_PROJECT_ID } from "@/lib/projects";

export const metadata = { title: "Reporte · Tronador" };

const CHANNEL_LABEL: Record<string, string> = {
  email: "📧 Email",
  whatsapp: "💬 WhatsApp",
  sms: "📱 SMS",
  voice: "☎️ Voz",
};

function fmtPct(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

export default async function ShareCampaignPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const verify = verifyShareToken(token);

  if (!verify.ok || !verify.payload || verify.payload.t !== "campaign" || !verify.payload.id) {
    return (
      <main
        className="flex min-h-screen items-center justify-center px-4 py-10"
        style={{ backgroundColor: "oklch(93% 0.012 80)" }}
      >
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-semibold text-[oklch(28%_0.06_250)]">
            Link inválido
          </h1>
          <p className="mt-3 text-sm text-[oklch(45%_0.04_250)]">
            Este reporte no se puede mostrar.{" "}
            {verify.reason === "expired"
              ? "El link expiró. Pediles uno nuevo a quien te lo compartió."
              : "La firma no coincide. Verificá que copiaste el link completo."}
          </p>
          <Link
            href="/"
            className="mt-6 inline-block rounded-full bg-[oklch(28%_0.06_250)] px-6 py-2 text-sm font-medium text-[oklch(96%_0.01_80)]"
          >
            Ir a tronador.net.ar
          </Link>
        </div>
      </main>
    );
  }

  // pid puede faltar en links viejos (pre-multitenant) → proyecto default.
  const pid = verify.payload.pid ?? DEFAULT_PROJECT_ID;
  const campaign = await getCampaign(pid, verify.payload.id);
  if (!campaign) notFound();

  const template = await getTemplate(campaign.templateId);
  const respuestasList = await listResponses(pid, campaign.id);
  const responseTokens = new Set(respuestasList.map((r) => r.token));
  const responses = respuestasList.length;
  const responseRate =
    campaign.metrics.sent > 0 ? responses / campaign.metrics.sent : 0;

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
            ...v,
            sent: enviosV.length,
            responses: respV,
            responseRate: enviosV.length > 0 ? respV / enviosV.length : 0,
          };
        })
      : [];

  const sig =
    variantBreakdown.length >= 2
      ? chiSquare2x2(
          {
            sent: variantBreakdown[0].sent,
            responses: variantBreakdown[0].responses,
          },
          {
            sent: variantBreakdown[1].sent,
            responses: variantBreakdown[1].responses,
          },
        )
      : null;

  const expiryDate = new Date(verify.payload.exp);

  return (
    <main
      className="min-h-screen px-4 py-10 sm:px-6"
      style={{ backgroundColor: "oklch(93% 0.012 80)" }}
    >
      <div className="mx-auto max-w-3xl space-y-8">
        {/* Header con branding */}
        <header className="flex items-start justify-between gap-4 border-b border-[oklch(80%_0.02_80)]/60 pb-6">
          <Link href="/" className="flex items-center gap-2">
            <Image
              src="/brand/tronador-mark.jpeg"
              alt="Tronador"
              width={36}
              height={36}
              className="rounded-sm"
            />
            <span className="font-mono text-sm font-semibold tracking-[0.18em] text-[oklch(28%_0.06_250)]">
              TRONADOR
            </span>
          </Link>
          <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-[oklch(55%_0.04_250)]">
            Reporte público · expira {expiryDate.toLocaleDateString("es-AR")}
          </span>
        </header>

        {/* Title */}
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[oklch(55%_0.08_80)]">
            Reporte de campaña
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-[oklch(28%_0.06_250)] sm:text-4xl">
            {campaign.nombre}
          </h1>
          <p className="mt-2 text-sm text-[oklch(45%_0.04_250)]">
            {CHANNEL_LABEL[campaign.channel] ?? campaign.channel} · creada{" "}
            {new Date(campaign.createdAt).toLocaleDateString("es-AR")} ·{" "}
            estado {campaign.estado}
          </p>
        </div>

        {/* KPIs */}
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Audiencia" value={campaign.metrics.total} />
          <Stat label="Enviados" value={campaign.metrics.sent} />
          <Stat
            label="Respuestas"
            value={responses}
            sub={fmtPct(responseRate)}
          />
          <Stat label="Fallidos" value={campaign.metrics.failed} />
        </section>

        {/* Plantilla */}
        {template && (
          <section className="rounded-lg border border-[oklch(80%_0.02_80)]/80 bg-[oklch(96%_0.012_80)] p-5">
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[oklch(55%_0.04_250)]">
              Mensaje enviado
            </p>
            {template.asunto && (
              <p className="mt-2 text-sm font-semibold text-[oklch(28%_0.06_250)]">
                {template.asunto}
              </p>
            )}
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[oklch(35%_0.04_250)]">
              {template.cuerpo}
            </p>
          </section>
        )}

        {/* A/B */}
        {variantBreakdown.length >= 2 && (
          <section>
            <div className="mb-2 flex items-baseline justify-between">
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[oklch(55%_0.04_250)]">
                A/B testing
              </p>
              {sig && !sig.sampleTooSmall && (
                <span
                  className={`font-mono text-[10px] uppercase tracking-wider ${
                    sig.significant
                      ? "text-emerald-700"
                      : "text-[oklch(55%_0.04_250)]"
                  }`}
                >
                  χ²={sig.chi2.toFixed(2)} · p={sig.pValue.toFixed(3)}
                </span>
              )}
            </div>
            <table className="w-full overflow-hidden rounded-lg border border-[oklch(80%_0.02_80)]/80 text-sm">
              <thead className="bg-[oklch(96%_0.012_80)] text-left text-[10px] uppercase tracking-wider text-[oklch(55%_0.04_250)]">
                <tr>
                  <th className="px-3 py-2 font-medium">Variante</th>
                  <th className="px-3 py-2 font-medium text-right">Enviados</th>
                  <th className="px-3 py-2 font-medium text-right">Resp</th>
                  <th className="px-3 py-2 font-medium text-right">RR</th>
                </tr>
              </thead>
              <tbody>
                {variantBreakdown.map((v) => (
                  <tr key={v.id} className="border-t border-[oklch(80%_0.02_80)]/60">
                    <td className="px-3 py-2 font-mono text-xs">
                      {v.id}
                      {v.label ? ` · ${v.label}` : ""}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{v.sent}</td>
                    <td className="px-3 py-2 text-right font-mono">
                      {v.responses}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {fmtPct(v.responseRate)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {/* Footer */}
        <footer className="border-t border-[oklch(80%_0.02_80)]/60 pt-6 text-center text-[10px] uppercase tracking-[0.22em] text-[oklch(55%_0.04_250)]">
          Centro de Estudios Políticos y Electorales ·{" "}
          <a href="https://cpelectoral.org" className="underline">
            cpelectoral.org
          </a>
        </footer>
      </div>
    </main>
  );
}

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: number;
  sub?: string;
}) {
  return (
    <div className="rounded-lg border border-[oklch(80%_0.02_80)]/80 bg-[oklch(96%_0.012_80)] p-3">
      <div className="text-3xl font-bold tabular-nums text-[oklch(28%_0.06_250)]">
        {value.toLocaleString()}
      </div>
      <div className="mt-0.5 flex items-baseline gap-2">
        <span className="text-[10px] font-medium uppercase tracking-wider text-[oklch(55%_0.04_250)]">
          {label}
        </span>
        {sub && (
          <span className="font-mono text-xs text-[oklch(60%_0.13_80)]">
            {sub}
          </span>
        )}
      </div>
    </div>
  );
}
