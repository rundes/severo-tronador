import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, authConfigured } from "@/lib/auth";
import { connectors } from "@/lib/connectors/registry";
import type { OutreachConnector } from "@/lib/connectors/types";
import { APP_NAME } from "@/lib/config";
import { VERSION_STRING } from "@/lib/version";

const NAV = [
  { href: "/padron", label: "Padrón" },
  { href: "/escucha", label: "Escucha" },
  { href: "/segmentos", label: "Segmentos" },
  { href: "/campanas", label: "Campañas" },
  { href: "/respuestas", label: "Respuestas" },
  { href: "/templates", label: "Plantillas" },
  { href: "/conectores", label: "Conectores" },
];

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Gate de auth: en prod es obligatorio (instrumentation aborta el boot si
  // falta). En dev sin OAuth configurado, el panel es accesible para iterar
  // contra el mock.
  if (authConfigured) {
    const session = await auth();
    if (!session) redirect("/api/auth/signin");
  } else if (process.env.NODE_ENV === "production") {
    // Defensa en profundidad: instrumentation debería haber abortado el boot.
    throw new Error("AUTH_NOT_CONFIGURED: dashboard requiere OAuth en prod.");
  }

  const outreach = connectors.filter(
    (c) => c.category === "outreach",
  ) as OutreachConnector[];
  const quotas = await Promise.all(
    outreach.map(async (c) => ({ icon: c.iconEmoji, q: await c.getQuota() })),
  );

  return (
    <div className="flex min-h-full flex-1">
      <aside className="flex w-56 shrink-0 flex-col border-r border-zinc-200 px-4 py-6 dark:border-zinc-800">
        <Link href="/" className="mb-8 font-mono text-sm tracking-tight">
          {APP_NAME}
        </Link>
        <nav className="flex flex-col gap-1 font-mono text-sm">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded px-2 py-1.5 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900"
            >
              ▸ {item.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto pt-6 text-xs text-zinc-400">
          <div>{authConfigured ? "auth: Google OAuth" : "auth: dev (sin login)"}</div>
          <div className="mt-1 font-mono text-[10px] text-zinc-500">{VERSION_STRING}</div>
        </div>
      </aside>
      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-zinc-200 px-8 py-4 dark:border-zinc-800">
          <span className="font-mono text-sm text-zinc-500">F5 · multicanal</span>
          <span className="font-mono text-xs text-zinc-400">
            🔋{" "}
            {quotas.map(({ icon, q }) => (
              <span key={icon} className="ml-2">
                {icon} {q.used}/{q.limit}
              </span>
            ))}
          </span>
        </header>
        <main className="flex-1 px-8 py-8">{children}</main>
      </div>
    </div>
  );
}
