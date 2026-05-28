"use client";

import { useRouter, useSearchParams } from "next/navigation";

const inputCls =
  "rounded border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900";

export function FilterForm({ barrios }: { barrios: string[] }) {
  const router = useRouter();
  const sp = useSearchParams();
  const get = (k: string) => sp.get(k) ?? "";
  const bandsActive = new Set(get("healthBands").split(",").filter(Boolean));

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const params = new URLSearchParams();
    // Recolectar checkboxes de bandas en una sola key CSV.
    const bands = fd.getAll("healthBands").map(String).filter(Boolean);
    fd.delete("healthBands");
    for (const [k, v] of fd.entries()) {
      const s = String(v).trim();
      if (s) params.set(k, s);
    }
    if (bands.length > 0) params.set("healthBands", bands.join(","));
    router.push(params.toString() ? `/segmentos?${params}` : "/segmentos");
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-4 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
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
        <div className="flex flex-col gap-1 text-xs text-zinc-500">
          Bandas de salud
          <div className="flex gap-2 pt-1">
            {(["green", "yellow", "red"] as const).map((band) => (
              <label
                key={band}
                className="flex cursor-pointer items-center gap-1 text-xs"
              >
                <input
                  type="checkbox"
                  name="healthBands"
                  value={band}
                  defaultChecked={bandsActive.has(band)}
                />
                {band === "green" ? "🟢" : band === "yellow" ? "🟡" : "🔴"}
              </label>
            ))}
          </div>
        </div>
      </div>

      <details>
        <summary className="cursor-pointer text-xs font-medium uppercase tracking-wide text-zinc-400 hover:text-zinc-600">
          Filtros avanzados
        </summary>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-xs text-zinc-500">
            Circuito
            <input
              name="circuito"
              defaultValue={get("circuito")}
              placeholder="ej 12"
              className={inputCls}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-zinc-500">
            Mesa
            <input
              name="mesa"
              defaultValue={get("mesa")}
              placeholder="ej 0034"
              className={inputCls}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-zinc-500">
            Canal preferido
            <select
              name="preferredChannel"
              defaultValue={get("preferredChannel")}
              className={inputCls}
            >
              <option value="">cualquiera</option>
              <option value="email">📧 Email</option>
              <option value="whatsapp">💬 WhatsApp</option>
              <option value="sms">📱 SMS</option>
              <option value="voice">☎️ Voz</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-zinc-500">
            Respondió últimos N días
            <input
              type="number"
              name="respondedWithinDays"
              min={1}
              max={3650}
              defaultValue={get("respondedWithinDays")}
              placeholder="ej 30"
              className={inputCls}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-zinc-500">
            Sin contacto hace ≥ N días
            <input
              type="number"
              name="notContactedDays"
              min={1}
              max={3650}
              defaultValue={get("notContactedDays")}
              placeholder="ej 60"
              className={inputCls}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-zinc-500">
            Tiene email
            <select
              name="hasEmail"
              defaultValue={get("hasEmail")}
              className={inputCls}
            >
              <option value="">no importa</option>
              <option value="1">sí</option>
              <option value="0">no</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-zinc-500">
            Tiene teléfono
            <select
              name="hasTelefono"
              defaultValue={get("hasTelefono")}
              className={inputCls}
            >
              <option value="">no importa</option>
              <option value="1">sí</option>
              <option value="0">no</option>
            </select>
          </label>
        </div>
      </details>

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
