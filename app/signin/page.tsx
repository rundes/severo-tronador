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

export const metadata = {
  title: "Ingresar · Tronador",
};

async function loginGoogle(formData: FormData) {
  "use server";
  const callbackUrl = String(formData.get("callbackUrl") ?? "/dashboard");
  await signIn("google", { redirectTo: callbackUrl });
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
          <button
            type="submit"
            className="flex w-full items-center justify-center gap-3 rounded-full bg-[oklch(28%_0.06_250)] px-6 py-3.5 text-sm font-medium text-[oklch(96%_0.01_80)] shadow-sm hover:bg-[oklch(20%_0.06_250)] active:scale-[0.99]"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
              <path d="M21.35 11.1H12v2.9h5.35c-.23 1.4-1.66 4.1-5.35 4.1-3.22 0-5.85-2.66-5.85-5.95S8.78 6.2 12 6.2c1.84 0 3.07.78 3.77 1.45l2.57-2.48C16.71 3.6 14.55 2.7 12 2.7 6.92 2.7 2.8 6.8 2.8 12s4.12 9.3 9.2 9.3c5.32 0 8.83-3.74 8.83-9 0-.6-.07-1.05-.15-1.5z" />
            </svg>
            Continuar con Google
          </button>
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
