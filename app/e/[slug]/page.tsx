import { cookies } from "next/headers";
import { getEncuestaBySlug } from "@/lib/encuestas";
import { SurveyRender } from "@/components/encuestas/survey-render";
import { ORG_NAME } from "@/lib/config";
import { responderPublica } from "./actions";

export const metadata = {
  title: "Encuesta",
  robots: { index: false },
};

export const dynamic = "force-dynamic";

// Tema claro fijo: superficie pública respondida al aire libre en celular.
// Papel cálido + tinta azulada + acento índigo. Tarjeta centrada, escala a desktop.
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

export default async function EncuestaPublicaPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<Record<string, string | undefined>>;
}) {
  const { slug } = await params;
  const sp = (await searchParams) ?? {};
  const enc = await getEncuestaBySlug(slug);

  if (!enc || enc.estado !== "publicada") {
    return (
      <Shell>
        <h1 className="text-lg font-semibold text-[oklch(26%_0.02_265)]">
          Encuesta no disponible
        </h1>
        <p className="mt-2 text-sm text-[oklch(52%_0.02_265)]">
          Este enlace no es válido o la encuesta no está activa.
        </p>
      </Shell>
    );
  }

  const cookieStore = await cookies();
  const alreadyDone = cookieStore.get(`enc_done_${enc.id}`)?.value === "1";

  if (sp.gracias || alreadyDone) {
    return (
      <Shell cover={enc.imageEndUrl}>
        <FinishScreen
          mensaje={enc.mensajeFinal}
          ctaLabel={enc.ctaLabel}
          ctaUrl={enc.ctaUrl}
          repetido={!sp.gracias}
        />
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
      {sp.error && (
        <p className="mt-4 rounded-lg bg-[oklch(96%_0.05_25)] px-3 py-2 text-sm text-[oklch(48%_0.16_25)]">
          {sp.detalle ?? "Revisá tus respuestas."}
        </p>
      )}
      <div className="my-6 h-px bg-[oklch(92%_0.01_95)]" />
      <SurveyRender
        layout={enc.layout}
        stepMode={enc.stepMode}
        questions={enc.preguntas}
        action={responderPublica}
        hidden={{ slug }}
      />
    </Shell>
  );
}

function FinishScreen({
  mensaje,
  ctaLabel,
  ctaUrl,
  repetido,
}: {
  mensaje?: string | null;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  repetido: boolean;
}) {
  return (
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
        {mensaje?.trim() ||
          `Tu respuesta quedó registrada.${repetido ? " Ya habías respondido esta encuesta." : ""}`}
      </p>
      {ctaLabel && ctaUrl && (
        <a
          href={ctaUrl}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="mt-6 inline-block rounded-xl bg-[oklch(52%_0.13_255)] px-6 py-3 text-base font-semibold text-white transition hover:bg-[oklch(47%_0.13_255)]"
        >
          {ctaLabel}
        </a>
      )}
    </div>
  );
}
