"use client";

// Actores que las barridas sugirieron y todavía no se resolvieron.
// Incorporar → plan de colecta (con nota de origen). Descartar → no vuelve.
import { useState, useTransition } from "react";
import { resolverActorSugerido } from "@/app/(dashboard)/escucha/actions";
import type { ActorSuggestion } from "@/lib/client-brief";

// La evidencia viene de la extensión/IA: solo se linkea si es http(s).
function safeUrl(u: string): boolean {
  try { return /^https?:$/.test(new URL(u).protocol); } catch { return false; }
}

const formatFollowers = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M` : n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k` : String(n);

export function ActorSuggestions({ suggestions }: { suggestions: ActorSuggestion[] }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const list = suggestions.filter((s) => s.status === "pending");
  if (list.length === 0) return null;

  const resolve = (id: string, accepted: boolean) =>
    start(async () => {
      setError(null);
      try {
        await resolverActorSugerido({ id, accepted });
      } catch {
        setError("No se pudo guardar. Recargá la página y probá de nuevo.");
      }
    });

  return (
    <section className="space-y-2 rounded-lg border border-zinc-200 p-5 dark:border-zinc-800">
      <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
        Actores sugeridos ({list.length})
      </h2>
      <p className="max-w-[70ch] text-xs text-zinc-500">
        Cuentas que aparecieron en las menciones y no están en el plan. Incorporar las suma al
        escenario con nota de origen; nada entra solo.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead className="text-left text-[10px] uppercase tracking-[0.12em] text-zinc-500">
            <tr>
              <th scope="col" className="py-1 pr-3">Cuenta</th>
              <th scope="col" className="py-1 pr-3">Plataforma</th>
              <th scope="col" className="py-1 pr-3">Categoría</th>
              <th scope="col" className="py-1 pr-3">Dir.</th>
              <th scope="col" className="py-1 pr-3">Razón</th>
              <th scope="col" className="py-1 pr-3">Origen · fecha</th>
              <th scope="col" className="py-1">
                <span className="sr-only">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {list.map((s) => (
              <tr key={s.id}>
                <td className="py-1.5 pr-3">
                  <span className="font-mono">@{s.handle}</span>
                  {s.displayName && <div className="text-zinc-500">{s.displayName}</div>}
                  {s.followers != null && (
                    <div className="tabular-nums text-zinc-500">{formatFollowers(s.followers)} seg.</div>
                  )}
                </td>
                <td className="py-1.5 pr-3">{s.platform}</td>
                <td className="py-1.5 pr-3">{s.category}</td>
                <td className="py-1.5 pr-3">{s.direccion}</td>
                <td className="py-1.5 pr-3 text-zinc-600 dark:text-zinc-300">
                  {s.razon}
                  {s.evidencia && !safeUrl(s.evidencia) && (
                    <span className="break-all text-zinc-400"> {s.evidencia}</span>
                  )}
                  {s.evidencia && safeUrl(s.evidencia) && (
                    <>
                      {" "}
                      <a
                        href={s.evidencia}
                        target="_blank"
                        rel="noreferrer"
                        className="underline"
                        aria-label={`Evidencia de @${s.handle} (abre en pestaña nueva)`}
                      >
                        evidencia →
                      </a>
                    </>
                  )}
                </td>
                <td className="py-1.5 pr-3 whitespace-nowrap text-zinc-500">
                  {s.origen === "barrido" ? "barrido" : "informe"}
                  {" · "}
                  <span className="font-mono tabular-nums">{s.suggestedAt.slice(0, 10)}</span>
                </td>
                <td className="py-1.5 whitespace-nowrap">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => resolve(s.id, true)}
                    aria-label={`Incorporar @${s.handle}`}
                    className="mr-2 rounded border border-zinc-300 px-2 py-0.5 hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:hover:bg-zinc-800"
                  >
                    Incorporar
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => resolve(s.id, false)}
                    aria-label={`Descartar @${s.handle}`}
                    className="text-zinc-500 hover:text-red-600 disabled:opacity-60"
                  >
                    Descartar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {error && <p role="alert" className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </section>
  );
}
