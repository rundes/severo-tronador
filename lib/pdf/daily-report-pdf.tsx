// PDF del informe diario: mismo árbol de bloques que el mail y el panel.
// Helvetica (default de react-pdf): sin descarga de fuentes en Vercel.
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import type { DailyReport } from "@/lib/daily-report";
import { parseReportMarkdown, renderableSections, inlineToText, reportTitle, type Block, type Inline } from "@/lib/report-markdown";

const C = { ink: "#18181b", soft: "#3f3f46", muted: "#71717a", border: "#e4e4e7", subtle: "#fafafa", accent: "#4f5bd5", accentSoft: "#eef0fb" };

const s = StyleSheet.create({
  page: { paddingTop: 48, paddingBottom: 56, paddingHorizontal: 48, fontSize: 10.5, color: C.soft, lineHeight: 1.45 },
  eyebrow: { fontSize: 8, letterSpacing: 1.5, color: C.muted, textTransform: "uppercase" },
  title: { fontSize: 20, color: C.ink, marginTop: 4 },
  meta: { fontSize: 9.5, color: C.muted, marginTop: 2 },
  chips: { flexDirection: "row", flexWrap: "wrap", marginTop: 8, marginBottom: 14 },
  chip: { fontSize: 8.5, color: C.soft, borderWidth: 1, borderColor: C.border, borderRadius: 8, paddingVertical: 2, paddingHorizontal: 7, marginRight: 5, marginBottom: 4 },
  hero: { borderWidth: 1, borderColor: C.border, backgroundColor: C.subtle, borderRadius: 6, padding: 10, marginBottom: 12 },
  accentBox: { backgroundColor: C.accentSoft, borderRadius: 6, padding: 10, marginTop: 12 },
  secTitle: { fontSize: 12.5, color: C.ink, marginTop: 14, marginBottom: 5, borderLeftWidth: 2, borderLeftColor: C.accent, paddingLeft: 7 },
  boxTitle: { fontSize: 8, letterSpacing: 1.5, color: C.muted, textTransform: "uppercase", marginBottom: 4 },
  h3: { fontSize: 11, color: C.ink, marginTop: 8, marginBottom: 3 },
  p: { marginBottom: 6 },
  bajada: { fontSize: 12, color: C.ink, lineHeight: 1.5, marginBottom: 12 },
  cards: { flexDirection: "row", flexWrap: "wrap", marginBottom: 10 },
  card: { borderWidth: 1, borderColor: C.border, borderRadius: 6, padding: 8, marginRight: 6, marginBottom: 6, width: 120 },
  cardBig: { fontSize: 17, fontFamily: "Helvetica-Bold", color: C.accent },
  cardBigInk: { fontSize: 16, fontFamily: "Helvetica-Bold", color: C.ink },
  cardLabel: { fontSize: 9, color: C.ink, marginTop: 3 },
  cardNote: { fontSize: 8, color: C.muted, marginTop: 1 },
  callout: { borderLeftWidth: 2, paddingLeft: 8, paddingRight: 8, paddingVertical: 5, marginBottom: 8 },
  calloutLabel: { fontSize: 7.5, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 2 },
  li: { flexDirection: "row", marginBottom: 3 },
  bullet: { width: 12 },
  quote: { borderLeftWidth: 2, borderLeftColor: C.border, backgroundColor: C.subtle, paddingVertical: 5, paddingHorizontal: 9, marginBottom: 6, fontStyle: "italic" as const },
  row: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: C.border },
  th: { flex: 1, padding: 4, fontSize: 8, color: C.muted, textTransform: "uppercase" },
  td: { flex: 1, padding: 4, fontSize: 9.5 },
  hr: { borderBottomWidth: 1, borderBottomColor: C.border, marginVertical: 10 },
  footer: { position: "absolute", bottom: 24, left: 48, right: 48, fontSize: 8, color: C.muted, flexDirection: "row", justifyContent: "space-between" },
});

function InlineText({ text }: { text: Inline[] }) {
  return (
    <Text>
      {text.map((x, i) =>
        x.t === "b" ? <Text key={i} style={{ fontFamily: "Helvetica-Bold", color: C.ink }}>{x.v}</Text>
        : x.t === "i" ? <Text key={i} style={{ fontFamily: "Helvetica-Oblique" }}>{x.v}</Text>
        : x.t === "code" ? <Text key={i} style={{ fontFamily: "Courier" }}>{x.v}</Text>
        : <Text key={i}>{x.v}</Text>,
      )}
    </Text>
  );
}

function BlockView({ b }: { b: Block }) {
  switch (b.t) {
    case "h":
      if (b.level === 1) return null;
      return <Text style={b.level === 2 ? s.secTitle : s.h3}>{inlineToText(b.text)}</Text>;
    case "p":
      return <View style={s.p}><InlineText text={b.text} /></View>;
    case "ul":
    case "ol":
      return (
        <View style={{ marginBottom: 6 }}>
          {b.items.map((it, i) => (
            <View key={i} style={s.li}>
              <Text style={s.bullet}>{b.t === "ol" ? `${i + 1}.` : "•"}</Text>
              <View style={{ flex: 1 }}><InlineText text={it} /></View>
            </View>
          ))}
        </View>
      );
    case "quote":
      return <View style={s.quote}><InlineText text={b.text} /></View>;
    case "table":
      return (
        <View style={{ marginBottom: 8 }}>
          <View style={s.row}>{b.header.map((h, i) => <Text key={i} style={s.th}>{h}</Text>)}</View>
          {b.rows.map((r, ri) => (
            <View key={ri} style={s.row}>{r.map((c, ci) => <Text key={ci} style={s.td}>{c}</Text>)}</View>
          ))}
        </View>
      );
    case "bajada":
      return <View style={s.bajada}><InlineText text={b.text} /></View>;
    case "countdown":
      return (
        <View style={s.cards}>
          {b.items.map((it, i) => (
            <View key={i} style={s.card}>
              <Text style={s.cardBig}>{it.days} días</Text>
              <Text style={s.cardLabel}>{it.label}</Text>
              {it.detail ? <Text style={s.cardNote}>{it.detail}</Text> : null}
            </View>
          ))}
        </View>
      );
    case "kpi":
      return (
        <View style={s.cards}>
          {b.items.map((it, i) => (
            <View key={i} style={s.card}>
              <Text style={s.cardBigInk}>{it.value}</Text>
              <Text style={s.cardLabel}>{it.label}</Text>
              {it.note ? <Text style={s.cardNote}>{it.note}</Text> : null}
            </View>
          ))}
        </View>
      );
    case "callout": {
      const adv = b.kind === "advertencia";
      const line = adv ? "#b45309" : C.accent;
      return (
        <View style={[s.callout, { borderLeftColor: line, backgroundColor: adv ? "#fffbeb" : C.accentSoft }]}>
          <Text style={[s.calloutLabel, { color: line }]}>{adv ? "Advertencia" : "Inferencia"}</Text>
          <InlineText text={b.text} />
        </View>
      );
    }
    case "hr":
      return <View style={s.hr} />;
  }
}

export interface DailyReportPdfInput { report: DailyReport; project: string; zona: string }

export function DailyReportDocument({ report, project, zona }: DailyReportPdfInput) {
  const blocks = parseReportMarkdown(report.markdown);
  const sections = renderableSections(blocks);
  const fecha = new Date(report.at).toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const titulo = reportTitle(report.markdown);
  return (
    <Document title={titulo ? `${project} · ${titulo}` : `Informe de escucha · ${project} · ${report.at.slice(0, 10)}`} author="Tronador">
      <Page size="A4" style={s.page}>
        <Text style={s.eyebrow}>Tronador · Escucha</Text>
        <Text style={s.title}>{titulo || project}</Text>
        <Text style={s.meta}>{titulo ? `${project} · ` : ""}{fecha}{zona ? ` · ${zona}` : ""}</Text>
        <View style={s.chips}>
          <Text style={s.chip}>{report.items24h} menciones 24 h</Text>
          <Text style={s.chip}>{report.items7d} en 7 d</Text>
          {report.pull && <Text style={s.chip}>barrido: {report.pull.total} items</Text>}
        </View>
        {blocks.length === 0 && <Text style={{ color: C.muted }}>Informe sin contenido.</Text>}
        {sections.map((sec, i) => {
          const t = sec.title.toLowerCase();
          if (/resumen ejecutivo/.test(t)) {
            return <View key={i} style={s.hero}><Text style={s.boxTitle}>{sec.title}</Text>{sec.blocks.map((b, j) => <BlockView key={j} b={b} />)}</View>;
          }
          if (/sugerencia operativa/.test(t)) {
            return <View key={i} style={s.accentBox}><Text style={[s.boxTitle, { color: C.accent }]}>{sec.title}</Text>{sec.blocks.map((b, j) => <BlockView key={j} b={b} />)}</View>;
          }
          return (
            <View key={i}>
              {sec.title ? <Text style={s.secTitle}>{sec.title}</Text> : null}
              {sec.blocks.map((b, j) => <BlockView key={j} b={b} />)}
            </View>
          );
        })}
        <View style={s.footer} fixed>
          <Text>Tronador · Escucha · {project}</Text>
          <Text render={({ pageNumber, totalPages }) => `página ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

export async function renderDailyReportPdf(input: DailyReportPdfInput): Promise<Buffer> {
  return renderToBuffer(<DailyReportDocument {...input} />);
}
