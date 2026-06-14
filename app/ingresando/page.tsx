// Pantalla intermedia del login: cae acá tras el OAuth de Google (lo fija el
// `redirectTo` del server action en /signin) y empalma con el overlay de marca
// antes de mostrar el panel. Confirma sesión en el server y limita el destino
// a paths internos para evitar open-redirect.
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { ReturnTransition } from "@/components/signin/return-transition";

export const metadata = {
  title: "Ingresando · Tronador",
};

function safeDest(to: string | undefined): string {
  // Solo paths internos: "/algo" sí, "//externo" o "http…" no.
  if (to && to.startsWith("/") && !to.startsWith("//")) return to;
  return "/dashboard";
}

export default async function IngresandoPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | undefined>>;
}) {
  const params = (await searchParams) ?? {};
  const dest = safeDest(params.to);

  const session = await auth();
  if (!session) {
    redirect(`/signin?callbackUrl=${encodeURIComponent(dest)}`);
  }

  return <ReturnTransition to={dest} />;
}
