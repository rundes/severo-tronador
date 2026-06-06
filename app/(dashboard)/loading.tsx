// Loading boundary del segmento (dashboard). Next renderiza esto durante
// las transiciones entre rutas, antes de que el server component nuevo
// termine de hidratar. Combina:
//   1. Barra indeterminada arriba (visible inmediato)
//   2. Skeleton del contenido (placeholder de layout)
// Resultado: al apretar cualquier link del sidebar o submit que redirige,
// el usuario ve feedback en <100ms en vez de pantalla congelada.
export default function DashboardLoading() {
  return (
    <div>
      <TopBar />
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="space-y-2">
          <div className="h-6 w-48 animate-pulse rounded bg-zinc-100 dark:bg-zinc-900" />
          <div className="h-3 w-72 animate-pulse rounded bg-zinc-100 dark:bg-zinc-900" />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-lg border border-zinc-200 dark:border-zinc-800"
            />
          ))}
        </div>
        <div className="h-64 animate-pulse rounded-lg border border-zinc-200 dark:border-zinc-800" />
      </div>
    </div>
  );
}

function TopBar() {
  return (
    <div
      aria-hidden
      className="fixed left-0 right-0 top-0 z-50 h-0.5 overflow-hidden bg-transparent"
    >
      <div className="h-full origin-left animate-[tronador-loading-bar_1.2s_ease-in-out_infinite] bg-zinc-900 dark:bg-zinc-100" />
    </div>
  );
}
