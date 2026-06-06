"use client";

import { useState, useTransition } from "react";
import { ImageUpload } from "@/components/encuestas/image-upload";
import { SubmitButton } from "@/components/ui/submit-button";
import type { AiTextState, AiImageState } from "@/app/(dashboard)/publicaciones/actions";

type AiAction = (prev: AiTextState, fd: FormData) => Promise<AiTextState>;
type ImgAction = (prev: AiImageState, fd: FormData) => Promise<AiImageState>;

const inputCls =
  "rounded border border-zinc-300 bg-white px-2.5 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900";

// Compositor de publicaciones: asistente de contenido con Gemini (ajustes
// acumulativos) + previsualización en vivo + envío a FB/IG. El asistente llama
// a la server action directamente (useTransition) y vuelca el texto al cuerpo.
export function PostComposer({
  publishAction,
  aiAction,
  imageAction,
  igReady,
  ready,
}: {
  publishAction: (fd: FormData) => void;
  aiAction: AiAction;
  imageAction: ImgAction;
  igReady: boolean;
  ready: boolean;
}) {
  const [mensaje, setMensaje] = useState("");
  const [link, setLink] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [red, setRed] = useState("ambos");
  const [prompt, setPrompt] = useState("");
  const [aiMsg, setAiMsg] = useState<{ ok: boolean | null; msg: string }>({
    ok: null,
    msg: "",
  });
  const [pending, startTransition] = useTransition();

  // Generación de imagen con Gemini.
  const [imgPrompt, setImgPrompt] = useState("");
  const [imgMsg, setImgMsg] = useState<{ ok: boolean | null; msg: string }>({
    ok: null,
    msg: "",
  });
  const [imgPending, startImg] = useTransition();

  function generar() {
    if (!prompt.trim() || pending) return;
    const fd = new FormData();
    fd.set("prompt", prompt);
    fd.set("current", mensaje);
    fd.set("red", red);
    startTransition(async () => {
      const res = await aiAction({ ok: null, text: "", msg: "" }, fd);
      if (res.ok && res.text) setMensaje(res.text);
      setAiMsg({ ok: res.ok, msg: res.msg });
    });
  }

  function generarImagen() {
    if (!imgPrompt.trim() || imgPending) return;
    const fd = new FormData();
    fd.set("prompt", imgPrompt);
    startImg(async () => {
      const res = await imageAction({ ok: null, url: "", msg: "" }, fd);
      if (res.ok && res.url) setImageUrl(res.url);
      setImgMsg({ ok: res.ok, msg: res.msg });
    });
  }

  return (
    <div className="space-y-5">
      {/* ── Asistente de contenido (Gemini) ─────────────────────────────── */}
      <div className="space-y-2 rounded-lg border border-[oklch(52%_0.13_255)]/30 bg-[oklch(52%_0.13_255)]/[0.04] p-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
            ✦ Generar contenido con IA
          </span>
          <span className="text-[11px] text-zinc-400">Google AI Studio (Gemini)</span>
        </div>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={2}
          placeholder="Describí el aviso/posteo. Ej: «invitar a vecinos del Centro a una encuesta de opinión, tono cercano». Volvé a pedir ajustes y se acumulan sobre el texto."
          className={`${inputCls} w-full`}
        />
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={red}
            onChange={(e) => setRed(e.target.value)}
            aria-label="Red social"
            className={`${inputCls} text-xs`}
          >
            <option value="ambos">Facebook + Instagram</option>
            <option value="facebook">Facebook</option>
            <option value="instagram">Instagram</option>
          </select>
          <button
            type="button"
            onClick={generar}
            disabled={pending || !prompt.trim()}
            className="inline-flex items-center gap-2 rounded bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {pending ? "Generando…" : mensaje.trim() ? "✦ Ajustar" : "✦ Generar"}
          </button>
          {aiMsg.ok !== null && (
            <span className={`text-[11px] ${aiMsg.ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
              {aiMsg.msg}
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* ── Editor ────────────────────────────────────────────────────── */}
        <form action={publishAction} className="space-y-4">
          <label className="flex flex-col gap-1 text-xs text-zinc-500">
            Mensaje
            <textarea
              name="mensaje"
              rows={6}
              value={mensaje}
              onChange={(e) => setMensaje(e.target.value)}
              placeholder="Texto del aviso / contenido…"
              className={`${inputCls} w-full`}
            />
          </label>

          <label className="flex flex-col gap-1 text-xs text-zinc-500">
            Enlace (opcional, solo Facebook)
            <input
              name="link"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://…"
              className={`${inputCls} w-full`}
            />
          </label>

          {/* Valor de imagen efectivo enviado (subida manual o generada). */}
          <input type="hidden" name="imageUrl" value={imageUrl} />

          <div className="space-y-2 rounded-lg border border-[oklch(52%_0.13_255)]/30 bg-[oklch(52%_0.13_255)]/[0.04] p-3">
            <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
              ✦ Generar imagen con IA (Gemini)
            </span>
            <textarea
              value={imgPrompt}
              onChange={(e) => setImgPrompt(e.target.value)}
              rows={2}
              placeholder="Describí la imagen. Ej: «ilustración cálida de vecinos charlando en una plaza de barrio, estilo flat, colores tierra»."
              className={`${inputCls} w-full`}
            />
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={generarImagen}
                disabled={imgPending || !imgPrompt.trim()}
                className="inline-flex items-center gap-2 rounded bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
              >
                {imgPending ? "Generando imagen…" : "✦ Generar imagen"}
              </button>
              {imgMsg.ok !== null && (
                <span className={`text-[11px] ${imgMsg.ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                  {imgMsg.msg}
                </span>
              )}
            </div>
          </div>

          <ImageUpload
            name="imageUrl_upload"
            value=""
            aspect={1}
            recommend="Cuadrada (1:1). Obligatoria para Instagram. O generala con IA arriba."
            label="O subí una imagen"
            onChange={setImageUrl}
          />

          <fieldset className="flex flex-col gap-1 text-xs text-zinc-500">
            <span>Publicar en</span>
            <div className="flex flex-wrap items-center gap-4 pt-1 text-sm text-zinc-700 dark:text-zinc-200">
              <label className="flex items-center gap-1.5">
                <input type="checkbox" name="targets" value="fb" defaultChecked />
                📘 Facebook
              </label>
              <label className="flex items-center gap-1.5">
                <input type="checkbox" name="targets" value="ig" disabled={!igReady && ready} />
                📸 Instagram
                {!igReady && (
                  <span className="text-[11px] text-zinc-400">(falta IG en el conector)</span>
                )}
              </label>
            </div>
          </fieldset>

          <SubmitButton pendingLabel="Publicando…">Publicar</SubmitButton>
        </form>

        {/* ── Previsualización ──────────────────────────────────────────── */}
        <div className="space-y-2">
          <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-400">
            Previsualización
          </div>
          <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex items-center gap-2 px-3 py-2">
              <div className="h-8 w-8 rounded-full bg-[oklch(52%_0.13_255)]/20" aria-hidden />
              <div className="text-xs">
                <div className="font-semibold text-zinc-800 dark:text-zinc-100">Tu organización</div>
                <div className="text-[10px] text-zinc-400">Ahora · 🌐</div>
              </div>
            </div>
            {mensaje && (
              <p className="whitespace-pre-wrap px-3 pb-2 text-sm text-zinc-800 dark:text-zinc-100">
                {mensaje}
              </p>
            )}
            {imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imageUrl} alt="" className="w-full object-cover" />
            )}
            {link && !imageUrl && (
              <div className="m-3 rounded-lg border border-zinc-200 px-3 py-2 text-xs text-zinc-500 dark:border-zinc-800">
                🔗 {link}
              </div>
            )}
            {!mensaje && !imageUrl && !link && (
              <p className="px-3 pb-3 text-sm text-zinc-400">
                Escribí o generá contenido para ver la vista previa.
              </p>
            )}
          </div>
          <p className="text-[10px] text-zinc-400">
            Aproximación de cómo se verá. El render real depende de cada red.
          </p>
        </div>
      </div>
    </div>
  );
}
