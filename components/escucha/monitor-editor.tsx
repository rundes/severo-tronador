// Editor del escenario de monitoreo electoral (server-first): cuentas del
// plan de colecta, búsquedas simétricas, calendario, memoria de errores y
// definiciones. Editor por líneas, en línea con el patrón de config de fuentes.
//
// Con una propuesta de IA pendiente (lib/scenario-ai), los campos que la IA
// produce se prellenan con la propuesta y muestran "vigente → propuesto";
// Guardar aplica. noRepetir y budget no los toca la IA.
import { guardarMonitor } from "@/app/(dashboard)/escucha/actions";
import { SubmitButton, FormStatus } from "@/components/ui/submit-button";
import type { MonitorConfig } from "@/lib/monitor-config";
import type { ScenarioProposal } from "@/lib/client-brief";

const inputCls =
  "w-full rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 font-mono text-[12px] text-zinc-900 focus-visible:border-[oklch(52%_0.13_255)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[oklch(52%_0.13_255)]/12 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";

function Field({ label, children, hint, diff }: { label: string; children: React.ReactNode; hint?: React.ReactNode; diff?: string }) {
  return (
    <div className="space-y-1">
      <label className="flex flex-col gap-1">
        <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-500">
          {label}
          {diff && <span className="ml-2 normal-case tracking-normal text-amber-700 dark:text-amber-300">{diff}</span>}
        </span>
        {children}
      </label>
      {hint && <p className="max-w-[70ch] text-xs text-zinc-500">{hint}</p>}
    </div>
  );
}

// "vigente 3 → propuesto 5 (+3 −1)" comparando líneas normalizadas.
export function diffLabel(current: string[], proposed: string[] | undefined): string | undefined {
  if (!proposed) return undefined;
  const norm = (s: string) => s.trim().toLowerCase();
  const cur = new Set(current.map(norm));
  const pro = new Set(proposed.map(norm));
  const added = [...pro].filter((x) => !cur.has(x)).length;
  const removed = [...cur].filter((x) => !pro.has(x)).length;
  return `vigente ${current.length} → propuesto ${proposed.length} (+${added} −${removed})`;
}

const accLine = (a: { handle: string; platform: string; category: string; vinculo?: string }) =>
  `${a.handle}, ${a.platform}, ${a.category}${a.vinculo ? `, ${a.vinculo}` : ""}`;
const calLine = (e: { label: string; date: string }) => `${e.label}, ${e.date}`;
const entLines = (e: Record<string, string>) => Object.entries(e).map(([k, v]) => `${k}: ${v}`);

export function MonitorEditor({ cfg, saved, proposal }: { cfg: MonitorConfig; saved: boolean; proposal?: ScenarioProposal }) {
  // Solo se prellena si la propuesta no se aplicó todavía en esta parte.
  const p = proposal && !proposal.applied.redes ? proposal : undefined;
  const accounts = { cur: cfg.accounts.map(accLine), pro: p?.accounts.map(accLine) };
  const sA = { cur: cfg.searchesA, pro: p?.searchesA };
  const sB = { cur: cfg.searchesB, pro: p?.searchesB };
  const cal = { cur: cfg.calendar.map(calLine), pro: p?.calendar.map(calLine) };
  const ent = { cur: entLines(cfg.entidades), pro: p ? entLines(p.entidades) : undefined };
  const val = (x: { cur: string[]; pro?: string[] }) => (x.pro ?? x.cur).join("\n");

  return (
    <details open={Boolean(p)} className="rounded-lg border border-zinc-200 p-5 dark:border-zinc-800">
      <summary className="cursor-pointer text-sm font-semibold text-zinc-800 dark:text-zinc-100">
        Escenario de monitoreo electoral ({cfg.accounts.length} cuentas)
        {p && <span className="ml-2 text-xs font-normal text-amber-700 dark:text-amber-300">· propuesta de IA prellenada — revisá y guardá</span>}
      </summary>
      <form key={proposal?.applied.redes ?? proposal?.at ?? "vigente"} action={guardarMonitor} className="mt-4 space-y-5">
        <Field
          label="Cuentas a monitorear (una por línea)"
          diff={diffLabel(accounts.cur, accounts.pro)}
          hint={<>Formato: <code>handle, plataforma, categoría[, vínculo]</code>. Plataforma: instagram/x/facebook/tiktok. Categoría: organizacion/medio/individual/institucional/opera. El plugin baja estas cuentas como plan de colecta.</>}
        >
          <textarea name="accounts" rows={6} defaultValue={val(accounts)} placeholder={"listaverde, instagram, organizacion\ndiariodelclub, x, medio, lista azul\nmuni, facebook, institucional"} className={inputCls} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Búsquedas dirección A" diff={diffLabel(sA.cur, sA.pro)} hint="Términos de un lado del conflicto.">
            <textarea name="searchesA" rows={3} defaultValue={val(sA)} className={inputCls} />
          </Field>
          <Field label="Búsquedas dirección B" diff={diffLabel(sB.cur, sB.pro)} hint="Términos simétricos del otro lado (spec §7.5).">
            <textarea name="searchesB" rows={3} defaultValue={val(sB)} className={inputCls} />
          </Field>
        </div>
        <Field label="Calendario (una por línea)" diff={diffLabel(cal.cur, cal.pro)} hint={<>Formato: <code>hito, fecha</code> (ej: <code>Elección, 2026-09-14</code>). El informe expresa la cuenta regresiva en días que faltan.</>}>
          <textarea name="calendar" rows={2} defaultValue={val(cal)} className={inputCls} />
        </Field>
        <Field label="Memoria de errores — no repetir (una por línea)" hint="Cada corrección que hagas se inyecta al prompt del informe para no repetir el mismo error.">
          <textarea name="noRepetir" rows={3} defaultValue={cfg.noRepetir.join("\n")} className={inputCls} />
        </Field>
        <Field label="Definiciones de entidades (una por línea)" diff={diffLabel(ent.cur, ent.pro)} hint={<>Formato: <code>nombre: definición</code>. Lugares/personas/cargos que no hay que confundir (spec §7.8).</>}>
          <textarea name="entidades" rows={3} defaultValue={val(ent)} className={inputCls} />
        </Field>
        <div className="space-y-2">
          <SubmitButton variant="accent" pendingLabel="Guardando…">Guardar escenario</SubmitButton>
          <FormStatus ok={saved ? "Escenario guardado. El plugin lo bajará en la próxima corrida." : null} error={null} />
        </div>
      </form>
    </details>
  );
}
