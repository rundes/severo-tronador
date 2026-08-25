// Resuelve la URL que ffmpeg puede grabar según la plataforma del programa.
// radio: el stream tal cual. youtube/kick: yt-dlp -g devuelve la URL del vivo
// (HLS) si el canal está transmitiendo; si no, el programa se marca no_live.
// `exec(cmd, args) → { stdout, stderr, code }` se inyecta para testear.
export async function resolveStreamUrl(program, exec) {
  if (program.kind === "radio" || !program.kind) return { ok: true, url: program.url };
  if (program.kind !== "youtube" && program.kind !== "kick") return { ok: false, reason: "unsupported_kind" };
  const r = await exec("yt-dlp", ["-g", "--no-playlist", "--no-warnings", program.url]);
  const url = (r.stdout || "").split("\n").map((s) => s.trim()).find((s) => /^https?:\/\//.test(s));
  if (r.code !== 0 || !url) return { ok: false, reason: "no_live" };
  return { ok: true, url };
}
