import { responderEncuesta, optarBaja } from "./actions";
import { getCampaign } from "@/lib/campaigns";
import { hasResponded, resolveToken } from "@/lib/survey";
import { getEncuesta } from "@/lib/encuestas";
import { safeHttpUrl } from "@/lib/encuestas/types";
import { hasRespondedToken } from "@/lib/encuestas/responses";
import { SurveyRender } from "@/components/encuestas/survey-render";
import { isOptedOut } from "@/lib/optout";
import { googleSheetsConnector } from "@/lib/connectors/google-sheets";
import { ORG_NAME } from "@/lib/config";

export const metadata = {
  title: "Encuesta",
  robots: { index: false },
};

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-lg flex-col px-4 py-8 sm:px-6 sm:py-12">
      <div className="rounded-xl border border-zinc-200 p-5 sm:p-6 dark:border-zinc-800">
        {children}
      </div>
      <p className="mt-4 text-center text-xs text-zinc-400">
        Relevamiento de opinión pública. No es campaña electoral. Tus datos no
        se comparten con terceros.
      </p>
    </div>
  );
}

export default async function EncuestaPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { token } = await params;
  const sp = await searchParams;
  const ref = await resolveToken(token);

  if (!ref || sp.error) {
    return (
      <Shell>
        <h1 className="text-lg font-semibold">Link inválido</h1>
        <p className="mt-2 text-sm text-zinc-500">
          Este enlace de encuesta no es válido o expiró.
        </p>
      </Shell>
    );
  }

  if (sp.baja) {
    return (
      <Shell>
        <h1 className="text-lg font-semibold">Listo, te damos de baja</h1>
        <p className="mt-2 text-sm text-zinc-500">
          No vas a recibir más mensajes nuestros por ningún canal. Gracias.
        </p>
      </Shell>
    );
  }

  const yaRespondio = ref.encuestaId
    ? await hasRespondedToken(token)
    : await hasResponded(token);
  if (sp.gracias || yaRespondio) {
    const encF = ref.encuestaId
      ? await getEncuesta(ref.projectId, ref.encuestaId)
      : null;
    const cu = safeHttpUrl(encF?.ctaUrl);
    return (
      <Shell>
        {encF?.imageEndUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={encF.imageEndUrl} alt="" className="mb-3 max-h-48 w-full rounded-lg object-cover" />
        )}
        <h1 className="text-lg font-semibold">¡Gracias por responder!</h1>
        <p className="mt-2 text-sm text-zinc-500">
          {encF?.mensajeFinal?.trim() ||
            "Tu respuesta quedó registrada. Nos ayuda a entender mejor el barrio."}
        </p>
        {encF?.ctaLabel && cu && (
          <a
            href={cu}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="mt-5 inline-block rounded-lg bg-zinc-900 px-5 py-3 text-base font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
          >
            {encF.ctaLabel}
          </a>
        )}
      </Shell>
    );
  }

  if (await isOptedOut(ref.projectId, ref.dni)) {
    return (
      <Shell>
        <h1 className="text-lg font-semibold">Estás dado de baja</h1>
        <p className="mt-2 text-sm text-zinc-500">
          No recibirás más mensajes. Si fue un error, escribinos.
        </p>
      </Shell>
    );
  }

  // Encuesta del módulo nuevo (tipada). Convive con el flujo legacy de abajo.
  if (ref.encuestaId) {
    const enc = await getEncuesta(ref.projectId, ref.encuestaId);
    if (!enc || enc.estado === "cerrada") {
      return (
        <Shell>
          <h1 className="text-lg font-semibold">Encuesta no disponible</h1>
          <p className="mt-2 text-sm text-zinc-500">
            Esta encuesta ya no está activa. Gracias igual por tu interés.
          </p>
        </Shell>
      );
    }
    return (
      <Shell>
        <header className="space-y-2">
          {enc.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={enc.imageUrl}
              alt=""
              className="mb-1 max-h-48 w-full rounded-lg object-cover"
            />
          )}
          <h1 className="text-xl font-semibold leading-tight text-zinc-900 dark:text-zinc-100">
            {enc.titulo}
          </h1>
          {enc.descripcion && (
            <p className="text-sm text-zinc-500">{enc.descripcion}</p>
          )}
        </header>
        <div className="mt-4 border-t border-zinc-200 pt-2 dark:border-zinc-800" />
        <SurveyRender
          layout={enc.layout}
          stepMode={enc.stepMode}
          questions={enc.preguntas}
          action={responderEncuesta}
          hidden={{ token }}
        />
        <form action={optarBaja} className="mt-4 border-t border-zinc-100 pt-4 dark:border-zinc-800">
          <input type="hidden" name="token" value={token} />
          <button
            type="submit"
            className="text-xs text-zinc-400 underline hover:text-zinc-600"
          >
            No quiero recibir más mensajes (darme de baja)
          </button>
        </form>
      </Shell>
    );
  }

  const campaign = await getCampaign(ref.projectId, ref.campaignId);
  const preguntas = campaign?.preguntas ?? [];
  const contacts = await googleSheetsConnector.readPadron();
  const nombre = contacts.find((c) => c.dni === ref.dni)?.nombre ?? "";

  return (
    <Shell>
      <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
        Hola{nombre ? ` ${nombre}` : ""} 👋
      </h1>
      <p className="mt-1 text-sm text-zinc-500">
        Somos {ORG_NAME}. ¿Nos das un minuto?
      </p>

      <form action={responderEncuesta} className="mt-5 space-y-4">
        <input type="hidden" name="token" value={token} />
        {preguntas.map((p, i) => (
          <label key={i} className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-700 dark:text-zinc-200">{p}</span>
            <textarea
              name={`q${i}`}
              rows={2}
              className="rounded border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>
        ))}
        <button
          type="submit"
          className="w-full rounded bg-zinc-900 px-4 py-2 text-sm text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900"
        >
          Enviar respuesta
        </button>
      </form>

      <form action={optarBaja} className="mt-4 border-t border-zinc-100 pt-4 dark:border-zinc-800">
        <input type="hidden" name="token" value={token} />
        <button
          type="submit"
          className="text-xs text-zinc-400 underline hover:text-zinc-600"
        >
          No quiero recibir más mensajes (darme de baja)
        </button>
      </form>
    </Shell>
  );
}
