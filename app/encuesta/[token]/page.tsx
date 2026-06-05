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

// Tema claro fijo (igual que /e/[slug]): papel cálido, tinta azulada, acento
// índigo. Tarjeta centrada con cover full-bleed opcional.
function Shell({
  cover,
  children,
}: {
  cover?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center bg-[oklch(98.5%_0.006_95)] px-4 py-8 sm:py-12">
      <main className="w-full max-w-xl overflow-hidden rounded-2xl border border-[oklch(91%_0.01_95)] bg-[oklch(99.5%_0.004_95)] shadow-[0_1px_2px_oklch(50%_0.03_265_/_0.08),0_10px_34px_oklch(50%_0.03_265_/_0.07)]">
        {cover && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} alt="" className="h-40 w-full object-cover sm:h-52" />
        )}
        <div className="p-5 sm:p-6">{children}</div>
      </main>
      <p className="mt-5 max-w-xl px-4 text-center text-xs leading-relaxed text-[oklch(62%_0.02_265)]">
        Relevamiento de opinión pública. No es campaña electoral. Tus datos no se
        comparten con terceros.
      </p>
    </div>
  );
}

function Heading({ children }: { children: React.ReactNode }) {
  return (
    <h1 className="text-lg font-semibold text-[oklch(26%_0.02_265)]">{children}</h1>
  );
}
function Sub({ children }: { children: React.ReactNode }) {
  return <p className="mt-2 text-sm text-[oklch(52%_0.02_265)]">{children}</p>;
}

function BajaLink({ token }: { token: string }) {
  return (
    <form action={optarBaja} className="mt-6 border-t border-[oklch(93%_0.01_95)] pt-4">
      <input type="hidden" name="token" value={token} />
      <button
        type="submit"
        className="text-xs text-[oklch(62%_0.02_265)] underline underline-offset-2 hover:text-[oklch(45%_0.02_265)]"
      >
        No quiero recibir más mensajes (darme de baja)
      </button>
    </form>
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
        <Heading>Link inválido</Heading>
        <Sub>Este enlace de encuesta no es válido o expiró.</Sub>
      </Shell>
    );
  }

  if (sp.baja) {
    return (
      <Shell>
        <Heading>Listo, te damos de baja</Heading>
        <Sub>No vas a recibir más mensajes nuestros por ningún canal. Gracias.</Sub>
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
      <Shell cover={encF?.imageEndUrl}>
        <div className="text-center">
          <span className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-[oklch(94%_0.05_150)] text-[oklch(52%_0.13_150)]">
            <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" aria-hidden>
              <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <h1 className="text-xl font-bold text-[oklch(26%_0.02_265)]">
            ¡Gracias por responder!
          </h1>
          <p className="mx-auto mt-2 max-w-sm text-[0.95rem] leading-relaxed text-[oklch(50%_0.02_265)]">
            {encF?.mensajeFinal?.trim() ||
              "Tu respuesta quedó registrada. Nos ayuda a entender mejor el barrio."}
          </p>
          {encF?.ctaLabel && cu && (
            <a
              href={cu}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="mt-6 inline-block rounded-xl bg-[oklch(52%_0.13_255)] px-6 py-3 text-base font-semibold text-white transition hover:bg-[oklch(47%_0.13_255)]"
            >
              {encF.ctaLabel}
            </a>
          )}
        </div>
      </Shell>
    );
  }

  if (await isOptedOut(ref.projectId, ref.dni)) {
    return (
      <Shell>
        <Heading>Estás dado de baja</Heading>
        <Sub>No recibirás más mensajes. Si fue un error, escribinos.</Sub>
      </Shell>
    );
  }

  // Encuesta del módulo nuevo (tipada). Convive con el flujo legacy de abajo.
  if (ref.encuestaId) {
    const enc = await getEncuesta(ref.projectId, ref.encuestaId);
    if (!enc || enc.estado === "cerrada") {
      return (
        <Shell>
          <Heading>Encuesta no disponible</Heading>
          <Sub>Esta encuesta ya no está activa. Gracias igual por tu interés.</Sub>
        </Shell>
      );
    }
    return (
      <Shell cover={enc.imageUrl}>
        <header className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-[oklch(58%_0.06_255)]">
            {ORG_NAME}
          </p>
          <h1 className="text-2xl font-bold leading-tight text-[oklch(24%_0.03_265)]">
            {enc.titulo}
          </h1>
          {enc.descripcion && (
            <p className="text-[0.95rem] leading-relaxed text-[oklch(48%_0.02_265)]">
              {enc.descripcion}
            </p>
          )}
        </header>
        <div className="my-6 h-px bg-[oklch(92%_0.01_95)]" />
        <SurveyRender
          layout={enc.layout}
          stepMode={enc.stepMode}
          questions={enc.preguntas}
          action={responderEncuesta}
          hidden={{ token }}
        />
        <BajaLink token={token} />
      </Shell>
    );
  }

  // Flujo legacy: preguntas-en-campaña (texto libre).
  const campaign = await getCampaign(ref.projectId, ref.campaignId);
  const preguntas = campaign?.preguntas ?? [];
  const contacts = await googleSheetsConnector.readPadron();
  const nombre = contacts.find((c) => c.dni === ref.dni)?.nombre ?? "";

  return (
    <Shell>
      <h1 className="text-xl font-bold text-[oklch(24%_0.03_265)]">
        Hola{nombre ? ` ${nombre}` : ""} 👋
      </h1>
      <p className="mt-1 text-[0.95rem] text-[oklch(48%_0.02_265)]">
        Somos {ORG_NAME}. ¿Nos das un minuto?
      </p>

      <form action={responderEncuesta} className="mt-6 space-y-5">
        <input type="hidden" name="token" value={token} />
        {preguntas.map((p, i) => (
          <label key={i} className="flex flex-col gap-2 text-base">
            <span className="font-semibold leading-snug text-[oklch(26%_0.02_265)]">{p}</span>
            <textarea
              name={`q${i}`}
              rows={3}
              className="w-full resize-y rounded-xl border border-[oklch(90%_0.01_95)] bg-[oklch(99.5%_0.004_95)] px-3.5 py-3 text-base text-[oklch(28%_0.02_265)] outline-none transition focus-visible:border-[oklch(52%_0.13_255)] focus-visible:ring-4 focus-visible:ring-[oklch(52%_0.13_255)/0.12]"
            />
          </label>
        ))}
        <button
          type="submit"
          className="w-full rounded-xl bg-[oklch(52%_0.13_255)] px-4 py-3.5 text-base font-semibold text-white transition hover:bg-[oklch(47%_0.13_255)] active:scale-[0.99]"
        >
          Enviar respuesta
        </button>
      </form>

      <BajaLink token={token} />
    </Shell>
  );
}
