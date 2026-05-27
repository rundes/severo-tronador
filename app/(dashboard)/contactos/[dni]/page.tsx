import Link from "next/link";
import { notFound } from "next/navigation";
import { HealthBadge } from "@/components/health-badge";
import { googleSheetsConnector } from "@/lib/connectors/google-sheets";
import { getRawRelationship } from "@/lib/mock/relaciones";
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

      <div className="flex gap-2">
        <button
          type="button"
          disabled
          title="Disponible cuando haya canales activos (F3+)"
          className="cursor-not-allowed rounded bg-zinc-200 px-3 py-1.5 text-sm text-zinc-500 dark:bg-zinc-800"
        >
          Contactar ahora
        </button>
      </div>
    </div>
  );
}
