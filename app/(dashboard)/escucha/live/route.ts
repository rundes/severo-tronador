// GET /escucha/live — devuelve el ListeningResult del proyecto activo como JSON.
// Lo consume el monitor en vivo (polling client-side, ~30s) para refrescar el
// stream sin recargar la página.
//
// runListening recomputa temas/sentiment/tags/autores sobre ~2000 filas; sin
// cache cada poll de cada pestaña lo recalculaba entero. Lo envolvemos en
// unstable_cache por proyecto (revalidate 30s, alineado al poll): los datos se
// ingieren por cron horario, así que 30s de staleness es irrelevante.
import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { runListening } from "@/lib/listening";
import { requireProject } from "@/lib/workspace";
import { log } from "@/lib/logger";

export const dynamic = "force-dynamic";

const cachedListening = (projectId: string) =>
  unstable_cache(() => runListening(projectId), ["escucha-live", projectId], {
    revalidate: 30,
    tags: [`escucha-live-${projectId}`],
  })();

export async function GET() {
  const project = await requireProject();
  try {
    const result = await cachedListening(project.id);
    return NextResponse.json({ ok: true, result }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    log.warn("escucha.live.failed", { project_id: project.id, error: (e as Error).message });
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
