import type { NextConfig } from "next";

// Headers de seguridad aplicados a todas las rutas. No incluimos una CSP
// estricta acá a propósito: el panel usa estilos/atributos inline de Next y una
// CSP mal calibrada rompería el render. Queda como follow-up agregar una CSP
// (idealmente report-only primero). Estos headers son seguros y sin riesgo de
// romper la app.
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "geolocation=(), microphone=(), camera=()" },
];

const nextConfig: NextConfig = {
  // Fija la raíz del workspace a este proyecto (hay otro lockfile en el home
  // del usuario que Next, si no, infiere como raíz).
  turbopack: {
    root: __dirname,
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
