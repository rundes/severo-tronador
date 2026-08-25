import { describe, it, expect, vi } from "vitest";
import { resolveStreamUrl } from "../tools/stream-url.mjs";

describe("resolveStreamUrl", () => {
  it("radio → la misma url sin ejecutar nada", async () => {
    const exec = vi.fn();
    await expect(resolveStreamUrl({ kind: "radio", url: "https://s/x.mp3" }, exec)).resolves.toEqual({ ok: true, url: "https://s/x.mp3" });
    expect(exec).not.toHaveBeenCalled();
  });

  it("youtube/kick → yt-dlp -g devuelve la url del vivo", async () => {
    const exec = vi.fn(async () => ({ stdout: "https://manifest.googlevideo.com/x.m3u8\n", code: 0 }));
    const r = await resolveStreamUrl({ kind: "youtube", url: "https://www.youtube.com/@c/live" }, exec);
    expect(r).toEqual({ ok: true, url: "https://manifest.googlevideo.com/x.m3u8" });
    expect(exec).toHaveBeenCalledWith("yt-dlp", ["-g", "--no-playlist", "--no-warnings", "https://www.youtube.com/@c/live"]);
  });

  it("sin vivo (yt-dlp falla o no imprime url) → no_live", async () => {
    const exec = vi.fn(async () => ({ stdout: "", code: 1, stderr: "ERROR: The channel is not currently live" }));
    await expect(resolveStreamUrl({ kind: "kick", url: "https://kick.com/c" }, exec)).resolves.toEqual({ ok: false, reason: "no_live" });
  });

  it("kind desconocido → error", async () => {
    await expect(resolveStreamUrl({ kind: "threads", url: "https://x" }, vi.fn())).resolves.toEqual({ ok: false, reason: "unsupported_kind" });
  });
});
