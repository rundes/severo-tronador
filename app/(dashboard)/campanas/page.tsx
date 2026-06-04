import Link from "next/link";
import { listCampaigns } from "@/lib/campaigns";
import { requireProject } from "@/lib/workspace";

export const metadata = { title: "Campañas · Severo Tronador" };

const CHANNEL_ICON: Record<string, string> = {
  email: "📧",
  whatsapp: "💬",
  sms: "📱",
  voice: "☎️",
};

export default async function CampanasPage() {
  const { id: projectId } = await requireProject();
  const campaigns = await listCampaigns(projectId);
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
          Campañas
        </h1>
        <Link
          href="/segmentos"
          className="rounded bg-zinc-900 px-3 py-1.5 text-sm text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900"
        >
          + Nueva (desde un segmento)
        </Link>
      </div>

      {campaigns.length === 0 ? (
        <p className="text-sm text-zinc-400">
          Todavía no hay campañas. Armá un segmento y tocá “Iniciar campaña”.
        </p>
      ) : (
        <div className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {campaigns.map((c) => (
            <Link
              key={c.id}
              href={`/campanas/${c.id}`}
              className="flex items-center justify-between px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-900"
            >
              <span className="text-sm">
                {c.nombre}
                <span className="ml-2 text-zinc-400">
                  {CHANNEL_ICON[c.channel]}{" "}
                  {new Date(c.createdAt).toLocaleString("es-AR")}
                </span>
              </span>
              <span className="font-mono text-xs text-zinc-500">
                {c.metrics.sent} enviados · {c.metrics.skipped} omitidos ·{" "}
                {c.metrics.failed} fallidos
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
