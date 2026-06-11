import type { AdRow } from "@/lib/meta-ads";

// Tabla comparativa: una fila por anuncio activo, una columna por KPI. Pensada
// para comparar de un vistazo (números alineados, scroll horizontal si hace falta).
export function AdsReportTable({ ads }: { ads: AdRow[] }) {
  if (!ads.length) {
    return (
      <p className="text-sm text-zinc-500">No hay anuncios activos para este período.</p>
    );
  }
  // El orden de KPIs es consistente (computeAdMetrics); tomamos las labels del
  // primer anuncio como columnas.
  const cols = ads[0].metrics.map((m) => m.label);
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-zinc-200 dark:border-zinc-800">
              <th className="sticky left-0 z-10 bg-white px-3 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-zinc-500 dark:bg-zinc-950">
                Anuncio
              </th>
              {cols.map((c) => (
                <th
                  key={c}
                  className="whitespace-nowrap px-3 py-2 text-right text-[10px] font-medium uppercase tracking-wider text-zinc-500"
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ads.map((ad) => {
              const by = new Map(ad.metrics.map((m) => [m.label, m.value]));
              return (
                <tr
                  key={ad.id}
                  className="border-b border-zinc-100 last:border-0 dark:border-zinc-800/60"
                >
                  <td className="sticky left-0 z-10 max-w-[240px] bg-white px-3 py-2 dark:bg-zinc-950">
                    <div className="truncate font-medium text-zinc-800 dark:text-zinc-100">
                      {ad.name}
                    </div>
                    <div className="truncate text-[10px] text-zinc-400">
                      {ad.campaign ?? "—"}
                    </div>
                  </td>
                  {cols.map((c) => (
                    <td
                      key={c}
                      className="whitespace-nowrap px-3 py-2 text-right font-mono tabular-nums text-zinc-700 dark:text-zinc-200"
                    >
                      {(by.get(c) ?? 0).toLocaleString("es-AR")}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {ads[0].mode === "mock" && (
        <p className="text-[11px] text-amber-600 dark:text-amber-400">
          Datos de ejemplo (modo mock, sin credenciales de Meta).
        </p>
      )}
    </div>
  );
}
