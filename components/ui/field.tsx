import * as React from "react";

// Controles de formulario del sistema.
//
// Había 20 definiciones locales de `inputCls`, todas parecidas y ninguna igual:
// distinto radio (rounded vs rounded-md vs rounded-lg), distinto padding, y
// —lo que importa— tres tratamientos distintos del foco. Doce de esas copias
// traían `focus:outline-none`, que ANULA el `:focus-visible` global de
// globals.css: el control quedaba sin ningún indicador de foco visible, que es
// WCAG 2.4.7 (AA) incumplido, y en la práctica hace el formulario inoperable
// con teclado.
//
// Acá no se apaga el outline: se apoya en el global. Lo único que se agrega es
// el borde de énfasis, que es decoración.

const BASE =
  "w-full rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-zinc-900 " +
  "transition-colors placeholder:text-zinc-400 " +
  "focus-visible:border-[var(--accent)] " +
  "disabled:cursor-not-allowed disabled:bg-zinc-50 disabled:text-zinc-500 " +
  "dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 " +
  "dark:placeholder:text-zinc-500 dark:disabled:bg-zinc-900/60";

// Estado inválido: además del color, el borde cambia de grosor. El color solo
// no alcanza para quien no lo distingue.
const INVALID = "border-red-500 border-2 dark:border-red-500";

function cls(...parts: (string | false | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

export type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  invalid?: boolean;
};

export function Input({ className, invalid, ...rest }: InputProps) {
  return (
    <input
      {...rest}
      aria-invalid={invalid || undefined}
      className={cls(BASE, invalid && INVALID, className)}
    />
  );
}

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  invalid?: boolean;
};

export function Textarea({ className, invalid, ...rest }: TextareaProps) {
  return (
    <textarea
      {...rest}
      aria-invalid={invalid || undefined}
      className={cls(BASE, "min-h-20 resize-y", invalid && INVALID, className)}
    />
  );
}

export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & {
  invalid?: boolean;
};

export function Select({ className, invalid, children, ...rest }: SelectProps) {
  return (
    <select
      {...rest}
      aria-invalid={invalid || undefined}
      className={cls(BASE, "pr-8", invalid && INVALID, className)}
    >
      {children}
    </select>
  );
}

// Etiqueta + control + ayuda/error, asociados de verdad.
//
// El patrón repetido era un <label> envolviendo el input, que asocia pero deja
// el texto de ayuda huérfano: el lector de pantalla lo lee como contenido
// suelto o no lo lee. Acá `aria-describedby` lo cuelga del control, y el error
// —cuando hay— reemplaza a la ayuda y va en `role="alert"`.
export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  children,
  className = "",
}: {
  label: string;
  // Id del control. Si se omite, hay que envolver el control con el <label>
  // (children) — soportado, pero preferí el id explícito.
  htmlFor?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const describedBy = error
    ? htmlFor && `${htmlFor}-error`
    : hint && htmlFor
      ? `${htmlFor}-hint`
      : undefined;

  const control = describedBy ? (
    <DescribedBy id={describedBy}>{children}</DescribedBy>
  ) : (
    children
  );

  return (
    <div className={cls("flex flex-col gap-1", className)}>
      {htmlFor ? (
        <label
          htmlFor={htmlFor}
          className="text-xs font-medium text-zinc-600 dark:text-zinc-400"
        >
          {label}
          {required && (
            <span className="ml-0.5 text-red-600 dark:text-red-400" aria-hidden>
              *
            </span>
          )}
        </label>
      ) : (
        <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
          {label}
        </span>
      )}
      {control}
      {error ? (
        <p
          id={htmlFor ? `${htmlFor}-error` : undefined}
          role="alert"
          className="text-xs text-red-600 dark:text-red-400"
        >
          {error}
        </p>
      ) : hint ? (
        <p
          id={htmlFor ? `${htmlFor}-hint` : undefined}
          className="text-xs text-zinc-500 dark:text-zinc-400"
        >
          {hint}
        </p>
      ) : null}
    </div>
  );
}

// Inyecta aria-describedby en el control hijo sin obligar al caller a pasarlo.
function DescribedBy({
  id,
  children,
}: {
  id: string;
  children: React.ReactNode;
}) {
  if (!React.isValidElement(children)) return <>{children}</>;
  const existing = (children.props as { "aria-describedby"?: string })[
    "aria-describedby"
  ];
  return React.cloneElement(children as React.ReactElement<{ "aria-describedby"?: string }>, {
    "aria-describedby": existing ? `${existing} ${id}` : id,
  });
}

// Clase de los controles, para los casos donde todavía no se puede usar el
// componente (un control dentro de HTML crudo, un `dangerouslySetInnerHTML`).
// Preferir los componentes: esto existe para no volver a tener 20 copias.
export const controlClassName = BASE;
