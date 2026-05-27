import Link from "next/link";
import { getCampaign } from "@/lib/campaigns";
import { listResponses } from "@/lib/survey";

export const metadata = { title: "Respuestas · Severo Tronador" };

export default async function RespuestasPage() {
  const responses = await listResponses();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
          Respuestas
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Respuestas a encuestas tokenizadas, logueadas contra cada contacto.
        </p>
      </div>

      {responses.length === 0 ? (
        <p className="text-sm text-zinc-400">
          Todavía no llegaron respuestas. Se capturan cuando alguien completa
          su link <code>/encuesta/[token]</code>.
        </p>
      ) : (
        <div className="space-y-3">
          {responses.map((r) => {
            const campaign = getCampaign(r.campaignId);
            return (
              <div
                key={r.token}
                className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
              >
                <div className="flex items-center justify-between text-sm">
                  <Link
                    href={`/contactos/${r.dni}`}
                    className="font-medium hover:underline"
                  >
                    DNI {r.dni}
                  </Link>
                  <span className="text-zinc-400">
                    {campaign?.nombre ?? r.campaignId} ·{" "}
                    {new Date(r.at).toLocaleString("es-AR")}
                  </span>
                </div>
                <dl className="mt-2 space-y-1 text-sm">
                  {r.answers.map((a, i) => (
                    <div key={i}>
                      <dt className="text-zinc-500">{a.pregunta}</dt>
                      <dd className="text-zinc-800 dark:text-zinc-200">
                        {a.respuesta}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
