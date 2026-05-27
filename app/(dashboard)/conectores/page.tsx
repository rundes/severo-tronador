import { ConnectorCard } from "@/components/connectors/connector-card";
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  connectors,
} from "@/lib/connectors/registry";
import type { Connector } from "@/lib/connectors/types";

export const metadata = { title: "Conectores · Severo Tronador" };

// Resuelve estado + cuota + nota de test de cada conector (server-side).
async function resolve(connector: Connector) {
  const [status, quota, test] = await Promise.all([
    connector.getStatus(),
    connector.getQuota ? connector.getQuota() : Promise.resolve(null),
    connector.test(),
  ]);
  return { connector, status, quota, note: test.message };
}

export default async function ConectoresPage() {
  const resolved = await Promise.all(connectors.map(resolve));
  const byCategory = CATEGORY_ORDER.map((cat) => ({
    cat,
    items: resolved.filter((r) => r.connector.category === cat),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
        Conectores
      </h1>
      <p className="mt-1 text-sm text-zinc-500">
        El abanico de servicios como plugins activables. En F1 viven los
        conectores de datos y autenticación.
      </p>

      <div className="mt-8 space-y-8">
        {byCategory.map(({ cat, items }) => (
          <section key={cat}>
            <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-zinc-400">
              {CATEGORY_LABELS[cat]}
            </h2>
            <div className="space-y-2">
              {items.map(({ connector, status, quota, note }) => (
                <ConnectorCard
                  key={connector.id}
                  connector={connector}
                  status={status}
                  quota={quota}
                  note={note}
                />
              ))}
            </div>
          </section>
        ))}

        <button
          type="button"
          disabled
          className="w-full cursor-not-allowed rounded-lg border border-dashed border-zinc-300 px-4 py-3 text-sm text-zinc-400 dark:border-zinc-700"
          title="Disponible al sumar más conectores (F3+)"
        >
          + Agregar conector
        </button>
      </div>
    </div>
  );
}
