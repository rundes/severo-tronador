// Onboarding: crear el primer proyecto. Top-level (fuera del grupo dashboard)
// para no entrar en loop con el redirect del layout (Fase 5). Gated por auth
// vía middleware.
import { redirect } from "next/navigation";
import { getActiveProject } from "@/lib/workspace";
import { crearProyecto } from "@/app/(dashboard)/proyectos/actions";
import { SubmitButton, FormStatus } from "@/components/ui/submit-button";

export const metadata = { title: "Crear proyecto · Tronador" };

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | undefined>>;
}) {
  const params = (await searchParams) ?? {};
  // Si ya tiene proyecto, no hay nada que onboardear.
  if (await getActiveProject()) redirect("/dashboard");

  const errMap: Record<string, string> = {
    nombre: "El nombre debe tener al menos 2 caracteres.",
    auth: "Sesión no válida. Volvé a entrar.",
  };
  const errMsg = params.error ? errMap[params.error] ?? params.error : null;

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
        Creá tu primer proyecto
      </h1>
      <p className="mt-2 text-sm text-zinc-500">
        Un proyecto es un estudio aislado: su propio padrón, escucha, segmentos
        y campañas. Después podés invitar a tu equipo.
      </p>
      <form action={crearProyecto} className="mt-6 space-y-3">
        <FormStatus error={errMsg} />
        <input
          name="nombre"
          required
          minLength={2}
          maxLength={120}
          placeholder="Nombre del proyecto (ej. Relevamiento Maipú 2026)"
          className="w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900"
        />
        <SubmitButton pendingLabel="Creando…">Crear proyecto</SubmitButton>
      </form>
    </main>
  );
}
