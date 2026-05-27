import Link from "next/link";
import { notFound } from "next/navigation";
import { getCampaign } from "@/lib/campaigns";
import { getTemplate } from "@/lib/templates";

export const metadata = { title: "Campaña · Severo Tronador" };

const ESTADO_META = {
  sent: { label: "enviado", cls: "text-emerald-600" },
  failed: { label: "fallido", cls: "text-red-600" },
  skipped: { label: "omitido", cls: "text-zinc-400" },
} as const;

const CHANNEL_LABEL: Record<string, string> = {
  email: "📧 Email",
  whatsapp: "💬 WhatsApp",
  sms: "📱 SMS",
  voice: "☎️ Voz",
};

const DELIVERY_LABEL: Record<string, string> = {
  delivered: "entregado",
  read: "leído",
  failed: "rebotó",
};

export default async function CampanaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const campaign = getCampaign(id);
  if (!campaign) notFound();

  const template = getTemplate(campaign.templateId);
  const { metrics } = campaign;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href="/campanas" className="text-sm text-zinc-500 hover:underline">
        ← Campañas
      </Link>

      <div>
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
          {campaign.nombre}
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          {CHANNEL_LABEL[campaign.channel] ?? campaign.channel} · plantilla “
          {template?.nombre ?? campaign.templateId}” ·{" "}
          {new Date(campaign.createdAt).toLocaleString("es-AR")}
        </p>
      </div>

      <div className="grid grid-cols-4 gap-3 text-center">
        {[
          { label: "Total", n: metrics.total, cls: "text-zinc-900 dark:text-zinc-100" },
          { label: "Enviados", n: metrics.sent, cls: "text-emerald-600" },
          { label: "Omitidos", n: metrics.skipped, cls: "text-zinc-500" },
          { label: "Fallidos", n: metrics.failed, cls: "text-red-600" },
        ].map((m) => (
          <div
            key={m.label}
            className="rounded-lg border border-zinc-200 py-3 dark:border-zinc-800"
          >
            <div className={`text-2xl font-semibold ${m.cls}`}>{m.n}</div>
            <div className="text-xs text-zinc-400">{m.label}</div>
          </div>
        ))}
      </div>

      <div>
        <div className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-400">
          Envíos
        </div>
        <div className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 text-sm dark:divide-zinc-800 dark:border-zinc-800">
          {campaign.envios.map((e) => {
            const meta = ESTADO_META[e.estado];
            return (
              <div
                key={e.dni}
                className="flex items-center justify-between px-4 py-2"
              >
                <Link
                  href={`/contactos/${e.dni}`}
                  className="hover:underline"
                >
                  {e.nombre}{" "}
                  <span className="text-zinc-400">{e.destino}</span>
                </Link>
                <span className={meta.cls}>
                  {meta.label}
                  {e.delivery && (
                    <span className="ml-1 text-xs text-zinc-500">
                      · {DELIVERY_LABEL[e.delivery] ?? e.delivery}
                    </span>
                  )}
                  {e.reason && (
                    <span className="ml-1 text-xs text-zinc-400">
                      ({e.reason})
                    </span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
