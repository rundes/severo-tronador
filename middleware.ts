// Middleware de auth — defensa en profundidad sobre el gate del layout
// (dashboard). Bloquea cualquier ruta no pública si OAuth está configurado y
// no hay sesión. En prod sin OAuth devuelve 503 (instrumentation ya abortó).
import { NextResponse, type NextRequest } from "next/server";
import { auth, authConfigured } from "@/lib/auth";

const PUBLIC_PATHS = new Set<string>(["/", "/signin"]);

export default async function middleware(req: NextRequest) {
  if (PUBLIC_PATHS.has(req.nextUrl.pathname)) return NextResponse.next();
  if (!authConfigured) {
    if (process.env.NODE_ENV !== "production") return NextResponse.next();
    return new NextResponse("Auth no configurada", { status: 503 });
  }
  const session = await auth();
  if (!session) {
    const url = new URL("/api/auth/signin", req.url);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

// Matchea TODO menos rutas públicas:
//   /api/auth/*       — NextAuth signin/callback
//   /api/cron/*       — protegido por CRON_SECRET
//   /api/webhooks/*   — protegido por firma del provider
//   /api/version      — endpoint público de health/versionado
//   /encuesta/*       — landing pública para responder encuestas
//   /_next/*, favicon — assets
export const config = {
  matcher: [
    "/((?!api/auth|api/cron|api/webhooks|api/version|encuesta|_next/static|_next/image|favicon.ico).*)",
  ],
};
