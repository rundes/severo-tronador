// Sanitización del HTML crudo que escribe el usuario en el editor de plantillas
// (formato = "html"). Server-only: sanitize-html depende de Node. Se aplica
// SIEMPRE antes de mandar un email para que el HTML del usuario no inyecte
// scripts ni tags peligrosos en la casilla del destinatario.
import sanitizeHtml from "sanitize-html";

const ALLOWED_TAGS = [
  "p", "br", "div", "span", "strong", "b", "em", "i", "u", "s",
  "a", "ul", "ol", "li", "blockquote", "hr",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "img", "table", "thead", "tbody", "tr", "td", "th", "center", "small",
];

export function sanitizeEmailHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      "*": ["style", "align", "width", "height", "dir", "title"],
      a: ["href", "target", "rel", "style"],
      img: ["src", "alt", "width", "height", "style"],
      td: ["colspan", "rowspan", "valign", "align", "style", "width", "bgcolor"],
      th: ["colspan", "rowspan", "valign", "align", "style", "width", "bgcolor"],
      table: ["cellpadding", "cellspacing", "border", "role", "style", "width", "bgcolor"],
    },
    // Solo http(s) y mailto en hrefs; data: solo para imágenes embebidas.
    allowedSchemes: ["http", "https", "mailto"],
    allowedSchemesByTag: { img: ["http", "https", "data"] },
    transformTags: {
      a: (tagName, attribs) => ({
        tagName,
        attribs: { ...attribs, target: "_blank", rel: "noopener noreferrer" },
      }),
    },
  });
}
