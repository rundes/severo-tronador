// GET config del escenario para la extensión de Chrome (token por proyecto).
import { NextResponse } from "next/server";
import { verifyExtensionToken } from "@/lib/extension-token";
import { getListeningConfig } from "@/lib/listening-config";
import { getProject } from "@/lib/projects";

export async function GET(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const projectId = await verifyExtensionToken(
    auth.startsWith("Bearer ") ? auth.slice(7) : null,
  );
  if (!projectId) return new Response("Forbidden", { status: 403 });
  const [cfg, project] = await Promise.all([
    getListeningConfig(projectId),
    getProject(projectId),
  ]);
  return NextResponse.json({
    project: project?.nombre ?? projectId,
    zona: cfg.zona,
    pais: cfg.pais,
    keywords: cfg.keywords,
  });
}
