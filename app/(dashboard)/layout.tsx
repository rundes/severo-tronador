import { redirect } from "next/navigation";
import { auth, authConfigured } from "@/lib/auth";
import { VERSION_STRING } from "@/lib/version";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Chrome } from "@/components/dashboard/chrome";
import type { NavGroup } from "@/lib/nav";
import { getActiveProject, listMyProjects } from "@/lib/workspace";
import { setActiveProject } from "./proyectos/actions";
import { cerrarSesion } from "./sign-out-action";

// Nav agrupada por etapa del trabajo: el operador encuentra más rápido cuando
// la estructura agrupa por intención, no por lista plana de 15 ítems.
const NAV: NavGroup[] = [
  {
    section: "Operación",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: "LayoutDashboard" },
      { href: "/contactos", label: "Contactos", icon: "Users" },
      { href: "/segmentos", label: "Segmentos", icon: "PieChart" },
      { href: "/campanas", label: "Campañas", icon: "Megaphone" },
      { href: "/campanas/flows", label: "Flows", icon: "Workflow" },
    ],
  },
  {
    section: "Investigación",
    items: [
      { href: "/escucha", label: "Escucha", icon: "Ear" },
      { href: "/competencia", label: "Competencia", icon: "Search" },
      { href: "/encuestas", label: "Encuestas", icon: "ClipboardList" },
      { href: "/respuestas", label: "Respuestas", icon: "MessageSquare" },
    ],
  },
  {
    section: "Contenido",
    items: [
      { href: "/publicaciones", label: "Estudio", icon: "PenTool" },
      { href: "/templates", label: "Plantillas", icon: "LayoutTemplate" },
      { href: "/difusion", label: "Difusión", icon: "Send" },
    ],
  },
  {
    section: "Sistema",
    items: [
      { href: "/mail", label: "Mail", icon: "Mail" },
      { href: "/conectores", label: "Conectores", icon: "Plug" },
      { href: "/proyectos", label: "Proyecto", icon: "FolderKanban" },
      { href: "/auditoria", label: "Auditoría", icon: "ScrollText" },
    ],
  },
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

  // Proyecto activo + lista para el switcher. Sin proyecto (usuario nuevo sin
  // membresía) → onboarding. En dev sin auth, getActiveProject devuelve el
  // proyecto default sintético (no manda a onboarding).
  const active = await getActiveProject();
  if (authConfigured && !active) redirect("/onboarding");
  const myProjects = await listMyProjects();
  const projectOptions = myProjects.map((p) => ({
    id: p.id,
    nombre: p.nombre,
    role: p.role,
  }));

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Chrome
        sidebar={
          <Sidebar
            nav={NAV}
            user={user}
            versionString={VERSION_STRING}
            signOutAction={cerrarSesion}
            projects={projectOptions}
            activeProjectId={active?.id ?? null}
            switchProjectAction={setActiveProject}
          />
        }
      >
        {children}
      </Chrome>
    </div>
  );
}
