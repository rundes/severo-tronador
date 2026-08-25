// Editor del escenario de monitoreo electoral (server-first): cuentas del
// plan de colecta, búsquedas simétricas, calendario, memoria de errores y
// definiciones. Editor por líneas, en línea con el patrón de config de fuentes.
import { guardarMonitor } from "@/app/(dashboard)/escucha/actions";
import { SubmitButton, FormStatus } from "@/components/ui/submit-button";
import type { MonitorConfig } from "@/lib/monitor-config";

const inputCls =
  "w-full rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 font-mono text-[12px] text-zinc-900 focus-visible:border-[oklch(52%_0.13_255)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[oklch(52%_0.13_255)]/12 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="flex flex-col gap-1">
        <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-500">{label}</span>
        {children}
      </label>
      {hint && <p className="max-w-[70ch] text-xs text-zinc-500">{hint}</p>}
    </div>
  );
}

export function MonitorEditor({ cfg, saved }: { cfg: MonitorConfig; saved: boolean }) {
  return (
    <details className="rounded-lg border border-zinc-200 p-5 dark:border-zinc-800">
      <summary className="cursor-pointer text-sm font-semibold text-zinc-800 dark:text-zinc-100">
        Escenario de monitoreo electoral ({cfg.accounts.length} cuentas)
      </summary>
      <form action={guardarMonitor} className="mt-4 space-y-5">
        <Field
          label="Cuentas a monitorear (una por línea)"
          hint={<>Formato: <code>handle, plataforma, categoría[, vínculo]</code>. Plataforma: instagram/x/facebook/tiktok. Categoría: organizacion/medio/individual/institucional/opera. El plugin baja estas cuentas como plan de colecta.</>}
        >
          <textarea
            name="accounts"
            rows={6}
            defaultValue={cfg.accounts.map((a) => `${a.handle}, ${a.platform}, ${a.category}${a.vinculo ? `, ${a.vinculo}` : ""}`).join("\n")}
            placeholder={"listaverde, instagram, organizacion\ndiariodelclub, x, medio, lista azul\nmuni, facebook, institucional"}
            className={inputCls}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Búsquedas dirección A" hint="Términos de un lado del conflicto.">
            <textarea name="searchesA" rows={3} defaultValue={cfg.searchesA.join("\n")} className={inputCls} />
          </Field>
          <Field label="Búsquedas dirección B" hint="Términos simétricos del otro lado (spec §7.5).">
            <textarea name="searchesB" rows={3} defaultValue={cfg.searchesB.join("\n")} className={inputCls} />
          </Field>
        </div>
        <Field label="Calendario (una por línea)" hint={<>Formato: <code>hito, fecha</code> (ej: <code>Elección, 2026-09-14</code>). El informe expresa la cuenta regresiva en días que faltan.</>}>
          <textarea name="calendar" rows={2} defaultValue={cfg.calendar.map((e) => `${e.label}, ${e.date}`).join("\n")} className={inputCls} />
        </Field>
        <Field label="Memoria de errores — no repetir (una por línea)" hint="Cada corrección que hagas se inyecta al prompt del informe para no repetir el mismo error.">
          <textarea name="noRepetir" rows={3} defaultValue={cfg.noRepetir.join("\n")} className={inputCls} />
        </Field>
        <Field label="Definiciones de entidades (una por línea)" hint={<>Formato: <code>nombre: definición</code>. Lugares/personas/cargos que no hay que confundir (spec §7.8).</>}>
          <textarea name="entidades" rows={3} defaultValue={Object.entries(cfg.entidades).map(([k, v]) => `${k}: ${v}`).join("\n")} className={inputCls} />
        </Field>
        <div className="space-y-2">
          <SubmitButton variant="accent" pendingLabel="Guardando…">Guardar escenario</SubmitButton>
          <FormStatus ok={saved ? "Escenario guardado. El plugin lo bajará en la próxima corrida." : null} error={null} />
        </div>
      </form>
    </details>
  );
}
