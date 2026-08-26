// HTML del mail del informe diario: tabla contenedora, CSS inline (Gmail/
// Outlook), paleta de DESIGN.md, sin imágenes remotas ni scripts. El PDF
// adjunto lleva el informe completo; acá va el mismo contenido legible.
import type { DailyReport } from "@/lib/daily-report";
import { parseReportMarkdown, renderableSections, inlineToHtml, escapeHtml, reportTitle, type Block } from "@/lib/report-markdown";

const C = {
  ink: "#18181b", soft: "#3f3f46", muted: "#71717a", border: "#e4e4e7",
  subtle: "#fafafa", accent: "#4f5bd5", accentSoft: "#eef0fb", danger: "#dc2626",
};
const FONT = "Geist,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

function fechaLarga(iso: string): string {
  return new Date(iso).toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}
function fechaCorta(iso: string): string {
  return new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function blockHtml(b: Block): string {
  switch (b.t) {
    case "h": {
      if (b.level === 1) return "";
      const size = b.level === 2 ? 16 : 14;
      const bar = b.level === 2 ? `border-left:3px solid ${C.accent};padding-left:10px;` : "";
      return `<h${b.level} style="margin:22px 0 8px;font-size:${size}px;line-height:1.3;color:${C.ink};${bar}">${inlineToHtml(b.text)}</h${b.level}>`;
    }
    case "p":
      return `<p style="margin:0 0 10px;font-size:14px;line-height:1.55;color:${C.soft}">${inlineToHtml(b.text)}</p>`;
    case "ul":
    case "ol": {
      const items = b.items.map((it) => `<li style="margin:0 0 6px;font-size:14px;line-height:1.5;color:${C.soft}">${inlineToHtml(it)}</li>`).join("");
      return `<${b.t} style="margin:0 0 12px;padding-left:20px">${items}</${b.t}>`;
    }
    case "quote":
      return `<blockquote style="margin:0 0 12px;padding:8px 14px;border-left:3px solid ${C.border};background:${C.subtle};font-size:14px;line-height:1.5;color:${C.soft};font-style:italic">${inlineToHtml(b.text)}</blockquote>`;
    case "table": {
      const th = b.header.map((h) => `<th style="text-align:left;padding:6px 8px;border-bottom:1px solid ${C.border};font-size:12px;color:${C.muted};text-transform:uppercase;letter-spacing:.06em">${escapeHtml(h)}</th>`).join("");
      const tr = b.rows.map((r) => `<tr>${r.map((c) => `<td style="padding:6px 8px;border-bottom:1px solid ${C.border};font-size:13px;color:${C.soft}">${escapeHtml(c)}</td>`).join("")}</tr>`).join("");
      return `<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;margin:0 0 12px"><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table>`;
    }
    case "bajada":
      return `<p style="margin:0 0 16px;font-size:15.5px;line-height:1.6;color:${C.ink}">${inlineToHtml(b.text)}</p>`;
    case "countdown": {
      const w = Math.floor(100 / Math.max(b.items.length, 1));
      const tds = b.items
        .map(
          (it) =>
            `<td width="${w}%" style="padding:0 6px 8px 0;vertical-align:top"><div style="border:1px solid ${C.border};border-radius:8px;padding:10px 12px;background:#fff"><div style="font-size:24px;font-weight:600;line-height:1;color:${C.accent}">${escapeHtml(String(it.days))}</div><div style="font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:${C.muted};margin-top:3px">días</div><div style="font-size:13px;line-height:1.35;color:${C.ink};margin-top:7px">${escapeHtml(it.label)}</div>${it.detail ? `<div style="font-size:12px;color:${C.muted};margin-top:2px">${escapeHtml(it.detail)}</div>` : ""}</div></td>`,
        )
        .join("");
      return `<table role="presentation" data-block="countdown" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:separate;margin:0 0 14px"><tr>${tds}</tr></table>`;
    }
    case "kpi": {
      const w = Math.floor(100 / Math.max(b.items.length, 1));
      const tds = b.items
        .map(
          (it) =>
            `<td width="${w}%" style="padding:0 6px 8px 0;vertical-align:top"><div style="border:1px solid ${C.border};border-radius:8px;padding:10px 12px;background:${C.subtle}"><div style="font-size:22px;font-weight:600;line-height:1;color:${C.ink}">${escapeHtml(it.value)}</div><div style="font-size:12px;line-height:1.35;color:${C.soft};margin-top:5px">${escapeHtml(it.label)}</div>${it.note ? `<div style="font-size:11px;color:${C.muted};margin-top:2px">${escapeHtml(it.note)}</div>` : ""}</div></td>`,
        )
        .join("");
      return `<table role="presentation" data-block="kpi" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:separate;margin:0 0 14px"><tr>${tds}</tr></table>`;
    }
    case "callout": {
      const adv = b.kind === "advertencia";
      const line = adv ? "#b45309" : C.accent;
      const bg = adv ? "#fffbeb" : C.accentSoft;
      const label = adv ? "Advertencia" : "Inferencia";
      return `<div data-callout="${b.kind}" style="margin:0 0 12px;padding:10px 14px;border-left:3px solid ${line};background:${bg}"><div style="font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:${line};margin-bottom:4px">${label}</div><div style="font-size:14px;line-height:1.55;color:${C.soft}">${inlineToHtml(b.text)}</div></div>`;
    }
    case "hr":
      return `<hr style="border:0;border-top:1px solid ${C.border};margin:16px 0">`;
  }
}

function sectionHtml(title: string, blocks: Block[], variant: "hero" | "accent" | "plain"): string {
  const body = blocks.map(blockHtml).join("");
  if (variant === "hero") {
    return `<div style="margin:0 0 18px;padding:14px 16px;border:1px solid ${C.border};border-radius:8px;background:${C.subtle}"><div style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:${C.muted};margin-bottom:6px">${escapeHtml(title)}</div>${body}</div>`;
  }
  if (variant === "accent") {
    return `<div style="margin:18px 0 0;padding:14px 16px;border-radius:8px;background:${C.accentSoft}"><div style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:${C.accent};margin-bottom:6px">${escapeHtml(title)}</div>${body}</div>`;
  }
  const h = title ? `<h2 style="margin:22px 0 8px;font-size:16px;line-height:1.3;color:${C.ink};border-left:3px solid ${C.accent};padding-left:10px">${escapeHtml(title)}</h2>` : "";
  return h + body;
}

const chip = (text: string, color = C.soft) =>
  `<span style="display:inline-block;margin:0 6px 6px 0;padding:3px 9px;border:1px solid ${C.border};border-radius:999px;font-size:12px;color:${color};background:#fff">${escapeHtml(text)}</span>`;

export function renderReportEmail(input: { report: DailyReport; project: string; zona: string; appUrl: string }): {
  subject: string; html: string; text: string;
} {
  const { report, project, zona, appUrl } = input;
  // El asunto es la tesis del día (el h1 del informe); si el modelo no la
  // escribió, cae al formato viejo con la fecha.
  const titulo = reportTitle(report.markdown);
  const subject = titulo ? `${project} · ${titulo}` : `Informe de escucha · ${project} · ${fechaCorta(report.at)}`;
  const blocks = parseReportMarkdown(report.markdown);
  const sections = renderableSections(blocks);

  const chips = [
    chip(`${report.items24h} menciones 24 h`),
    chip(`${report.items7d} en 7 d`),
    report.pull ? chip(`barrido: ${report.pull.total} items`) : "",
    report.pull && report.pull.errors.length > 0
      ? chip(`${report.pull.errors.length} fuente${report.pull.errors.length === 1 ? "" : "s"} con error`, C.danger)
      : "",
  ].join("");

  const body = blocks.length === 0
    ? `<p style="font-size:14px;color:${C.muted}">Informe sin contenido.</p>`
    : sections.map((s) => {
        const t = s.title.toLowerCase();
        const variant = /resumen ejecutivo/.test(t) ? "hero" : /sugerencia operativa/.test(t) ? "accent" : "plain";
        return sectionHtml(s.title, s.blocks, variant);
      }).join("");

  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:24px 12px;background:${C.subtle};font-family:${FONT};color:${C.ink}">
<table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr><td align="center">
<table role="presentation" cellpadding="0" cellspacing="0" width="640" style="max-width:640px;width:100%">
<tr><td style="padding:0 4px 12px">
  <div style="font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:${C.muted}">Tronador · Escucha</div>
  <div style="font-size:22px;font-weight:600;line-height:1.15;color:${C.ink};margin-top:4px">${escapeHtml(titulo || project)}</div>
  <div style="font-size:13px;color:${C.muted};margin-top:2px">${titulo ? `${escapeHtml(project)} · ` : ""}${escapeHtml(fechaLarga(report.at))}${zona ? ` · ${escapeHtml(zona)}` : ""}</div>
  <div style="margin-top:10px">${chips}</div>
</td></tr>
<tr><td style="background:#fff;border:1px solid ${C.border};border-radius:10px;padding:22px 24px">
${body}
<div style="margin-top:26px;padding-top:16px;border-top:1px solid ${C.border};text-align:center">
  <a href="${escapeHtml(appUrl)}/escucha?tab=informe" style="display:inline-block;padding:9px 16px;border-radius:6px;background:${C.accent};color:#fff;font-size:13px;font-weight:600;text-decoration:none">Abrir en Tronador</a>
  <div style="margin-top:10px;font-size:12px;color:${C.muted}">Adjunto: informe completo en PDF.</div>
</div>
</td></tr>
<tr><td style="padding:14px 4px 0;font-size:11px;color:${C.muted};text-align:center">Generado automáticamente por Tronador a partir de la escucha del proyecto.</td></tr>
</table></td></tr></table></body></html>`;

  return { subject, html, text: report.markdown };
}
