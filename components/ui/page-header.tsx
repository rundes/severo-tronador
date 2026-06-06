// Encabezado de página consistente en todos los módulos: título grande,
// subtítulo opcional (acotado a ~60ch) y acción primaria a la derecha.
export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          {title}
        </h1>
        {subtitle && (
          <p className="max-w-[60ch] text-sm leading-relaxed text-zinc-500">
            {subtitle}
          </p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  );
}
