// Middleware de auth — defensa en profundidad sobre el gate del layout
// (dashboard). Bloquea cualquier ruta no pública si OAuth está configurado y
// no hay sesión. En prod sin OAuth devuelve 503 (instrumentation ya abortó).
import { NextResponse } from "next/server";
import { auth, authConfigured } from "@/lib/auth";

export default async function middleware(req: Request) {
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
//   /encuesta/*       — landing pública para responder encuestas
//   /_next/*, favicon — assets
export const config = {
  matcher: [
    "/((?!api/auth|api/cron|api/webhooks|encuesta|_next/static|_next/image|favicon.ico).*)",
  ],
};
