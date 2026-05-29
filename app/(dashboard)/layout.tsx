import { redirect } from "next/navigation";
import { auth, authConfigured } from "@/lib/auth";
import { VERSION_STRING } from "@/lib/version";
import { Sidebar } from "@/components/dashboard/sidebar";
import { cerrarSesion } from "./sign-out-action";

const NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/contactos", label: "Contactos" },
  { href: "/escucha", label: "Escucha" },
  { href: "/segmentos", label: "Segmentos" },
  { href: "/campanas", label: "Campañas" },
  { href: "/campanas/flows", label: "Flows" },
  { href: "/respuestas", label: "Respuestas" },
  { href: "/mail", label: "Mail" },
  { href: "/templates", label: "Plantillas" },
  { href: "/conectores", label: "Conectores" },
  { href: "/auditoria", label: "Auditoría" },
];

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let user: {
    name: string | null;
    email: string | null;
    image: string | null;
  } | null = null;

  if (authConfigured) {
    const session = await auth();
    if (!session) redirect("/signin");
    user = {
      name: session.user?.name ?? null,
      email: session.user?.email ?? null,
      image: session.user?.image ?? null,
    };
  }

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Sidebar
        nav={NAV}
        user={user}
        versionString={VERSION_STRING}
        signOutAction={cerrarSesion}
      />
      <main className="flex-1 px-5 py-6 sm:px-8 sm:py-8">{children}</main>
    </div>
  );
}
