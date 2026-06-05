import { cookies } from "next/headers";
import { getEncuestaBySlug } from "@/lib/encuestas";
import { SurveyForm } from "@/components/encuestas/survey-form";
import { ORG_NAME } from "@/lib/config";
import { responderPublica } from "./actions";

export const metadata = {
  title: "Encuesta",
  robots: { index: false },
};

export const dynamic = "force-dynamic";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-12">
      <div className="rounded-xl border border-zinc-200 p-6 dark:border-zinc-800">
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
        <h1 className="text-lg font-semibold">¡Gracias por responder!</h1>
        <p className="mt-2 text-sm text-zinc-500">
          Tu respuesta quedó registrada. {sp.gracias ? "" : "Ya habías respondido esta encuesta."}
        </p>
      </Shell>
    );
  }

  return (
    <Shell>
      <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
        {enc.titulo}
      </h1>
      {enc.descripcion && (
        <p className="mt-1 text-sm text-zinc-500">{enc.descripcion}</p>
      )}
      <p className="mt-1 text-xs text-zinc-400">Somos {ORG_NAME}.</p>
      {sp.error && (
        <p className="mt-3 rounded bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/30 dark:text-red-300">
          {sp.detalle ?? "Revisá tus respuestas."}
        </p>
      )}
      <SurveyForm
        questions={enc.preguntas}
        action={responderPublica}
        hidden={{ slug }}
      />
    </Shell>
  );
}
