// Agenda visual de seguimiento de radio: próximas grabaciones programadas +
// grabaciones recientes con su estado. Server component (presentacional).
import type { RadioRun } from "@/lib/radio-runs";

const TZ = "America/Argentina/Buenos_Aires";

function fmt(ms: number): string {
  return new Date(ms).toLocaleString("es-AR", {
    timeZone: TZ,
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
function fmtIso(iso: string | null): string {
  return iso ? fmt(new Date(iso).getTime()) : "—";
}

function statusBadge(status: string, mentions: number) {
  if (status === "recording")
    return (
      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
        grabando…
      </span>
    );
  if (status === "failed")
    return (
      <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-800 dark:bg-red-950/40 dark:text-red-300">
        falló
      </span>
    );
  return (
    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
      grabado · {mentions} menc
    </span>
  );
}

export function RadioAgenda({
  upcoming,
  runs,
}: {
  upcoming: Array<{ station: string; programa: string; startMs: number; endMs: number }>;
  runs: RadioRun[];
}) {
  if (upcoming.length === 0 && runs.length === 0) return null;
  return (
    <section className="grid grid-cols-1 gap-4 rounded-lg border border-zinc-200 p-5 shadow-[var(--shadow-rest)] md:grid-cols-2 dark:border-zinc-800">
      <div>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
          Próximas grabaciones
        </h3>
        {upcoming.length === 0 ? (
          <p className="text-sm text-zinc-400">Sin programas próximos.</p>
        ) : (
          <ul className="space-y-1.5">
            {upcoming.slice(0, 12).map((o, i) => (
              <li key={i} className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate">
                  <span className="font-medium text-zinc-800 dark:text-zinc-100">{o.programa}</span>{" "}
                  <span className="text-zinc-400">· {o.station}</span>
                </span>
                <span className="shrink-0 font-mono text-[11px] tabular-nums text-zinc-500">
                  {fmt(o.startMs)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
          Grabaciones recientes
        </h3>
        {runs.length === 0 ? (
          <p className="text-sm text-zinc-400">Todavía no se grabó ningún programa.</p>
        ) : (
          <ul className="space-y-1.5">
            {runs.slice(0, 12).map((r) => (
              <li key={r.id} className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate">
                  <span className="font-medium text-zinc-800 dark:text-zinc-100">{r.programa}</span>{" "}
                  <span className="text-zinc-400">· {r.station}</span>
                  <span className="ml-1 font-mono text-[10px] text-zinc-400">{fmtIso(r.scheduledStart)}</span>
                </span>
                <span className="shrink-0">{statusBadge(r.status, r.mentions)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
