import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, authConfigured } from "@/lib/auth";
import { resendConnector } from "@/lib/connectors/resend";

const NAV = [
  { href: "/segmentos", label: "Segmentos" },
  { href: "/campanas", label: "Campañas" },
  { href: "/templates", label: "Plantillas" },
  { href: "/conectores", label: "Conectores" },
  // F4+: Respuestas
];

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Gate de auth: solo se aplica si OAuth está configurado. En dev local sin
  // credenciales, el panel es accesible para poder iterar contra el mock.
  if (authConfigured) {
    const session = await auth();
    if (!session) redirect("/api/auth/signin");
  }

  const emailQuota = await resendConnector.getQuota();

  return (
    <div className="flex min-h-full flex-1">
      <aside className="flex w-56 shrink-0 flex-col border-r border-zinc-200 px-4 py-6 dark:border-zinc-800">
        <Link href="/" className="mb-8 font-mono text-sm tracking-tight">
          severo·tronador
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
          {authConfigured ? "auth: Google OAuth" : "auth: dev (sin login)"}
        </div>
      </aside>
      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-zinc-200 px-8 py-4 dark:border-zinc-800">
          <span className="font-mono text-sm text-zinc-500">F3 · campañas</span>
          <span className="font-mono text-xs text-zinc-400">
            🔋 📧 {emailQuota.used}/{emailQuota.limit} mes
          </span>
        </header>
        <main className="flex-1 px-8 py-8">{children}</main>
      </div>
    </div>
  );
}
