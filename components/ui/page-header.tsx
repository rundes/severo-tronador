// Encabezado de página consistente en todos los módulos: eyebrow opcional
// (rótulo tracked), título grande con una hairline de acento, subtítulo
// acotado a ~65ch y acción primaria a la derecha.
export function PageHeader({
  title,
  subtitle,
  eyebrow,
  action,
}: {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div className="space-y-1.5">
        {eyebrow && (
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
            {eyebrow}
          </div>
        )}
        <h1 className="flex items-center gap-2.5 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          <span aria-hidden className="h-5 w-1 rounded-full bg-[var(--accent)]" />
          {title}
        </h1>
        {subtitle && (
          <p className="max-w-[65ch] text-sm leading-relaxed text-zinc-500">
            {subtitle}
          </p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  );
}
