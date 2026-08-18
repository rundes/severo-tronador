"use client";
import { useState, useTransition } from "react";
import type { FieldStatus } from "@/lib/connectors/config";
import { buttonClass } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";

interface Props {
  name: string;
  fields: FieldStatus[];
  enabled: boolean;
  setupUrl: string;
  onClose: () => void;
  guardar: (fd: FormData) => Promise<{ ok: boolean; message?: string }>;
  probar: (fd: FormData) => Promise<{ ok: boolean; message: string }>;
  toggle: (enabled: boolean) => Promise<void>;
  borrar: () => Promise<void>;
}

function sourceLabel(source: FieldStatus["source"]): string {
  if (source === "ui") return "guardada";
  if (source === "env") return "variable de entorno";
  return "sin configurar";
}

export function ConfigModal(p: Props) {
  const [pending, start] = useTransition();
  const [test, setTest] = useState<string | null>(null);

  return (
    <Modal
      open
      onClose={p.onClose}
      title={p.name}
      description="Las credenciales se guardan cifradas y sólo para este proyecto."
    >
      <a
        href={p.setupUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-block text-xs text-[var(--accent)] underline"
      >
        Cómo obtener estas credenciales →
      </a>
      <form
        className="mt-4 max-h-[60vh] space-y-3 overflow-auto"
        action={(fd) =>
          start(async () => {
            const r = await p.guardar(fd);
            if (r && !r.ok) {
              setTest(r.message ?? "No se pudo guardar.");
              return;
            }
            p.onClose();
          })
        }
      >
        {p.fields.map((f) => {
          const id = `cfg-${f.key}`;
          const hint = [f.help, `fuente actual: ${sourceLabel(f.source)}`]
            .filter(Boolean)
            .join(" · ");
          return (
            <Field
              key={f.key}
              label={f.label}
              htmlFor={id}
              required={f.required}
              hint={hint}
            >
              {f.type === "select" && f.options && f.options.length > 0 ? (
                <Select id={id} name={f.key} defaultValue="">
                  <option value="">
                    {f.hasValue
                      ? "(configurado — sin cambios)"
                      : "— elegí un modelo —"}
                  </option>
                  {f.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              ) : (
                <Input
                  id={id}
                  name={f.key}
                  type={f.type === "secret" ? "password" : "text"}
                  placeholder={
                    f.hasValue && f.type === "secret"
                      ? "configurado ••••"
                      : (f.placeholder ?? "")
                  }
                />
              )}
            </Field>
          );
        })}
        <div className="flex flex-wrap items-center gap-2 pt-2">
          <button
            type="submit"
            disabled={pending}
            className={buttonClass("primary")}
          >
            Guardar
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={(e) => {
              const form = e.currentTarget.closest("form") as HTMLFormElement;
              start(async () =>
                setTest((await p.probar(new FormData(form))).message),
              );
            }}
            className="rounded border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700"
          >
            Probar conexión
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                await p.toggle(!p.enabled);
                p.onClose();
              })
            }
            className="text-sm text-zinc-600 dark:text-zinc-300"
          >
            {p.enabled ? "Desactivar" : "Activar"}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                await p.borrar();
                p.onClose();
              })
            }
            className="ml-auto text-xs text-red-600 underline dark:text-red-400"
          >
            Borrar config
          </button>
        </div>
        {/* El resultado de "probar conexión" aparece después de una acción del
            usuario: sin role=status, un lector de pantalla no lo anuncia. */}
        {test && (
          <p role="status" className="text-xs text-zinc-600 dark:text-zinc-300">
            {test}
          </p>
        )}
      </form>
    </Modal>
  );
}

export function ConfigButton(p: Omit<Props, "onClose">) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded border border-zinc-300 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
      >
        Configurar
      </button>
      {open && <ConfigModal {...p} onClose={() => setOpen(false)} />}
    </>
  );
}
