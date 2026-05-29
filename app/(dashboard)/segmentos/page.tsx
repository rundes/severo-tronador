import Link from "next/link";
import { FilterForm } from "@/components/segmentos/filter-form";
import { SavedList } from "@/components/segmentos/saved-list";
import { HealthBadge } from "@/components/health-badge";
import {
  applySegment,
  barriosDisponibles,
  buildFunnel,
  filterFromParams,
  loadContacts,
} from "@/lib/segments";
import { estimateAllChannels } from "@/lib/segments-cost";
import { CostPreview, FunnelView } from "@/components/segmentos/funnel";
import { QueryBuilder } from "@/components/segmentos/query-builder";
import { applyQuery, decodeQuery } from "@/lib/segment-query";
import {
  CHANNELS,
  channelAvailable,
  healthBand,
  type Channel,
} from "@/lib/relationship";
import { listSavedSegments } from "@/lib/segments-store";
import { borrarSegmento, guardarSegmento } from "./actions";
import { SubmitButton, FormStatus } from "@/components/ui/submit-button";

export const metadata = { title: "Segmentos · Severo Tronador" };

const CHANNEL_LABEL: Record<Channel, string> = {
  email: "📧 Email",
  whatsapp: "💬 WhatsApp",
  sms: "📱 SMS",
  voice: "☎️ Voz",
};

function Bar({ n, total }: { n: number; total: number }) {
  const pct = total ? Math.round((n / total) * 100) : 0;
  const filled = Math.round((pct / 100) * 24);
  return (
    <span className="font-mono text-xs text-zinc-400">
      {"█".repeat(filled)}
      {"░".repeat(24 - filled)} {pct}%
    </span>
  );
}

export default async function SegmentosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const advancedQuery = params.q ? decodeQuery(params.q) : null;
  const advanced = Boolean(advancedQuery);
  const filter = advanced ? {} : filterFromParams(params);
  const all = await loadContacts();
  const matched = advancedQuery
    ? applyQuery(all, advancedQuery)
    : applySegment(all, filter);
  const saved = await listSavedSegments();
  const funnel = advanced ? [] : buildFunnel(all, filter);
  const costs = matched.length > 0 ? await estimateAllChannels(matched.length) : [];

  const bands = { green: 0, yellow: 0, red: 0 };
  for (const m of matched) bands[healthBand(m.rel.healthScore)]++;

  const available: Record<Channel, number> = {
    email: 0,
    whatsapp: 0,
    sms: 0,
    voice: 0,
  };
  for (const m of matched)
    for (const ch of CHANNELS)
      if (channelAvailable(m.rel, ch)) available[ch]++;

  const total = matched.length;
  const qsParams = new URLSearchParams(
    Object.entries(filter).filter(([, v]) => v !== undefined) as [
      string,
      string,
    ][],
  );
  if (params.q) qsParams.set("q", params.q);
  const qs = qsParams.toString();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
          Segmentos
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Constructor de audiencias sobre el padrón. La calidad sobre la
          cantidad: 80 correctos valen más que 8.000 random.
        </p>
      </div>

      {advanced ? (
        <>
          <div className="flex items-center justify-between text-xs text-zinc-500">
            <span>Modo avanzado activo (AND/OR + NOT).</span>
            <Link
              href="/segmentos"
              className="rounded border border-zinc-300 px-2 py-1 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
            >
              ← Volver a modo simple
            </Link>
          </div>
          <QueryBuilder
            initial={advancedQuery ?? undefined}
            barrios={barriosDisponibles(all)}
          />
        </>
      ) : (
        <>
          <FilterForm barrios={barriosDisponibles(all)} />
          <details className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
            <summary className="cursor-pointer text-xs font-medium uppercase tracking-wide text-zinc-400 hover:text-zinc-600">
              Modo avanzado (AND/OR)
            </summary>
            <div className="mt-3">
              <QueryBuilder barrios={barriosDisponibles(all)} />
            </div>
          </details>
        </>
      )}

      <details className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
        <summary className="cursor-pointer text-xs font-medium uppercase tracking-wide text-zinc-400">
          Segmentos guardados ({saved.length})
        </summary>
        <div className="mt-3">
          <SavedList segments={saved} onDelete={borrarSegmento} />
        </div>
      </details>

      <form
        action={guardarSegmento}
        className="space-y-2 rounded-lg border border-dashed border-zinc-300 p-3 dark:border-zinc-700"
      >
        <div className="flex items-end gap-2">
        <input type="hidden" name="sexo" value={filter.sexo ?? ""} />
        <input type="hidden" name="edadMin" value={filter.edadMin ?? ""} />
        <input type="hidden" name="edadMax" value={filter.edadMax ?? ""} />
        <input type="hidden" name="barrio" value={filter.barrio ?? ""} />
        <input type="hidden" name="circuito" value={filter.circuito ?? ""} />
        <input type="hidden" name="mesa" value={filter.mesa ?? ""} />
        <input type="hidden" name="healthMin" value={filter.healthMin ?? ""} />
        {(filter.healthBands ?? []).map((band) => (
          <input key={band} type="hidden" name="healthBands" value={band} />
        ))}
        <input
          type="hidden"
          name="respondedWithinDays"
          value={filter.respondedWithinDays ?? ""}
        />
        <input
          type="hidden"
          name="notContactedDays"
          value={filter.notContactedDays ?? ""}
        />
        <input
          type="hidden"
          name="hasEmail"
          value={
            filter.hasEmail === true ? "1" : filter.hasEmail === false ? "0" : ""
          }
        />
        <input
          type="hidden"
          name="hasTelefono"
          value={
            filter.hasTelefono === true
              ? "1"
              : filter.hasTelefono === false
                ? "0"
                : ""
          }
        />
        <input
          type="hidden"
          name="preferredChannel"
          value={filter.preferredChannel ?? ""}
        />
        <label className="flex flex-1 flex-col gap-1 text-xs text-zinc-500">
          Guardar segmento actual como…
          <input
            name="nombre"
            required
            placeholder="Mujeres 40-65 Centro"
            className="rounded border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <SubmitButton pendingLabel="Guardando…">Guardar</SubmitButton>
        </div>
        <FormStatus
          ok={params.guardado === "1" ? "Segmento guardado." : null}
          error={params.error === "validacion" ? "Datos inválidos. Revisá los campos." : null}
          detalle={params.detalle ?? null}
        />
      </form>

      <FunnelView total={all.length} steps={funnel} />

      <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <div className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
          {total}{" "}
          <span className="text-base font-normal text-zinc-500">
            {total === 1 ? "persona" : "personas"}
          </span>
        </div>

        <div className="mt-4">
          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-400">
            Distribución de salud
          </div>
          <div className="space-y-0.5 text-sm">
            <div className="flex items-center gap-3">
              🟢 sanas <span className="w-8 text-right">{bands.green}</span>{" "}
              <Bar n={bands.green} total={total} />
            </div>
            <div className="flex items-center gap-3">
              🟡 tibias <span className="w-8 text-right">{bands.yellow}</span>{" "}
              <Bar n={bands.yellow} total={total} />
            </div>
            <div className="flex items-center gap-3">
              🔴 deterioradas{" "}
              <span className="w-8 text-right">{bands.red}</span>{" "}
              <Bar n={bands.red} total={total} />
            </div>
          </div>
        </div>

        <div className="mt-4">
          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-400">
            Disponibles para contacto hoy
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-zinc-600 dark:text-zinc-300">
            {CHANNELS.map((ch) => (
              <span key={ch}>
                {CHANNEL_LABEL[ch]}: {available[ch]}
              </span>
            ))}
          </div>
        </div>

        {total > 0 && (
          <div className="mt-4 flex flex-wrap gap-2 border-t border-zinc-100 pt-3 dark:border-zinc-800">
            <Link
              href={qs ? `/campanas/nueva?${qs}` : "/campanas/nueva"}
              className="inline-block rounded bg-zinc-900 px-3 py-1.5 text-sm text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900"
            >
              Iniciar campaña →
            </Link>
            <a
              href={
                qs
                  ? `/api/segmentos/export?${qs}`
                  : "/api/segmentos/export"
              }
              className="inline-block rounded border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200"
            >
              ⬇️ CSV
            </a>
          </div>
        )}
      </div>

      {costs.length > 0 && <CostPreview costs={costs} />}

      <div>
        <div className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-400">
          Vista previa {total > 50 && "(primeros 50)"}
        </div>
        <div className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {matched.slice(0, 50).map(({ contact, rel, edad }) => (
            <Link
              key={contact.dni}
              href={`/contactos/${contact.dni}`}
              className="flex items-center justify-between px-4 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-900"
            >
              <span className="text-sm">
                {contact.nombre} {contact.apellido}
                <span className="ml-2 text-zinc-400">
                  {edad ?? "—"} · {contact.barrio}
                </span>
              </span>
              <HealthBadge score={rel.healthScore} />
            </Link>
          ))}
          {total === 0 && (
            <div className="px-4 py-6 text-center text-sm text-zinc-400">
              Ningún contacto coincide con estos filtros.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
