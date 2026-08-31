import Link from "next/link";
import type { AlAire } from "@/lib/al-aire";

const hhmm = (ms: number) => new Date(ms).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
const STATUS: Record<string, string> = { done: "transcripto", failed: "falló", no_live: "sin vivo", recording: "grabando" };

export function AlAireBar({ state }: { state: AlAire | null }) {
  if (!state) return null;
  return (
    <section aria-label="Al aire" className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-lg border border-zinc-200 bg-zinc-50/60 px-4 py-2 text-xs text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-200">
      <span className="font-semibold uppercase tracking-[0.16em] text-zinc-500">Al aire</span>
      {state.grabando ? (
        <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-red-600" aria-hidden />Grabando: {state.grabando.station} · {state.grabando.programa} · hasta {hhmm(state.grabando.hastaMs)}</span>
      ) : state.proximo ? (
        <span>Próximo: {state.proximo.station} · {state.proximo.programa} en {state.proximo.enMin} min</span>
      ) : null}
      {state.ultimo && (
        <span className="text-zinc-500">Último: {state.ultimo.station} · {STATUS[state.ultimo.status] ?? state.ultimo.status}{state.ultimo.status === "done" ? ` (${state.ultimo.mentions} menciones)` : ""}</span>
      )}
      <Link href="/escucha?tab=entorno#audio" className="ml-auto underline">Configurar →</Link>
    </section>
  );
}
