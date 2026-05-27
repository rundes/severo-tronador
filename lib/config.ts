// Identidad del despliegue. Genérica por defecto; cada instalación la setea
// por env para que la herramienta no esté atada a ningún territorio u
// organización en particular.
export const ORG_NAME =
  process.env.ORG_NAME?.trim() || "el equipo de relevamiento";

export const TERRITORY = process.env.TERRITORY?.trim() || "tu territorio";

// Nombre corto del producto (branding del sidebar / títulos).
export const APP_NAME = process.env.APP_NAME?.trim() || "severo·tronador";
