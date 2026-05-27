import type { Connector, ConnectorStatus, Quota } from "@/lib/connectors/types";
import type { FieldStatus } from "@/lib/connectors/config";
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

export function ConnectorCard({
  connector,
  status,
  quota,
  note,
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
  note?: string;
  fields: FieldStatus[];
  enabled: boolean;
  setupUrl: string;
  guardar: (fd: FormData) => Promise<void>;
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
            {note ?? connector.description}
          </div>
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
