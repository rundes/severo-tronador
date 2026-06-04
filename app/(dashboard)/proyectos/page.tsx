// Proyectos: listar los del usuario, marcar el activo, cambiar de proyecto y
// crear uno nuevo. La gestión de miembros (invitar/rol/quitar) se suma en
// Fase 5.
import { requireProject, listMyProjects } from "@/lib/workspace";
import { listMembers, roleAllows } from "@/lib/projects";
import {
  setActiveProject,
  crearProyecto,
  invitarMiembro,
  cambiarRol,
  quitarMiembro,
  renombrarProyecto,
} from "./actions";
import { SubmitButton, FormStatus } from "@/components/ui/submit-button";

const inputCls =
  "rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900";
const ROLES = ["viewer", "editor", "owner"] as const;

export const metadata = { title: "Proyectos · Tronador" };

export default async function ProyectosPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | undefined>>;
}) {
  const params = (await searchParams) ?? {};
  const active = await requireProject();
  const projects = await listMyProjects();
  const members = await listMembers(active.id);
  const isOwner = roleAllows(active.role, "owner");

  const errMap: Record<string, string> = {
    forbidden: "No tenés permiso para esa acción en este proyecto.",
    invalid: "Solicitud inválida.",
    email: "Email inválido.",
    nombre: "El nombre debe tener al menos 2 caracteres.",
  };
  const okMap: Record<string, string> = {
    invite: "Miembro agregado.",
    rol: "Rol actualizado.",
    quitar: "Miembro quitado.",
    rename: "Proyecto renombrado.",
  };
  const errMsg = params.error ? errMap[params.error] ?? params.error : null;
  const okMsg = params.ok ? okMap[params.ok] ?? null : null;

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

      <FormStatus ok={okMsg} error={errMsg} />

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

      {/* ── Miembros del proyecto activo ─────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-xs font-medium uppercase tracking-wider text-zinc-400">
          Miembros de “{active.nombre}”
        </h2>
        <ul className="divide-y divide-zinc-200 rounded border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {members.map((m) => (
            <li
              key={m.email}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
            >
              <span className="min-w-0 truncate text-sm text-zinc-800 dark:text-zinc-100">
                {m.email}
              </span>
              {isOwner ? (
                <div className="flex items-center gap-2">
                  <form action={cambiarRol} className="flex items-center gap-1">
                    <input type="hidden" name="email" value={m.email} />
                    <select
                      name="role"
                      defaultValue={m.role}
                      className={inputCls}
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                    <SubmitButton variant="secondary" pendingLabel="…">
                      Guardar
                    </SubmitButton>
                  </form>
                  <form action={quitarMiembro}>
                    <input type="hidden" name="email" value={m.email} />
                    <SubmitButton variant="danger" pendingLabel="…">
                      Quitar
                    </SubmitButton>
                  </form>
                </div>
              ) : (
                <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-400">
                  {m.role}
                </span>
              )}
            </li>
          ))}
        </ul>

        {isOwner && (
          <form action={invitarMiembro} className="flex flex-wrap items-center gap-2">
            <input
              name="email"
              type="email"
              required
              placeholder="email@dominio.com"
              className={`min-w-[14rem] flex-1 ${inputCls}`}
            />
            <select name="role" defaultValue="viewer" className={inputCls}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <SubmitButton pendingLabel="Invitando…">Invitar</SubmitButton>
          </form>
        )}
      </section>

      {isOwner && (
        <section className="space-y-2">
          <h2 className="text-xs font-medium uppercase tracking-wider text-zinc-400">
            Renombrar proyecto activo
          </h2>
          <form action={renombrarProyecto} className="flex flex-wrap items-center gap-2">
            <input
              name="nombre"
              required
              minLength={2}
              maxLength={120}
              defaultValue={active.nombre}
              className={`min-w-[16rem] flex-1 ${inputCls}`}
            />
            <SubmitButton variant="secondary" pendingLabel="…">
              Renombrar
            </SubmitButton>
          </form>
        </section>
      )}
    </div>
  );
}
