import { describe, it, expect, beforeAll } from "vitest";
import { AD_FORMATS, type AdFormat } from "@/lib/meta-ads";

beforeAll(() => {
  delete process.env.META_ACCESS_TOKEN;
  delete process.env.META_AD_ACCOUNT_ID;
  delete process.env.META_PAGE_ID;
});

describe("AD_FORMATS", () => {
  it("incluye los placements clave y no tiene duplicados", () => {
    expect(AD_FORMATS).toContain("MOBILE_FEED_STANDARD");
    expect(AD_FORMATS).toContain("INSTAGRAM_STORY");
    expect(AD_FORMATS).toContain("INSTAGRAM_REELS");
    expect(new Set(AD_FORMATS).size).toBe(AD_FORMATS.length);
  });
});
