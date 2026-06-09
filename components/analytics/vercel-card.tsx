import { vercelAnalyticsUrl, vercelSpeedUrl, vercelConfigured } from "@/lib/vercel-links";

// Panel que enlaza al Web Analytics y Speed Insights de Vercel para una ruta
// (o la vista general si no se pasa `path`). Las métricas se recogen con
// @vercel/analytics + @vercel/speed-insights (ver app/layout.tsx) y viven en
// el panel de Vercel; acá las dejamos a un click desde la app.
export function VercelMetricsCard({
  path,
  scope,
}: {
  path?: string;
  // Texto que aclara el alcance (ej: "este enlace público" o "todo el sitio").
  scope?: string;
}) {
  const configured = vercelConfigured();
  const analytics = vercelAnalyticsUrl(path);
  const speed = vercelSpeedUrl(path);

  return (
    <section className="space-y-2 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="flex items-baseline justify-between">
        <h2 className="text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">
          Métricas en Vercel
        </h2>
        <span className="text-[10px] uppercase tracking-wider text-zinc-400">▲ Vercel</span>
      </div>
      <p className="text-xs text-zinc-500">
        Visitas, visitantes únicos, origen del tráfico y dispositivo
        {scope ? ` de ${scope}` : ""}, más Web Vitals (rendimiento){" "}
        {path ? <code className="text-[11px]">{path}</code> : null}. Se recogen
        automáticamente en cada visita.
      </p>
      {configured ? (
        <div className="flex flex-wrap gap-2">
          {analytics && (
            <a
              href={analytics}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              📊 Abrir Web Analytics
            </a>
          )}
          {speed && (
            <a
              href={speed}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              ⚡ Abrir Web Vitals
            </a>
          )}
        </div>
      ) : (
        <p className="rounded-md border border-dashed border-zinc-300 bg-zinc-50/60 px-3 py-2 text-[11px] text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900/30">
          Configurá la variable <code>ANALYTICS_VERCEL_BASE</code> (ej:{" "}
          <code>https://vercel.com/&lt;equipo&gt;/&lt;proyecto&gt;</code>) para
          enlazar tu panel. Mientras tanto, los datos igual se acumulan en Vercel.
        </p>
      )}
    </section>
  );
}
