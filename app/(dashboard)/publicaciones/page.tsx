import { requireProject } from "@/lib/workspace";
import { availableModels } from "@/lib/ad-proposals";
import { AdStudio } from "@/components/publicaciones/ad-studio";
import { PageHeader } from "@/components/ui/page-header";
import { buttonClass } from "@/components/ui/button";
import { listBriefs } from "@/lib/estudio-briefs";
import {
  generarPropuestas,
  afinarPropuesta,
  publicarDirecto,
  generarImagenPropuesta,
  generarVideoPropuesta,
  estadoVideoPropuesta,
  listarBriefs,
  guardarBrief,
  eliminarBrief,
  previsualizarPropuestaAd,
  crearAnuncioDesdePropuesta,
  listarCampaigns,
  listarAdsets,
} from "./actions";

export const metadata = { title: "Estudio de contenido · Tronador" };

export default async function PublicacionesPage() {
  const { id: projectId } = await requireProject();
  const studioModels = (await availableModels()).map((m) => m.label);
  const savedBriefs = await listBriefs(projectId);

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
        previewAdAction={previsualizarPropuestaAd}
        crearAdAction={crearAnuncioDesdePropuesta}
        listCampaignsAction={listarCampaigns}
        listAdsetsAction={listarAdsets}
        models={studioModels}
        savedBriefs={savedBriefs}
        listBriefsAction={listarBriefs}
        saveBriefAction={guardarBrief}
        deleteBriefAction={eliminarBrief}
      />
    </div>
  );
}
