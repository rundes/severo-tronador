import { redirect } from "next/navigation";
import { auth, authConfigured } from "@/lib/auth";
import { connectors } from "@/lib/connectors/registry";
import type { OutreachConnector } from "@/lib/connectors/types";
import { VERSION_STRING } from "@/lib/version";
import { Sidebar } from "@/components/dashboard/sidebar";

const NAV = [
  { href: "/padron", label: "Padrón" },
  { href: "/escucha", label: "Escucha" },
  { href: "/segmentos", label: "Segmentos" },
  { href: "/campanas", label: "Campañas" },
  { href: "/campanas/flows", label: "Flows" },
  { href: "/respuestas", label: "Respuestas" },
  { href: "/templates", label: "Plantillas" },
  { href: "/conectores", label: "Conectores" },
  { href: "/auditoria", label: "Auditoría" },
];

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (authConfigured) {
    const session = await auth();
    if (!session) redirect("/signin");
  }

  const outreach = connectors.filter(
    (c) => c.category === "outreach",
  ) as OutreachConnector[];
  const quotas = await Promise.all(
    outreach.map(async (c) => {
      const q = await c.getQuota();
      return { icon: c.iconEmoji, used: q.used, limit: q.limit };
    }),
  );

  const authLabel = authConfigured
    ? "auth: Google OAuth"
    : "auth: dev (sin login)";

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Sidebar
        nav={NAV}
        quotas={quotas}
        authLabel={authLabel}
        versionString={VERSION_STRING}
      />
      <main className="flex-1 px-5 py-6 sm:px-8 sm:py-8">{children}</main>
    </div>
  );
}
