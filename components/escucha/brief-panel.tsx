// Contexto del cliente: aportes acumulativos (append-only) + "Generar
// escenario con IA" + estado de la propuesta pendiente. Lo generado NO se
// aplica acá: se prellena en los editores de Escenario / Configurar y se
// aplica con sus Guardar.
import {
  agregarAporteBrief,
  quitarAporteBrief,
  generarEscenarioIA,
  descartarPropuesta,
} from "@/app/(dashboard)/escucha/actions";
import { SubmitButton, FormStatus } from "@/components/ui/submit-button";
import { appliedCount, briefHash, isProposalPending, type ClientBrief, type ProposalBlock } from "@/lib/client-brief";

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
  flags: { saved: boolean; generated: boolean; iaError?: string; briefError?: string };
}) {
  const p = brief.proposal;
  const pendiente = isProposalPending(p);
  const briefCambio = p && p.briefHash !== briefHash(brief);
  const parcial = p && appliedCount(p).done > 0;
  const { faltan } = p ? appliedCount(p) : { faltan: [] };

  return (
    <section className="space-y-4 rounded-lg border border-zinc-200 p-5 dark:border-zinc-800">
      <div>
        <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">Contexto del cliente</h2>
        <p className="max-w-[70ch] text-xs text-zinc-500">
          Contá quién es el cliente, qué se juega, actores, territorio y fechas. Cada aporte se suma
          al anterior; la IA arma el escenario de monitoreo a partir de todo el brief.
        </p>
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
          <FormStatus ok={flags.saved ? "Aporte guardado." : null} error={flags.briefError ? "El aporte está vacío." : null} />
        </div>
      </form>

      <div className="flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-4 dark:border-zinc-800">
        <form action={generarEscenarioIA}>
          <SubmitButton
            variant="accent"
            disabled={!canGenerate || brief.entries.length === 0}
            pendingLabel="Leyendo el brief y armando el escenario…"
          >
            Generar escenario con IA
          </SubmitButton>
        </form>
        {!canGenerate && (
          <span className="text-xs text-zinc-500">Configurá el conector Claude (API key) para generar.</span>
        )}
        {canGenerate && brief.entries.length === 0 && (
          <span className="text-xs text-zinc-500">Agregá al menos un aporte.</span>
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
