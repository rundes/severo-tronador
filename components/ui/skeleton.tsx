import * as React from "react";

// Placeholders de carga.
//
// Había un solo loading.tsx para todo el dashboard, con un esqueleto genérico
// (4 tarjetas + un bloque). Servía para las transiciones de ruta, no para lo que
// realmente bloquea: /escucha, /competencia y /difusión esperan a proveedores
// externos y frenan el TTFB de la página COMPLETA aunque el resto ya esté listo.
// Con estos placeholders adentro de un <Suspense> por bloque, la página aparece
// y el bloque lento llega después.
//
// `aria-hidden` en todos: son decoración. Quien no ve la pantalla necesita que
// el estado de carga lo anuncie el contenedor con role="status", no que le lean
// cajas vacías.

export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`animate-pulse rounded bg-zinc-100 dark:bg-zinc-800 ${className}`}
    />
  );
}

// Bloque con borde, del tamaño de una tarjeta.
export function SkeletonCard({
  className = "",
  lines = 3,
}: {
  className?: string;
  lines?: number;
}) {
  return (
    <div
      aria-hidden
      className={`space-y-2 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800 ${className}`}
    >
      <Skeleton className="h-3 w-1/3" />
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={`h-3 ${i === lines - 1 ? "w-2/3" : "w-full"}`}
        />
      ))}
    </div>
  );
}

// Filas de tabla, para que el layout no salte cuando llegan los datos.
export function SkeletonTable({
  rows = 5,
  cols = 4,
}: {
  rows?: number;
  cols?: number;
}) {
  return (
    <div aria-hidden className="space-y-2">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-3">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className="h-4 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

// Contenedor de un bloque que está cargando. Anuncia el estado una vez, en vez
// de dejar al lector de pantalla en silencio hasta que aparezca el contenido.
export function LoadingBlock({
  label,
  children,
}: {
  label: string;
  children?: React.ReactNode;
}) {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      {children ?? <SkeletonCard />}
    </div>
  );
}
