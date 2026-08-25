// Bloque de Escenario: <details> con título, resumen de estado, badge de
// propuesta pendiente y estado del último Guardar (?ok=/?error=).
import { FormStatus } from "@/components/ui/submit-button";

export function Bloque({
  id,
  titulo,
  resumen,
  pendiente,
  open,
  params,
  children,
}: {
  id: string; // "territorio" | "prensa" | "redes" | "audio" | "reglas"
  titulo: string;
  resumen: string;
  pendiente?: boolean;
  open?: boolean;
  params: Record<string, string | undefined>;
  children: React.ReactNode;
}) {
  const ok = params.ok === id;
  const err = params.error?.startsWith(`${id}:`)
    ? decodeURIComponent(params.error.slice(id.length + 1))
    : null;
  return (
    <details
      id={id}
      open={open || ok || Boolean(err) || pendiente}
      className="rounded-lg border border-zinc-200 p-5 shadow-[var(--shadow-rest)] dark:border-zinc-800"
    >
      <summary className="cursor-pointer text-sm font-semibold text-zinc-800 dark:text-zinc-100">
        {titulo}
        <span className="ml-2 text-xs font-normal text-zinc-500">{resumen}</span>
        {pendiente && (
          <span className="ml-2 text-xs font-normal text-amber-700 dark:text-amber-300">
            · propuesta de IA prellenada — revisá y guardá
          </span>
        )}
      </summary>
      <div className="mt-4 space-y-5">
        {children}
        <FormStatus
          ok={ok ? "Guardado." : null}
          error={err ? (err === "no_db" ? "Supabase no configurado." : err) : null}
        />
      </div>
    </details>
  );
}
