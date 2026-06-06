import Link from "next/link";
import { listCampaigns } from "@/lib/campaigns";
import { requireProject } from "@/lib/workspace";
import { Hint } from "@/components/ui/hint";
import { PageHeader } from "@/components/ui/page-header";

export const metadata = { title: "Campañas · Severo Tronador" };

const CHANNEL_ICON: Record<string, string> = {
  email: "📧",
  whatsapp: "💬",
  sms: "📱",
  voice: "☎️",
  telegram: "✈️",
};

function relativeDate(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "—";
  const m = Math.floor((Date.now() - t) / 60000);
  if (m < 1) return "ahora";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} d`;
  return new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "short" });
}

const ESTADO_BADGE: Record<string, string> = {
  enviada: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
  encolada: "bg-[oklch(95%_0.04_255)] text-[oklch(45%_0.13_255)] dark:bg-[oklch(35%_0.06_255)] dark:text-[oklch(82%_0.08_255)]",
  enviando: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
};

export default async function CampanasPage() {
  const { id: projectId } = await requireProject();
  const campaigns = await listCampaigns(projectId);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Campañas"
        subtitle="Cada campaña es un envío a un segmento, por un canal, respetando cuota y cooldowns."
        action={
          <Link
            href="/segmentos"
            className="rounded-lg bg-[oklch(52%_0.13_255)] px-3.5 py-2 text-sm font-medium text-white hover:bg-[oklch(47%_0.13_255)]"
          >
            + Nueva (desde un segmento)
          </Link>
        }
      />

      <Hint id="campanas-flujo" title="Cómo armar una campaña" cta={{ href: "/segmentos", label: "Ir a Segmentos" }}>
        Una campaña sale de un <strong>segmento</strong>: definí el público en
        Segmentos y tocá <strong>“Iniciar campaña”</strong>. Para secuencias
        (ej. invitación + recordatorio a las 48&nbsp;h) usá <strong>Flows</strong>.
      </Hint>

      {campaigns.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 px-6 py-12 text-center dark:border-zinc-700">
          <p className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
            Todavía no hay campañas
          </p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-zinc-500">
            Armá un segmento y tocá “Iniciar campaña” para enviar tu primer
            relevamiento.
          </p>
          <Link
            href="/segmentos"
            className="mt-4 inline-block rounded-lg bg-[oklch(52%_0.13_255)] px-4 py-2 text-sm font-medium text-white hover:bg-[oklch(47%_0.13_255)]"
          >
            Crear segmento
          </Link>
        </div>
      ) : (
        <ol className="divide-y divide-zinc-100 overflow-hidden rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {campaigns.map((c) => (
            <li key={c.id}>
              <Link
                href={`/campanas/${c.id}`}
                className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900/50"
              >
                <span aria-hidden className="text-lg">{CHANNEL_ICON[c.channel] ?? "•"}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    {c.nombre}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-zinc-500">
                    <span className={`rounded-full px-1.5 py-0.5 font-medium ${ESTADO_BADGE[c.estado] ?? ""}`}>
                      {c.estado}
                    </span>
                    <span>{relativeDate(c.createdAt)}</span>
                  </div>
                </div>
                <div className="shrink-0 text-right text-xs tabular-nums text-zinc-500">
                  <span className="text-emerald-600 dark:text-emerald-400">{c.metrics.sent} env.</span>
                  {c.metrics.failed > 0 && (
                    <span className="text-red-600 dark:text-red-400"> · {c.metrics.failed} fall.</span>
                  )}
                  {c.metrics.skipped > 0 && <span> · {c.metrics.skipped} omit.</span>}
                </div>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
