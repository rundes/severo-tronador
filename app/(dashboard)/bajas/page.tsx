import Link from "next/link";
import { listOptOuts } from "@/lib/optout";
import { readPadronFromDb } from "@/lib/db/padron";
import { requireProject } from "@/lib/workspace";
import { PageHeader } from "@/components/ui/page-header";
import { SubmitButton, FormStatus } from "@/components/ui/submit-button";
import { crearBaja, revocarBaja } from "./actions";

export const metadata = { title: "Bajas · Tronador" };

const OK_MSG: Record<string, string> = {
  alta: "Baja registrada. La persona no recibirá más envíos de ningún canal.",
  revocada: "Baja revocada. La persona vuelve a estar disponible para envíos.",
};

const ERROR_MSG: Record<string, string> = {
  dni: "DNI inválido (solo números, 6 a 9 dígitos).",
  ya_existe: "Ese DNI ya está dado de baja.",
  no_existe: "Ese DNI no tiene una baja activa.",
};

function fecha(iso: string): string {
  return new Date(iso).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export default async function BajasPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | undefined>>;
}) {
  const params = (await searchParams) ?? {};
  const { id: projectId } = await requireProject();
  const [optOuts, padron] = await Promise.all([
    listOptOuts(projectId),
    readPadronFromDb(projectId),
  ]);
  const nombreByDni = new Map(
    padron.map((c) => {
      const p = c as { dni: string; nombre?: string; apellido?: string };
      return [p.dni, [p.nombre, p.apellido].filter(Boolean).join(" ")] as const;
    }),
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        eyebrow="Operación"
        title="Bajas"
        subtitle="Opt-outs del proyecto: la baja es cross-canal (ningún envío la alcanza). La revocación es una decisión explícita del operador y queda auditada."
      />

      <FormStatus
        ok={params.ok ? OK_MSG[params.ok] ?? null : null}
        error={params.error ? ERROR_MSG[params.error] ?? "Error." : null}
      />

      <section className="rounded-lg border border-zinc-200 p-5 dark:border-zinc-800">
        <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
          Alta manual de baja
        </h2>
        <p className="mt-1 max-w-[60ch] text-xs text-zinc-500">
          Para pedidos que llegan por fuera de los canales (teléfono, en persona,
          nota). El motivo queda en el registro y en la auditoría.
        </p>
        <form action={crearBaja} className="mt-3 flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="mb-1 block text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-500">
              DNI
            </span>
            <input
              name="dni"
              required
              inputMode="numeric"
              pattern="[0-9]{6,9}"
              placeholder="30111222"
              className="w-36 rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 font-mono text-sm tabular-nums focus:border-[oklch(52%_0.13_255)] focus-visible:ring-4 focus-visible:ring-[oklch(52%_0.13_255)]/12 dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>
          <label className="block flex-1 min-w-48">
            <span className="mb-1 block text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-500">
              Motivo (opcional)
            </span>
            <input
              name="reason"
              placeholder="pidió no ser contactado por teléfono"
              className="w-full rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm focus:border-[oklch(52%_0.13_255)] focus-visible:ring-4 focus-visible:ring-[oklch(52%_0.13_255)]/12 dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>
          <SubmitButton pendingLabel="Registrando…">Dar de baja</SubmitButton>
        </form>
      </section>

      <section className="space-y-2">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
            Bajas activas
          </h2>
          <span className="font-mono text-[11px] tabular-nums text-zinc-500">
            {optOuts.length}
          </span>
        </div>

        {optOuts.length === 0 ? (
          <p className="rounded-lg border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500 dark:border-zinc-700">
            Sin bajas registradas en este proyecto.
          </p>
        ) : (
          <ol className="space-y-1.5">
            {optOuts.map((o) => (
              <li
                key={`${o.project_id}:${o.dni}`}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-zinc-200 px-4 py-3 text-sm dark:border-zinc-800"
              >
                <Link
                  href={`/contactos/${o.dni}`}
                  className="font-mono text-[11px] tabular-nums text-zinc-700 underline-offset-2 hover:underline dark:text-zinc-200"
                >
                  {o.dni}
                </Link>
                {nombreByDni.get(o.dni) && (
                  <span className="text-zinc-700 dark:text-zinc-300">
                    {nombreByDni.get(o.dni)}
                  </span>
                )}
                {o.reason && (
                  <span className="text-xs text-zinc-500">{o.reason}</span>
                )}
                <span className="ml-auto font-mono text-[10px] tabular-nums text-zinc-500 dark:text-zinc-400">
                  {fecha(o.at)}
                </span>
                <form action={revocarBaja}>
                  <input type="hidden" name="dni" value={o.dni} />
                  <SubmitButton variant="secondary" pendingLabel="Revocando…">
                    Revocar
                  </SubmitButton>
                </form>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
