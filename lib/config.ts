// Identidad del despliegue. Genérica por defecto; cada instalación la setea
// por env para que la herramienta no esté atada a ningún territorio u
// organización en particular.
export const ORG_NAME =
  process.env.ORG_NAME?.trim() || "el equipo de relevamiento";

export const TERRITORY = process.env.TERRITORY?.trim() || "tu territorio";

// Nombre corto del producto (branding del sidebar / títulos).
export const APP_NAME = process.env.APP_NAME?.trim() || "severo·tronador";

// Zona horaria para variables de plantilla con reloj de pared (saludo,
// fecha humana, fecha ISO). Vercel corre en UTC; sin esto el saludo y la
// fecha se desfasan respecto del territorio. Default AR (GMT-3).
export const APP_TZ =
  process.env.APP_TZ?.trim() || "America/Argentina/Buenos_Aires";
