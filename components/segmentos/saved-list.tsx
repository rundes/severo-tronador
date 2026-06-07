"use client";

import { useRouter } from "next/navigation";
import type { SavedSegment } from "@/lib/segments-store";

export function SavedList({
  segments,
  onDelete,
}: {
  segments: SavedSegment[];
  onDelete: (formData: FormData) => Promise<void>;
}) {
  const router = useRouter();

  function loadInto(seg: SavedSegment) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(seg.filtros)) {
      // Las listas manuales (dnis/emails) no entran en la URL (serían enormes
      // y el modo simple no las edita); el segmento se usa por id en campañas.
      if (k === "dnis" || k === "emails") continue;
      if (v != null && v !== "") params.set(k, String(v));
    }
    router.push(`/segmentos?${params}`);
  }

  if (segments.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-zinc-300 p-3 text-xs text-zinc-500 dark:border-zinc-700">
        No hay segmentos guardados todavía. Aplicá filtros y dale «Guardar
        como…» para reutilizarlos.
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {segments.map((seg) => (
        <div
          key={seg.id}
          className="flex items-center justify-between rounded border border-zinc-200 px-3 py-1.5 text-sm dark:border-zinc-800"
        >
          <button
            type="button"
            onClick={() => loadInto(seg)}
            className="flex-1 text-left text-zinc-800 hover:underline dark:text-zinc-200"
          >
            {seg.nombre}
            <span className="ml-2 text-xs text-zinc-400">
              {filtrosResumen(seg.filtros)}
            </span>
          </button>
          <form action={onDelete}>
            <input type="hidden" name="id" value={seg.id} />
            <button
              type="submit"
              className="text-xs text-zinc-400 hover:text-red-600"
              aria-label="Borrar"
            >
              ✕
            </button>
          </form>
        </div>
      ))}
    </div>
  );
}

function filtrosResumen(f: SavedSegment["filtros"]): string {
  const parts: string[] = [];
  if (f.sexo) parts.push(f.sexo);
  if (f.edadMin != null || f.edadMax != null)
    parts.push(`${f.edadMin ?? ""}–${f.edadMax ?? ""}`);
  if (f.barrio) parts.push(f.barrio);
  if (f.circuito) parts.push(`circ ${f.circuito}`);
  if (f.mesa) parts.push(`mesa ${f.mesa}`);
  if (f.healthMin != null) parts.push(`salud≥${f.healthMin}`);
  if (f.healthBands?.length) parts.push(f.healthBands.join("/"));
  if (f.preferredChannel) parts.push(`pref ${f.preferredChannel}`);
  if (f.respondedWithinDays) parts.push(`resp<${f.respondedWithinDays}d`);
  if (f.notContactedDays) parts.push(`sin>${f.notContactedDays}d`);
  if (f.hasEmail === true) parts.push("+email");
  if (f.hasTelefono === true) parts.push("+tel");
  const listN = (f.dnis?.length ?? 0) + (f.emails?.length ?? 0);
  if (listN > 0) parts.push(`lista ${listN}`);
  return parts.length ? `(${parts.join(", ")})` : "";
}
