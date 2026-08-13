import Link from "next/link";
import { runListening } from "@/lib/listening";
import { TERRITORY } from "@/lib/config";
import { getListeningConfig } from "@/lib/listening-config";
import {
  lastListeningUpdate,
  readPullSummary,
  countsBySource,
  type SourceCounts,
} from "@/lib/listening-cache";
import { dbConfigured } from "@/lib/db/supabase";
import { requireProject } from "@/lib/workspace";
import { listMarcas } from "@/lib/escucha-marcas";
import { listDescartes } from "@/lib/escucha-descartes";
import { PageHeader } from "@/components/ui/page-header";
import { ConfigForm } from "@/components/escucha/config-form";
import { RadioAgenda } from "@/components/escucha/radio-agenda";
import { listRecentRuns, agendaUpcoming } from "@/lib/radio-runs";
import { Monitor } from "@/components/escucha/monitor";
import type { SourceStatus } from "@/components/escucha/config-form";

// Revalida cada 60s para el "tiempo real" sin sobrecargar las APIs externas.
export const revalidate = 60;

export const metadata = { title: "Escucha · Tronador" };

function sourceStatuses(rssCount = 0): SourceStatus[] {
  const xToken = Boolean(process.env.X_API_BEARER_TOKEN);
  const metaCl = Boolean(process.env.META_CL_TOKEN);
  return [
    { id: "gdelt", label: "GDELT", real: true, reason: "sin auth" },
    {
      id: "rss-medios",
      label: "RSS medios",
      real: rssCount > 0,
      reason: rssCount > 0 ? `${rssCount} feed(s)` : "agregá feeds abajo",
    },
    {
      id: "x-api",
      label: "X",
      real: true,
      reason: xToken ? "API oficial (free tier)" : "sin token",
    },
    {
      id: "meta-content-library",
      label: "Meta CL (FB + IG)",
      real: metaCl,
      reason: metaCl ? "token research presente" : "aprobación pendiente",
      countIds: ["meta-fb", "meta-ig"],
    },
  ];
}

export default async function EscuchaPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | undefined>>;
}) {
  const params = (await searchParams) ?? {};
  const tab = params.tab === "config" ? "config" : "monitor";

  const { id: projectId } = await requireProject();
  const persistOk = dbConfigured();

  // El fetch de fuentes vivas (runListening) solo corre en el tab monitor;
  // el tab config lee stats del cache (baratas) en vez de pegarle a las APIs.
  const [result, cfg, lastXUpdate, marcas, descartados, summary, counts] =
    await Promise.all([
      tab === "monitor" ? runListening(projectId) : Promise.resolve(null),
      getListeningConfig(projectId),
      lastListeningUpdate(projectId, "x-api"),
      persistOk ? listMarcas(projectId) : Promise.resolve([]),
      persistOk ? listDescartes(projectId) : Promise.resolve([]),
      tab === "config" ? readPullSummary(projectId) : Promise.resolve(null),
      tab === "config"
        ? countsBySource(projectId)
        : Promise.resolve<SourceCounts>({ byConnector: {}, bySource: {} }),
    ]);

  const sources = sourceStatuses(cfg.rssFeeds.length);

  const tabLinkCls = (active: boolean) =>
    `px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
      active
        ? "border-[oklch(52%_0.13_255)] text-[oklch(52%_0.13_255)]"
        : "border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
    }`;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        eyebrow="Investigación"
        title="Escucha"
        subtitle={
          <>
            Qué se dice de {TERRITORY} en prensa y redes. Descubrí temas{" "}
            <em>antes</em> de diseñar una encuesta.
          </>
        }
      />

      {/* Tab nav */}
      <nav
        aria-label="Secciones de escucha"
        className="flex gap-1 border-b border-zinc-200 dark:border-zinc-800"
      >
        <Link href="/escucha?tab=monitor" className={tabLinkCls(tab === "monitor")}>
          Monitorear
        </Link>
        <Link href="/escucha?tab=config" className={tabLinkCls(tab === "config")}>
          Configurar
        </Link>
      </nav>

      {/* Tab content */}
      {tab === "monitor" && result ? (
        <Monitor result={result} marcas={marcas} descartados={descartados} persistOk={persistOk} />
      ) : (
        <div className="space-y-6">
          <ConfigForm
            cfg={cfg}
            sources={sources}
            persistOk={persistOk}
            params={params}
            lastXUpdate={lastXUpdate}
            summary={summary}
            counts={counts}
          />
          <RadioAgenda
            upcoming={agendaUpcoming(cfg.radioStreams)}
            runs={persistOk ? await listRecentRuns(projectId) : []}
          />
        </div>
      )}
    </div>
  );
}
