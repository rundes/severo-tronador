// GET /escucha/live — devuelve el ListeningResult del proyecto activo como JSON.
// Lo consume el monitor en vivo (polling client-side) para refrescar el stream
// sin recargar la página. Sin store: cada llamada lee el estado actual.
import { NextResponse } from "next/server";
import { runListening } from "@/lib/listening";
import { requireProject } from "@/lib/workspace";
import { log } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET() {
  const project = await requireProject();
  try {
    const result = await runListening(project.id);
    return NextResponse.json({ ok: true, result }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    log.warn("escucha.live.failed", { project_id: project.id, error: (e as Error).message });
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
