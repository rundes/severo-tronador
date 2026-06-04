// Proyectos: listar los del usuario, marcar el activo, cambiar de proyecto y
// crear uno nuevo. La gestión de miembros (invitar/rol/quitar) se suma en
// Fase 5.
import { requireProject, listMyProjects } from "@/lib/workspace";
import { setActiveProject, crearProyecto } from "./actions";
import { SubmitButton, FormStatus } from "@/components/ui/submit-button";

export const metadata = { title: "Proyectos · Tronador" };

export default async function ProyectosPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | undefined>>;
}) {
  const params = (await searchParams) ?? {};
  const active = await requireProject();
  const projects = await listMyProjects();

  const errMap: Record<string, string> = {
    forbidden: "No tenés permiso para esa acción en este proyecto.",
    invalid: "Solicitud inválida.",
  };
  const errMsg = params.error ? errMap[params.error] ?? params.error : null;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          Proyectos
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Estudios aislados. El proyecto activo determina qué datos ves en todo
          el panel.
        </p>
      </header>

      <FormStatus error={errMsg} />

      <section className="space-y-2">
        <h2 className="text-xs font-medium uppercase tracking-wider text-zinc-400">
          Tus proyectos
        </h2>
        <ul className="divide-y divide-zinc-200 rounded border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {projects.map((p) => {
            const isActive = p.id === active.id;
            return (
              <li
                key={p.id}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    {p.nombre}
                    {isActive && (
                      <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                        Activo
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-zinc-500">Rol: {p.role}</p>
                </div>
                {!isActive && (
                  <form action={setActiveProject}>
                    <input type="hidden" name="project_id" value={p.id} />
                    <SubmitButton variant="secondary" pendingLabel="Cambiando…">
                      Cambiar a este
                    </SubmitButton>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-xs font-medium uppercase tracking-wider text-zinc-400">
          Nuevo proyecto
        </h2>
        <form action={crearProyecto} className="flex flex-wrap items-center gap-2">
          <input
            name="nombre"
            required
            minLength={2}
            maxLength={120}
            placeholder="Nombre del proyecto"
            className="min-w-[16rem] flex-1 rounded border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900"
          />
          <SubmitButton pendingLabel="Creando…">Crear</SubmitButton>
        </form>
      </section>
    </div>
  );
}
