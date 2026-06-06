import { requireProject } from "@/lib/workspace";
import { availableModels } from "@/lib/ad-proposals";
import { AdStudio } from "@/components/publicaciones/ad-studio";
import { PageHeader } from "@/components/ui/page-header";
import { buttonClass } from "@/components/ui/button";
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
      <PageHeader
        eyebrow="Contenido"
        title="Estudio de contenido"
        subtitle={
          <>
            Generá propuestas de avisos con todos los modelos de IA a la vez:
            guiones y copys por plataforma (Instagram, Facebook, WhatsApp, X,
            TikTok, YouTube) más imagen y video. Preseleccionás, afinás cada una
            con prompts propios y exportás. Para difundir, usá{" "}
            <a href="/difusion" className="text-zinc-700 underline-offset-4 hover:underline dark:text-zinc-300">
              Difusión
            </a>
            .
          </>
        }
        action={
          <a href="/difusion" className={buttonClass("secondary")}>
            Ir a Difusión →
          </a>
        }
      />

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
