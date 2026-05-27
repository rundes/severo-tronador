import Link from "next/link";
import { FilterForm } from "@/components/segmentos/filter-form";
import { HealthBadge } from "@/components/health-badge";
import {
  applySegment,
  barriosDisponibles,
  filterFromParams,
  loadContacts,
} from "@/lib/segments";
import {
  CHANNELS,
  channelAvailable,
  healthBand,
  type Channel,
} from "@/lib/relationship";

export const metadata = { title: "Segmentos · Severo Tronador" };

const CHANNEL_LABEL: Record<Channel, string> = {
  email: "📧 Email",
  whatsapp: "💬 WhatsApp",
  sms: "📱 SMS",
  voice: "☎️ Voz",
};

function Bar({ n, total }: { n: number; total: number }) {
  const pct = total ? Math.round((n / total) * 100) : 0;
  const filled = Math.round((pct / 100) * 24);
  return (
    <span className="font-mono text-xs text-zinc-400">
      {"█".repeat(filled)}
      {"░".repeat(24 - filled)} {pct}%
    </span>
  );
}

export default async function SegmentosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const filter = filterFromParams(params);
  const all = await loadContacts();
  const matched = applySegment(all, filter);

  const bands = { green: 0, yellow: 0, red: 0 };
  for (const m of matched) bands[healthBand(m.rel.healthScore)]++;

  const available: Record<Channel, number> = {
    email: 0,
    whatsapp: 0,
    sms: 0,
    voice: 0,
  };
  for (const m of matched)
    for (const ch of CHANNELS)
      if (channelAvailable(m.rel, ch)) available[ch]++;

  const total = matched.length;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
          Segmentos
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Constructor de audiencias sobre el padrón. La calidad sobre la
          cantidad: 80 correctos valen más que 8.000 random.
        </p>
      </div>

      <FilterForm barrios={barriosDisponibles(all)} />

      <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <div className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
          {total}{" "}
          <span className="text-base font-normal text-zinc-500">
            {total === 1 ? "persona" : "personas"}
          </span>
        </div>

        <div className="mt-4">
          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-400">
            Distribución de salud
          </div>
          <div className="space-y-0.5 text-sm">
            <div className="flex items-center gap-3">
              🟢 sanas <span className="w-8 text-right">{bands.green}</span>{" "}
              <Bar n={bands.green} total={total} />
            </div>
            <div className="flex items-center gap-3">
              🟡 tibias <span className="w-8 text-right">{bands.yellow}</span>{" "}
              <Bar n={bands.yellow} total={total} />
            </div>
            <div className="flex items-center gap-3">
              🔴 deterioradas{" "}
              <span className="w-8 text-right">{bands.red}</span>{" "}
              <Bar n={bands.red} total={total} />
            </div>
          </div>
        </div>

        <div className="mt-4">
          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-400">
            Disponibles para contacto hoy
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-zinc-600 dark:text-zinc-300">
            {CHANNELS.map((ch) => (
              <span key={ch}>
                {CHANNEL_LABEL[ch]}: {available[ch]}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div>
        <div className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-400">
          Vista previa {total > 50 && "(primeros 50)"}
        </div>
        <div className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {matched.slice(0, 50).map(({ contact, rel, edad }) => (
            <Link
              key={contact.dni}
              href={`/contactos/${contact.dni}`}
              className="flex items-center justify-between px-4 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-900"
            >
              <span className="text-sm">
                {contact.nombre} {contact.apellido}
                <span className="ml-2 text-zinc-400">
                  {edad ?? "—"} · {contact.barrio}
                </span>
              </span>
              <HealthBadge score={rel.healthScore} />
            </Link>
          ))}
          {total === 0 && (
            <div className="px-4 py-6 text-center text-sm text-zinc-400">
              Ningún contacto coincide con estos filtros.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
