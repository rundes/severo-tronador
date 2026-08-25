import Link from "next/link";
import { redirect } from "next/navigation";
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
import { renderNow } from "@/lib/escucha-fuentes";
import { resolveTab } from "@/lib/escucha-tab";
import { InformePanel } from "@/components/escucha/informe-panel";
import { EscenarioTab } from "@/components/escucha/escenario-tab";
import { readDailyReports } from "@/lib/daily-report";
import { getMonitorConfig } from "@/lib/monitor-config";
import { listRecentRuns, agendaUpcoming } from "@/lib/radio-runs";
import { alAireState } from "@/lib/al-aire";
import { Monitor } from "@/components/escucha/monitor";
import type { SourceStatus } from "@/components/escucha/source-rows";
import { getClientBrief } from "@/lib/client-brief";
import { getConnectorConfig } from "@/lib/connectors/config";

// Página autenticada con fetch vivo de fuentes externas (tab monitor): el
// prerender de build pagaba todas esas llamadas (y con el enriquecimiento de
// scraping puede superar el límite de 60s del export). Siempre dinámica; el
// "tiempo real" barato lo da el cache de listening_items.
export const dynamic = "force-dynamic";

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
  // "config" quedó como alias de "escenario" para links viejos.
  if (params.tab === "config") redirect("/escucha?tab=escenario");
  const tab = resolveTab(params.tab);

  const { id: projectId } = await requireProject();
  const persistOk = dbConfigured();
  // Agenda de audio: la usa Escenario (bloque Audio y video) y Monitorear ("Al aire").
  const needsAgenda = tab === "escenario" || tab === "monitor";

  // El fetch de fuentes vivas (runListening) solo corre en el tab monitor;
  // el tab escenario lee stats del cache (baratas) en vez de pegarle a las APIs.
  const [result, cfg, lastXUpdate, marcas, descartados, summary, counts, runs] =
    await Promise.all([
      tab === "monitor" ? runListening(projectId) : Promise.resolve(null),
      getListeningConfig(projectId),
      lastListeningUpdate(projectId, "x-api"),
      persistOk ? listMarcas(projectId) : Promise.resolve([]),
      persistOk ? listDescartes(projectId) : Promise.resolve([]),
      tab === "escenario" ? readPullSummary(projectId) : Promise.resolve(null),
      tab === "escenario"
        ? countsBySource(projectId)
        : Promise.resolve<SourceCounts>({ byConnector: {}, bySource: {} }),
      needsAgenda && persistOk ? listRecentRuns(projectId) : Promise.resolve([]),
    ]);
  const upcoming = needsAgenda ? agendaUpcoming(cfg.radioStreams) : [];

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
        <Link href="/escucha?tab=escenario" className={tabLinkCls(tab === "escenario")}>
          Escenario
        </Link>
        <Link href="/escucha?tab=monitor" className={tabLinkCls(tab === "monitor")}>
          Monitorear
        </Link>
        <Link href="/escucha?tab=informe" className={tabLinkCls(tab === "informe")}>
          Informe
        </Link>
      </nav>

      {/* Tab content */}
      {tab === "escenario" ? (
        <EscenarioTab
          cfg={cfg}
          monitor={await getMonitorConfig(projectId)}
          brief={await getClientBrief(projectId)}
          canGenerate={Boolean((await getConnectorConfig("claude-api", projectId)).ANTHROPIC_API_KEY)}
          sources={sources}
          summary={summary}
          counts={counts}
          now={renderNow()}
          lastXUpdate={lastXUpdate}
          upcoming={upcoming}
          runs={runs}
          persistOk={persistOk}
          params={params}
        />
      ) : tab === "informe" ? (
        <InformePanel {...await readDailyReports(projectId)} generado={params.generado === "1"} />
      ) : result ? (
        <Monitor
          result={result}
          marcas={marcas}
          descartados={descartados}
          persistOk={persistOk}
          alAire={alAireState(upcoming, runs)}
        />
      ) : null}
    </div>
  );
}
