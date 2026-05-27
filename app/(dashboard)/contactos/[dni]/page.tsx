import Link from "next/link";
import { notFound } from "next/navigation";
import { HealthBadge } from "@/components/health-badge";
import { registrarLlamada } from "./actions";
import { googleSheetsConnector } from "@/lib/connectors/google-sheets";
import { getRawRelationship } from "@/lib/mock/relaciones";
import { CALL_OUTCOMES, listCallsFor } from "@/lib/calls";
import {
  deriveRelationship,
  edadLabel,
  type Channel,
} from "@/lib/relationship";

const CHANNEL_LABEL: Record<Channel, string> = {
  email: "Email",
  whatsapp: "WhatsApp",
  sms: "SMS",
  voice: "Voz",
};

const OUTCOME_LABEL: Record<string, string> = Object.fromEntries(
  CALL_OUTCOMES.map((o) => [o.value, o.label]),
);

const callInputCls =
  "rounded border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900";

function fmt(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default async function ContactoPage({
  params,
}: {
  params: Promise<{ dni: string }>;
}) {
  const { dni } = await params;
  const contacts = await googleSheetsConnector.readPadron();
  const contact = contacts.find((c) => c.dni === dni);
  if (!contact) notFound();

  const raw = getRawRelationship(dni);
  const rel = deriveRelationship(dni, raw);
  const historial = [...(raw?.events ?? [])].sort(
    (a, b) => +new Date(b.contactedAt) - +new Date(a.contactedAt),
  );
  const llamadas = listCallsFor(dni);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link href="/segmentos" className="text-sm text-zinc-500 hover:underline">
        ← Volver a segmentos
      </Link>

      <div>
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
          {contact.nombre} {contact.apellido}
        </h1>
        <p className="mt-1 font-mono text-sm text-zinc-500">
          DNI {contact.dni} · {edadLabel(contact.fecha_nac)} ·{" "}
          {contact.barrio} · Circuito {contact.circuito}
        </p>
      </div>

      <dl className="space-y-2 rounded-lg border border-zinc-200 p-4 text-sm dark:border-zinc-800">
        <div className="flex justify-between">
          <dt className="text-zinc-500">Salud de la relación</dt>
          <dd>
            <HealthBadge score={rel.healthScore} />
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-zinc-500">Próximo contacto permitido</dt>
          <dd className="text-zinc-800 dark:text-zinc-200">
            {rel.nextAvailableAt
              ? fmt(rel.nextAvailableAt)
              : "hoy mismo (algún canal disponible)"}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-zinc-500">Canal preferido inferido</dt>
          <dd className="text-zinc-800 dark:text-zinc-200">
            {rel.preferredChannel
              ? CHANNEL_LABEL[rel.preferredChannel]
              : "— (pocos contactos)"}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-zinc-500">Contactos / respuestas</dt>
          <dd className="text-zinc-800 dark:text-zinc-200">
            {rel.totalContactsMade} / {rel.totalResponses}
            {rel.totalContactsMade > 0 &&
              ` (${Math.round(rel.responseRate * 100)}%)`}
          </dd>
        </div>
        {rel.optOuts.length > 0 && (
          <div className="flex justify-between">
            <dt className="text-zinc-500">Opt-outs</dt>
            <dd className="text-red-700">
              {rel.optOuts.map((o) => CHANNEL_LABEL[o.channel]).join(", ")}
            </dd>
          </div>
        )}
      </dl>

      <div>
        <div className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-400">
          Historial
        </div>
        {historial.length === 0 ? (
          <p className="text-sm text-zinc-400">Sin contactos previos.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {historial.map((e, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className="font-mono text-zinc-400">
                  {fmt(e.contactedAt)}
                </span>
                <span className="text-zinc-700 dark:text-zinc-300">
                  {CHANNEL_LABEL[e.channel]}
                </span>
                {e.respondedAt ? (
                  <span className="text-emerald-600">· respondió</span>
                ) : e.complained ? (
                  <span className="text-red-600">· se quejó</span>
                ) : (
                  <span className="text-zinc-400">· sin respuesta</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Registro manual de llamadas (encuestador llama desde su celular) */}
      <div>
        <div className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-400">
          Llamadas registradas
        </div>
        {llamadas.length > 0 && (
          <ul className="mb-3 space-y-1 text-sm">
            {llamadas.map((c, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className="font-mono text-zinc-400">{fmt(c.at)}</span>
                <span className="text-zinc-700 dark:text-zinc-300">
                  {OUTCOME_LABEL[c.outcome] ?? c.outcome}
                </span>
                {c.notes && (
                  <span className="text-zinc-400">· {c.notes}</span>
                )}
              </li>
            ))}
          </ul>
        )}
        <form
          action={registrarLlamada}
          className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-zinc-300 p-3 dark:border-zinc-700"
        >
          <input type="hidden" name="dni" value={contact.dni} />
          <label className="flex flex-col gap-1 text-xs text-zinc-500">
            Resultado
            <select name="outcome" required className={callInputCls} defaultValue="">
              <option value="" disabled>
                elegí…
              </option>
              {CALL_OUTCOMES.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-1 flex-col gap-1 text-xs text-zinc-500">
            Notas (opcional)
            <input name="notes" className={callInputCls} />
          </label>
          <button
            type="submit"
            className="rounded bg-zinc-900 px-3 py-1.5 text-sm text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900"
          >
            Registrar llamada
          </button>
        </form>
      </div>
    </div>
  );
}
