import { listAudit, type AuditAction } from "@/lib/audit";
import { requireProject } from "@/lib/workspace";

export const metadata = { title: "Auditoría · Tronador" };
export const revalidate = 30;

const ACTION_LABEL: Record<AuditAction, string> = {
  "campaign.create": "Campaña creada",
  "campaign.executed": "Campaña ejecutada",
  "flow.create": "Flow creado",
  "flow.start": "Flow iniciado",
  "flow.delete": "Flow eliminado",
  "segment.save": "Segmento guardado",
  "segment.delete": "Segmento eliminado",
  "template.create": "Plantilla creada",
  "template.test_send": "Email de prueba enviado",
  "connector.config": "Conector configurado",
  "connector.toggle": "Conector toggleado",
  "listening.config": "Config de escucha",
  "mailbox.provision": "Casilla provisionada",
  "mailbox.send": "Mail enviado",
  "mailbox.address.update": "Dirección de casilla cambiada",
  "survey.create": "Encuesta creada",
  "survey.publish": "Encuesta publicada",
  "survey.send": "Encuesta enviada",
  "survey.delete": "Encuesta eliminada",
  "group.create": "Grupo creado",
  "contact.create": "Contacto cargado",
};

const ACTION_TONE: Record<AuditAction, string> = {
  "campaign.create": "bg-emerald-500",
  "campaign.executed": "bg-emerald-500",
  "flow.create": "bg-sky-500",
  "flow.start": "bg-sky-500",
  "flow.delete": "bg-red-500",
  "segment.save": "bg-amber-500",
  "segment.delete": "bg-red-500",
  "template.create": "bg-violet-500",
  "template.test_send": "bg-violet-400",
  "connector.config": "bg-zinc-500",
  "connector.toggle": "bg-zinc-500",
  "listening.config": "bg-zinc-500",
  "mailbox.provision": "bg-teal-500",
  "mailbox.send": "bg-teal-500",
  "mailbox.address.update": "bg-teal-500",
  "survey.create": "bg-indigo-500",
  "survey.publish": "bg-indigo-500",
  "survey.send": "bg-indigo-500",
  "survey.delete": "bg-red-500",
  "group.create": "bg-amber-500",
  "contact.create": "bg-emerald-500",
};

function ago(iso: string): string {
  const ms = Date.now() - +new Date(iso);
  const m = Math.round(ms / 60000);
  if (m < 1) return "ahora";
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.round(h / 24);
  return `${d}d`;
}

export default async function AuditoriaPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | undefined>>;
}) {
  const params = (await searchParams) ?? {};
  const { id: projectId } = await requireProject();
  const action = params.action as AuditAction | undefined;
  const actor = params.actor;
  const entries = await listAudit({ projectId, limit: 200, action, actor });

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          Auditoría
        </h1>
        <p className="mt-1 max-w-[60ch] text-sm text-zinc-500">
          Registro inmutable de acciones del panel. Quién hizo qué, sobre
          qué entidad, con qué detalles.
        </p>
      </header>

      {(action || actor) && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-zinc-500">Filtros activos:</span>
          {action && (
            <FilterChip label={ACTION_LABEL[action] ?? action} clearParam="action" current={params} />
          )}
          {actor && (
            <FilterChip label={actor} clearParam="actor" current={params} />
          )}
        </div>
      )}

      {entries.length === 0 ? (
        <p className="rounded-lg border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500 dark:border-zinc-700">
          Sin registros que coincidan.
        </p>
      ) : (
        <ol className="space-y-1.5">
          {entries.map((e) => (
            <li
              key={e.id}
              className="flex gap-3 rounded-lg border border-zinc-200 px-4 py-3 dark:border-zinc-800"
            >
              <div
                aria-hidden
                className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${ACTION_TONE[e.action] ?? "bg-zinc-400"}`}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-2 text-sm">
                  <span className="font-medium text-zinc-800 dark:text-zinc-100">
                    {ACTION_LABEL[e.action] ?? e.action}
                  </span>
                  {e.actor && (
                    <a
                      href={`/auditoria?actor=${encodeURIComponent(e.actor)}`}
                      className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[10px] text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300"
                    >
                      {e.actor}
                    </a>
                  )}
                  {e.entity_id && (
                    <span className="font-mono text-[10px] text-zinc-400">
                      {e.entity_type}#{e.entity_id.slice(0, 8)}
                    </span>
                  )}
                  <span className="ml-auto font-mono text-[10px] text-zinc-400">
                    {ago(e.at)}
                  </span>
                </div>
                {Object.keys(e.details).length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-500">
                    {Object.entries(e.details).map(([k, v]) => (
                      <span key={k}>
                        <span className="text-zinc-400">{k}:</span>{" "}
                        <span className="font-mono">{String(v)}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function FilterChip({
  label,
  clearParam,
  current,
}: {
  label: string;
  clearParam: string;
  current: Record<string, string | undefined>;
}) {
  const next = new URLSearchParams();
  for (const [k, v] of Object.entries(current)) {
    if (k !== clearParam && v) next.set(k, v);
  }
  const href = next.toString() ? `/auditoria?${next}` : "/auditoria";
  return (
    <a
      href={href}
      className="flex items-center gap-1 rounded-full border border-zinc-300 px-2 py-0.5 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200"
    >
      {label} ✕
    </a>
  );
}
