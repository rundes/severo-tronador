# Informe diario: mail HTML diseñado + PDF adjunto + render en el panel

**Fecha:** 2026-08-25 · **Estado:** aprobado (diseño) · **Ámbito:** `lib/daily-report.ts` (mail), `lib/pdf/`, `components/escucha/informe-panel.tsx`, nueva ruta de descarga. Sin DDL.

## Problema

El informe diario (Claude, markdown) se manda por Resend como `<pre>` monoespaciado y en el
panel Informe se muestra igual. No hay PDF. El cliente recibe texto crudo.

## Decisiones

- **Un solo parser** (`lib/report-markdown.ts`) del subset de markdown que produce el prompt del
  informe → árbol de bloques tipado. Tres renderers sobre ese árbol: HTML de mail (CSS inline),
  PDF (`@react-pdf/renderer`, ya en el repo), React/Tailwind para el panel.
- **`DailyReport.markdown` sigue siendo la fuente de verdad**; no se guarda HTML ni PDF.
- **PDF adjunto en cada mail** (Resend `attachments`). Si el PDF falla, el mail sale sin adjunto
  y se loguea `daily_report.pdf_failed` — el informe nunca deja de llegar por el PDF.
- **Descarga de PDF por informe** desde el panel (vigente e historial).
- Fuera de alcance: cambiar el prompt/contenido del informe; gráficos; PDF del historial
  recortado (`history[].markdown` viene truncado a 4000 chars por `saveReport`, y así se exporta).

## Árbol de bloques (`lib/report-markdown.ts`)

```ts
export type Inline = { t: "text"; v: string } | { t: "b"; v: string } | { t: "i"; v: string } | { t: "code"; v: string };
export type Block =
  | { t: "h"; level: 1 | 2 | 3; text: Inline[] }
  | { t: "p"; text: Inline[] }
  | { t: "ul"; items: Inline[][] }
  | { t: "ol"; items: Inline[][] }
  | { t: "quote"; text: Inline[] }
  | { t: "table"; header: string[]; rows: string[][] }
  | { t: "hr" };

export function parseReportMarkdown(md: string): Block[];
export function sectionsOf(blocks: Block[]): { title: string; blocks: Block[] }[]; // corta por h2 (## N. Título)
export function escapeHtml(s: string): string;
```

Reglas: `#`/`##`/`###` → h; líneas `- ` / `* ` → ul; `1. ` → ol; `> ` → quote; `| a | b |` con
línea `|---|` → table; `---` → hr; resto → párrafos (líneas contiguas se unen). Inline: `**x**`,
`*x*`/`_x_`, `` `x` ``. Todo texto pasa por `escapeHtml` en los renderers HTML; el PDF no escapa
(react-pdf renderiza texto). Un bloque ```json``` no debería llegar (`splitReport` ya lo saca);
si llega, se renderiza como párrafo monoespaciado.

## Mail (`lib/report-html.ts`)

`renderReportEmail(input: { report: DailyReport; project: string; zona: string; appUrl: string }): { subject: string; html: string; text: string }`

- Tabla contenedora 640 px, fondo `#fafafa`, tarjeta blanca borde `#e4e4e7`, tipografía
  `Geist, -apple-system, Segoe UI, Roboto, sans-serif`, ink `#18181b`, muted `#71717a`, acento
  `#4f5bd5` (barra izquierda en h2, botón), estados `#059669/#d97706/#dc2626` solo con texto.
- Cabecera: wordmark "TRONADOR · Escucha", proyecto, fecha larga (es-AR), chips "N menciones 24 h"
  · "M en 7 d" · barrido (`pull.total` items, errores si hay).
- Cuerpo por secciones de `sectionsOf`: la primera (Resumen ejecutivo) en caja destacada; el
  resto con h2 con barra acento; citas como blockquote con borde; "Sugerencia operativa" en caja
  con fondo acento suave.
- Pie: botón "Abrir en Tronador" → `${appUrl}/escucha?tab=informe`; "Adjunto: informe completo en PDF".
- `text`: versión plana (el markdown original) para clientes sin HTML.
- Sin `<script>`, sin CSS externo, sin imágenes remotas (el wordmark es texto).

## PDF (`lib/pdf/daily-report-pdf.tsx`)

`DailyReportDocument({ report, project, zona, generatedAt })` con `@react-pdf/renderer`: A4,
márgenes 48, cabecera (proyecto · fecha · chips) en la primera página, secciones con el mismo
orden, pie fijo "Tronador · Escucha · página N de M" (`render={({pageNumber,totalPages})=>…}`),
fuente Helvetica (default; sin descarga de fuentes para no depender de red en Vercel).
`renderDailyReportPdf(input): Promise<Buffer>` envuelve `renderToBuffer`.

## Envío (`emailDailyReport` en `lib/daily-report.ts`)

```ts
const { subject, html, text } = renderReportEmail({ report, project, zona, appUrl });
let attachments: { filename: string; content: string }[] = [];
try {
  const pdf = await renderDailyReportPdf({ report, project, zona, generatedAt: report.at });
  attachments = [{ filename: `informe-${slug(project)}-${yyyy-mm-dd}.pdf`, content: pdf.toString("base64") }];
} catch (e) { log.warn("daily_report.pdf_failed", …); }
body: { from, to, subject, html, text, attachments }
```

`appUrl` = `process.env.APP_URL ?? "https://severo-tronador.vercel.app"`.

## Panel

- `components/escucha/report-view.tsx` (server): renderiza `Block[]` con Tailwind (h2 con barra
  acento, listas, citas, tablas `overflow-x-auto`, dark mode). Reemplaza el `<div whitespace-pre-wrap>`
  en informe vigente e historial de `informe-panel.tsx`.
- Botón **Descargar PDF** junto al informe vigente y en cada `<details>` del historial →
  `GET /escucha/informe-diario?at=<iso>`.
- Ruta `app/(dashboard)/escucha/informe-diario/route.ts`: `requireProject`; busca `at` en
  `latest`/`history` de `readDailyReports`; 404 si no está; responde
  `application/pdf` + `Content-Disposition: attachment; filename="informe-<slug>-<fecha>.pdf"`;
  `runtime = "nodejs"`; `log.info("pdf.daily_report.generated")`.

## Errores

- Markdown vacío → HTML/PDF con "Informe sin contenido" (no rompe).
- Resend sin `RESEND_API_KEY` → `{ sent: 0 }` como hoy.
- PDF falla → mail sin adjunto + warn; ruta de descarga → 500 con log.
- `at` inválido/no encontrado → 404.

## Testing (vitest)

- `report-markdown`: headings, listas, ol, quote, tabla, hr, inline (`**`, `*`, `` ` ``), unión de
  párrafos, `escapeHtml`, `sectionsOf` corta por h2 y conserva preámbulo.
- `report-html`: subject con proyecto y fecha; contiene las secciones; escapa `<script>` del
  contenido; incluye link `appUrl/escucha?tab=informe`; `text` = markdown.
- `daily-report-pdf`: `renderDailyReportPdf` devuelve Buffer que empieza con `%PDF`.
- `emailDailyReport`: con `fetch` mockeado, el body tiene `attachments[0].filename` `.pdf` y
  `content` base64; si el PDF tira, `attachments` vacío y el POST igual sale.
- Ruta: 403 sin proyecto (mock), 404 `at` inexistente, 200 `application/pdf` con `at` válido.
