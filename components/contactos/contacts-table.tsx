"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Contact } from "@/lib/connectors/types";
import type { FieldDef } from "@/lib/contactos/field-defs";
import {
  asignarGrupoASeleccionados,
  eliminarContactosSeleccionados,
} from "@/app/(dashboard)/contactos/actions";

// Tabla de contactos con selección múltiple y acciones masivas (asignar grupo,
// eliminar) sobre la selección. Las acciones devuelven datos; al terminar se
// limpia la selección y se refresca la ruta.
type Grupo = { id: string; nombre: string; count: number };

const BASE_COLS = [
  "DNI",
  "Apellido",
  "Nombre",
  "Sexo",
  "Nac.",
  "Barrio",
  "Teléfono",
  "Email",
];

export function ContactsTable({
  rows,
  fieldDefs,
  grupos,
  cpage,
  pageSize,
  count,
  totalPages,
}: {
  rows: Contact[];
  fieldDefs: FieldDef[];
  grupos: Grupo[];
  cpage: number;
  pageSize: number;
  count: number;
  totalPages: number;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [grupoId, setGrupoId] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const pageDnis = rows.map((r) => String(r.dni));
  const allOnPage =
    pageDnis.length > 0 && pageDnis.every((d) => selected.has(d));

  function toggle(dni: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(dni)) next.delete(dni);
      else next.add(dni);
      return next;
    });
  }

  function toggleAllPage() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOnPage) pageDnis.forEach((d) => next.delete(d));
      else pageDnis.forEach((d) => next.add(d));
      return next;
    });
  }

  function clear() {
    setSelected(new Set());
    setMsg(null);
  }

  async function asignar() {
    const dnis = [...selected];
    if (!dnis.length) return;
    setBusy(true);
    setMsg(null);
    const res = await asignarGrupoASeleccionados(grupoId || null, dnis);
    setBusy(false);
    if (res.ok) {
      setMsg(`Grupo asignado a ${res.n} contactos.`);
      clear();
      router.refresh();
    } else {
      setMsg(res.error);
    }
  }

  async function eliminar() {
    const dnis = [...selected];
    if (!dnis.length) return;
    if (
      !window.confirm(
        `Eliminar ${dnis.length} contactos seleccionados? No se puede deshacer.`,
      )
    )
      return;
    setBusy(true);
    setMsg(null);
    const res = await eliminarContactosSeleccionados(dnis);
    setBusy(false);
    if (res.ok) {
      setMsg(`${res.n} contactos eliminados.`);
      clear();
      router.refresh();
    } else {
      setMsg(res.error);
    }
  }

  const n = selected.size;

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
          Contactos cargados
        </h2>
        <span className="font-mono text-[11px] text-zinc-500">
          {((cpage - 1) * pageSize + 1).toLocaleString()}–
          {Math.min(cpage * pageSize, count).toLocaleString()} de{" "}
          {count.toLocaleString()}
        </span>
      </div>

      {/* Barra de acciones de la selección */}
      {n > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-accent/40 bg-accent/5 px-3 py-2 text-sm">
          <span className="font-medium text-zinc-700 dark:text-zinc-200">
            {n} seleccionado{n === 1 ? "" : "s"}
          </span>
          <div className="flex items-center gap-1.5">
            <select
              value={grupoId}
              onChange={(e) => setGrupoId(e.target.value)}
              disabled={busy}
              className="min-h-9 rounded border border-zinc-300 bg-white px-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            >
              <option value="">— quitar grupo —</option>
              {grupos.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.nombre}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={asignar}
              disabled={busy}
              className="rounded bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
            >
              Asignar
            </button>
          </div>
          <button
            type="button"
            onClick={eliminar}
            disabled={busy}
            className="rounded bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-60"
          >
            Eliminar
          </button>
          <button
            type="button"
            onClick={clear}
            disabled={busy}
            className="text-xs text-zinc-500 underline-offset-4 hover:underline"
          >
            Limpiar
          </button>
          {msg && <span className="text-xs text-zinc-500">{msg}</span>}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-left text-xs">
          <thead className="bg-zinc-50 text-[11px] uppercase tracking-wider text-zinc-500 dark:bg-zinc-900/40">
            <tr>
              <th className="px-2.5 py-2">
                <input
                  type="checkbox"
                  checked={allOnPage}
                  onChange={toggleAllPage}
                  aria-label="Seleccionar todos en esta página"
                  className="h-4 w-4 cursor-pointer accent-[var(--accent)]"
                />
              </th>
              {BASE_COLS.map((h) => (
                <th key={h} className="px-2.5 py-2 font-medium">
                  {h}
                </th>
              ))}
              {fieldDefs.map((d) => (
                <th
                  key={d.id}
                  className="whitespace-nowrap px-2.5 py-2 font-medium"
                >
                  {d.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {rows.map((c) => {
              const dni = String(c.dni);
              const sel = selected.has(dni);
              const cv = (c as unknown as Record<string, unknown>).custom as
                | Record<string, unknown>
                | undefined;
              return (
                <tr
                  key={dni}
                  className={
                    sel
                      ? "bg-accent/5"
                      : "hover:bg-zinc-50 dark:hover:bg-zinc-900/40"
                  }
                >
                  <td className="px-2.5 py-1.5">
                    <input
                      type="checkbox"
                      checked={sel}
                      onChange={() => toggle(dni)}
                      aria-label={`Seleccionar ${dni}`}
                      className="h-4 w-4 cursor-pointer accent-[var(--accent)]"
                    />
                  </td>
                  <td className="px-2.5 py-1.5 font-mono">
                    <Link
                      href={`/contactos/${dni}`}
                      className="text-zinc-700 underline-offset-4 hover:underline dark:text-zinc-300"
                    >
                      {dni}
                    </Link>
                  </td>
                  <td className="px-2.5 py-1.5">{c.apellido ?? ""}</td>
                  <td className="px-2.5 py-1.5">{c.nombre ?? ""}</td>
                  <td className="px-2.5 py-1.5">{c.sexo ?? ""}</td>
                  <td className="px-2.5 py-1.5 tabular-nums">
                    {c.fecha_nac ?? ""}
                  </td>
                  <td className="px-2.5 py-1.5">{c.barrio ?? ""}</td>
                  <td className="px-2.5 py-1.5 tabular-nums">
                    {c.telefono ?? ""}
                  </td>
                  <td className="px-2.5 py-1.5">{c.email ?? ""}</td>
                  {fieldDefs.map((d) => (
                    <td
                      key={d.id}
                      className="whitespace-nowrap px-2.5 py-1.5"
                    >
                      {cv?.[d.key] != null ? String(cv[d.key]) : ""}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          {cpage > 1 ? (
            <Link
              href={`/contactos?cpage=${cpage - 1}`}
              className="rounded border border-zinc-300 px-3 py-1.5 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
            >
              ← Anterior
            </Link>
          ) : (
            <span />
          )}
          <span className="font-mono text-xs text-zinc-500">
            Página {cpage} / {totalPages}
          </span>
          {cpage < totalPages ? (
            <Link
              href={`/contactos?cpage=${cpage + 1}`}
              className="rounded border border-zinc-300 px-3 py-1.5 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
            >
              Siguiente →
            </Link>
          ) : (
            <span />
          )}
        </div>
      )}
    </section>
  );
}
