import { requireProject } from "@/lib/workspace";
import { availableModels } from "@/lib/ad-proposals";
import { AdStudio } from "@/components/publicaciones/ad-studio";
import {
  generarPropuestas,
  afinarPropuesta,
  publicarDirecto,
  generarImagenPropuesta,
  generarVideoPropuesta,
  estadoVideoPropuesta,
} from "./actions";

export const metadata = { title: "Estudio de contenido · Tronador" };

export default async function PublicacionesPage() {
  await requireProject();
  const studioModels = (await availableModels()).map((m) => m.label);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            Estudio de contenido
          </h1>
          <p className="mt-1 max-w-[70ch] text-sm text-zinc-500">
            Generá propuestas de avisos con todos los modelos de IA a la vez:
            guiones y copys por plataforma (Instagram, Facebook, WhatsApp, X,
            TikTok, YouTube) más imagen y video. Preseleccionás, afinás cada una
            con prompts propios y exportás. Para difundir, usá la herramienta de{" "}
            <a href="/difusion" className="text-zinc-700 underline-offset-4 hover:underline dark:text-zinc-300">
              Difusión
            </a>
            .
          </p>
        </div>
        <a
          href="/difusion"
          className="shrink-0 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
        >
          Ir a Difusión →
        </a>
      </header>

      <AdStudio
        genAction={generarPropuestas}
        refineAction={afinarPropuesta}
        publishAction={publicarDirecto}
        imageAction={generarImagenPropuesta}
        videoAction={generarVideoPropuesta}
        videoStatusAction={estadoVideoPropuesta}
        models={studioModels}
      />
    </div>
  );
}
