// Contexto del cliente: aportes acumulativos (append-only) + "Generar
// escenario con IA" + estado de la propuesta pendiente. Lo generado NO se
// aplica acá: se prellena en los editores de Escenario / Configurar y se
// aplica con sus Guardar.
import {
  agregarAporteBrief,
  quitarAporteBrief,
  generarEscenarioIA,
  descartarPropuesta,
  resolverBriefUpdate,
} from "@/app/(dashboard)/escucha/actions";
import { BriefMaster } from "@/components/escucha/brief-master";
import { SubmitButton, FormStatus } from "@/components/ui/submit-button";
import { appliedCount, briefHash, isProposalPending, MASTER_MAX_CHARS, type ClientBrief, type ProposalBlock } from "@/lib/client-brief";

const BLOCK_LABEL: Record<ProposalBlock, string> = {
  territorio: "Territorio",
  redes: "Redes",
  audio: "Audio y video",
  reglas: "Reglas",
};

const inputCls =
  "w-full rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-[13px] text-zinc-900 focus-visible:border-[oklch(52%_0.13_255)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[oklch(52%_0.13_255)]/12 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";

function fecha(iso: string): string {
  return new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

export function BriefPanel({
  brief,
  canGenerate,
  flags,
}: {
  brief: ClientBrief;
  // false si falta la API key de Claude
  canGenerate: boolean;
  flags: { saved: boolean; generated: boolean; maestroSaved: boolean; iaError?: string; briefError?: string };
}) {
  const p = brief.proposal;
  const pendiente = isProposalPending(p);
  const briefCambio = p && p.briefHash !== briefHash(brief);
  const parcial = p && appliedCount(p).done > 0;
  const { faltan } = p ? appliedCount(p) : { faltan: [] };
  const pendientes = (brief.pendingUpdates ?? []).filter((u) => u.status === "pending");
  const sinContexto = brief.entries.length === 0 && !brief.master?.text;

  return (
    <section className="space-y-4 rounded-lg border border-zinc-200 p-5 dark:border-zinc-800">
      <div>
        <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">Contexto del cliente</h2>
        <p className="max-w-[70ch] text-xs text-zinc-500">
          El brief maestro es el documento que manda: mapa de actores, métricas ya medidas,
          hallazgos establecidos, errores a no repetir y reglas editoriales. Los aportes de abajo
          son notas incrementales entre versiones del maestro. La IA arma el escenario con todo.
        </p>
      </div>

      <div className="space-y-3 rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
        <BriefMaster
          initial={brief.master?.text ?? ""}
          max={MASTER_MAX_CHARS}
          updatedAt={brief.master?.updatedAt}
          by={brief.master?.by}
        />
        <FormStatus
          ok={flags.maestroSaved ? "Brief maestro guardado." : null}
          error={
            flags.briefError === "too_long"
              ? `El brief maestro supera los ${MASTER_MAX_CHARS.toLocaleString("es-AR")} caracteres: no se guardó.`
              : flags.briefError === "maestro_vacio"
                ? "El brief maestro está vacío: no se guardó."
                : null
          }
        />

        {pendientes.length > 0 && (
          <div className="space-y-1 border-t border-zinc-100 pt-3 dark:border-zinc-800">
            <h3 className="text-[13px] font-semibold text-zinc-800 dark:text-zinc-100">
              Propuestas de actualización ({pendientes.length})
            </h3>
            <p className="max-w-[70ch] text-xs text-zinc-500">
              Hechos nuevos que el último informe propone incorporar al maestro. Aceptar los suma
              como aporte fechado; el maestro nunca se edita solo.
            </p>
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {pendientes.map((u) => (
                <li key={u.id} className="flex flex-wrap items-start gap-2 py-2 text-[13px]">
                  <span className="shrink-0 font-mono text-[11px] tabular-nums text-zinc-500">
                    {fecha(u.reportAt)} · §{u.seccion}
                  </span>
                  <span className="flex-1 whitespace-pre-wrap text-zinc-800 dark:text-zinc-200">{u.texto}</span>
                  <form action={resolverBriefUpdate} className="flex shrink-0 items-center gap-2">
                    <input type="hidden" name="id" value={u.id} />
                    <SubmitButton variant="secondary" name="accion" value="aceptar" pendingLabel="Guardando…" className="px-2 py-0.5 text-[11px]">
                      Aceptar
                    </SubmitButton>
                    <SubmitButton variant="secondary" name="accion" value="descartar" pendingLabel="…" className="px-2 py-0.5 text-[11px]">
                      Descartar
                    </SubmitButton>
                  </form>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {brief.entries.length > 0 ? (
        <ul className="divide-y divide-zinc-100 rounded-md border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {brief.entries.map((e) => (
            <li key={e.id} className="flex items-start gap-3 px-3 py-2 text-[13px]">
              <span className="shrink-0 font-mono text-[11px] tabular-nums text-zinc-500">
                {fecha(e.at)} · {e.by}
              </span>
              <span className="flex-1 whitespace-pre-wrap text-zinc-800 dark:text-zinc-200">{e.text}</span>
              <form action={quitarAporteBrief}>
                <input type="hidden" name="id" value={e.id} />
                <button
                  type="submit"
                  className="text-[11px] text-zinc-500 hover:text-red-600 dark:text-zinc-400"
                  title="Quitar aporte"
                  aria-label={`Quitar aporte del ${fecha(e.at)}`}
                >
                  quitar
                </button>
              </form>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-zinc-500">Todavía no hay aportes.</p>
      )}

      <form action={agregarAporteBrief} className="space-y-2">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-500">Agregar aporte</span>
          <textarea
            name="text"
            rows={3}
            placeholder="Ej: Municipio de Ibicuy (Entre Ríos). Nos interesa la gestión local: cloacas, caminos, agua. Intendente actual X; la oposición se agrupa en Y."
            className={inputCls}
          />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <SubmitButton variant="secondary" pendingLabel="Guardando…">Agregar aporte</SubmitButton>
          <FormStatus ok={flags.saved ? "Aporte guardado." : null} error={flags.briefError === "vacio" ? "El aporte está vacío." : null} />
        </div>
      </form>

      <div className="flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-4 dark:border-zinc-800">
        <form action={generarEscenarioIA}>
          <SubmitButton
            variant="accent"
            disabled={!canGenerate || sinContexto}
            pendingLabel="Leyendo el brief y armando el escenario…"
          >
            Generar escenario con IA
          </SubmitButton>
        </form>
        {!canGenerate && (
          <span className="text-xs text-zinc-500">Configurá el conector Claude (API key) para generar.</span>
        )}
        {canGenerate && sinContexto && (
          <span className="text-xs text-zinc-500">Cargá el brief maestro o agregá al menos un aporte.</span>
        )}
      </div>
      <FormStatus ok={flags.generated ? "Propuesta lista: revisala en los bloques de abajo y guardá cada uno." : null} error={flags.iaError ?? null} />

      {p && pendiente && (
        <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-[13px] text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
          <div className="font-medium">
            Propuesta del {fecha(p.at)} {parcial ? "parcialmente aplicada" : "sin aplicar"} · {p.tipo}
            {briefCambio && " · el brief cambió desde esta propuesta"}
          </div>
          <p className="whitespace-pre-wrap">{p.resumen}</p>
          <p className="text-xs">
            {p.keywords.length} keywords · {p.searchesA.length}+{p.searchesB.length} búsquedas · {p.accounts.length} cuentas ·{" "}
            {Object.keys(p.entidades).length} entidades · {p.calendar.length} hitos · {p.audio.length} programas de audio.{" "}
            {`Aplicada ${appliedCount(p).done}/${appliedCount(p).total}`}
            {faltan.length ? ` · Faltan: ${faltan.map((b) => BLOCK_LABEL[b]).join(", ")}` : ""}
          </p>
          <form action={descartarPropuesta}>
            <button type="submit" className="text-xs underline">Descartar propuesta</button>
          </form>
        </div>
      )}
    </section>
  );
}
