"use client";

import { useRouter, useSearchParams } from "next/navigation";

const inputCls =
  "w-full rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-zinc-900 outline-none transition focus-visible:border-[oklch(52%_0.13_255)] focus-visible:ring-4 focus-visible:ring-[oklch(52%_0.13_255)]/12 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";
const labelCls = "flex flex-col gap-1 text-xs font-medium text-zinc-500";
const legendCls = "text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className={labelCls}>
      {label}
      {children}
    </label>
  );
}

export function FilterForm({
  barrios,
  grupos = [],
  afiliaciones = [],
}: {
  barrios: string[];
  grupos?: { id: string; nombre: string }[];
  afiliaciones?: string[];
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const get = (k: string) => sp.get(k) ?? "";
  const bandsActive = new Set(get("healthBands").split(",").filter(Boolean));

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const params = new URLSearchParams();
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
      className="space-y-5 rounded-xl border border-zinc-200 p-5 dark:border-zinc-800"
    >
      {/* Demografía */}
      <fieldset className="space-y-2">
        <legend className={legendCls}>Demografía</legend>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Sexo">
            <select name="sexo" defaultValue={get("sexo")} className={inputCls}>
              <option value="">cualquiera</option>
              <option value="F">Femenino</option>
              <option value="M">Masculino</option>
            </select>
          </Field>
          <Field label="Edad mín.">
            <input type="number" name="edadMin" min={0} max={120} defaultValue={get("edadMin")} className={inputCls} />
          </Field>
          <Field label="Edad máx.">
            <input type="number" name="edadMax" min={0} max={120} defaultValue={get("edadMax")} className={inputCls} />
          </Field>
          <Field label="Barrio / localidad">
            <select name="barrio" defaultValue={get("barrio")} className={inputCls}>
              <option value="">cualquiera</option>
              {barrios.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </Field>
          {grupos.length > 0 && (
            <Field label="Grupo de contactos">
              <select name="grupoId" defaultValue={get("grupoId")} className={inputCls}>
                <option value="">cualquiera</option>
                {grupos.map((g) => (
                  <option key={g.id} value={g.id}>{g.nombre}</option>
                ))}
              </select>
            </Field>
          )}
        </div>
      </fieldset>

      {/* Salud de la relación */}
      <fieldset className="space-y-2">
        <legend className={legendCls}>Salud de la relación</legend>
        <div className="flex flex-wrap items-end gap-4">
          <Field label="Salud mín. (0–100)">
            <input type="number" name="healthMin" min={0} max={100} defaultValue={get("healthMin")} className={`${inputCls} w-28`} />
          </Field>
          <div className={labelCls}>
            Bandas
            <div className="flex gap-2 pt-0.5">
              {([
                ["green", "🟢 Sanas"],
                ["yellow", "🟡 Tibias"],
                ["red", "🔴 Frías"],
              ] as const).map(([band, label]) => (
                <label
                  key={band}
                  className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-zinc-300 px-2.5 py-1.5 text-xs transition has-[:checked]:border-[oklch(52%_0.13_255)] has-[:checked]:bg-[oklch(96.5%_0.025_255)] dark:border-zinc-700 dark:has-[:checked]:border-[oklch(70%_0.1_255)] dark:has-[:checked]:bg-[oklch(32%_0.05_255)]"
                >
                  <input type="checkbox" name="healthBands" value={band} defaultChecked={bandsActive.has(band)} className="sr-only" />
                  {label}
                </label>
              ))}
            </div>
          </div>
        </div>
      </fieldset>

      {/* Más filtros */}
      <details className="rounded-lg border border-dashed border-zinc-300 p-3 dark:border-zinc-700">
        <summary className={`cursor-pointer ${legendCls} hover:text-zinc-600`}>
          Más filtros
        </summary>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {afiliaciones.length > 0 && (
            <Field label="Afiliación política">
              <select name="afiliacion" defaultValue={get("afiliacion")} className={inputCls}>
                <option value="">cualquiera</option>
                {afiliaciones.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </Field>
          )}
          <Field label="Circuito">
            <input name="circuito" defaultValue={get("circuito")} placeholder="ej 12" className={inputCls} />
          </Field>
          <Field label="Mesa">
            <input name="mesa" defaultValue={get("mesa")} placeholder="ej 0034" className={inputCls} />
          </Field>
          <Field label="Tiene email">
            <select name="hasEmail" defaultValue={get("hasEmail")} className={inputCls}>
              <option value="">no importa</option>
              <option value="1">sí</option>
              <option value="0">no</option>
            </select>
          </Field>
          <Field label="Tiene teléfono">
            <select name="hasTelefono" defaultValue={get("hasTelefono")} className={inputCls}>
              <option value="">no importa</option>
              <option value="1">sí</option>
              <option value="0">no</option>
            </select>
          </Field>
          <Field label="Respondió últimos N días">
            <input type="number" name="respondedWithinDays" min={1} max={3650} defaultValue={get("respondedWithinDays")} placeholder="ej 30" className={inputCls} />
          </Field>
          <Field label="Sin contacto hace ≥ N días">
            <input type="number" name="notContactedDays" min={1} max={3650} defaultValue={get("notContactedDays")} placeholder="ej 60" className={inputCls} />
          </Field>
          <label className={`${labelCls} sm:col-span-1`}>
            Canal preferido
            <select name="preferredChannel" defaultValue={get("preferredChannel")} className={inputCls}>
              <option value="">cualquiera</option>
              <option value="email">📧 Email</option>
              <option value="whatsapp">💬 WhatsApp</option>
              <option value="sms">📱 SMS</option>
              <option value="voice">☎️ Voz</option>
            </select>
            <span className="font-normal text-[11px] text-amber-600 dark:text-amber-400">
              Necesita historial de respuestas (3+); vacío al empezar.
            </span>
          </label>
        </div>
      </details>

      <div className="flex items-center gap-2 border-t border-zinc-100 pt-4 dark:border-zinc-800">
        <button
          type="submit"
          className="rounded-lg bg-[oklch(52%_0.13_255)] px-4 py-2 text-sm font-medium text-white hover:bg-[oklch(47%_0.13_255)]"
        >
          Aplicar filtros
        </button>
        <button
          type="button"
          onClick={() => router.push("/segmentos")}
          className="rounded-lg px-3 py-2 text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
        >
          Limpiar
        </button>
      </div>
    </form>
  );
}
