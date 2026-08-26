import { describe, it, expect } from "vitest";
import { metricsLine, commentsSection } from "@/lib/daily-report";
import type { AccountMetrics } from "@/lib/monitor-metrics";

const base: AccountMetrics = {
  handle: "@ferrooficial",
  category: "organizacion",
  followers: 136000,
  amplificacion: 0.04,
  adhesion: 0.002,
  densidad: 0.5,
  comentarios: 41,
  comentaristas: 30,
  muestraComentarios: [
    { autor: "c1", text: "vamos ferro", at: "2026-08-25T13:00:00.000Z" },
    { autor: "c2", text: "aguante", at: "2026-08-25T13:05:00.000Z" },
  ],
  piezas: 3,
  ultimaActividad: "2026-08-26T09:00:00.000Z",
  historiasVivas: 2,
  ultimaPieza: { url: "https://www.instagram.com/p/BBB/", text: "carrusel del domingo", likeCount: 306, at: "2026-08-25T12:00:00.000Z" },
};

describe("metricsLine", () => {
  it("suma comentarios y densidad en porcentaje", () => {
    expect(metricsLine(base)).toBe(
      '- @ferrooficial [organizacion] seg:136000 amp:0.04 adh:0.002 com:41 dens:50% piezas:3 hist:2 última:2026-08-26 última pieza: "carrusel del domingo" (306 likes)',
    );
  });
  it("sin datos usa s/d", () => {
    const m: AccountMetrics = { ...base, amplificacion: null, adhesion: null, densidad: null, comentarios: 0, ultimaActividad: null, ultimaPieza: null };
    expect(metricsLine(m)).toBe("- @ferrooficial [organizacion] seg:136000 amp:s/d adh:s/d com:0 dens:s/d piezas:3 hist:2 última:s/d");
  });
});

describe("commentsSection", () => {
  it("una lista por cuenta con autores anonimizados", () => {
    expect(commentsSection([base])).toBe(
      "### @ferrooficial (41 comentarios, 30 comentaristas)\n- [c1] vamos ferro\n- [c2] aguante",
    );
  });
  it("cuentas sin comentarios se omiten", () => {
    expect(commentsSection([{ ...base, muestraComentarios: [] }])).toBe("(sin comentarios colectados)");
  });
  it("como máximo 6 cuentas, ordenadas por cantidad de comentarios", () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ ...base, handle: `cuenta${i}`, comentarios: i }));
    const out = commentsSection(many);
    expect(out.match(/^### /gm)).toHaveLength(6);
    expect(out.startsWith("### @cuenta7 (7 comentarios")).toBe(true);
  });
});
