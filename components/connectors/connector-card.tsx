import type { Connector, ConnectorStatus, Quota } from "@/lib/connectors/types";
import type { FieldStatus } from "@/lib/connectors/config";
import type { ConnectorHealth } from "@/lib/connectors/health";
import { ConfigButton } from "@/components/connectors/config-modal";

const STATUS_META: Record<
  ConnectorStatus,
  { label: string; dot: string; text: string }
> = {
  enabled: { label: "activo", dot: "bg-emerald-500", text: "text-emerald-700" },
  configuring: {
    label: "sin configurar",
    dot: "bg-amber-400",
    text: "text-amber-700",
  },
  paused: { label: "pausado", dot: "bg-zinc-400", text: "text-zinc-600" },
  error: { label: "error", dot: "bg-red-500", text: "text-red-700" },
  quota_exhausted: {
    label: "cuota agotada",
    dot: "bg-red-400",
    text: "text-red-700",
  },
  not_installed: {
    label: "no instalado",
    dot: "bg-zinc-300",
    text: "text-zinc-500",
  },
};

function quotaLabel(q: Quota): string {
  return `${q.used.toLocaleString("es-AR")}/${q.limit.toLocaleString("es-AR")} ${q.unit}`;
}

function HealthBadge({ health }: { health: ConnectorHealth }) {
  if (health.ok) {
    return (
      <span className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400">
        <span className="inline-flex items-center rounded-full bg-emerald-50 px-1.5 py-0.5 font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20 dark:bg-emerald-950 dark:text-emerald-400 dark:ring-emerald-500/20">
          Conecta
        </span>
        <span className="truncate max-w-[22ch] text-zinc-500 dark:text-zinc-400">
          {health.message}
        </span>
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5 text-xs text-red-700 dark:text-red-400">
      <span className="inline-flex items-center rounded-full bg-red-50 px-1.5 py-0.5 font-medium text-red-700 ring-1 ring-inset ring-red-600/20 dark:bg-red-950 dark:text-red-400 dark:ring-red-500/20">
        No conecta
      </span>
      <span className="truncate max-w-[22ch] text-zinc-500 dark:text-zinc-400">
        {health.message}
      </span>
    </span>
  );
}

export function ConnectorCard({
  connector,
  status,
  quota,
  health,
  fields,
  enabled,
  setupUrl,
  guardar,
  probar,
  toggle,
  borrar,
}: {
  connector: Connector;
  status: ConnectorStatus;
  quota: Quota | null;
  health: ConnectorHealth | null;
  fields: FieldStatus[];
  enabled: boolean;
  setupUrl: string;
  guardar: (fd: FormData) => Promise<{ ok: boolean; message?: string }>;
  probar: (fd: FormData) => Promise<{ ok: boolean; message: string }>;
  toggle: (enabled: boolean) => Promise<void>;
  borrar: () => Promise<void>;
}) {
  const meta = STATUS_META[status];
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-start gap-3">
        <span className="text-2xl leading-none" aria-hidden>
          {connector.iconEmoji}
        </span>
        <div>
          <div className="font-medium text-zinc-900 dark:text-zinc-100">
            {connector.name}
          </div>
          <div className="text-sm text-zinc-500 dark:text-zinc-400">
            {connector.description}
          </div>
          {health && (
            <div className="mt-1">
              <HealthBadge health={health} />
            </div>
          )}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className={`flex items-center gap-1.5 text-sm ${meta.text}`}>
          <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
          {meta.label}
        </span>
        {quota && (
          <span className="font-mono text-xs text-zinc-500">
            {quotaLabel(quota)}
          </span>
        )}
        <ConfigButton
          name={connector.name}
          fields={fields}
          enabled={enabled}
          setupUrl={setupUrl}
          guardar={guardar}
          probar={probar}
          toggle={toggle}
          borrar={borrar}
        />
      </div>
    </div>
  );
}
