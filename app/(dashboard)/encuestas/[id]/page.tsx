import Link from "next/link";
import { notFound } from "next/navigation";
import { getEncuesta } from "@/lib/encuestas";
import { listEncuestaResponses } from "@/lib/encuestas/responses";
import { listSavedSegments } from "@/lib/segments-store";
import { listGrupos } from "@/lib/grupos";
import { listTemplates } from "@/lib/templates";
import { outreachConnectorFor, SURVEY_SEND_CHANNELS, EMAIL_PROVIDERS } from "@/lib/campaigns";
import type { Channel } from "@/lib/relationship";
import { requireProject } from "@/lib/workspace";
import { FormStatus, SubmitButton } from "@/components/ui/submit-button";
import { QuestionEditor } from "@/components/encuestas/question-editor";
import { EncuestaDashboard } from "@/components/encuestas/dashboard";
import { EditTabs } from "@/components/encuestas/edit-tabs";
import { DeleteEncuestaButton } from "@/components/encuestas/delete-button";
import { ResetResponsesButton } from "@/components/encuestas/reset-responses-button";
import { EncuestaSendForm, type SendChannel } from "@/components/encuestas/send-form";
import { VercelMetricsCard } from "@/components/analytics/vercel-card";
import {
  guardarPreguntas,
  publicarEncuesta,
  cerrarEncuesta,
  enviarEncuestaPorMail,
  eliminarEncuesta,
  borrarRespuestas,
  probarEnvioEncuesta,
} from "../actions";

const CHANNEL_LABEL: Partial<Record<Channel, string>> = {
  email: "📧 Email",
  sms: "📱 SMS",
  whatsapp: "💬 WhatsApp",
  telegram: "✈️ Telegram",
};

export const metadata = { title: "Editar encuesta · Tronador" };

function publicUrl(slug: string): string {
  const base = process.env.NEXTAUTH_URL ?? "";
  return `${base}/e/${slug}`;
}

export default async function EncuestaDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  const sp = (await searchParams) ?? {};
  const { id: projectId } = await requireProject();
  const enc = await getEncuesta(projectId, id);
  if (!enc) notFound();

  const isPublished = enc.estado === "publicada";
  const isClosed = enc.estado === "cerrada";

  const responses = await listEncuestaResponses(projectId, id);
  const [segments, grupos] = isPublished
    ? await Promise.all([listSavedSegments(projectId), listGrupos(projectId)])
    : [[], []];

  // Canales por los que se puede enviar la encuesta: los que tienen conector y
  // al menos una plantilla. Cada plantilla debería incluir {{encuesta_url}}.
  const sendChannels: SendChannel[] = isPublished
    ? (
        await Promise.all(
          SURVEY_SEND_CHANNELS.map(async (ch) => {
            if (!outreachConnectorFor(ch)) return null;
            const tpls = await listTemplates(ch);
            if (!tpls.length) return null;
            return {
              id: ch,
              label: CHANNEL_LABEL[ch] ?? ch,
              templates: tpls.map((t) => ({ id: t.id, nombre: t.nombre })),
            } as SendChannel;
          }),
        )
      ).filter((c): c is SendChannel => c !== null)
    : [];
  const hasTemplates = sendChannels.length > 0;

  const okMap: Record<string, string> = {
    guardada: "Cambios guardados.",
    publicada: "Encuesta publicada. Ya podés distribuir el link público.",
    cerrada: "Encuesta cerrada. No recibe más respuestas.",
    enviada: "Envío encolado. Seguí el estado (enviados / pendientes) en Campañas.",
    prueba_enviada: `Prueba enviada a ${sp.dest ?? ""}. Revisá que haya llegado antes del envío masivo.`,
    duplicada: "Encuesta duplicada. Estás editando la copia.",
    respuestas_borradas: `Respuestas borradas (${sp.n ?? 0}). La encuesta arranca de cero.`,
  };
  const errDetalleMap: Record<string, string> = {
    validacion: sp.detalle ?? "Revisá las preguntas.",
    no_publicada: "Publicá la encuesta antes de enviarla.",
    envio_datos: "Elegí una plantilla y un segmento.",
    envio: `No se pudo enviar: ${sp.detalle ?? ""}`,
    prueba_datos: "Elegí una plantilla y escribí un destino de prueba.",
    prueba_destino: "El destino de prueba no tiene un formato válido (mail o teléfono según el canal).",
    prueba: `No se pudo enviar la prueba: ${sp.detalle ?? ""}`,
  };
  const okMsg = sp.ok ? okMap[sp.ok] ?? null : null;
  const errMsg = sp.error
    ? errDetalleMap[sp.error] ?? "No se pudo guardar."
    : null;

  // ── Tab: Edición ──────────────────────────────────────────────────────
  const edicion = (
    <div className="space-y-5">
      <QuestionEditor
        encuestaId={enc.id}
        titulo={enc.titulo}
        descripcion={enc.descripcion ?? ""}
        layout={enc.layout}
        stepMode={enc.stepMode}
        imageUrl={enc.imageUrl ?? ""}
        imageEndUrl={enc.imageEndUrl ?? ""}
        mensajeFinal={enc.mensajeFinal ?? ""}
        ctaLabel={enc.ctaLabel ?? ""}
        ctaUrl={enc.ctaUrl ?? ""}
        initial={enc.preguntas}
        readOnly={isClosed}
        action={guardarPreguntas}
      />
      {!isClosed && (
        <div className="flex flex-wrap items-center gap-3 border-t border-zinc-200 pt-4 dark:border-zinc-800">
          {!isPublished && (
            <form action={publicarEncuesta}>
              <input type="hidden" name="id" value={enc.id} />
              <SubmitButton pendingLabel="Publicando…">Publicar</SubmitButton>
            </form>
          )}
          <form action={cerrarEncuesta}>
            <input type="hidden" name="id" value={enc.id} />
            <SubmitButton pendingLabel="Cerrando…" variant="secondary">
              Cerrar encuesta
            </SubmitButton>
          </form>
          <div className="ml-auto">
            <DeleteEncuestaButton id={enc.id} titulo={enc.titulo} action={eliminarEncuesta} />
          </div>
        </div>
      )}
      {isClosed && (
        <div className="flex border-t border-zinc-200 pt-4 dark:border-zinc-800">
          <DeleteEncuestaButton id={enc.id} titulo={enc.titulo} action={eliminarEncuesta} />
        </div>
      )}
    </div>
  );

  // ── Tab: Estadísticas ─────────────────────────────────────────────────
  const estadisticas = (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">
          Monitoreo
        </h2>
        {responses.length > 0 && (
          <div className="flex items-center gap-3">
            <a
              href={`/encuestas/${enc.id}/export`}
              className="text-xs text-zinc-500 underline-offset-4 hover:underline"
            >
              Exportar CSV
            </a>
            <ResetResponsesButton
              id={enc.id}
              total={responses.length}
              exportHref={`/encuestas/${enc.id}/export`}
              action={borrarRespuestas}
            />
          </div>
        )}
      </div>
      <EncuestaDashboard encuesta={enc} responses={responses} />
      {enc.slug && (
        <VercelMetricsCard path={`/e/${enc.slug}`} scope="este enlace público" />
      )}
    </div>
  );

  // ── Tab: Envío ────────────────────────────────────────────────────────
  const envio = (
    <div className="space-y-5">
      {!isPublished ? (
        <p className="rounded border border-dashed border-zinc-300 px-4 py-8 text-center text-sm text-zinc-500 dark:border-zinc-700">
          Publicá la encuesta (pestaña Edición) para obtener el link público y
          poder enviarla por mail.
        </p>
      ) : (
        <>
          {enc.slug && (
            <div className="space-y-1">
              <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">
                Link público
              </h2>
              <code className="block break-all rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 font-mono text-xs text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-200">
                {publicUrl(enc.slug)}
              </code>
            </div>
          )}

          <div className="space-y-2 border-t border-zinc-200 pt-4 dark:border-zinc-800">
            <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">
              Enviar a un segmento o grupo
            </h2>
            {(segments.length === 0 && grupos.length === 0) || !hasTemplates ? (
              <div className="space-y-1 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300">
                <p>Para enviar te falta:</p>
                <ul className="ml-4 list-disc">
                  {segments.length === 0 && grupos.length === 0 && (
                    <li>
                      Un <strong>segmento guardado</strong> (en{" "}
                      <a href="/segmentos" className="underline underline-offset-2">
                        Segmentos
                      </a>
                      ) o un <strong>grupo de contactos</strong> (en{" "}
                      <Link href="/contactos" className="underline underline-offset-2">
                        Contactos
                      </Link>
                      ).
                    </li>
                  )}
                  {!hasTemplates && (
                    <li>
                      Crear una <strong>plantilla</strong> (email, SMS, WhatsApp o
                      Telegram) en{" "}
                      <a href="/templates" className="underline underline-offset-2">
                        Plantillas
                      </a>{" "}
                      con <code>{"{{encuesta_url}}"}</code> en el cuerpo.
                    </li>
                  )}
                </ul>
              </div>
            ) : (
              <EncuestaSendForm
                encuestaId={enc.id}
                channels={sendChannels}
                segments={segments}
                grupos={grupos}
                emailProviders={EMAIL_PROVIDERS}
                action={enviarEncuestaPorMail}
                testAction={probarEnvioEncuesta}
              />
            )}
            <p className="text-[11px] text-zinc-400">
              El envío crea una campaña por el canal elegido. Mirá cuántos se
              enviaron / quedan pendientes en{" "}
              <Link href="/campanas" className="underline underline-offset-2 hover:text-zinc-600 dark:hover:text-zinc-300">
                Campañas
              </Link>
              . Sale escalonado (cola): puede tardar.
            </p>
          </div>
        </>
      )}
    </div>
  );

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <nav className="flex items-center justify-between">
        <Link href="/encuestas" className="text-sm text-zinc-500 underline-offset-4 hover:underline">
          ← Encuestas
        </Link>
        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
          {enc.estado}
        </span>
      </nav>

      <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
        {enc.titulo}
      </h1>

      <FormStatus ok={okMsg} error={errMsg} />

      <EditTabs
        items={[
          { id: "edicion", label: "Edición", content: edicion },
          { id: "estadisticas", label: "Estadísticas", content: estadisticas },
          { id: "envio", label: "Envío", content: envio },
        ]}
      />
    </div>
  );
}
