import Link from "next/link";
import { runListening } from "@/lib/listening";
import { TERRITORY } from "@/lib/config";
import { getListeningConfig } from "@/lib/listening-config";
import {
  lastListeningUpdate,
  readPullSummary,
  countsBySource,
  readCachedItems,
  type SourceCounts,
} from "@/lib/listening-cache";
import { resumirMenciones } from "@/lib/escucha-resumen";
import { SintesisCorrida } from "@/components/escucha/sintesis-corrida";
import { MetricasResumen } from "@/components/escucha/metricas-resumen";
import { reportTitle } from "@/lib/report-markdown";
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
import { readExtensionRun } from "@/lib/extension-run";
import { readClaudeLink } from "@/lib/claude-link";

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

  const { id: projectId } = await requireProject();
  // Los alias de tabs viejas ("config", "escenario", "monitor") los resuelve
  // resolveTab; los redirects de actions siguen funcionando sin reescribirse.
  const tab = resolveTab(params.tab);
  const persistOk = dbConfigured();
  // Agenda de audio: la usan Entorno (bloque Audio y video) y Monitoreo ("Al aire").
  const needsAgenda = tab === "entorno" || tab === "monitoreo";

  // El fetch de fuentes vivas (runListening) solo corre en el tab Monitoreo;
  // Entorno lee stats del cache (baratas) en vez de pegarle a las APIs, y las
  // tarjetas de síntesis/métricas de Informe y Monitoreo salen del cache de 7
  // días con una sola lectura.
  const [result, cfg, lastXUpdate, marcas, descartados, summary, counts, runs, extensionRun, cachedWeek] =
    await Promise.all([
      tab === "monitoreo" ? runListening(projectId) : Promise.resolve(null),
      getListeningConfig(projectId),
      lastListeningUpdate(projectId, "x-api"),
      persistOk ? listMarcas(projectId) : Promise.resolve([]),
      persistOk ? listDescartes(projectId) : Promise.resolve([]),
      tab === "entorno" ? readPullSummary(projectId) : Promise.resolve(null),
      tab === "entorno"
        ? countsBySource(projectId)
        : Promise.resolve<SourceCounts>({ byConnector: {}, bySource: {} }),
      needsAgenda && persistOk ? listRecentRuns(projectId) : Promise.resolve([]),
      tab !== "monitoreo" ? readExtensionRun(projectId) : Promise.resolve(null),
      tab !== "entorno" ? readCachedItems(projectId, 7) : Promise.resolve([]),
    ]);
  const upcoming = needsAgenda ? agendaUpcoming(cfg.radioStreams) : [];
  const resumen24 = resumirMenciones(cachedWeek, 24);
  const resumen7 = resumirMenciones(cachedWeek, 24 * 7);

  const reports = tab === "informe" ? await readDailyReports(projectId) : null;
  const ultimoInforme = reports?.latest
    ? {
        at: reports.latest.at,
        titulo: reports.latest.titulo ?? reportTitle(reports.latest.markdown) ?? "(sin título)",
      }
    : null;

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
        <Link href="/escucha?tab=informe" className={tabLinkCls(tab === "informe")}>
          Informe
        </Link>
        <Link href="/escucha?tab=monitoreo" className={tabLinkCls(tab === "monitoreo")}>
          Monitoreo
        </Link>
        <Link href="/escucha?tab=entorno" className={tabLinkCls(tab === "entorno")}>
          Entorno
        </Link>
      </nav>

      {/* Tab content */}
      {tab === "entorno" ? (
        <EscenarioTab
          cfg={cfg}
          monitor={await getMonitorConfig(projectId)}
          brief={await getClientBrief(projectId)}
          canGenerate={Boolean((await getConnectorConfig("claude-api", projectId)).ANTHROPIC_API_KEY)}
          sources={sources}
          summary={summary}
          counts={counts}
          now={renderNow()}
          extensionRun={extensionRun}
          lastXUpdate={lastXUpdate}
          upcoming={upcoming}
          runs={runs}
          persistOk={persistOk}
          params={params}
        />
      ) : tab === "informe" && reports ? (
        <>
          <SintesisCorrida run={extensionRun} resumen24={resumen24} ultimoInforme={ultimoInforme} />
          <InformePanel
            {...reports}
            generado={params.generado === "1"}
            claude={await readClaudeLink(projectId)}
            params={params}
          />
        </>
      ) : result ? (
        <>
          <MetricasResumen resumen24={resumen24} resumen7={resumen7} keywords={cfg.keywords} />
          <Monitor
            result={result}
            marcas={marcas}
            descartados={descartados}
            persistOk={persistOk}
            alAire={alAireState(upcoming, runs)}
          />
        </>
      ) : null}
    </div>
  );
}
