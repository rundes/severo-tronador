"use client";

import { useRouter, useSearchParams } from "next/navigation";

const inputCls =
  "rounded border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900";

export function FilterForm({ barrios }: { barrios: string[] }) {
  const router = useRouter();
  const sp = useSearchParams();
  const get = (k: string) => sp.get(k) ?? "";

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const params = new URLSearchParams();
    for (const [k, v] of fd.entries()) {
      const s = String(v).trim();
      if (s) params.set(k, s);
    }
    router.push(params.toString() ? `/segmentos?${params}` : "/segmentos");
  }

  return (
    <form
      onSubmit={onSubmit}
      className="grid grid-cols-2 gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800 sm:grid-cols-3"
    >
      <label className="flex flex-col gap-1 text-xs text-zinc-500">
        Sexo
        <select name="sexo" defaultValue={get("sexo")} className={inputCls}>
          <option value="">cualquiera</option>
          <option value="F">F</option>
          <option value="M">M</option>
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-zinc-500">
        Edad mín.
        <input
          type="number"
          name="edadMin"
          min={0}
          max={120}
          defaultValue={get("edadMin")}
          className={inputCls}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-zinc-500">
        Edad máx.
        <input
          type="number"
          name="edadMax"
          min={0}
          max={120}
          defaultValue={get("edadMax")}
          className={inputCls}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-zinc-500">
        Barrio / localidad
        <select name="barrio" defaultValue={get("barrio")} className={inputCls}>
          <option value="">cualquiera</option>
          {barrios.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-zinc-500">
        Salud mín. (0–100)
        <input
          type="number"
          name="healthMin"
          min={0}
          max={100}
          defaultValue={get("healthMin")}
          className={inputCls}
        />
      </label>
      <div className="flex items-end gap-2">
        <button
          type="submit"
          className="rounded bg-zinc-900 px-3 py-1.5 text-sm text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900"
        >
          Aplicar
        </button>
        <button
          type="button"
          onClick={() => router.push("/segmentos")}
          className="rounded px-3 py-1.5 text-sm text-zinc-500 hover:text-zinc-900"
        >
          Limpiar
        </button>
      </div>
    </form>
  );
}
