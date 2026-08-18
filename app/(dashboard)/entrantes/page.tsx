import Link from "next/link";
import { listInbound, type InboundRow } from "@/lib/inbound-store";
import { requireProject } from "@/lib/workspace";
import { PageHeader } from "@/components/ui/page-header";

export const metadata = { title: "Entrantes · Tronador" };
export const revalidate = 30;

const CHANNELS = ["whatsapp", "telegram", "sms"] as const;

const CHANNEL_LABEL: Record<string, string> = {
  whatsapp: "WhatsApp",
  telegram: "Telegram",
  sms: "SMS",
};

function ago(iso: string | undefined): string {
  if (!iso) return "—";
  const m = Math.round((Date.now() - +new Date(iso)) / 60000);
  if (m < 1) return "ahora";
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

function buildHref(params: Record<string, string | undefined>, patch: Record<string, string | undefined>): string {
  const next = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...params, ...patch })) {
    if (v) next.set(k, v);
  }
  const qs = next.toString();
  return qs ? `/entrantes?${qs}` : "/entrantes";
}

export default async function EntrantesPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | undefined>>;
}) {
  const params = (await searchParams) ?? {};
  const { id: projectId } = await requireProject();
  const canal = params.canal;
  const huerfanos = params.huerfanos === "1";
  const rows = await listInbound({
    projectId,
    channel: canal,
    onlyOrphans: huerfanos,
    limit: 200,
  });

  const orphanCount = rows.filter((r) => r.dni === null).length;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        eyebrow="Operación"
        title="Entrantes"
        subtitle="Mensajes recibidos por WhatsApp, Telegram y SMS. Los que matchean el padrón se asocian al contacto; los huérfanos indican teléfonos a corregir."
      />

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <FilterLink
          label="Todos"
          active={!canal}
          href={buildHref(params, { canal: undefined })}
        />
        {CHANNELS.map((c) => (
          <FilterLink
            key={c}
            label={CHANNEL_LABEL[c]}
            active={canal === c}
            href={buildHref(params, { canal: canal === c ? undefined : c })}
          />
        ))}
        <span className="mx-1 h-4 w-px bg-zinc-200 dark:bg-zinc-800" aria-hidden />
        <FilterLink
          label={`Solo huérfanos${!canal && !huerfanos && orphanCount ? ` (${orphanCount})` : ""}`}
          active={huerfanos}
          href={buildHref(params, { huerfanos: huerfanos ? undefined : "1" })}
        />
      </div>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500 dark:border-zinc-700">
          Sin mensajes entrantes{canal ? ` de ${CHANNEL_LABEL[canal] ?? canal}` : ""}
          {huerfanos ? " sin match" : ""}. Los replies de vecinos van a aparecer acá.
        </p>
      ) : (
        <ol className="space-y-1.5">
          {rows.map((r) => (
            <InboundItem key={r.id ?? `${r.channel}-${r.provider_message_id}`} row={r} />
          ))}
        </ol>
      )}
    </div>
  );
}

function InboundItem({ row }: { row: InboundRow }) {
  return (
    <li className="rounded-lg border border-zinc-200 px-4 py-3 dark:border-zinc-800">
      <div className="flex flex-wrap items-baseline gap-2 text-sm">
        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
          {CHANNEL_LABEL[row.channel] ?? row.channel}
        </span>
        {row.dni ? (
          <Link
            href={`/contactos/${row.dni}`}
            className="font-mono text-[11px] tabular-nums text-zinc-700 underline-offset-2 hover:underline dark:text-zinc-200"
          >
            DNI {row.dni}
          </Link>
        ) : (
          <span className="text-xs text-amber-600 dark:text-amber-500">
            sin match — {row.sender_external_id}
          </span>
        )}
        {row.is_opt_out && (
          <span className="text-xs font-medium text-red-600 dark:text-red-500">
            baja
          </span>
        )}
        {row.respuesta_token && (
          <span className="text-xs text-emerald-600 dark:text-emerald-500">
            → respuesta de encuesta
          </span>
        )}
        <span className="ml-auto font-mono text-[10px] tabular-nums text-zinc-500 dark:text-zinc-400">
          {ago(row.received_at)}
        </span>
      </div>
      <p className="mt-1 max-w-[75ch] text-sm text-zinc-700 dark:text-zinc-300">
        {row.body || <span className="italic text-zinc-500 dark:text-zinc-400">(sin texto)</span>}
      </p>
    </li>
  );
}

function FilterLink({
  label,
  active,
  href,
}: {
  label: string;
  active: boolean;
  href: string;
}) {
  return (
    <Link
      href={href}
      className={
        active
          ? "rounded-full border border-[oklch(52%_0.13_255)] bg-[oklch(52%_0.13_255)]/10 px-2.5 py-0.5 text-xs font-medium text-zinc-800 dark:text-zinc-100"
          : "rounded-full border border-zinc-300 px-2.5 py-0.5 text-xs text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
      }
    >
      {label}
    </Link>
  );
}
