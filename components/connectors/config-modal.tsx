"use client";
import { useState, useTransition } from "react";
import type { FieldStatus } from "@/lib/connectors/config";

interface Props {
  name: string;
  fields: FieldStatus[];
  enabled: boolean;
  setupUrl: string;
  onClose: () => void;
  guardar: (fd: FormData) => Promise<void>;
  probar: (fd: FormData) => Promise<{ ok: boolean; message: string }>;
  toggle: (enabled: boolean) => Promise<void>;
  borrar: () => Promise<void>;
}

const input =
  "w-full rounded border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900";

export function ConfigModal(p: Props) {
  const [pending, start] = useTransition();
  const [test, setTest] = useState<string | null>(null);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={p.onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-auto rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-medium">{p.name}</h2>
          <button onClick={p.onClose} className="text-zinc-400 hover:text-zinc-700">
            ✕
          </button>
        </div>
        <a
          href={p.setupUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 inline-block text-xs text-blue-600 underline"
        >
          Cómo obtener estas credenciales →
        </a>
        <form
          className="mt-4 space-y-3"
          action={(fd) =>
            start(async () => {
              await p.guardar(fd);
              p.onClose();
            })
          }
        >
          {p.fields.map((f) => (
            <label key={f.key} className="block text-xs text-zinc-500">
              {f.label} {f.required && <span className="text-red-500">*</span>}
              <input
                name={f.key}
                type={f.type === "secret" ? "password" : "text"}
                placeholder={
                  f.hasValue && f.type === "secret"
                    ? "configurado ••••"
                    : (f.placeholder ?? "")
                }
                className={input}
              />
              {f.help && (
                <span className="mt-0.5 block text-[11px] text-zinc-400">{f.help}</span>
              )}
              <span className="text-[11px] text-zinc-400">
                fuente actual:{" "}
                {f.source === "ui"
                  ? "guardada"
                  : f.source === "env"
                    ? "variable de entorno"
                    : "sin configurar"}
              </span>
            </label>
          ))}
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <button
              type="submit"
              disabled={pending}
              className="rounded bg-zinc-900 px-3 py-1.5 text-sm text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
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
              className="text-sm text-zinc-600"
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
              className="ml-auto text-xs text-red-600 underline"
            >
              Borrar config
            </button>
          </div>
          {test && <p className="text-xs text-zinc-500">{test}</p>}
        </form>
      </div>
    </div>
  );
}

export function ConfigButton(p: Omit<Props, "onClose">) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded border border-zinc-300 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
      >
        Configurar
      </button>
      {open && <ConfigModal {...p} onClose={() => setOpen(false)} />}
    </>
  );
}
