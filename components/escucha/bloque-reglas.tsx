// Bloque Reglas del informe: definiciones de entidades, calendario y memoria
// de errores (monitor_config). Entidades y calendario se prellenan con la
// propuesta de IA si no se aplicó en `reglas`; noRepetir no lo toca la IA.
import { guardarReglas } from "@/app/(dashboard)/escucha/actions";
import { SubmitButton } from "@/components/ui/submit-button";
import { Bloque } from "@/components/escucha/bloque";
import { Field } from "@/components/escucha/source-rows";
import { controlClassName as inputCls } from "@/components/ui/field";
import { calLine, diffLabel, entLines } from "@/lib/escenario-diff";
import type { MonitorConfig } from "@/lib/monitor-config";
import type { ScenarioProposal } from "@/lib/client-brief";

const monoCls = `${inputCls} font-mono`;

export function BloqueReglas({
  monitor,
  proposal,
  params,
}: {
  monitor: MonitorConfig;
  proposal?: ScenarioProposal;
  params: Record<string, string | undefined>;
}) {
  const p = proposal && !proposal.applied.reglas ? proposal : undefined;
  const cal = { cur: monitor.calendar.map(calLine), pro: p?.calendar.map(calLine) };
  const ent = { cur: entLines(monitor.entidades), pro: p ? entLines(p.entidades) : undefined };
  const val = (x: { cur: string[]; pro?: string[] }) => (x.pro ?? x.cur).join("\n");

  return (
    <Bloque
      id="reglas"
      titulo="Reglas del informe"
      resumen={`${Object.keys(monitor.entidades).length} entidades · ${monitor.calendar.length} hitos`}
      pendiente={Boolean(p)}
      params={params}
    >
      <form key={p?.at ?? "vigente"} action={guardarReglas} className="space-y-5">
        <Field
          label="Definiciones de entidades (una por línea)"
          diff={diffLabel(ent.cur, ent.pro)}
          hint={
            <>
              Formato: <code>nombre: definición</code>. Lugares/personas/cargos que no hay que
              confundir (spec §7.8).
            </>
          }
        >
          <textarea name="entidades" rows={3} defaultValue={val(ent)} className={monoCls} />
        </Field>
        <Field
          label="Calendario (una por línea)"
          diff={diffLabel(cal.cur, cal.pro)}
          hint={
            <>
              Formato: <code>hito, fecha</code> (ej: <code>Elección, 2026-09-14</code>). El informe
              expresa la cuenta regresiva en días que faltan.
            </>
          }
        >
          <textarea name="calendar" rows={2} defaultValue={val(cal)} className={monoCls} />
        </Field>
        <Field
          label="Memoria de errores — no repetir (una por línea)"
          hint="Cada corrección que hagas se inyecta al prompt del informe para no repetir el mismo error."
        >
          <textarea name="noRepetir" rows={3} defaultValue={monitor.noRepetir.join("\n")} className={monoCls} />
        </Field>
        <SubmitButton variant="accent" pendingLabel="Guardando…">
          Guardar reglas
        </SubmitButton>
      </form>
    </Bloque>
  );
}
