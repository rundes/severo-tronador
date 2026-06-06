import Link from "next/link";
import { getCampaign } from "@/lib/campaigns";
import { listResponses } from "@/lib/survey";
import { requireProject } from "@/lib/workspace";

export const metadata = { title: "Respuestas · Severo Tronador" };

export default async function RespuestasPage() {
  const { id: projectId } = await requireProject();
  const responses = await listResponses(projectId);

  // Pre-resolvemos el nombre de cada campaña (getCampaign ahora es async y no
  // puede llamarse dentro del .map de render). Dedup por campaignId.
  const campaignIds = [...new Set(responses.map((r) => r.campaignId))];
  const campaignNames = new Map<string, string | undefined>(
    await Promise.all(
      campaignIds.map(
        async (id) =>
          [id, (await getCampaign(projectId, id))?.nombre] as [
            string,
            string | undefined,
          ],
      ),
    ),
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6">
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
            const campaignNombre = campaignNames.get(r.campaignId);
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
                    {campaignNombre ?? r.campaignId} ·{" "}
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
