// Sanitiza el HTML de un mail antes de renderizarlo (dangerouslySetInnerHTML).
// El cuerpo de un mail —entrante (Cloudflare), Stalwart o mock— es contenido
// no confiable: sin esto sería XSS almacenado. Quita <script>, handlers on*,
// esquemas peligrosos (javascript:) y deja solo formato + imágenes seguras.
import sanitizeHtml from "sanitize-html";

export function sanitizeEmailHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat([
      "img",
      "h1",
      "h2",
      "span",
      "figure",
      "figcaption",
      "u",
    ]),
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      img: ["src", "alt", "title", "width", "height"],
      a: ["href", "name", "target", "rel"],
      "*": ["style"],
    },
    // href/links: solo esquemas seguros. img: además data: (imágenes inline).
    allowedSchemes: ["http", "https", "mailto"],
    allowedSchemesByTag: { img: ["http", "https", "data"] },
    allowProtocolRelative: false,
    // data: en img solo para imágenes (no text/html ni svg con script).
    allowedSchemesAppliedToAttributes: ["href", "src"],
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", {
        rel: "noopener noreferrer nofollow",
        target: "_blank",
      }),
    },
    allowedStyles: {
      "*": {
        color: [/^[#a-z0-9 ().,%-]+$/i],
        "background-color": [/^[#a-z0-9 ().,%-]+$/i],
        "text-align": [/^(left|right|center|justify)$/],
        "font-weight": [/^(bold|normal|\d{3})$/],
        "font-style": [/^(italic|normal)$/],
        width: [/^\d+(px|%)?$/],
        "max-width": [/^\d+(px|%)?$/],
      },
    },
  });
}
