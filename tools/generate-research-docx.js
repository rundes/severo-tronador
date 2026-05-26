/* eslint-disable */
// Generates: ../docs/SEVERO_TRONADOR_Research.docx
// Run: npm install && node generate-research-docx.js

const fs = require("fs");
const path = require("path");
const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  Header,
  Footer,
  AlignmentType,
  LevelFormat,
  ExternalHyperlink,
  TableOfContents,
  HeadingLevel,
  BorderStyle,
  WidthType,
  ShadingType,
  PageNumber,
  PageBreak,
  TabStopType,
  TabStopPosition,
} = require("docx");

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const BRAND = "1F4E79"; // azul corporativo
const SUBTLE = "595959";
const LIGHT_BG = "D5E8F0";
const ZEBRA = "F2F2F2";
const BORDER_COLOR = "BFBFBF";

const border = { style: BorderStyle.SINGLE, size: 4, color: BORDER_COLOR };
const cellBorders = { top: border, bottom: border, left: border, right: border };
const cellPadding = { top: 80, bottom: 80, left: 120, right: 120 };

// US Letter @ 1" margins → content width 9360 DXA
const CONTENT_WIDTH = 9360;

const p = (text, opts = {}) =>
  new Paragraph({
    children: [new TextRun({ text, ...opts })],
    spacing: { after: 120 },
    alignment: opts.alignment,
  });

const h1 = (text) =>
  new Paragraph({
    heading: HeadingLevel.HEADING_1,
    children: [new TextRun({ text, bold: true })],
    spacing: { before: 360, after: 200 },
  });

const h2 = (text) =>
  new Paragraph({
    heading: HeadingLevel.HEADING_2,
    children: [new TextRun({ text, bold: true })],
    spacing: { before: 280, after: 160 },
  });

const h3 = (text) =>
  new Paragraph({
    heading: HeadingLevel.HEADING_3,
    children: [new TextRun({ text, bold: true })],
    spacing: { before: 220, after: 120 },
  });

const bullet = (text, level = 0) =>
  new Paragraph({
    numbering: { reference: "bullets", level },
    children: typeof text === "string" ? [new TextRun(text)] : text,
    spacing: { after: 80 },
  });

const numbered = (text, level = 0) =>
  new Paragraph({
    numbering: { reference: "numbers", level },
    children: typeof text === "string" ? [new TextRun(text)] : text,
    spacing: { after: 80 },
  });

const link = (text, url) =>
  new ExternalHyperlink({
    children: [new TextRun({ text, style: "Hyperlink" })],
    link: url,
  });

const pageBreak = () => new Paragraph({ children: [new PageBreak()] });

const callout = (text) =>
  new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: [CONTENT_WIDTH],
    rows: [
      new TableRow({
        children: [
          new TableCell({
            borders: {
              top: { style: BorderStyle.SINGLE, size: 4, color: BRAND },
              bottom: { style: BorderStyle.SINGLE, size: 4, color: BRAND },
              left: { style: BorderStyle.SINGLE, size: 24, color: BRAND },
              right: { style: BorderStyle.SINGLE, size: 4, color: BRAND },
            },
            width: { size: CONTENT_WIDTH, type: WidthType.DXA },
            shading: { fill: LIGHT_BG, type: ShadingType.CLEAR },
            margins: { top: 160, bottom: 160, left: 200, right: 200 },
            children: [
              new Paragraph({
                children: [new TextRun({ text, italics: true })],
              }),
            ],
          }),
        ],
      }),
    ],
  });

// Build a table with header + rows. Each row is an array of cells; each cell is a string.
function makeTable(headers, rows, widths) {
  if (!widths) {
    const w = Math.floor(CONTENT_WIDTH / headers.length);
    widths = headers.map(() => w);
  }
  // Adjust last col so the sum equals CONTENT_WIDTH
  const sum = widths.reduce((a, b) => a + b, 0);
  if (sum !== CONTENT_WIDTH) widths[widths.length - 1] += CONTENT_WIDTH - sum;

  const headerRow = new TableRow({
    tableHeader: true,
    children: headers.map(
      (h, i) =>
        new TableCell({
          borders: cellBorders,
          width: { size: widths[i], type: WidthType.DXA },
          shading: { fill: BRAND, type: ShadingType.CLEAR },
          margins: cellPadding,
          children: [
            new Paragraph({
              children: [
                new TextRun({ text: h, bold: true, color: "FFFFFF", size: 20 }),
              ],
            }),
          ],
        })
    ),
  });

  const bodyRows = rows.map(
    (cells, rowIdx) =>
      new TableRow({
        children: cells.map(
          (c, i) =>
            new TableCell({
              borders: cellBorders,
              width: { size: widths[i], type: WidthType.DXA },
              shading:
                rowIdx % 2 === 1
                  ? { fill: ZEBRA, type: ShadingType.CLEAR }
                  : undefined,
              margins: cellPadding,
              children: cellToParagraphs(c),
            })
        ),
      })
  );

  return new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: widths,
    rows: [headerRow, ...bodyRows],
  });
}

// Cell can be string OR {text, bold, color} OR array of runs
function cellToParagraphs(c) {
  if (typeof c === "string") {
    return [new Paragraph({ children: [new TextRun({ text: c, size: 20 })] })];
  }
  if (Array.isArray(c)) {
    return [new Paragraph({ children: c })];
  }
  return [new Paragraph({ children: [new TextRun({ size: 20, ...c })] })];
}

// ─────────────────────────────────────────────────────────────────────────────
// COVER PAGE
// ─────────────────────────────────────────────────────────────────────────────

const cover = [
  new Paragraph({ spacing: { before: 2400 }, children: [] }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [
      new TextRun({ text: "SEVERO TRONADOR", bold: true, size: 56, color: BRAND }),
    ],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 200, after: 400 },
    children: [
      new TextRun({
        text: "Plataforma de contactación segmentada para relevamientos territoriales y encuestas",
        size: 28,
        color: SUBTLE,
        italics: true,
      }),
    ],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 400, after: 200 },
    children: [
      new TextRun({
        text: "Research técnico y comparativa de proveedores",
        size: 32,
        bold: true,
      }),
    ],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [
      new TextRun({
        text: "Investigación social y opinión pública · Maipú, Mendoza · Argentina",
        size: 22,
        color: SUBTLE,
      }),
    ],
  }),
  new Paragraph({ spacing: { before: 2400 }, children: [] }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [
      new TextRun({
        text: "Documento técnico — Mayo 2026",
        size: 22,
        bold: true,
      }),
    ],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [
      new TextRun({
        text: "Repositorio: github.com/rundes/severo-tronador",
        size: 20,
        color: SUBTLE,
      }),
    ],
  }),
  pageBreak(),
];

// ─────────────────────────────────────────────────────────────────────────────
// TOC
// ─────────────────────────────────────────────────────────────────────────────

const toc = [
  h1("Índice"),
  new Paragraph({
    children: [
      new TextRun({
        text: "Generar índice en Word: clic derecho sobre el siguiente bloque → Actualizar campos.",
        italics: true,
        color: SUBTLE,
        size: 20,
      }),
    ],
    spacing: { after: 120 },
  }),
  new TableOfContents("Tabla de contenidos", { hyperlink: true, headingStyleRange: "1-3" }),
  pageBreak(),
];

// ─────────────────────────────────────────────────────────────────────────────
// 1. RESUMEN EJECUTIVO
// ─────────────────────────────────────────────────────────────────────────────

const resumen = [
  h1("1. Resumen ejecutivo"),
  p(
    "Severo Tronador es una plataforma web para diseñar audiencias sobre el padrón enriquecido de Maipú (filtros por edad, barrio, sexo, circuito), ejecutar campañas de contactación multicanal con propósito investigativo, y registrar todo el ciclo (envíos, entregas, respuestas, opt-outs) en Google Sheets como base de datos única."
  ),
  callout(
    "Alcance: relevamientos territoriales, encuestas cuali/cuanti y opinión pública. NO se usa para campañas electorales, propaganda partidaria ni posicionamiento de candidatos. Este encuadre nos posiciona como herramienta de investigación social (vertical Market Research), lo que destraba prácticamente todos los proveedores comerciales."
  ),
  h2("Decisiones clave"),
  bullet("Stack: Next.js 15 + TypeScript + Tailwind + shadcn/ui, deploy en Vercel."),
  bullet("Auth: NextAuth con Google OAuth, alineado con el resto de las apps de Severo."),
  bullet("Capa de datos: Google Sheets vía service account (7 hojas, esquema documentado más abajo)."),
  bullet("Email: Resend (3.000 emails/mes gratis permanente, sin trabas para research)."),
  bullet("WhatsApp: Meta Cloud API directo (1.000 conversaciones service-initiated gratis/mes, sin markup de intermediarios)."),
  bullet("SMS y Voz: Telnyx (49% más barato que Twilio, IVR avanzado incluido) con 360nrs como alternativa local AR para facturación A."),
  bullet("Encuestas: built-in en la app para control de tracking; Google Forms / Tally como atajo para piezas ad-hoc."),
  bullet("Análisis cualitativo de respuestas abiertas: pipeline con LLM (Claude API) para coding asistido y clustering por embeddings."),
];

// ─────────────────────────────────────────────────────────────────────────────
// 2. CONTEXTO Y ALCANCE
// ─────────────────────────────────────────────────────────────────────────────

const contexto = [
  h1("2. Contexto y alcance"),
  h2("Problema que resuelve"),
  p(
    "Los equipos de investigación territorial necesitan contactar a sub-poblaciones específicas (por ejemplo, mujeres de 30-50 años residentes en el barrio Luján del departamento de Maipú) para administrar encuestas. Hoy ese proceso se hace con planillas manuales, llamadas one-off, y consolidación posterior fragmentada. Severo Tronador unifica el ciclo completo."
  ),
  h2("Casos de uso primarios"),
  numbered("Relevamientos territoriales: detección de demandas por barrio (seguridad, infraestructura, servicios)."),
  numbered("Encuestas de opinión periódicas: medición de percepciones sobre gestión municipal, política provincial, temas de agenda."),
  numbered("Encuestas cualitativas: invitación a focus groups o entrevistas en profundidad sobre segmentos específicos."),
  numbered("Estudios longitudinales: seguimiento del mismo panel de ciudadanos en el tiempo (cohortes)."),
  h2("Lo que NO hace la herramienta"),
  bullet("No envía propaganda electoral ni materiales de campaña."),
  bullet("No promociona candidatos ni partidos políticos."),
  bullet("No solicita votos ni hace fundraising."),
  bullet("No vende productos o servicios comerciales."),
  callout(
    "Este encuadre es central para acceder a proveedores como WhatsApp Business Platform (que prohíbe explícitamente partidos y campañas, pero acepta la vertical 'Market Research / Survey') y para cumplir con la Ley 25.326 de Protección de Datos Personales bajo la base legal de interés legítimo de investigación social."
  ),
];

// ─────────────────────────────────────────────────────────────────────────────
// 3. ARQUITECTURA
// ─────────────────────────────────────────────────────────────────────────────

const arquitectura = [
  h1("3. Arquitectura técnica"),
  h2("Diagrama de alto nivel"),
  p(
    "La aplicación es un monolito Next.js que actúa como única superficie de UI y como gateway hacia: (a) Google Sheets como capa de datos, (b) Google OAuth para autenticación de voluntarios, y (c) un conjunto plug-and-play de providers de canal que se activan por variable de entorno."
  ),
  new Paragraph({
    spacing: { before: 200, after: 200 },
    children: [
      new TextRun({
        text:
          "┌───────────────────────────────────────────────────────┐\n" +
          "│   Next.js 15 (App Router) + TS + Tailwind + shadcn   │\n" +
          "│   /app · /api · /lib · /components                   │\n" +
          "└──────────────────┬────────────────────────────────────┘\n" +
          "                   │\n" +
          "       ┌───────────┼────────────┬─────────────┐\n" +
          "       ▼           ▼            ▼             ▼\n" +
          "  ┌─────────┐ ┌──────────┐ ┌─────────┐  ┌──────────┐\n" +
          "  │ Google  │ │ Google   │ │ Channel │  │  Vercel  │\n" +
          "  │ Sheets  │ │ OAuth    │ │ Provid. │  │  Cron    │\n" +
          "  │  (DB)   │ │ (Auth)   │ │ (Email, │  │ (queue)  │\n" +
          "  └─────────┘ └──────────┘ │  WA,    │  └──────────┘\n" +
          "                           │  SMS,   │\n" +
          "                           │  Voice) │\n" +
          "                           └─────────┘",
        font: "Consolas",
        size: 18,
      }),
    ],
  }),
  h2("Componentes y responsabilidades"),
  makeTable(
    ["Componente", "Responsabilidad"],
    [
      ["Next.js App Router", "UI completa + endpoints server-side que tocan APIs externas. Mantiene credenciales fuera del cliente."],
      ["NextAuth + Google OAuth", "Login con cuenta Google, allowlist por email, audit trail de quién creó cada segmento/campaña."],
      ["Google Sheets API", "Base de datos versionada y editable por humanos. Service account con permiso editor sobre el spreadsheet."],
      ["Vercel Cron", "Procesa la cola de envíos cada minuto en batches, respetando rate limits de cada provider."],
      ["Webhooks", "Endpoints /api/webhooks/{resend,meta,telnyx} reciben actualizaciones de estado y las escriben en la hoja envios."],
      ["Channel adapters", "Una interfaz común (lib/channels/*.ts) por provider. Se activan dinámicamente según ENV vars presentes."],
    ],
    [2800, 6560]
  ),
];

// ─────────────────────────────────────────────────────────────────────────────
// 4. MODELO DE DATOS
// ─────────────────────────────────────────────────────────────────────────────

const datos = [
  h1("4. Modelo de datos (Google Sheets)"),
  p(
    "Siete hojas en el mismo spreadsheet. Cada hoja es una tabla relacional simple con una columna id. La hoja padron es de solo lectura desde la app; el resto son escritura controlada."
  ),
  h2("Esquema"),
  makeTable(
    ["Hoja", "Rol", "Columnas clave"],
    [
      ["padron", "Read-only (fuente)", "dni, nombre, apellido, fecha_nac, sexo, domicilio, barrio, circuito, mesa, telefono, email, …"],
      ["segmentos", "Audiencias guardadas", "id, nombre, filtros_json, tamano, creado_por, creado_at"],
      ["templates", "Plantillas por canal", "id, canal, nombre, asunto, cuerpo (vars {{nombre}}, {{barrio}}), estado"],
      ["campañas", "Metadata de campaña", "id, nombre, canal, template_id, segmento_id, estado, scheduled_at, métricas"],
      ["envios", "1 fila por destinatario × campaña", "campaña_id, dni, canal, destino, estado, sent_at, delivered_at, opened_at, replied_at, error"],
      ["respuestas", "Respuestas a encuestas", "envio_id, pregunta, respuesta, timestamp"],
      ["opt_outs", "Bajas globales", "identificador (dni/tel/email), canal, fecha, motivo"],
    ],
    [1400, 2400, 5560]
  ),
  h2("Consideraciones de escala"),
  bullet("Límite duro de Google Sheets: ~10 millones de celdas por spreadsheet. Padrones típicos municipales (Maipú ~200k habitantes) caben holgadamente."),
  bullet("Si envios crece > 500k filas, conviene archivar campañas viejas en otra hoja o migrar la tabla envios a BigQuery (sigue cabiendo el resto en Sheets)."),
  bullet("Lecturas concurrentes: Sheets API tiene quota de 60 reads/min/usuario; cachear segmentos resueltos en memoria del server."),
];

// ─────────────────────────────────────────────────────────────────────────────
// 5. PROVEEDORES COMERCIALES POR CANAL
// ─────────────────────────────────────────────────────────────────────────────

const providers = [
  h1("5. Proveedores comerciales por canal"),
  p(
    "Comparativa por canal, ordenada por recomendación. Se priorizan free tier permanente, costo a escala para mercado AR, calidad de DX (developer experience), y aceptación de uso para encuestas / investigación social."
  ),

  h2("5.1 Email"),
  makeTable(
    ["Proveedor", "Free tier", "Costo a escala", "Política", "Recomendación"],
    [
      [{ text: "Resend ⭐", bold: true }, "3.000/mes permanente", "$20/mes → 50k", "Sin restricción a research con opt-in", "Fase 1 — DX top"],
      ["Brevo (ex-Sendinblue)", "300/día (~9k/mes)", "$9/mes → 5k; $25/mes → 20k", "Restringe listas políticas no solicitadas; research con opt-in OK", "Alternativa — incluye SMS+WA"],
      ["MailerLite", "1k contactos / 12k mes", "$10/mes → 500 contactos", "Permite encuestas", "Alternativa"],
      ["AWS SES", "62k/mes free desde EC2", "$0.10 por 1.000 emails", "Permite todo (TOS estricto)", "A escala alta (5k+/día)"],
      ["SendGrid", "60-day trial", "Desde $19.95/mes", "Estricto con bulk", "Descartado (free tier murió)"],
      ["Mailgun", "30 días trial", "Desde $35/mes", "Permisivo si hay opt-in", "Sin ventaja vs Resend"],
      ["Postmark", "Sólo pago", "$15/mes → 10k", "Bloquea bulk marketing", "Descartado (no sirve para encuestas masivas)"],
      ["Mailchimp", "500 contactos / 1k mes", "Sube rápido con la lista", "Permite, pero pricing castiga", "Descartado"],
      [{ text: "Listmonk (self-hosted)", bold: true }, "Gratis", "$5/mes VPS + SMTP provider", "Control total", "A escala — sustituto a SaaS"],
    ],
    [1900, 1700, 1900, 2300, 1560]
  ),
  p(""),
  h3("Recomendación"),
  bullet("Arrancar con Resend (3k free permanente, DX excelente, sin trabas para research)."),
  bullet("Cuando superemos free tier: evaluar Brevo (incluye SMS+WA en mismo dashboard) o Listmonk + AWS SES (más barato a escala alta)."),

  pageBreak(),

  h2("5.2 WhatsApp"),
  callout(
    "Crítico: WhatsApp Business Platform prohíbe partidos políticos, candidatos y campañas electorales. Nuestro caso (research/encuestas) NO entra en esa categoría — la vertical Market Research está aceptada. La aplicación debe registrarse correctamente y los templates deben tener tono de invitación a investigación."
  ),
  makeTable(
    ["Proveedor", "Fee plataforma", "Sobre tarifa Meta", "Mín. mensual", "Recomendación"],
    [
      [{ text: "Meta Cloud API (directo) ⭐", bold: true }, "$0", "0% (es la fuente)", "$0", "Sí — si tenemos tech"],
      [{ text: "360dialog", bold: true }, "€49/mes", "0% markup", "€49", "Sí — a volumen"],
      ["Gupshup", "~$0.001/msg", "Sobre tarifa Meta", "$0", "Sí — LATAM-friendly"],
      ["Twilio for WhatsApp", "$0.005/msg in+out", "Sobre tarifa Meta", "$0", "Setup rápido, caro a escala"],
      ["WATI", "$49/mes", "+20% markup", "$49", "Descartado — caro"],
      ["Infobip", "Custom", "Custom", "Enterprise", "Sólo si ya somos cliente"],
    ],
    [2200, 1800, 1900, 1600, 1860]
  ),
  p(""),
  h3("Tarifas Meta (categorías post-2024)"),
  bullet("Service (iniciada por usuario, ventana 24h): gratis las primeras 1.000/mes."),
  bullet("Marketing / Utility / Authentication (iniciada por business): pago por mensaje, tarifa por país. AR ≈ $0.05–0.07 por conversación marketing."),
  h3("Templates necesarios (pre-aprobación de Meta)"),
  numbered("Invitación a encuesta corta con link a /encuesta/[token]."),
  numbered("Recordatorio (24h después si no respondió)."),
  numbered("Agradecimiento post-respuesta."),

  pageBreak(),

  h2("5.3 SMS (Argentina)"),
  callout(
    "SMS a destinos AR es caro vs mercados US/EU (~$0.08–0.10/SMS). Conviene usarlo para urgencia o cuando el destinatario no tiene smartphone, no como canal masivo de primera línea."
  ),
  makeTable(
    ["Proveedor", "Costo SMS AR", "Free tier", "Local AR", "Recomendación"],
    [
      [{ text: "Telnyx ⭐", bold: true }, "~$0.04 (49% < Twilio)", "$2 trial", "No", "Mejor ratio costo/feature"],
      [{ text: "Plivo", bold: true }, "~$0.05 (37% < Twilio)", "$20 trial", "No", "Alternativa cost-effective"],
      ["Vonage", "~$0.05–0.08", "$2 trial", "No", "Buena alternativa global"],
      ["Twilio", "~$0.085/SMS", "$15 trial", "No", "Caro pero maduro"],
      ["360nrs / WauSMS (AR)", "$0.10215/SMS", "Saldo prueba", "Sí", "Si necesitamos factura A AR"],
      ["Tecsid (AR)", "Variable por operadora", "Consultar", "Sí", "Alt local"],
      ["Mensatek (AR)", "Variable", "Consultar", "Sí", "Alt local"],
    ],
    [2200, 2000, 1500, 1500, 2160]
  ),

  h2("5.4 Voz e IVR"),
  makeTable(
    ["Proveedor", "Costo/min saliente", "IVR builder", "Recomendación"],
    [
      [{ text: "Telnyx ⭐", bold: true }, "$0.004/min (49% < Twilio)", "Avanzado (visual + API)", "Sí — IVR completo"],
      ["Plivo", "37% < Twilio", "API-driven", "Sí — simple"],
      ["Twilio", "Baseline (consultar AR)", "Studio (visual) + TwiML", "Maduro pero caro"],
      ["Vonage", "~$0.013/min", "Voice API + IVR", "Alternativa"],
      ["360nrs (AR)", "$0.17516/llamada (no por min)", "Speech recording", "Alt local"],
    ],
    [2200, 2500, 2500, 2160]
  ),
  p(""),
  h3("Estrategia para llamadas en encuestas"),
  bullet("Encuestas automáticas (IVR sin operador): Telnyx — mejor relación costo/features."),
  bullet("Registro de llamadas hechas por encuestadores humanos: no se necesita provider de voz, sólo un formulario web mobile-friendly en la app que el encuestador completa después de cada llamada."),
  bullet("Llamadas outbound con grabación: Twilio o Telnyx, ambos generan recording URL que guardamos en la hoja envios."),

  pageBreak(),

  h2("5.5 Encuestas web / Formularios"),
  makeTable(
    ["Herramienta", "Free tier", "API / Sheets", "Branding propio", "Recomendación"],
    [
      [{ text: "Built-in (Next.js) ⭐", bold: true }, "Gratis", "Nativo a nuestro Sheet", "Total", "Encuesta principal"],
      [{ text: "Google Forms", bold: true }, "Gratis ilimitado", "Sheets nativo", "Limitado", "Atajo ad-hoc"],
      ["Tally", "Free unlimited", "Sheets vía API/Zapier", "Bueno", "Alt rápida"],
      ["Typeform", "10 resp/mes free", "Sheets vía Zapier", "Excelente", "Caro ($25/mes)"],
      ["Jotform", "100 resp/mes free", "Sheets nativo", "Bueno", "OK"],
      [{ text: "LimeSurvey CE (open source)", bold: true }, "Gratis self-hosted", "Plugins", "Total", "Cuali compleja"],
      [{ text: "Formbricks (open source)", bold: true }, "Cloud free + self-host", "Webhooks + API", "Total", "Alternativa moderna"],
    ],
    [2400, 1800, 2000, 1500, 1660]
  ),

  h2("5.6 Telegram (canal complementario)"),
  callout(
    "Penetración menor que WhatsApp en AR, pero Bot API completamente gratis, sin restricciones a contenido de research o cívico. Limitación: el usuario debe iniciar conversación con el bot primero (/start); no se contacta en frío."
  ),
  bullet("Bot API: gratis, sin per-message charge."),
  bullet("Broadcast: 30 msg/seg gratis; hasta 1.000/seg con Paid Broadcasts (0.1 Stars/msg ≈ centavos)."),
  bullet("Caso de uso: ofrecer 'respondé por Telegram: t.me/severo_maipu_bot' como canal opt-in alternativo en volantes y redes."),

  pageBreak(),

  h2("5.7 Social listening — Brandwatch y alternativas (canal pasivo)"),
  callout(
    "Mientras los canales 5.1–5.6 son ACTIVOS (nosotros contactamos al ciudadano), social listening es PASIVO: monitoreamos qué dice la ciudadanía organicamente en X/Twitter, Reddit, TikTok, foros, podcasts y noticias. Útil para detectar temas emergentes ANTES de diseñar una encuesta, calibrar sentiment baseline, o disparar alertas en tiempo real."
  ),
  h3("Comparativa de plataformas"),
  makeTable(
    ["Plataforma", "Pricing 2026", "Fuentes", "Recomendación"],
    [
      [
        { text: "Brandwatch", bold: true },
        "Desde $800/mes (anual); típico $25k+/año",
        "100M+ (X, Reddit, TikTok, 70k podcasts, foros, news, blogs)",
        "Enterprise — sobrado para municipio salvo presupuesto alto",
      ],
      [
        "Talkwalker (Hootsuite)",
        "~$9.6k/año entry; $27k+/año típico",
        "Global + visual AI (image recognition)",
        "Similar a BW, fuerte en visual y multi-idioma",
      ],
      [
        "Meltwater",
        "~$25k/año mediano",
        "PR + medios + social + Klear influencers",
        "Mejor para PR/medios tradicionales",
      ],
      [
        { text: "Brand24 ⭐", bold: true },
        "$99–$199/mes",
        "X, Reddit, TikTok, IG, FB, web, blogs",
        "Mejor relación costo/feature para municipio",
      ],
      [
        "Buska",
        "$49/mes",
        "30+ plataformas",
        "Alternativa barata SMB",
      ],
      [
        "Mention",
        "$41/mes (free limitado)",
        "Web + redes",
        "Alternativa SMB",
      ],
      [
        { text: "DIY (X+Reddit+Claude)", bold: true },
        "$0–$200/mes",
        "Lo que integremos manualmente",
        "Si tenemos dev time, ~80% del valor a 1% del costo",
      ],
      [
        "Google Alerts",
        "Gratis",
        "Web",
        "Mínimo viable, sin real-time ni APIs",
      ],
    ],
    [2100, 2100, 2900, 2260]
  ),

  h3("Iris AI — el feature destacado de Brandwatch en 2026"),
  bullet("\"Ask Iris\": chat conversacional sobre el dataset — preguntas en lenguaje natural tipo \"¿qué se dice de transporte público en Maipú en los últimos 30 días?\" devuelve respuesta narrativa con citas."),
  bullet("AI Dashboards: genera resúmenes ejecutivos automáticos sobre cualquier query."),
  bullet("AI Query Writer: traduce prompts en lenguaje natural a queries Booleanas complejas (lenguaje técnico de social listening)."),
  bullet("Conversation Insights: agrupa miles de menciones en clusters temáticos digeribles."),
  bullet("Roadmap 2026 (anunciado): análisis de video/imagen, \"Bring Your Own Data\" para cargar nuestros propios datasets junto al de Brandwatch, expansión APAC y app mobile nativa."),

  h3("Casos de uso documentados en sector público"),
  p(
    "Brandwatch publica guías específicas para gobiernos: detectar shifts en prioridades ciudadanas, gestionar crisis comms en tiempo real, validar mensajes oficiales antes y después del lanzamiento, detectar misinformation que requiera respuesta institucional, y monitorear sentiment sobre proyectos de obra pública. En UK tienen procurement pathway pre-aprobado para entes públicos, lo que sugiere madurez en esta vertical."
  ),

  h3("Decisión para Severo Tronador"),
  makeTable(
    ["Escenario", "Recomendación"],
    [
      [
        "Fases F1–F6",
        "Omitir social listening — foco en contactación activa primero",
      ],
      [
        "F7+ con presupuesto bajo (~$0–$200/mes)",
        "DIY: X API Basic (free) + Reddit API (free) + Claude API para sentiment ≈ 80% del valor por <$50/mes. Requiere ~2 semanas de dev.",
      ],
      [
        "F7+ con presupuesto medio (~$1.2k/año)",
        "Brand24 — cobertura buena, IA decente, asequible y rápido de adoptar.",
      ],
      [
        "F7+ con presupuesto alto (~$25k+/año)",
        "Brandwatch — si necesitamos profundidad de podcasts/foros, reportes institucionales, o el storytelling de Iris AI para presentar a stakeholders.",
      ],
    ],
    [3400, 5960]
  ),

  callout(
    "Insight de arquitectura: Brandwatch (o cualquier social listening) y Severo Tronador son COMPLEMENTARIOS, no sustitutos. Brandwatch detecta DE QUÉ está hablando la gente; Severo Tronador pregunta directo a una muestra controlada del padrón. La pipeline ideal: usar listening para DESCUBRIR temas, después usar encuestas para MEDIR prevalencia en la población objetivo. Cierre del loop: las respuestas a encuestas pueden, a su vez, alimentar nuevas queries de listening (\"¿qué tan generalizada está esta queja sobre el barrio X?\")."
  ),
];

// ─────────────────────────────────────────────────────────────────────────────
// 6. OPEN SOURCE EN GITHUB
// ─────────────────────────────────────────────────────────────────────────────

const opensource = [
  h1("6. Proyectos open source en GitHub"),
  p(
    "Investigación de software libre relevante. Se evalúa cada proyecto por: estado de mantenimiento, ajuste al caso de uso de research (no electoral), riesgos legales o de TOS, y si conviene usarlo, integrarlo, o inspirarse."
  ),

  h2("6.1 CRM e infraestructura cívica"),
  makeTable(
    ["Proyecto", "Qué es", "Uso para nosotros", "Riesgo"],
    [
      [
        { text: "CiviCRM", bold: true },
        "CRM open source maduro para ONGs y orgs cívicas. Self-hosted, plugins de canvassing y encuestas.",
        "Demasiado heavy para nuestro alcance (Sheets es suficiente). Útil como referencia de esquema de datos.",
        "Bajo — proyecto maduro y permisivo.",
      ],
      [
        { text: "MoveOn Spoke", bold: true },
        "Tool de mass-texting peer-to-peer hecho por MoveOn.org. Usado en campañas progresistas en US.",
        "Diseñado para electoral. Framing equivocado. Vale como referencia de UX de envío masivo.",
        "Medio — está pensado para campañas, no encuestas.",
      ],
      [
        { text: "Action Network", bold: true },
        "Plataforma cívica SaaS-friendly (no open source pero con API).",
        "Referencia de feature set y pricing para orgs.",
        "N/A.",
      ],
    ],
    [1900, 3000, 3000, 1460]
  ),

  h2("6.2 Email marketing self-hosted"),
  makeTable(
    ["Proyecto", "Stars (aprox)", "Stack", "Uso para nosotros"],
    [
      [
        { text: "Listmonk ⭐", bold: true },
        "16k+",
        "Go + Postgres",
        "Excelente sustituto a Resend/Brevo cuando escalemos. Corre en VPS de $5/mes. Conectarlo a AWS SES como backend SMTP.",
      ],
      [
        "Mautic",
        "8k+",
        "PHP + MySQL",
        "Demasiado pesado (4GB RAM mínimo). Más automatización que la que necesitamos. Descartado.",
      ],
      [
        "Postal",
        "14k+",
        "Ruby on Rails",
        "Servidor SMTP completo self-hosted. Alternativa si queremos correr nuestro propio mail server.",
      ],
    ],
    [1700, 1500, 2200, 3960]
  ),

  h2("6.3 WhatsApp open source (no oficial)"),
  callout(
    "Estos proyectos NO usan la WhatsApp Business API oficial: se conectan al protocolo de WhatsApp Web (Linked Devices). Implica violación de TOS de Meta y riesgo de baneo del número. Aceptable para experimentación o como Plan B, no para producción seria."
  ),
  makeTable(
    ["Proyecto", "Stars (aprox)", "Qué hace", "Riesgo"],
    [
      [
        { text: "Baileys (WhiskeySockets)", bold: true },
        "17k+",
        "Librería TS/JS de bajo nivel que habla el protocolo de WhatsApp Web vía WebSockets.",
        "Alto — viola TOS de Meta. Número usado puede ser baneado.",
      ],
      [
        { text: "Evolution API", bold: true },
        "Crecimiento 6x en 2026",
        "API REST sobre Baileys. Muy popular en LATAM para conectar n8n + WhatsApp.",
        "Alto — mismo riesgo, además protocolo puede cambiar.",
      ],
      [
        "whatsapp-web.js",
        "16k+",
        "Otra librería sobre el protocolo de WhatsApp Web.",
        "Alto — idem.",
      ],
      [
        "WPPConnect",
        "5k+",
        "Familia de librerías comunitarias.",
        "Alto — idem.",
      ],
    ],
    [2200, 1700, 3500, 1960]
  ),
  p(""),
  h3("Decisión recomendada sobre WhatsApp"),
  bullet("Producción: Meta Cloud API oficial, vertical Survey/Research."),
  bullet("Experimentación local con destinatarios consentidos: Evolution API en un número descartable."),
  bullet("Nunca: usar Baileys con un número productivo o con padrón completo en frío — ban garantizado."),

  pageBreak(),

  h2("6.4 Forms / Encuestas open source"),
  makeTable(
    ["Proyecto", "Stars (aprox)", "Licencia", "Uso para nosotros"],
    [
      [
        { text: "SurveyJS ⭐", bold: true },
        "5k+",
        "MIT (core)",
        "Librería JS embebible. Ideal para incrustar el render de la encuesta dentro de Next.js sin reinventar la rueda. JSON schema versionable.",
      ],
      [
        { text: "Formbricks", bold: true },
        "10k+",
        "AGPLv3",
        "Suite completa estilo Qualtrics open. Self-host con Docker. Útil si queremos un editor visual de encuestas sin construirlo.",
      ],
      [
        "LimeSurvey CE",
        "Maduro",
        "GPL",
        "Veterano de encuestas científicas. 80+ idiomas, export a SPSS/R/Stata. Heavy pero confiable para estudios formales.",
      ],
      [
        { text: "Typebot", bold: true },
        "10k+",
        "AGPLv3",
        "Visual flow builder para encuestas conversacionales. Integra WhatsApp y Telegram. Alternativa a construir el flujo nosotros.",
      ],
      [
        "Botpress",
        "14k+",
        "MIT",
        "Plataforma de chatbots completa con visual builder, integraciones multicanal. Más maduro que Typebot, requiere más coding.",
      ],
      [
        "OpnForm",
        "5k+",
        "AGPLv3",
        "Otra opción de form builder open source, simple.",
      ],
    ],
    [1900, 1400, 1400, 4660]
  ),

  h2("6.5 Inbox omnicanal"),
  makeTable(
    ["Proyecto", "Stars (aprox)", "Qué resuelve"],
    [
      [
        { text: "Chatwoot ⭐", bold: true },
        "23k+",
        "Inbox compartido para que el equipo de campo responda mensajes entrantes de WhatsApp, Telegram, email, web chat, SMS, Instagram, etc. en un único lugar. Open source, self-hosted o cloud. Integra nativamente con Evolution API.",
      ],
      [
        "Erxes",
        "4k+",
        "CRM + inbox omnicanal open source, alternativa más completa pero más pesada.",
      ],
      [
        "Tawk.to (no OSS pero free)",
        "—",
        "Live chat web gratis ilimitado, en caso de querer un canal de respuesta sincrónica desde la encuesta misma.",
      ],
    ],
    [2200, 1500, 5660]
  ),
  p(""),
  h3("Cómo Chatwoot encaja en Severo Tronador"),
  bullet("Caso de uso: cuando una persona responde a un WhatsApp/SMS de encuesta con un mensaje en vez de seguir el flujo (ej: 'cuándo es la reunión?'), un humano del equipo necesita responder."),
  bullet("Sin Chatwoot: el mensaje cae en un buzón sin gestión. Con Chatwoot: aparece como ticket asignable."),
  bullet("Decisión: opcional para fase 1. Recomendado a partir de fase 4 si el volumen lo justifica."),

  h2("6.6 Workflow automation"),
  bullet("n8n (open source, 60k+ stars): orquestador de workflows estilo Zapier auto-hosteable. Útil como pegamento entre Sheets, Evolution API, Telegram, etc., sin escribir código. Vale tenerlo en el toolkit para flujos ad-hoc."),
  bullet("VICIdial: predictive dialer open source para call centers serios. Demasiado para encuestas voluntarias; sirve si crecemos a operación masiva de llamadas humanas."),
];

// ─────────────────────────────────────────────────────────────────────────────
// 7. TECH INNOVADORA 2026
// ─────────────────────────────────────────────────────────────────────────────

const innovacion = [
  h1("7. Tecnología innovadora (2026)"),
  p(
    "Más allá del set tradicional de canales, hay tres frentes nuevos que cambian materialmente cómo se hace investigación social en 2026: agentes de voz con LLM, análisis cualitativo asistido por LLM, y plataformas conversacionales visuales."
  ),

  h2("7.1 Agentes de voz con IA (alternativa al IVR clásico)"),
  callout(
    "Cambio de paradigma: un agente de voz IA mantiene conversaciones reales por teléfono con LLM + speech-to-text + text-to-speech. Comprende habla no estructurada, razona sobre lo que el llamante realmente quiere, y reemplaza al IVR de menú rígido por una entrevista conversacional natural."
  ),
  p(
    "Esto habilita encuestas telefónicas automáticas donde el agente hace preguntas abiertas, escucha la respuesta del entrevistado, repregunta si es ambigua, y registra todo. La barra de calidad actual es latencia <800ms end-to-end."
  ),
  makeTable(
    ["Plataforma", "Costo (all-in)", "Fortaleza", "Recomendación"],
    [
      [{ text: "Vapi", bold: true }, "$0.05/min orquestación + LLM ($0.15–0.30 all-in)", "Más flexible para developers, multi-LLM", "Top pick si construimos algo custom"],
      [{ text: "Retell AI", bold: true }, "$0.055/min + LLM ($0.07–0.31 all-in)", "Mejor turn-taking (sensación natural)", "Si la calidad conversacional es prioridad"],
      [{ text: "Bland AI", bold: true }, "$0.11–0.14/min bundled (todo incluido)", "Más barato a escala, todo en un paquete", "Si queremos costo predecible"],
      ["ElevenLabs Conv AI", "$0.10/min (sin LLM)", "Mejor calidad de voz del mercado", "Si la naturalidad de voz es crítica"],
    ],
    [1900, 2700, 2900, 1860]
  ),
  p(""),
  h3("Costo realista de una encuesta telefónica por IA"),
  bullet("Encuesta de 5 minutos × 100 personas = 500 minutos."),
  bullet("Con Bland AI ($0.13/min bundled) ≈ $65 dólares por 100 encuestas completas, sin humanos involucrados."),
  bullet("Comparar contra encuestador humano AR: 500 min × $15/hr = ~$125 + tiempo de coordinación."),
  bullet("Ahorro real ≈ 50% + escalable a miles de llamadas sin agregar staff."),

  pageBreak(),

  h2("7.2 LLM para análisis cualitativo de respuestas abiertas"),
  p(
    "Las encuestas con preguntas abiertas (\"¿qué cambiaría del barrio?\") generan texto libre cuyo análisis tradicional requiere coders humanos haciendo coding inductivo y deductivo. LLMs reducen este trabajo en órdenes de magnitud."
  ),
  h3("Pipeline propuesto"),
  numbered("Pre-procesamiento: limpieza, anonimización (remover nombres propios y direcciones)."),
  numbered("Coding inductivo (descubrimiento de temas): primer pass con Claude API sobre una muestra (~10% de respuestas) generando códigos emergentes."),
  numbered("Validación humana: el investigador revisa y consolida la lista de códigos."),
  numbered("Coding deductivo (clasificación masiva): segundo pass con Claude sobre el 100% de respuestas asignando códigos validados."),
  numbered("Embeddings + clustering: para detectar respuestas atípicas o sub-temas no contemplados (modelo text-embedding-3-small de OpenAI o equivalente)."),
  numbered("Dashboard: frecuencia por código, cruzado con filtros del padrón (edad, barrio, sexo)."),
  h3("Consideraciones"),
  bullet("Privacidad: las respuestas se mandan a la API de un tercero (Anthropic/OpenAI). Para datos sensibles, evaluar Claude Haiku self-hosted via Bedrock o un modelo open source on-device (ChatQDA paper, 2026)."),
  bullet("Bias y consistencia: LLMs son consistentes con prompts estandarizados. Hacer auditoría puntual humana sobre ~5% de la salida."),
  bullet("Costo: Claude Haiku 4.5 a ~$1 por millón de tokens input → procesar 10.000 respuestas de 200 palabras cada una ≈ $2."),

  h2("7.3 Plataformas conversacionales visuales (Typebot / Botpress)"),
  p(
    "En vez de programar el flujo de encuesta en código Next.js, se puede orquestar visualmente con un builder. Las respuestas se webhookean al Sheet vía nuestro endpoint."
  ),
  makeTable(
    ["Aspecto", "Built-in en Next.js", "Typebot", "Botpress"],
    [
      ["Esfuerzo dev inicial", "Medio (componentes propios)", "Bajo (drag & drop)", "Bajo a medio"],
      ["Control de UX", "Total", "Limitado al template", "Limitado pero customizable"],
      ["Multi-canal (WA + web)", "Hay que implementarlo", "Nativo", "Nativo + más canales"],
      ["Self-host", "Por defecto", "Sí (AGPLv3)", "Sí (MIT)"],
      ["Costo", "Cero", "Cero (self-host) o SaaS", "Cero (self-host) o SaaS"],
      ["Recomendación", "Encuesta principal", "Si necesitamos WA flow rápido", "Alternativa más madura"],
    ],
    [2200, 1900, 2600, 2660]
  ),

  h2("7.4 Inbox omnicanal con IA (Chatwoot + Claude)"),
  bullet("Chatwoot self-hosted ya soporta integración con LLMs para sugerencias de respuesta automáticas a operadores humanos."),
  bullet("Caso de uso: cuando alguien responde a una encuesta con una queja libre, Claude sugiere una respuesta empática que el operador aprueba con un click."),
  bullet("Reduce tiempo de respuesta promedio sin perder el toque humano."),

  h2("7.5 Otras tendencias 2026 a vigilar"),
  bullet("RCS (Rich Communication Services) de Google: SMS evolucionado con imágenes, botones, sin app extra. Adopción en AR aún baja pero crece. Costo similar a SMS premium."),
  bullet("WhatsApp Flows: formularios nativos dentro de WhatsApp sin link externo. Más fricción menos para encuestas. Se configuran desde Meta Cloud API."),
  bullet("Voice cloning ético: TTS personalizado con voz consentida del candidato/funcionario para mensajes oficiales (NO usar para campañas; sólo para comunicación institucional con disclosure)."),
];

// ─────────────────────────────────────────────────────────────────────────────
// 8. STACK POR FASE
// ─────────────────────────────────────────────────────────────────────────────

const stackPorFase = [
  h1("8. Stack recomendado por fase"),
  makeTable(
    ["Fase", "Email", "WhatsApp", "SMS", "Voz", "Encuesta"],
    [
      [
        { text: "F0–F2 (MVP)", bold: true },
        "Mock",
        "Mock",
        "Mock",
        "—",
        "Built-in",
      ],
      [
        { text: "F3 (primer canal real)", bold: true },
        "Resend",
        "—",
        "—",
        "—",
        "Built-in",
      ],
      [
        { text: "F4 (WhatsApp)", bold: true },
        "Resend",
        "Meta Cloud API",
        "—",
        "—",
        "Built-in",
      ],
      [
        { text: "F5 (SMS)", bold: true },
        "Resend",
        "Meta Cloud",
        "Telnyx",
        "—",
        "Built-in",
      ],
      [
        { text: "F6 (Voz)", bold: true },
        "Resend",
        "Meta Cloud",
        "Telnyx",
        "Telnyx IVR o Bland AI",
        "Built-in",
      ],
      [
        { text: "A escala", bold: true },
        "Brevo o Listmonk+SES",
        "360dialog o Meta",
        "Telnyx + 360nrs",
        "Telnyx + Bland AI",
        "Built-in + Forms ad-hoc",
      ],
    ],
    [2000, 1500, 1700, 1500, 1300, 1360]
  ),

  h2("Roadmap de entrega"),
  makeTable(
    ["#", "Entregable", "Resultado"],
    [
      ["F0", "Plan + investigación (este doc)", "PLAN.md + PROVIDERS.md + este Word"],
      ["F1", "Scaffold Next.js + auth + Sheets mock", "App corriendo local"],
      ["F2", "Padrón + segmentos con preview", "UI funcional sin envíos"],
      ["F3", "Templates + primer envío email (Resend)", "E2E primer canal"],
      ["F4", "WhatsApp Meta Cloud API + templates aprobados", "2 canales activos"],
      ["F5", "SMS + registro manual de llamadas", "Multi-canal completo"],
      ["F6", "Encuestas públicas con tracking token", "Captura de respuestas"],
      ["F7", "Dashboard + opt-out cross-channel + dedupe + IA cualitativa", "Producción"],
    ],
    [700, 4500, 4160]
  ),
];

// ─────────────────────────────────────────────────────────────────────────────
// 9. LEGAL Y OPERATIVO
// ─────────────────────────────────────────────────────────────────────────────

const legal = [
  h1("9. Consideraciones legales y operativas"),
  h2("9.1 Ley 25.326 (Protección de Datos Personales, AR)"),
  bullet("Base legal: interés legítimo de investigación social con propósito declarado (no comercial, no electoral)."),
  bullet("Inscripción de la base de datos ante la AAIP (Agencia de Acceso a la Información Pública)."),
  bullet("El padrón se queda en el spreadsheet del cliente. No se exporta a terceros más allá del destino del mensaje."),
  bullet("Cada envío logea qué dato se usó (DNI parcial, no completo), cuándo, por quién y para qué campaña."),
  bullet("Derecho de acceso, rectificación y supresión: tabla opt_outs implementa supresión funcional."),

  h2("9.2 Consentimiento y disclosure"),
  bullet("Primer contacto declara propósito: 'Investigación de opinión pública. No es campaña electoral. No vendemos nada.'"),
  bullet("Identificación clara del remitente: 'Equipo de relevamiento [Org]'."),
  bullet("Opt-out inmediato en TODOS los mensajes: 'Para no recibir más mensajes: [link/BAJA]'."),
  bullet("Tabla opt_outs se consulta ANTES de cada envío en TODOS los canales."),

  h2("9.3 Rate limits y deliverabilidad"),
  bullet("Cada provider tiene su límite; el cron procesa en batches respetando el más restrictivo."),
  bullet("Warm-up de dominio email gradual para no caer en blacklist (empezar con 100/día, doblar semanal)."),
  bullet("WhatsApp: tasa de bloqueo del usuario monitoreada — si > 2% en una campaña, pausar automáticamente."),
  bullet("SMS: short codes o long codes según volumen; consultar normativa ENACOM si > 10k SMS/mes."),

  h2("9.4 Seguridad"),
  bullet("Credenciales (service account, API keys) NUNCA en client; siempre en API routes server-side."),
  bullet("OAuth Google con allowlist por email; no auto-registro."),
  bullet("Logs de auditoría en hoja envios: quién creó cada campaña, cuándo, sobre qué segmento."),
  bullet("Backups automáticos del spreadsheet (Google Sheets ya versiona; complementar con export periódico a otro Drive)."),
];

// ─────────────────────────────────────────────────────────────────────────────
// 10. RIESGOS
// ─────────────────────────────────────────────────────────────────────────────

const riesgos = [
  h1("10. Riesgos y mitigaciones"),
  makeTable(
    ["Riesgo", "Impacto", "Mitigación"],
    [
      ["Google Sheets no escala (10M celdas máx)", "Alto si > 100k DNIs en padrón", "Migrar tabla envios a BigQuery a partir de F5; Sheets sigue como I/O humano."],
      ["WhatsApp rechaza templates marketing", "Bloquea canal", "Aplicar como vertical Survey/Research; redactar templates con tono investigativo, no comercial."],
      ["Bounce/spam rate destruye reputación email", "Caída en deliverabilidad", "Warm-up gradual, validar emails pre-envío, mantener bounce < 2%."],
      ["Ban del número WhatsApp", "Pérdida de canal", "Sólo Meta Cloud API oficial en producción; nunca Baileys/Evolution API con número productivo."],
      ["Costo SMS AR alto", "Presupuesto sube rápido", "Reservar SMS para urgencia; canal default = WhatsApp + email."],
      ["Ley 25.326 inscripción incumplida", "Sanción AAIP", "Inscribir base antes de F3; tener política de privacidad pública."],
      ["Encuestas filtradas a oposición/medios", "Reputacional", "Acceso por allowlist; no exportar padrón completo; logs de quién descargó qué."],
      ["LLM alucina al codificar respuestas", "Análisis cuali sesgado", "Validación humana sobre 5% de salida; prompts estandarizados versionados."],
      ["Rate limit de Sheets API en bursts", "Errores 429", "Cache de segmentos resueltos en memoria; batch writes."],
    ],
    [2800, 1800, 4760]
  ),
];

// ─────────────────────────────────────────────────────────────────────────────
// 11. PRÓXIMOS PASOS
// ─────────────────────────────────────────────────────────────────────────────

const proximos = [
  h1("11. Próximos pasos"),
  h2("Bloqueantes para arrancar F1"),
  numbered("ID del Google Sheet del padrón enriquecido (o autorización a usar uno placeholder)."),
  numbered("Service account de Google Cloud con permiso editor sobre ese Sheet."),
  numbered("OAuth client de Google (Client ID + Secret) para auth de voluntarios."),
  numbered("Allowlist inicial de emails autorizados."),
  numbered("Decisión sobre dominio: severotronador.ar, severo.maipu.gob.ar, etc. (necesario para configurar Resend y registros SPF/DKIM)."),

  h2("Decisiones pendientes (no bloquean F1)"),
  bullet("¿Inscribir base ante AAIP a nombre de qué entidad? (persona física, ONG, municipio)."),
  bullet("¿Vamos a integrar Chatwoot para tickets de respuesta? (decidir antes de F4)."),
  bullet("¿Pipeline cuali con LLM en F6 o F7? Depende de volumen real de respuestas abiertas."),
  bullet("¿Versión móvil dedicada (PWA) para encuestadores en campo? (post-F5)."),

  h2("Calendario tentativo"),
  bullet("F1 (scaffold): 1 sesión."),
  bullet("F2 (segmentos): 1 sesión."),
  bullet("F3 (email real): 1 sesión + 1 día de DNS warm-up."),
  bullet("F4 (WhatsApp): 2 sesiones + ~5–10 días hábiles de aprobación de templates Meta."),
  bullet("F5–F7: 1 sesión cada una."),
  p(""),
  p(
    "Total mínimo a producción multicanal: ~3–4 semanas calendario, asumiendo provisión rápida de credenciales."
  ),
];

// ─────────────────────────────────────────────────────────────────────────────
// 12. FUENTES
// ─────────────────────────────────────────────────────────────────────────────

const fuentes = [
  h1("12. Fuentes consultadas"),
  h2("Políticas de proveedores"),
  new Paragraph({
    children: [
      new TextRun("· WhatsApp Business Messaging Policy — "),
      link("business.whatsapp.com/policy", "https://business.whatsapp.com/policy"),
    ],
    spacing: { after: 80 },
  }),
  new Paragraph({
    children: [
      new TextRun("· WhatsApp Cloud API & Government Bodies (360dialog docs) — "),
      link("docs.360dialog.com", "https://docs.360dialog.com/docs/waba-basics/waba-for-government-agencies"),
    ],
    spacing: { after: 80 },
  }),
  new Paragraph({
    children: [
      new TextRun("· Resend Acceptable Use Policy — "),
      link("resend.com/legal/acceptable-use", "https://resend.com/legal/acceptable-use"),
    ],
    spacing: { after: 80 },
  }),
  new Paragraph({
    children: [
      new TextRun("· Brevo Anti-spam Policy — "),
      link("brevo.com/legal/antispampolicy", "https://www.brevo.com/legal/antispampolicy/"),
    ],
    spacing: { after: 80 },
  }),

  h2("Pricing y comparativas"),
  new Paragraph({
    children: [
      new TextRun("· Email API pricing 2026 (Resend/SendGrid/Postmark) — "),
      link("buildmvpfast.com/api-costs/email", "https://www.buildmvpfast.com/api-costs/email"),
    ],
    spacing: { after: 80 },
  }),
  new Paragraph({
    children: [
      new TextRun("· WhatsApp API pricing 2026 — "),
      link("engagelab.com", "https://www.engagelab.com/blog/whatsapp-business-api-pricing"),
    ],
    spacing: { after: 80 },
  }),
  new Paragraph({
    children: [
      new TextRun("· Twilio vs 360dialog comparison — "),
      link("kommunicate.io", "https://www.kommunicate.io/blog/twilio-vs-360dialog-a-comparison/"),
    ],
    spacing: { after: 80 },
  }),
  new Paragraph({
    children: [
      new TextRun("· SMS API comparison Twilio/Plivo/Vonage — "),
      link("buildmvpfast.com/api-costs/sms", "https://www.buildmvpfast.com/api-costs/sms"),
    ],
    spacing: { after: 80 },
  }),
  new Paragraph({
    children: [
      new TextRun("· Argentina SMS pricing — "),
      link("sent.dm", "https://www.sent.dm/resources/argentina-sms-pricing"),
    ],
    spacing: { after: 80 },
  }),
  new Paragraph({
    children: [
      new TextRun("· 360nrs precios Argentina — "),
      link("360nrs.com", "https://en.360nrs.com/prices/argentina"),
    ],
    spacing: { after: 80 },
  }),
  new Paragraph({
    children: [
      new TextRun("· Telnyx vs Twilio — "),
      link("telnyx.com", "https://telnyx.com/resources/telnyx-vs-twilio-which-voice-api-is-better"),
    ],
    spacing: { after: 80 },
  }),
  new Paragraph({
    children: [
      new TextRun("· AI Voice Agents 2026 pricing — "),
      link("retellai.com", "https://www.retellai.com/blog/ai-voice-agent-pricing-full-cost-breakdown-platform-comparison-roi-analysis"),
    ],
    spacing: { after: 80 },
  }),

  h2("Social listening"),
  new Paragraph({
    children: [
      new TextRun("· Brandwatch (home) — "),
      link("brandwatch.com", "https://www.brandwatch.com/"),
    ],
    spacing: { after: 80 },
  }),
  new Paragraph({
    children: [
      new TextRun("· Brandwatch Iris AI — "),
      link("brandwatch.com/products/iris-ai", "https://www.brandwatch.com/products/iris-ai/"),
    ],
    spacing: { after: 80 },
  }),
  new Paragraph({
    children: [
      new TextRun("· Brandwatch — Social listening for government (guía) — "),
      link("brandwatch.com/guides/social-listening-for-government-best-practices", "https://www.brandwatch.com/guides/social-listening-for-government-best-practices/"),
    ],
    spacing: { after: 80 },
  }),
  new Paragraph({
    children: [
      new TextRun("· Brandwatch vs Meltwater vs Talkwalker (Syncly) — "),
      link("syncly.app", "https://syncly.app/blog/brandwatch-vs-meltwater-vs-talkwalker"),
    ],
    spacing: { after: 80 },
  }),
  new Paragraph({
    children: [
      new TextRun("· Brandwatch pricing on Vendr — "),
      link("vendr.com/marketplace/brandwatch", "https://www.vendr.com/marketplace/brandwatch"),
    ],
    spacing: { after: 80 },
  }),

  h2("Open source"),
  new Paragraph({
    children: [
      new TextRun("· Listmonk — "),
      link("listmonk.app", "https://listmonk.app/"),
    ],
    spacing: { after: 80 },
  }),
  new Paragraph({
    children: [
      new TextRun("· Chatwoot — "),
      link("github.com/chatwoot/chatwoot", "https://github.com/chatwoot/chatwoot"),
    ],
    spacing: { after: 80 },
  }),
  new Paragraph({
    children: [
      new TextRun("· Baileys — "),
      link("github.com/whiskeysockets/Baileys", "https://github.com/whiskeysockets/Baileys"),
    ],
    spacing: { after: 80 },
  }),
  new Paragraph({
    children: [
      new TextRun("· Evolution API — "),
      link("github.com/EvolutionAPI/evolution-api", "https://github.com/EvolutionAPI/evolution-api"),
    ],
    spacing: { after: 80 },
  }),
  new Paragraph({
    children: [
      new TextRun("· Formbricks — "),
      link("github.com/formbricks/formbricks", "https://github.com/formbricks/formbricks"),
    ],
    spacing: { after: 80 },
  }),
  new Paragraph({
    children: [
      new TextRun("· SurveyJS — "),
      link("github.com/surveyjs/survey-library", "https://github.com/surveyjs/survey-library"),
    ],
    spacing: { after: 80 },
  }),
  new Paragraph({
    children: [
      new TextRun("· Typebot vs Botpress — "),
      link("openalternative.co", "https://openalternative.co/compare/botpress/vs/typebot"),
    ],
    spacing: { after: 80 },
  }),
  new Paragraph({
    children: [
      new TextRun("· Awesome Political Tech list — "),
      link("github.com/trozzelle/awesome-political-tech", "https://github.com/trozzelle/awesome-political-tech"),
    ],
    spacing: { after: 80 },
  }),

  h2("Investigación académica"),
  new Paragraph({
    children: [
      new TextRun("· LLM-Assisted Thematic Analysis (arXiv 2026) — "),
      link("arxiv.org/2511.14528", "https://arxiv.org/html/2511.14528v1"),
    ],
    spacing: { after: 80 },
  }),
  new Paragraph({
    children: [
      new TextRun("· Qualitative Coding via Open-Source LLMs (CHI 2026) — "),
      link("dl.acm.org/10.1145/3772363.3798320", "https://dl.acm.org/doi/10.1145/3772363.3798320"),
    ],
    spacing: { after: 80 },
  }),
  new Paragraph({
    children: [
      new TextRun("· Few-shot classification of survey responses (arXiv 2025) — "),
      link("arxiv.org/2508.19836", "https://arxiv.org/pdf/2508.19836"),
    ],
    spacing: { after: 80 },
  }),
];

// ─────────────────────────────────────────────────────────────────────────────
// DOCUMENT
// ─────────────────────────────────────────────────────────────────────────────

const doc = new Document({
  creator: "Severo Tronador",
  title: "Severo Tronador — Research técnico",
  description: "Plan, arquitectura y comparativa de proveedores para plataforma de contactación e investigación social",
  styles: {
    default: { document: { run: { font: "Calibri", size: 22 } } },
    paragraphStyles: [
      {
        id: "Heading1",
        name: "Heading 1",
        basedOn: "Normal",
        next: "Normal",
        quickFormat: true,
        run: { size: 36, bold: true, font: "Calibri", color: BRAND },
        paragraph: { spacing: { before: 360, after: 200 }, outlineLevel: 0 },
      },
      {
        id: "Heading2",
        name: "Heading 2",
        basedOn: "Normal",
        next: "Normal",
        quickFormat: true,
        run: { size: 28, bold: true, font: "Calibri", color: BRAND },
        paragraph: { spacing: { before: 280, after: 160 }, outlineLevel: 1 },
      },
      {
        id: "Heading3",
        name: "Heading 3",
        basedOn: "Normal",
        next: "Normal",
        quickFormat: true,
        run: { size: 24, bold: true, font: "Calibri", color: SUBTLE },
        paragraph: { spacing: { before: 220, after: 120 }, outlineLevel: 2 },
      },
    ],
  },
  numbering: {
    config: [
      {
        reference: "bullets",
        levels: [
          {
            level: 0,
            format: LevelFormat.BULLET,
            text: "•",
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } },
          },
          {
            level: 1,
            format: LevelFormat.BULLET,
            text: "◦",
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 1440, hanging: 360 } } },
          },
        ],
      },
      {
        reference: "numbers",
        levels: [
          {
            level: 0,
            format: LevelFormat.DECIMAL,
            text: "%1.",
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } },
          },
        ],
      },
    ],
  },
  sections: [
    {
      properties: {
        page: {
          size: { width: 12240, height: 15840 },
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
        },
      },
      headers: {
        default: new Header({
          children: [
            new Paragraph({
              alignment: AlignmentType.RIGHT,
              children: [
                new TextRun({
                  text: "Severo Tronador · Research técnico",
                  size: 18,
                  color: SUBTLE,
                }),
              ],
            }),
          ],
        }),
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              tabStops: [
                { type: TabStopType.RIGHT, position: TabStopPosition.MAX },
              ],
              children: [
                new TextRun({
                  text: "Mayo 2026",
                  size: 18,
                  color: SUBTLE,
                }),
                new TextRun({ text: "\tPágina " }),
                new TextRun({ children: [PageNumber.CURRENT] }),
                new TextRun(" de "),
                new TextRun({ children: [PageNumber.TOTAL_PAGES] }),
              ],
            }),
          ],
        }),
      },
      children: [
        ...cover,
        ...toc,
        ...resumen,
        pageBreak(),
        ...contexto,
        pageBreak(),
        ...arquitectura,
        pageBreak(),
        ...datos,
        pageBreak(),
        ...providers,
        pageBreak(),
        ...opensource,
        pageBreak(),
        ...innovacion,
        pageBreak(),
        ...stackPorFase,
        pageBreak(),
        ...legal,
        pageBreak(),
        ...riesgos,
        pageBreak(),
        ...proximos,
        pageBreak(),
        ...fuentes,
      ],
    },
  ],
});

const outDir = path.resolve(__dirname, "..", "docs");
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, "SEVERO_TRONADOR_Research.docx");

Packer.toBuffer(doc).then((buffer) => {
  fs.writeFileSync(outPath, buffer);
  console.log("✓ Written:", outPath);
  console.log("  Size:", (buffer.length / 1024).toFixed(1), "KB");
});
