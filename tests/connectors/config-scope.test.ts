// Scope por proyecto de la config de conectores (F2.2 del plan de mejoras).
//
// Antes `conector_config` tenía una sola fila por conector para toda la
// organización: el owner de cualquier proyecto pisaba las API keys de todos.
// Ahora hay dos niveles — fila de organización (project_id null, fallback) y
// override del proyecto (lo único que escribe el panel).
import { describe, it, expect, beforeEach, vi } from "vitest";

type Row = Record<string, unknown>;
let rows: Row[] = [];

function makeQuery(pending: Row) {
  const filters: Row = {};
  let nullCol: string | null = null;
  const q = {
    select() {
      return q;
    },
    eq(k: string, v: unknown) {
      filters[k] = v;
      return q;
    },
    is(k: string, v: unknown) {
      if (v === null) nullCol = k;
      return q;
    },
    maybeSingle() {
      const found = rows.find((r) => {
        for (const [k, v] of Object.entries(filters)) if (r[k] !== v) return false;
        if (nullCol && r[nullCol] != null) return false;
        return true;
      });
      return Promise.resolve({ data: found ?? null, error: null });
    },
    upsert(payload: Row) {
      const key = (r: Row) =>
        `${r.connector_id}|${r.project_id ?? "org"}`;
      const i = rows.findIndex((r) => key(r) === key(payload));
      if (i >= 0) rows[i] = { ...rows[i], ...payload };
      else rows.push({ ...payload });
      return Promise.resolve({ data: null, error: null });
    },
    delete() {
      return {
        eq(k: string, v: unknown) {
          filters[k] = v;
          return this;
        },
        then(resolve: (v: unknown) => unknown) {
          rows = rows.filter((r) => {
            for (const [k, v] of Object.entries(filters)) if (r[k] !== v) return true;
            return false;
          });
          return resolve({ data: null, error: null });
        },
      };
    },
  };
  void pending;
  return q;
}

vi.mock("@/lib/db/supabase", () => ({
  dbConfigured: () => true,
  getSupabase: () => ({ from: () => makeQuery({}) }),
}));

// El cifrado real necesita CONFIG_MASTER_KEY; para este test alcanza con una
// identidad que preserve el valor y permita distinguir niveles.
vi.mock("@/lib/crypto", () => ({
  encryptJson: async (v: unknown) => `enc:${String(v)}`,
  decryptJson: async (v: string) => v.replace(/^enc:/, ""),
}));

const P1 = "11111111-1111-1111-1111-111111111111";
const P2 = "22222222-2222-2222-2222-222222222222";

beforeEach(() => {
  rows = [];
  delete process.env.RESEND_API_KEY;
  delete process.env.RESEND_FROM;
});

describe("config de conectores · niveles", () => {
  it("el override del proyecto gana sobre la fila de organización", async () => {
    const { getConnectorConfig, saveConnectorConfig } = await import(
      "@/lib/connectors/config"
    );
    rows.push({
      connector_id: "resend",
      project_id: null,
      config: { RESEND_FROM: "org@tronador.net.ar" },
      enabled: true,
    });
    await saveConnectorConfig("resend", P1, {
      RESEND_FROM: "p1@tronador.net.ar",
    });

    expect((await getConnectorConfig("resend", P1)).RESEND_FROM).toBe(
      "p1@tronador.net.ar",
    );
    // El otro proyecto sigue viendo el fallback de organización.
    expect((await getConnectorConfig("resend", P2)).RESEND_FROM).toBe(
      "org@tronador.net.ar",
    );
  });

  it("guardar en un proyecto no toca la fila de organización ni la de otro", async () => {
    // Era la escalada: cualquier owner pisaba las credenciales de todos.
    const { getConnectorConfig, saveConnectorConfig } = await import(
      "@/lib/connectors/config"
    );
    rows.push({
      connector_id: "resend",
      project_id: null,
      config: { RESEND_API_KEY: "enc:re_org" },
      enabled: true,
    });
    await saveConnectorConfig("resend", P2, { RESEND_API_KEY: "re_p2" });

    const org = rows.find((r) => r.project_id === null)!;
    expect((org.config as Row).RESEND_API_KEY).toBe("enc:re_org");
    expect((await getConnectorConfig("resend", P1)).RESEND_API_KEY).toBe("re_org");
    expect((await getConnectorConfig("resend", P2)).RESEND_API_KEY).toBe("re_p2");
  });

  it("sin proyecto se resuelve sólo el nivel de organización", async () => {
    const { getConnectorConfig, saveConnectorConfig } = await import(
      "@/lib/connectors/config"
    );
    rows.push({
      connector_id: "resend",
      project_id: null,
      config: { RESEND_FROM: "org@tronador.net.ar" },
      enabled: true,
    });
    await saveConnectorConfig("resend", P1, { RESEND_FROM: "p1@tronador.net.ar" });
    expect((await getConnectorConfig("resend")).RESEND_FROM).toBe(
      "org@tronador.net.ar",
    );
  });

  it("borrar la config del proyecto deja intacta la de organización", async () => {
    const { deleteConnectorConfig, getConnectorConfig, saveConnectorConfig } =
      await import("@/lib/connectors/config");
    rows.push({
      connector_id: "resend",
      project_id: null,
      config: { RESEND_FROM: "org@tronador.net.ar" },
      enabled: true,
    });
    await saveConnectorConfig("resend", P1, { RESEND_FROM: "p1@tronador.net.ar" });
    await deleteConnectorConfig("resend", P1);

    expect((await getConnectorConfig("resend", P1)).RESEND_FROM).toBe(
      "org@tronador.net.ar",
    );
  });

  it("borrar la config NO reactiva el conector", async () => {
    // Era la trampa: al desaparecer la fila del proyecto, isEnabled caía al
    // fallback de organización —true cuando no hay fila— y "Borrar config"
    // terminaba reactivando el conector con las credenciales de la org.
    const { deleteConnectorConfig, isEnabled, saveConnectorConfig } =
      await import("@/lib/connectors/config");
    rows.push({
      connector_id: "resend",
      project_id: null,
      config: { RESEND_FROM: "org@tronador.net.ar" },
      enabled: true,
    });
    await saveConnectorConfig("resend", P1, { RESEND_FROM: "p1@tronador.net.ar" });
    expect(await isEnabled("resend", P1)).toBe(true);

    await deleteConnectorConfig("resend", P1);
    expect(await isEnabled("resend", P1)).toBe(false);
    // El resto de los proyectos sigue funcionando con el fallback.
    expect(await isEnabled("resend", P2)).toBe(true);
  });

  it("el toggle del proyecto gana sobre el de organización", async () => {
    const { isEnabled, setEnabled } = await import("@/lib/connectors/config");
    rows.push({
      connector_id: "resend",
      project_id: null,
      config: {},
      enabled: true,
    });
    await setEnabled("resend", P1, false);

    expect(await isEnabled("resend", P1)).toBe(false);
    expect(await isEnabled("resend", P2)).toBe(true);
    expect(await isEnabled("resend")).toBe(true);
  });
});
