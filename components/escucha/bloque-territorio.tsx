// Bloque Territorio: zona, país, mapa/radio y keywords. Si hay propuesta de
// IA sin aplicar en este bloque, las keywords se prellenan con la propuesta.
import { guardarTerritorio } from "@/app/(dashboard)/escucha/actions";
import { SubmitButton } from "@/components/ui/submit-button";
import { MapPicker } from "@/components/escucha/map-picker";
import { Bloque } from "@/components/escucha/bloque";
import { Field } from "@/components/escucha/source-rows";
import { controlClassName as inputCls } from "@/components/ui/field";
import type { ListeningConfig } from "@/lib/listening-config";
import type { ScenarioProposal } from "@/lib/client-brief";

export function BloqueTerritorio({
  cfg,
  proposal,
  persistOk,
  params,
}: {
  cfg: ListeningConfig;
  proposal?: ScenarioProposal;
  persistOk: boolean;
  params: Record<string, string | undefined>;
}) {
  const p = proposal && !proposal.applied.territorio ? proposal : undefined;
  const keywords = p?.keywords ?? cfg.keywords;
  return (
    <Bloque
      id="territorio"
      titulo="Territorio"
      resumen={`${cfg.zona || "sin zona"} · ${cfg.keywords.length} keywords`}
      pendiente={Boolean(p)}
      params={params}
    >
      <form key={p?.at ?? "vigente"} action={guardarTerritorio} className="space-y-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Zona">
            <input name="zona" defaultValue={cfg.zona} placeholder="Ibicuy, Entre Ríos" className={inputCls} />
          </Field>
          <Field label="País (código de 2 letras)">
            <input name="pais" defaultValue={cfg.pais} maxLength={2} className={`${inputCls} uppercase`} />
          </Field>
        </div>
        <Field
          label="Keywords (una por línea)"
          diff={p ? `vigente ${cfg.keywords.length} → propuesto ${p.keywords.length}` : undefined}
          hint="Temas a rastrear en todas las fuentes. La zona + estas keywords arman también las búsquedas automáticas de Google News y GDELT. El worker de GDELT lotea de a 7: las amplias primero."
        >
          <textarea
            name="keywords"
            rows={p ? 8 : 4}
            defaultValue={keywords.join("\n")}
            placeholder={"obras\nseguridad\nsalud"}
            className={`${inputCls} font-mono`}
          />
        </Field>
        <MapPicker defaultLat={cfg.lat} defaultLng={cfg.lng} defaultRadio={cfg.radioKm} />
        <SubmitButton variant="accent" disabled={!persistOk} pendingLabel="Guardando…">
          Guardar territorio
        </SubmitButton>
      </form>
    </Bloque>
  );
}
