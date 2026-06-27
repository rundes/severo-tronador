import { ConnectorCard } from "@/components/connectors/connector-card";
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  connectors,
} from "@/lib/connectors/registry";
import type { Connector } from "@/lib/connectors/types";
import { configFieldStatus, getConnectorConfig, isEnabled } from "@/lib/connectors/config";
import { curatedModels } from "@/lib/ai/nvidia-models";
import { setupLink } from "@/lib/connectors/setup-links";
import {
  guardarConfig,
  probarConexion,
  toggleConector,
  borrarConfig,
} from "./actions";
import { PageHeader } from "@/components/ui/page-header";
import { getConnectorHealth } from "@/lib/connectors/health";

export const metadata = { title: "Conectores · Severo Tronador" };

// Resuelve estado + cuota + salud real + config de cada conector (server-side).
async function resolve(connector: Connector) {
  const [status, quota, health, fields, enabled] = await Promise.all([
    connector.getStatus(),
    connector.getQuota ? connector.getQuota() : Promise.resolve(null),
    getConnectorHealth(connector.id),
    configFieldStatus(connector.id),
    isEnabled(connector.id),
  ]);
  // NVIDIA: poblar el selector de modelos (rápido/profundo) desde /v1/models.
  if (connector.id === "nvidia") {
    const cfg = await getConnectorConfig("nvidia");
    if (cfg.NVIDIA_API_KEY) {
      try {
        const models = await curatedModels(cfg.NVIDIA_API_KEY);
        const opts = models.map((m) => ({ value: m.id, label: `${m.label} (${m.capability})` }));
        for (const f of fields) {
          if (f.key === "NVIDIA_MODEL_FAST" || f.key === "NVIDIA_MODEL_DEEP") f.options = opts;
        }
      } catch {
        // sin red / key inválida → el modal cae a input de texto
      }
    }
  }
  return { connector, status, quota, health, fields, enabled };
}

export default async function ConectoresPage() {
  const resolved = await Promise.all(connectors.map(resolve));
  const byCategory = CATEGORY_ORDER.map((cat) => ({
    cat,
    items: resolved.filter((r) => r.connector.category === cat),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        eyebrow="Sistema"
        title="Conectores"
        subtitle="El abanico de servicios como plugins activables: datos, canales, publicación, escucha y análisis."
      />

      <div className="mt-8 space-y-8">
        {byCategory.map(({ cat, items }) => (
          <section key={cat}>
            <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-zinc-400">
              {CATEGORY_LABELS[cat]}
            </h2>
            <div className="space-y-2">
              {items.map(({ connector, status, quota, health, fields, enabled }) => (
                <ConnectorCard
                  key={connector.id}
                  connector={connector}
                  status={status}
                  quota={quota}
                  health={health}
                  fields={fields}
                  enabled={enabled}
                  setupUrl={setupLink(connector.id)}
                  guardar={guardarConfig.bind(null, connector.id)}
                  probar={probarConexion.bind(null, connector.id)}
                  toggle={toggleConector.bind(null, connector.id)}
                  borrar={borrarConfig.bind(null, connector.id)}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
