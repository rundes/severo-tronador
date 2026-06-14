// Página custom de login. Reemplaza el default de NextAuth para tener
// branding + diseño mobile-first decente.
//
// Comportamiento: server action `loginGoogle` llama signIn() de NextAuth
// que ya maneja el CSRF token y el redirect de Google. La página queda
// estática hasta que el usuario aprieta el botón.
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { signIn, auth, allowedEmails } from "@/lib/auth";
import { GoogleSignInButton } from "@/components/signin/google-button";

export const metadata = {
  title: "Ingresar · Tronador",
};

async function loginGoogle(formData: FormData) {
  "use server";
  const callbackUrl = String(formData.get("callbackUrl") ?? "/dashboard");
  // Pasa por /ingresando para el overlay de marca del regreso antes del panel.
  const dest = `/ingresando?to=${encodeURIComponent(callbackUrl)}`;
  await signIn("google", { redirectTo: dest });
}

const ERRORS: Record<string, string> = {
  AccessDenied:
    "Tu cuenta no figura en la allowlist. Pedile al equipo que te sume.",
  Configuration:
    "Configuración de auth pendiente. Si pasaste por acá por error, escribinos.",
  Verification: "Tuvimos un problema validando tu sesión. Probá de nuevo.",
  OAuthAccountNotLinked:
    "El email ya existe vinculado a otra cuenta. Usá la misma de siempre.",
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | undefined>>;
}) {
  const params = (await searchParams) ?? {};
  // Si ya hay sesión, redirigir al panel para no quedarnos en /signin.
  const session = await auth();
  if (session) redirect(params.callbackUrl ?? "/dashboard");

  const errorKey = params.error;
  const errorMsg = errorKey ? ERRORS[errorKey] ?? "No pudimos completar el ingreso. Probá de nuevo." : null;

  return (
    <main
      className="flex min-h-screen items-center justify-center px-4 py-10"
      style={{ backgroundColor: "oklch(93% 0.012 80)" }}
    >
      <div className="w-full max-w-sm">
        <div className="text-center">
          <Image
            src="/brand/tronador-mark.jpeg"
            alt="Tronador"
            width={88}
            height={88}
            priority
            className="mx-auto h-auto w-20 rounded-md"
          />
          <h1 className="mt-6 text-2xl font-bold tracking-tight text-[oklch(28%_0.06_250)] sm:text-3xl">
            Ingresar
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-[oklch(45%_0.04_250)]">
            Panel del{" "}
            <strong className="font-semibold">
              Centro de Estudios Políticos y Electorales
            </strong>
            . Acceso con Google, solo para mails autorizados.
          </p>
        </div>

        {errorMsg && (
          <div
            role="alert"
            className="mt-6 rounded-lg border border-[oklch(50%_0.13_30)] bg-[oklch(95%_0.04_30)] p-3 text-sm text-[oklch(35%_0.13_30)]"
          >
            {errorMsg}
          </div>
        )}

        <form action={loginGoogle} className="mt-8 space-y-4">
          <input
            type="hidden"
            name="callbackUrl"
            value={params.callbackUrl ?? "/dashboard"}
          />
          <GoogleSignInButton />
        </form>

        <div className="mt-10 space-y-3 text-center text-xs text-[oklch(45%_0.04_250)]">
          {allowedEmails.length > 0 && (
            <p className="font-mono text-[10px] uppercase tracking-wider">
              Allowlist activa · {allowedEmails.length} mails autorizados
            </p>
          )}
          <Link
            href="/#contacto"
            className="inline-block text-[oklch(30%_0.06_250)] underline-offset-4 hover:underline"
          >
            No tengo acceso, escribir
          </Link>
        </div>

        <div className="mt-12 text-center font-mono text-[10px] uppercase tracking-[0.22em] text-[oklch(55%_0.04_250)]">
          <Link href="/" className="hover:underline">
            ← volver al sitio
          </Link>
        </div>
      </div>
    </main>
  );
}
