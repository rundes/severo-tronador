import { describe, it, expect, afterEach } from "vitest";
import { getConnectorConfig, configFieldStatus } from "@/lib/connectors/config";

afterEach(() => { delete process.env.RESEND_API_KEY; delete process.env.RESEND_FROM; });

describe("connector config (sin Supabase)", () => {
  it("getConnectorConfig devuelve defaults de env", async () => {
    process.env.RESEND_API_KEY = "re_env";
    const cfg = await getConnectorConfig("resend");
    expect(cfg.RESEND_API_KEY).toBe("re_env");
  });

  it("configFieldStatus marca source env/none sin exponer valores", async () => {
    process.env.RESEND_API_KEY = "re_secreto";
    const fields = await configFieldStatus("resend");
    const apiKey = fields.find((f) => f.key === "RESEND_API_KEY")!;
    expect(apiKey.hasValue).toBe(true);
    expect(apiKey.source).toBe("env");
    expect(JSON.stringify(fields)).not.toContain("re_secreto");
  });
});
