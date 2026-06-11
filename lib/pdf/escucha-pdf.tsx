// PDF de informe de escucha. Lista los ítems marcados por el usuario
// con texto, fuente, autor y sentimiento. Patrón idéntico a campaign-pdf.tsx.
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";
import type { Marca } from "@/lib/escucha-marcas";

const NAVY = "#2A3F66";
const INDIGO = "#3730a3"; // aprox oklch(52% 0.13 255) en hex
const ZINC_500 = "#71717a";
const ZINC_200 = "#e4e4e7";
const ZINC_50 = "#fafafa";
const AMBER_100 = "#fef3c7";
const AMBER_800 = "#92400e";
const EMERALD_100 = "#d1fae5";
const EMERALD_800 = "#065f46";
const RED_100 = "#fee2e2";
const RED_800 = "#991b1b";

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 10,
    fontFamily: "Helvetica",
    color: "#18181b",
  },
  header: {
    marginBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: ZINC_200,
    paddingBottom: 12,
  },
  kicker: {
    fontSize: 8,
    color: INDIGO,
    letterSpacing: 2,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  title: {
    fontSize: 20,
    fontFamily: "Helvetica-Bold",
    color: NAVY,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 10,
    color: ZINC_500,
  },
  section: {
    marginTop: 16,
  },
  sectionLabel: {
    fontSize: 8,
    color: ZINC_500,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginBottom: 10,
    fontFamily: "Helvetica-Bold",
  },
  itemCard: {
    borderWidth: 1,
    borderColor: ZINC_200,
    borderRadius: 4,
    padding: 10,
    marginBottom: 8,
    backgroundColor: ZINC_50,
  },
  itemText: {
    fontSize: 10,
    lineHeight: 1.5,
    marginBottom: 6,
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    alignItems: "center",
  },
  badge: {
    fontSize: 7,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
    textTransform: "uppercase",
    letterSpacing: 1,
    fontFamily: "Helvetica-Bold",
  },
  badgePos: {
    backgroundColor: EMERALD_100,
    color: EMERALD_800,
  },
  badgeNeg: {
    backgroundColor: RED_100,
    color: RED_800,
  },
  badgeNeu: {
    backgroundColor: ZINC_200,
    color: ZINC_500,
  },
  badgeTopic: {
    backgroundColor: AMBER_100,
    color: AMBER_800,
  },
  metaText: {
    fontSize: 8,
    color: ZINC_500,
  },
  emptyBox: {
    borderWidth: 1,
    borderColor: ZINC_200,
    borderRadius: 4,
    padding: 24,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 12,
    color: ZINC_500,
  },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 40,
    right: 40,
    fontSize: 7,
    color: ZINC_500,
    textAlign: "center",
  },
  kindLabel: {
    fontSize: 7,
    color: ZINC_500,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 4,
  },
});

export interface EscuchaInformeMeta {
  projectName?: string;
  generatedAt: string;
}

interface EscuchaInformeDocumentProps {
  marcas: Marca[];
  meta: EscuchaInformeMeta;
}

function sentimentBadgeStyle(sentiment: string | undefined) {
  if (sentiment === "positive") return styles.badgePos;
  if (sentiment === "negative") return styles.badgeNeg;
  return styles.badgeNeu;
}

function sentimentLabel(sentiment: string | undefined): string {
  if (sentiment === "positive") return "pos";
  if (sentiment === "negative") return "neg";
  return "neu";
}

export function EscuchaInformeDocument({
  marcas,
  meta,
}: EscuchaInformeDocumentProps) {
  const feedItems = marcas.filter((m) => m.kind === "feed");
  const topicItems = marcas.filter((m) => m.kind === "topic");

  return (
    <Document
      title={`Tronador · Informe de Escucha${meta.projectName ? ` · ${meta.projectName}` : ""}`}
      author="Centro de Estudios Políticos y Electorales"
    >
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.kicker}>Tronador · Informe de escucha</Text>
          <Text style={styles.title}>
            Contenido marcado{meta.projectName ? ` · ${meta.projectName}` : ""}
          </Text>
          <Text style={styles.subtitle}>
            {marcas.length} ítem{marcas.length !== 1 ? "s" : ""} marcado
            {marcas.length !== 1 ? "s" : ""} · generado el {meta.generatedAt}
          </Text>
        </View>

        {marcas.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>Sin contenido marcado</Text>
          </View>
        ) : (
          <>
            {/* Feed items */}
            {feedItems.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>
                  Menciones ({feedItems.length})
                </Text>
                {feedItems.map((m, i) => {
                  const p = m.payload;
                  const text = typeof p.text === "string" ? p.text : "";
                  const source = typeof p.source === "string" ? p.source : "";
                  const author = typeof p.author === "string" ? p.author : "";
                  const sentiment =
                    typeof p.sentiment === "string" ? p.sentiment : undefined;
                  const url = typeof p.url === "string" ? p.url : "";
                  return (
                    <View key={i} style={styles.itemCard}>
                      <Text style={styles.itemText}>{text}</Text>
                      <View style={styles.metaRow}>
                        <Text
                          style={[
                            styles.badge,
                            sentimentBadgeStyle(sentiment),
                          ]}
                        >
                          {sentimentLabel(sentiment)}
                        </Text>
                        {source ? (
                          <Text style={styles.metaText}>{source}</Text>
                        ) : null}
                        {author ? (
                          <Text style={styles.metaText}>· {author}</Text>
                        ) : null}
                        {url ? (
                          <Text style={styles.metaText}>{url}</Text>
                        ) : null}
                      </View>
                    </View>
                  );
                })}
              </View>
            )}

            {/* Topic items */}
            {topicItems.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>
                  Temas emergentes ({topicItems.length})
                </Text>
                {topicItems.map((m, i) => {
                  const p = m.payload;
                  const label =
                    typeof p.label === "string" ? p.label : m.itemKey;
                  const recent =
                    typeof p.recent === "number" ? p.recent : null;
                  const prior =
                    typeof p.prior === "number" ? p.prior : null;
                  return (
                    <View key={i} style={styles.itemCard}>
                      <Text style={styles.kindLabel}>Tema emergente</Text>
                      <Text
                        style={[
                          styles.itemText,
                          { fontFamily: "Helvetica-Bold", fontSize: 12 },
                        ]}
                      >
                        {label}
                      </Text>
                      {recent !== null && prior !== null && (
                        <View style={styles.metaRow}>
                          <Text style={[styles.badge, styles.badgeTopic]}>
                            {recent} esta semana · {prior} previa
                          </Text>
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            )}
          </>
        )}

        {/* Footer */}
        <Text style={styles.footer} fixed>
          Generado el {meta.generatedAt} · Centro de Estudios Políticos y
          Electorales · cpelectoral.org · Tronador
        </Text>
      </Page>
    </Document>
  );
}
