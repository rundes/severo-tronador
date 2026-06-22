import { describe, it, expect } from "vitest";
import { extractTopics, type TopicConfig } from "@/lib/topics";
import type { ListenItem } from "@/lib/connectors/types";

const NOW = Date.UTC(2026, 4, 26);
const DAY = 24 * 60 * 60 * 1000;
const iso = (daysAgo: number) => new Date(NOW - daysAgo * DAY).toISOString();

function item(
  text: string,
  daysAgo: number,
  author?: string,
  source = "x-api",
): ListenItem {
  return { source, text, publishedAt: iso(daysAgo), author };
}

const CFG: TopicConfig = {
  windowDays: 7,
  minVolume: 3,
  ratio: 3,
  minAuthors: 2,
  maxTopics: 8,
  maxNgram: 3,
  now: NOW,
};

const labels = (ts: { label: string }[]) => ts.map((t) => t.label);

describe("topics · extractTopics", () => {
  it("no produce ruido de plataforma (https / posted) como tema", () => {
    const items = [
      item("Reunión por el corte de luz en el centro https://x.com/abc", 1, "a1"),
      item("Otro corte de luz, posted ayer https://t.co/zzz", 2, "a2"),
      item("El corte de luz nos tiene cansados https://n.ws/q", 3, "a3"),
    ];
    const got = labels(extractTopics(items, CFG));
    expect(got.some((l) => l.includes("https") || l.includes("posted"))).toBe(false);
    expect(got).toContain("corte de luz");
  });

  it("prefiere la frase sobre el unigrama componente (subsunción)", () => {
    const items = [
      item("corte de luz otra vez", 1, "a1"),
      item("seguimos con el corte de luz", 2, "a2"),
      item("corte de luz en todo el barrio", 3, "a3"),
    ];
    const got = labels(extractTopics(items, CFG));
    expect(got).toContain("corte de luz");
    expect(got).not.toContain("luz");
  });

  it("degrada lo ambiental y marca emergente lo que crece", () => {
    // textos distintos (firmas distintas) para no auto-deduplicar
    const obraRecent = [
      "avanza la obra publica del centro",
      "la obra publica sigue demorada",
      "inauguraron una obra publica nueva",
      "critican el costo de la obra publica",
    ];
    const obraPrior = [
      "comenzo la obra publica prometida",
      "financian otra obra publica mas",
      "la obra publica genera empleo local",
      "debaten sobre cada obra publica",
    ];
    const boletoTexts = [
      "piden boleto estudiantil gratuito",
      "marcha por el boleto estudiantil",
      "prometen boleto estudiantil este año",
      "reclaman boleto estudiantil urgente",
    ];
    const items = [
      // ambiental: presente en reciente Y previa, por muchos autores → no emerge
      ...obraRecent.map((t, k) => item(t, 1, `a${k}`)),
      ...obraPrior.map((t, k) => item(t, 10, `b${k}`)),
      // emergente: sólo en reciente
      ...boletoTexts.map((t, k) => item(t, 2, `c${k}`)),
    ];
    const topics = extractTopics(items, CFG);
    const obra = topics.find((t) => t.label === "obra publica");
    const boleto = topics.find((t) => t.label === "boleto estudiantil");
    expect(boleto?.emerging).toBe(true);
    expect(obra?.emerging).toBe(false);
    // el que crece se ordena antes que el ambiental
    expect(topics[0].label).toBe("boleto estudiantil");
  });

  it("rechaza una palabra amplificada por un solo autor", () => {
    const items = [
      item("regalo numero uno aqui", 1, "spammer"),
      item("regalo numero dos por aca", 2, "spammer"),
      item("regalo numero tres ahora", 3, "spammer"),
      item("regalo numero cuatro hoy", 1, "spammer"),
    ];
    const got = labels(extractTopics(items, CFG));
    expect(got).not.toContain("regalo");
  });

  it("deduplica reposts idénticos antes de contar volumen", () => {
    // mismo texto repetido por 5 cuentas → 1 documento real → bajo minVolume
    const items = ["u1", "u2", "u3", "u4", "u5"].map((au) =>
      item("voten lista cinco siempre", 1, au),
    );
    const got = labels(extractTopics(items, CFG));
    expect(got).not.toContain("voten lista cinco");
    expect(got).not.toContain("voten");
  });

  it("acepta un unigrama fuerte con autores distintos", () => {
    const items = [
      item("la inseguridad crece", 1, "a1"),
      item("otra vez la inseguridad", 2, "a2"),
      item("basta de inseguridad ya", 3, "a3"),
    ];
    const topics = extractTopics(items, CFG);
    const t = topics.find((x) => x.label === "inseguridad");
    expect(t).toBeDefined();
    expect(t?.emerging).toBe(true);
    expect(t?.recent).toBe(3);
  });
});
