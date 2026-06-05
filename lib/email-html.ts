// Render de email a HTML seguro para clientes de correo (layout en tablas +
// estilos inline, que es lo único que Gmail/Outlook respetan). Funciones
// PURAS, sin dependencias de Node: se usan tanto en el server (envío real)
// como en el cliente (preview en vivo del editor de plantillas).
//
// La sanitización del HTML crudo del usuario NO vive acá (necesita
// sanitize-html, que es server-only); ver lib/email-sanitize.ts. Este módulo
// asume que `contentHtml` ya viene confiable.

// Paleta de marca (aprox. hex de los oklch del landing): crema, navy, mostaza.
const BRAND = {
  pageBg: "#efe9da",
  cardBg: "#ffffff",
  text: "#2b2f3a",
  muted: "#6b6f7b",
  navy: "#2b3350",
  mustard: "#c8961e",
  border: "#e4ddcd",
};

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Linkea URLs http(s) bareas en un fragmento de texto, escapando el resto.
function linkifyEscaped(raw: string): string {
  const urlRe = /(https?:\/\/[^\s<]+)/g;
  let out = "";
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = urlRe.exec(raw)) !== null) {
    out += escapeHtml(raw.slice(last, m.index));
    const url = m[0];
    out +=
      `<a href="${escapeHtml(url)}" ` +
      `style="color:${BRAND.navy};text-decoration:underline;word-break:break-all;">` +
      `${escapeHtml(url)}</a>`;
    last = m.index + url.length;
  }
  out += escapeHtml(raw.slice(last));
  return out;
}

// Texto plano → HTML. Bloques separados por línea en blanco se vuelven <p>;
// saltos simples dentro de un bloque se vuelven <br>. URLs auto-linkeadas.
export function textToHtml(text: string): string {
  const blocks = text.replace(/\r\n/g, "\n").split(/\n{2,}/);
  return blocks
    .map((block) => {
      const inner = block
        .split("\n")
        .map((line) => linkifyEscaped(line))
        .join("<br>");
      return (
        `<p style="margin:0 0 16px;color:${BRAND.text};` +
        `font-size:15px;line-height:1.6;">${inner}</p>`
      );
    })
    .join("\n");
}

export interface EmailShellOpts {
  contentHtml: string;
  orgName?: string;
  preheader?: string;
  // HTML extra inyectado al final del body (ej: pixel de apertura). Confiable.
  trailingHtml?: string;
  // Pie con la nota de baja/opt-out. Si null, no se muestra.
  optOutNote?: string | null;
}

const DEFAULT_OPT_OUT =
  "Recibís este mensaje por una investigación de opinión pública. " +
  "Para no recibir más, respondé BAJA.";

// Envuelve el contenido en un layout de email responsivo y seguro.
export function wrapEmailShell(opts: EmailShellOpts): string {
  const {
    contentHtml,
    orgName,
    preheader,
    trailingHtml = "",
    optOutNote = DEFAULT_OPT_OUT,
  } = opts;

  const preheaderHtml = preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(
        preheader,
      )}</div>`
    : "";

  const header = orgName
    ? `<tr><td style="padding:20px 32px;border-bottom:3px solid ${BRAND.mustard};">
         <span style="font-size:13px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:${BRAND.navy};">${escapeHtml(
           orgName,
         )}</span>
       </td></tr>`
    : "";

  const footer = optOutNote
    ? `<tr><td style="padding:18px 32px 28px;border-top:1px solid ${BRAND.border};">
         <p style="margin:0;color:${BRAND.muted};font-size:12px;line-height:1.5;">${escapeHtml(
           optOutNote,
         )}</p>
       </td></tr>`
    : "";

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
</head>
<body style="margin:0;padding:0;background:${BRAND.pageBg};">
${preheaderHtml}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.pageBg};">
  <tr>
    <td align="center" style="padding:24px 12px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:${BRAND.cardBg};border:1px solid ${BRAND.border};border-radius:10px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
        ${header}
        <tr>
          <td style="padding:28px 32px 8px;">
            ${contentHtml}
          </td>
        </tr>
        ${footer}
      </table>
    </td>
  </tr>
</table>
${trailingHtml}
</body>
</html>`;
}

// Botón CTA reutilizable (para insertar en plantillas HTML).
export function ctaButton(label: string, href: string): string {
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 20px;">` +
    `<tr><td style="border-radius:8px;background:${BRAND.navy};">` +
    `<a href="${escapeHtml(href)}" style="display:inline-block;padding:12px 26px;` +
    `color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;` +
    `font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">` +
    `${escapeHtml(label)}</a></td></tr></table>`
  );
}
