import Link from "next/link";
import { runListening } from "@/lib/listening";
import { TERRITORY } from "@/lib/config";
import { getListeningConfig } from "@/lib/listening-config";
import { lastListeningUpdate } from "@/lib/listening-cache";
import { dbConfigured } from "@/lib/db/supabase";
import { requireProject } from "@/lib/workspace";
import { listMarcas } from "@/lib/escucha-marcas";
import { PageHeader } from "@/components/ui/page-header";
import { ConfigForm } from "@/components/escucha/config-form";
import { Monitor } from "@/components/escucha/monitor";
import type { SourceStatus } from "@/components/escucha/config-form";

// Revalida cada 60s para el "tiempo real" sin sobrecargar las APIs externas.
export const revalidate = 60;

export const metadata = { title: "Escucha · Tronador" };

function sourceStatuses(rssCount = 0): SourceStatus[] {
  const xToken = Boolean(process.env.X_API_BEARER_TOKEN);
  const reddit = Boolean(
    process.env.REDDIT_CLIENT_ID && process.env.REDDIT_CLIENT_SECRET,
  );
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
      reason: xToken ? "API paga" : "sindicación (gratis, timelines de handles)",
    },
    {
      id: "reddit-api",
      label: "Reddit",
      real: reddit,
      reason: reddit ? "creds presentes" : "OAuth pendiente",
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

  const [result, cfg, lastXUpdate, marcas] = await Promise.all([
    runListening(projectId),
    getListeningConfig(projectId),
    lastListeningUpdate(projectId, "x-api"),
    persistOk ? listMarcas(projectId) : Promise.resolve([]),
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
      {tab === "monitor" ? (
        <Monitor result={result} marcas={marcas} persistOk={persistOk} />
      ) : (
        <ConfigForm
          cfg={cfg}
          sources={sources}
          persistOk={persistOk}
          bySource={result.bySource}
          params={params}
          lastXUpdate={lastXUpdate}
        />
      )}
    </div>
  );
}
