// PDF de campaña (Plan 03 F6.1). React-PDF document que rinde server-side
// los datos agregados de una campaña para compartir con stakeholders
// externos sin acceso al panel.
//
// Sin imagenes raster: solo texto + tablas + barras de progreso CSS.

import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";
import type { Campaign, Envio } from "@/lib/campaigns";

const NAVY = "#2A3F66";
const MUSTARD = "#C8A248";
const ZINC_500 = "#71717a";
const ZINC_200 = "#e4e4e7";
const ZINC_50 = "#fafafa";

// Geist Sans no está disponible default en react-pdf; usamos las fuentes
// integradas Helvetica para portabilidad.

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: "Helvetica", color: "#18181b" },
  header: { marginBottom: 24, borderBottomWidth: 1, borderBottomColor: ZINC_200, paddingBottom: 12 },
  kicker: { fontSize: 8, color: MUSTARD, letterSpacing: 2, textTransform: "uppercase", marginBottom: 6 },
  title: { fontSize: 20, fontFamily: "Helvetica-Bold", color: NAVY, marginBottom: 4 },
  subtitle: { fontSize: 10, color: ZINC_500 },
  section: { marginTop: 20 },
  sectionLabel: { fontSize: 8, color: ZINC_500, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 8, fontFamily: "Helvetica-Bold" },
  kpiRow: { flexDirection: "row", gap: 12 },
  kpiCard: { flex: 1, borderWidth: 1, borderColor: ZINC_200, padding: 10, borderRadius: 4 },
  kpiValue: { fontSize: 18, fontFamily: "Helvetica-Bold", color: NAVY, marginBottom: 4 },
  kpiLabel: { fontSize: 7, color: ZINC_500, textTransform: "uppercase", letterSpacing: 1 },
  table: { borderWidth: 1, borderColor: ZINC_200, borderRadius: 4 },
  tableHead: { flexDirection: "row", backgroundColor: ZINC_50, padding: 6, borderBottomWidth: 1, borderBottomColor: ZINC_200 },
  tableRow: { flexDirection: "row", padding: 6, borderBottomWidth: 0.5, borderBottomColor: ZINC_200 },
  th: { fontSize: 7, color: ZINC_500, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 1 },
  td: { fontSize: 9 },
  messageBox: { borderWidth: 1, borderColor: ZINC_200, borderRadius: 4, padding: 12, backgroundColor: ZINC_50 },
  messageLabel: { fontSize: 7, color: ZINC_500, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 },
  messageBody: { fontSize: 9, lineHeight: 1.4 },
  footer: { position: "absolute", bottom: 24, left: 40, right: 40, fontSize: 7, color: ZINC_500, textAlign: "center" },
  bar: { height: 6, backgroundColor: ZINC_200, borderRadius: 2, overflow: "hidden" },
  barFill: { height: 6, backgroundColor: NAVY },
});

interface CampaignPdfProps {
  campaign: Campaign;
  template?: { nombre: string; asunto?: string | null; cuerpo: string } | null;
  responses: number;
  sampleEnvio?: Envio | null;
  generatedAt: string;
  variantBreakdown?: {
    id: string;
    label?: string;
    sent: number;
    responses: number;
    responseRate: number;
  }[];
}

function pct(value: number, total: number): string {
  if (total === 0) return "0%";
  return `${Math.round((value / total) * 100)}%`;
}

function pctNumber(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

export function CampaignPdfDocument({
  campaign,
  template,
  responses,
  sampleEnvio,
  generatedAt,
  variantBreakdown = [],
}: CampaignPdfProps) {
  const { metrics } = campaign;
  const responseRate = metrics.sent > 0 ? responses / metrics.sent : 0;

  return (
    <Document
      title={`Tronador · ${campaign.nombre}`}
      author="Centro de Estudios Políticos y Electorales"
    >
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.kicker}>Tronador · Reporte de campaña</Text>
          <Text style={styles.title}>{campaign.nombre}</Text>
          <Text style={styles.subtitle}>
            {channelLabel(campaign.channel)} · creada{" "}
            {new Date(campaign.createdAt).toLocaleString("es-AR")} ·{" "}
            estado {campaign.estado}
          </Text>
        </View>

        {/* KPIs */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Resumen ejecutivo</Text>
          <View style={styles.kpiRow}>
            <KpiCard label="Audiencia" value={metrics.total.toString()} />
            <KpiCard label="Enviados" value={metrics.sent.toString()} />
            <KpiCard label="Respuestas" value={responses.toString()} sub={pctNumber(responseRate)} />
            <KpiCard label="Fallidos" value={metrics.failed.toString()} />
            <KpiCard label="Omitidos" value={metrics.skipped.toString()} />
          </View>
        </View>

        {/* Mensaje */}
        {template && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Mensaje</Text>
            <View style={styles.messageBox}>
              <Text style={styles.messageLabel}>Plantilla: {template.nombre}</Text>
              {template.asunto && (
                <Text style={{ fontFamily: "Helvetica-Bold", marginBottom: 6 }}>
                  Asunto: {template.asunto}
                </Text>
              )}
              <Text style={styles.messageBody}>{template.cuerpo}</Text>
            </View>
          </View>
        )}

        {/* A/B variant breakdown */}
        {variantBreakdown.length >= 2 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>A/B testing</Text>
            <View style={styles.table}>
              <View style={styles.tableHead}>
                <Text style={[styles.th, { flex: 1 }]}>Variante</Text>
                <Text style={[styles.th, { width: 60, textAlign: "right" }]}>Enviados</Text>
                <Text style={[styles.th, { width: 60, textAlign: "right" }]}>Respuestas</Text>
                <Text style={[styles.th, { width: 60, textAlign: "right" }]}>RR</Text>
              </View>
              {variantBreakdown.map((v) => (
                <View key={v.id} style={styles.tableRow}>
                  <Text style={[styles.td, { flex: 1 }]}>
                    {v.id}
                    {v.label ? ` · ${v.label}` : ""}
                  </Text>
                  <Text style={[styles.td, { width: 60, textAlign: "right" }]}>{v.sent}</Text>
                  <Text style={[styles.td, { width: 60, textAlign: "right" }]}>{v.responses}</Text>
                  <Text style={[styles.td, { width: 60, textAlign: "right" }]}>
                    {pctNumber(v.responseRate)}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Salud de envío */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Distribución de envíos</Text>
          <View style={{ gap: 6 }}>
            <Row label="Enviados" value={metrics.sent} total={metrics.total} />
            <Row label="Omitidos" value={metrics.skipped} total={metrics.total} />
            <Row label="Fallidos" value={metrics.failed} total={metrics.total} />
          </View>
        </View>

        {/* Muestra */}
        {sampleEnvio && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Ejemplo de envío</Text>
            <View style={styles.messageBox}>
              <Text style={{ fontFamily: "Helvetica-Bold" }}>
                {sampleEnvio.nombre} ({sampleEnvio.dni})
              </Text>
              <Text style={{ marginTop: 4, color: ZINC_500 }}>
                Destino: {sampleEnvio.destino}
              </Text>
              <Text style={{ marginTop: 2, color: ZINC_500 }}>
                Estado: {sampleEnvio.estado}
                {sampleEnvio.delivery ? ` (${sampleEnvio.delivery})` : ""}
              </Text>
            </View>
          </View>
        )}

        {/* Footer */}
        <Text style={styles.footer} fixed>
          Generado el {generatedAt} · Centro de Estudios Políticos y
          Electorales · cpelectoral.org · Tronador
        </Text>
      </Page>
    </Document>
  );
}

function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <View style={styles.kpiCard}>
      <Text style={styles.kpiValue}>{value}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
      {sub && (
        <Text style={{ fontSize: 7, color: MUSTARD, marginTop: 2, fontFamily: "Helvetica-Bold" }}>
          {sub}
        </Text>
      )}
    </View>
  );
}

function Row({ label, value, total }: { label: string; value: number; total: number }) {
  const percentage = total === 0 ? 0 : (value / total) * 100;
  return (
    <View>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 2 }}>
        <Text style={{ fontSize: 9 }}>{label}</Text>
        <Text style={{ fontSize: 9, color: ZINC_500 }}>
          {value} ({pct(value, total)})
        </Text>
      </View>
      <View style={styles.bar}>
        <View style={[styles.barFill, { width: `${percentage}%` }]} />
      </View>
    </View>
  );
}

function channelLabel(channel: string): string {
  switch (channel) {
    case "email":
      return "Email";
    case "whatsapp":
      return "WhatsApp";
    case "sms":
      return "SMS";
    case "voice":
      return "Voz";
    default:
      return channel;
  }
}
