import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import {
  createEncuesta,
  updateEncuesta,
  publishEncuesta,
  closeEncuesta,
  getEncuesta,
  getEncuestaBySlug,
  listEncuestas,
  deleteEncuesta,
  _clearEncuestasMem,
} from "@/lib/encuestas";
import {
  addEncuestaResponse,
  listEncuestaResponses,
  aggregate,
  _clearEncRespuestasMem,
} from "@/lib/encuestas/responses";
import { buildSteps, type Question } from "@/lib/encuestas/types";

const P = "00000000-0000-0000-0000-000000000001";

beforeAll(() => {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
});

beforeEach(() => {
  _clearEncuestasMem();
  _clearEncRespuestasMem();
});

const QS: Question[] = [
  { id: "q1", type: "single", label: "¿Cómo estás?", required: true, options: ["Bien", "Mal"] },
  { id: "q2", type: "scale", label: "Nivel 1-5", required: false, min: 1, max: 5 },
  { id: "q3", type: "paragraph", label: "Comentarios", required: false },
];

describe("encuestas · CRUD + publish", () => {
  it("crea, actualiza preguntas y publica con slug", async () => {
    const enc = await createEncuesta(P, { titulo: "Opinión Barrial", descripcion: "test" });
    expect(enc.estado).toBe("borrador");
    expect(enc.slug).toBeNull();

    await updateEncuesta(P, enc.id, { preguntas: QS });
    const pub = await publishEncuesta(P, enc.id);
    expect(pub?.estado).toBe("publicada");
    expect(pub?.slug).toMatch(/^opinion-barrial-[a-f0-9]{6}$/);
    expect(pub?.publishedAt).toBeTruthy();

    const bySlug = await getEncuestaBySlug(pub!.slug!);
    expect(bySlug?.id).toBe(enc.id);

    const closed = await closeEncuesta(P, enc.id);
    expect(closed?.estado).toBe("cerrada");
  });

  it("publicar sin preguntas falla", async () => {
    const enc = await createEncuesta(P, { titulo: "Vacía" });
    await expect(publishEncuesta(P, enc.id)).rejects.toThrow(/al menos una pregunta/);
  });

  it("rechaza single con menos de 2 opciones", async () => {
    const enc = await createEncuesta(P, { titulo: "X" });
    await expect(
      updateEncuesta(P, enc.id, {
        preguntas: [{ id: "a", type: "single", label: "Q", required: true, options: ["solo"] }],
      }),
    ).rejects.toThrow(/2 opciones/);
  });

  it("layout: default minimal, setea stepper, normaliza inválidos", async () => {
    const a = await createEncuesta(P, { titulo: "A" });
    expect(a.layout).toBe("minimal");
    const b = await createEncuesta(P, { titulo: "B", layout: "stepper" });
    expect(b.layout).toBe("stepper");
    const upd = await updateEncuesta(P, b.id, { layout: "inexistente" });
    expect(upd?.layout).toBe("minimal");
  });

  it("stepMode round-trip + buildSteps agrupa", async () => {
    const enc = await createEncuesta(P, { titulo: "Steps", layout: "stepper" });
    const qs: Question[] = [
      { id: "a", type: "text", label: "A", required: false, step: 1 },
      { id: "b", type: "text", label: "B", required: false, step: 1 },
      { id: "c", type: "text", label: "C", required: false, step: 2 },
    ];
    const upd = await updateEncuesta(P, enc.id, { stepMode: "manual", preguntas: qs });
    expect(upd?.stepMode).toBe("manual");

    // one → un paso por pregunta
    expect(buildSteps(qs, "one")).toHaveLength(3);
    // manual → agrupa por step (1: [a,b], 2: [c])
    const groups = buildSteps(qs, "manual");
    expect(groups).toHaveLength(2);
    expect(groups[0].map((q) => q.id)).toEqual(["a", "b"]);
    expect(groups[1].map((q) => q.id)).toEqual(["c"]);
  });

  it("descripción por pregunta round-trip", async () => {
    const enc = await createEncuesta(P, { titulo: "Desc" });
    await updateEncuesta(P, enc.id, {
      preguntas: [
        { id: "x", type: "text", label: "Nombre", description: "Tu nombre completo", required: false },
      ],
    });
    const full = await getEncuesta(P, enc.id);
    expect(full?.preguntas[0].description).toBe("Tu nombre completo");
  });

  it("imágenes solo aceptan http/https; eliminar borra la encuesta", async () => {
    const enc = await createEncuesta(P, { titulo: "Img" });
    const upd = await updateEncuesta(P, enc.id, {
      imageUrl: "https://x/cover.jpg",
      imageEndUrl: "javascript:alert(1)", // inválida → null
    });
    expect(upd?.imageUrl).toBe("https://x/cover.jpg");
    expect(upd?.imageEndUrl).toBeNull();

    await deleteEncuesta(P, enc.id);
    expect(await getEncuesta(P, enc.id)).toBeNull();
  });

  it("aísla por proyecto", async () => {
    await createEncuesta(P, { titulo: "Mía" });
    expect(await listEncuestas("otro-proj")).toHaveLength(0);
    expect(await listEncuestas(P)).toHaveLength(1);
  });
});

describe("encuestas · respuestas + agregación", () => {
  it("guarda respuestas, dedupe por token y agrega por tipo", async () => {
    const enc = await createEncuesta(P, { titulo: "Agg" });
    await updateEncuesta(P, enc.id, { preguntas: QS });
    const full = await getEncuesta(P, enc.id);

    await addEncuestaResponse({
      projectId: P, encuestaId: enc.id, source: "publica",
      answers: [
        { questionId: "q1", label: "¿Cómo estás?", type: "single", value: "Bien" },
        { questionId: "q2", label: "Nivel 1-5", type: "scale", value: 4 },
        { questionId: "q3", label: "Comentarios", type: "paragraph", value: "todo ok" },
      ],
    });
    await addEncuestaResponse({
      projectId: P, encuestaId: enc.id, source: "email", dni: "123", token: "tok-A",
      answers: [
        { questionId: "q1", label: "¿Cómo estás?", type: "single", value: "Mal" },
        { questionId: "q2", label: "Nivel 1-5", type: "scale", value: 2 },
      ],
    });
    // Duplicado por token → null.
    const dup = await addEncuestaResponse({
      projectId: P, encuestaId: enc.id, source: "email", dni: "123", token: "tok-A",
      answers: [],
    });
    expect(dup).toBeNull();

    const resp = await listEncuestaResponses(P, enc.id);
    expect(resp).toHaveLength(2);

    const agg = aggregate(full!, resp);
    const q1 = agg.find((a) => a.questionId === "q1");
    expect(q1?.type).toBe("single");
    if (q1?.type === "single") {
      expect(q1.total).toBe(2);
      expect(q1.counts.find((c) => c.option === "Bien")?.n).toBe(1);
      expect(q1.counts.find((c) => c.option === "Mal")?.n).toBe(1);
    }
    const q2 = agg.find((a) => a.questionId === "q2");
    if (q2?.type === "scale") {
      expect(q2.average).toBe(3); // (4+2)/2
      expect(q2.distribution.find((d) => d.value === 4)?.n).toBe(1);
    }
    const q3 = agg.find((a) => a.questionId === "q3");
    if (q3?.type === "paragraph") {
      expect(q3.values).toEqual(["todo ok"]);
    }
  });
});
