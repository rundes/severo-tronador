import type { NextConfig } from "next";

// Headers de seguridad aplicados a todas las rutas.
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "geolocation=(), microphone=(), camera=()" },
];

// CSP en REPORT-ONLY.
//
// Faltaba por completo, y con `dangerouslySetInnerHTML` en el render de mails
// es la segunda capa que corresponde tener. Va en report-only a propósito: el
// panel usa estilos y atributos inline de Next, así que una CSP estricta de
// entrada rompe el render. Report-only no bloquea nada — sólo reporta a
// /api/csp-report qué violaría, que es lo que hace falta para calibrarla antes
// de aplicarla de verdad.
//
// `unsafe-inline` en script-src está a propósito en esta primera vuelta: Next
// inyecta scripts inline para la hidratación y sin nonce por request serían
// todos violación, ahogando los reportes que sí importan. Pasar a nonces es el
// siguiente paso, junto con mover el header a Content-Security-Policy.
const cspReportOnly = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "report-uri /api/csp-report",
].join("; ");

const nextConfig: NextConfig = {
  // Fija la raíz del workspace a este proyecto (hay otro lockfile en el home
  // del usuario que Next, si no, infiere como raíz).
  turbopack: {
    root: __dirname,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          ...securityHeaders,
          { key: "Content-Security-Policy-Report-Only", value: cspReportOnly },
        ],
      },
    ];
  },
};

export default nextConfig;
