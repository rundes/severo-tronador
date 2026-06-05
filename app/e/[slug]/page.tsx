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
        <h1 className="text-lg font-semibold">Encuesta no disponible</h1>
        <p className="mt-2 text-sm text-zinc-500">
          Este enlace no es válido o la encuesta no está activa.
        </p>
      </Shell>
    );
  }

  const cookieStore = await cookies();
  const alreadyDone = cookieStore.get(`enc_done_${enc.id}`)?.value === "1";

  if (sp.gracias || alreadyDone) {
    return (
      <Shell>
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
    <Shell>
      {/* Portada: imagen + título + descripción, separada de las preguntas. */}
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
        <p className="text-xs text-zinc-400">Somos {ORG_NAME}.</p>
      </header>
      {sp.error && (
        <p className="mt-3 rounded bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/30 dark:text-red-300">
          {sp.detalle ?? "Revisá tus respuestas."}
        </p>
      )}
      <div className="mt-4 border-t border-zinc-200 pt-2 dark:border-zinc-800" />
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
    <div>
      <h1 className="text-lg font-semibold">¡Gracias por responder!</h1>
      <p className="mt-2 text-sm text-zinc-500">
        {mensaje?.trim() ||
          `Tu respuesta quedó registrada.${repetido ? " Ya habías respondido esta encuesta." : ""}`}
      </p>
      {ctaLabel && ctaUrl && (
        <a
          href={ctaUrl}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="mt-5 inline-block rounded-lg bg-zinc-900 px-5 py-3 text-base font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          {ctaLabel}
        </a>
      )}
    </div>
  );
}
