"use client";

import { useState, useTransition } from "react";
import { ImageUpload } from "@/components/encuestas/image-upload";
import { buttonClass } from "@/components/ui/button";
import type { AiTextState, AiImageState, AiSuggestState } from "@/app/(dashboard)/publicaciones/actions";

type AiAction = (prev: AiTextState, fd: FormData) => Promise<AiTextState>;
type ImgAction = (prev: AiImageState, fd: FormData) => Promise<AiImageState>;
type SuggestAction = (prev: AiSuggestState, fd: FormData) => Promise<AiSuggestState>;
type PublishAction = (
  mensaje: string,
  targets: string[],
  imageUrl?: string,
) => Promise<{ ok: boolean; msg: string }>;

const inputCls =
  "w-full rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900";

// Tablero de difusión multi-red. Compone una vez (texto + imagen, con IA) y
// publica en cada red. Facebook/Instagram: nativo vía Meta API. X/TikTok/
// YouTube: no tienen connector OAuth todavía → "copiar y abrir el creador"
// (X prellena el texto vía intent; TikTok/YouTube abren el uploader y copian
// el copy al portapapeles para pegar).
export function DifusionBoard({
  aiAction,
  imageAction,
  publishAction,
  suggestAction,
  igReady,
  ready,
}: {
  aiAction: AiAction;
  imageAction: ImgAction;
  publishAction: PublishAction;
  suggestAction: SuggestAction;
  igReady: boolean;
  ready: boolean;
}) {
  const [mensaje, setMensaje] = useState("");
  const [link, setLink] = useState("");
  const [imageUrl, setImageUrl] = useState("");

  const [prompt, setPrompt] = useState("");
  const [imgPrompt, setImgPrompt] = useState("");
  const [aiBusy, startAi] = useTransition();
  const [imgBusy, startImg] = useTransition();
  const [pubBusy, startPub] = useTransition();
  const [sugBusy, startSug] = useTransition();
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [improved, setImproved] = useState("");
  const [note, setNote] = useState<{ ok: boolean | null; text: string }>({ ok: null, text: "" });

  function sugerirMejoras() {
    if (!mensaje.trim() || sugBusy) return;
    const fd = new FormData();
    fd.set("texto", mensaje);
    fd.set("red", "redes");
    startSug(async () => {
      const r = await suggestAction({ ok: null, suggestions: [], improved: "", msg: "" }, fd);
      setSuggestions(r.suggestions);
      setImproved(r.improved);
      setNote({ ok: r.ok, text: r.msg });
    });
  }

  function genTexto() {
    if (!prompt.trim() || aiBusy) return;
    const fd = new FormData();
    fd.set("prompt", prompt);
    fd.set("current", mensaje);
    fd.set("red", "ambos");
    startAi(async () => {
      const r = await aiAction({ ok: null, text: "", msg: "" }, fd);
      if (r.ok && r.text) setMensaje(r.text);
      setNote({ ok: r.ok, text: r.msg });
    });
  }

  function genImagen() {
    if (!imgPrompt.trim() || imgBusy) return;
    const fd = new FormData();
    fd.set("prompt", imgPrompt);
    startImg(async () => {
      const r = await imageAction({ ok: null, url: "", msg: "" }, fd);
      if (r.ok && r.url) setImageUrl(r.url);
      setNote({ ok: r.ok, text: r.msg });
    });
  }

  function publishMeta(target: "fb" | "ig") {
    if (pubBusy) return;
    startPub(async () => {
      const r = await publishAction(mensaje, [target], imageUrl || undefined);
      setNote({ ok: r.ok, text: r.msg });
    });
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard?.writeText(text);
    } catch {
      // ignore
    }
  }

  function openX() {
    const u = new URL("https://x.com/intent/tweet");
    if (mensaje) u.searchParams.set("text", mensaje);
    if (link) u.searchParams.set("url", link);
    window.open(u.toString(), "_blank", "noopener");
  }

  function openTikTok() {
    copy(mensaje);
    setNote({ ok: true, text: "Copy copiado. Subí el video en TikTok y pegá el texto." });
    window.open("https://www.tiktok.com/upload", "_blank", "noopener");
  }

  function openYouTube() {
    copy(`${mensaje}${link ? `\n${link}` : ""}`);
    setNote({ ok: true, text: "Copy copiado. Subí el video en YouTube Studio y pegá título/descripción." });
    window.open("https://studio.youtube.com", "_blank", "noopener");
  }

  const PLATFORMS: {
    id: string;
    label: string;
    icon: string;
    kind: "native" | "intent" | "manual";
    onClick: () => void;
    disabled?: boolean;
    hint?: string;
  }[] = [
    { id: "fb", label: "Facebook", icon: "📘", kind: "native", onClick: () => publishMeta("fb"), disabled: pubBusy },
    {
      id: "ig",
      label: "Instagram",
      icon: "📸",
      kind: "native",
      onClick: () => publishMeta("ig"),
      disabled: pubBusy || !imageUrl,
      hint: !imageUrl ? "necesita imagen" : !igReady ? "configurá IG en el conector" : undefined,
    },
    { id: "x", label: "X", icon: "✖️", kind: "intent", onClick: openX, hint: "abre X con el texto" },
    { id: "tiktok", label: "TikTok", icon: "🎵", kind: "manual", onClick: openTikTok, hint: "copia + abre uploader" },
    { id: "youtube", label: "YouTube", icon: "▶️", kind: "manual", onClick: openYouTube, hint: "copia + abre Studio" },
  ];

  return (
    <div className="space-y-5">
      {/* Asistente de contenido */}
      <div className="space-y-2 rounded-lg border border-[oklch(52%_0.13_255)]/30 bg-[oklch(52%_0.13_255)]/[0.04] p-4">
        <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">✦ Contenido con IA</span>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={2}
          placeholder="Describí el aviso. Ej: «invitación a la encuesta de opinión, tono cercano»."
          className={inputCls}
        />
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={genTexto} disabled={aiBusy || !prompt.trim()} className={buttonClass("accent", "sm")}>
            {aiBusy ? "Generando…" : mensaje.trim() ? "Ajustar texto" : "Generar texto"}
          </button>
          <input
            value={imgPrompt}
            onChange={(e) => setImgPrompt(e.target.value)}
            placeholder="Prompt de imagen (Gemini/SiliconFlow)"
            className={`${inputCls} max-w-xs`}
          />
          <button type="button" onClick={genImagen} disabled={imgBusy || !imgPrompt.trim()} className={buttonClass("secondary", "sm")}>
            {imgBusy ? "Generando…" : "Generar imagen"}
          </button>
          <button type="button" onClick={sugerirMejoras} disabled={sugBusy || !mensaje.trim()} className={buttonClass("secondary", "sm")} title="Analiza el texto actual y sugiere mejoras">
            {sugBusy ? "Analizando…" : "✦ Sugerir mejoras"}
          </button>
        </div>

        {(suggestions.length > 0 || improved) && (
          <div className="space-y-2 rounded-md border border-zinc-200 bg-white/60 p-3 dark:border-zinc-800 dark:bg-zinc-950/40">
            {suggestions.length > 0 && (
              <ul className="ml-4 list-disc space-y-1 text-xs text-zinc-600 dark:text-zinc-300">
                {suggestions.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            )}
            {improved && (
              <div className="space-y-1">
                <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-400">Versión mejorada</div>
                <p className="whitespace-pre-wrap rounded border border-zinc-200 p-2 text-xs text-zinc-700 dark:border-zinc-800 dark:text-zinc-200">{improved}</p>
                <button
                  type="button"
                  onClick={() => { setMensaje(improved); setNote({ ok: true, text: "Versión mejorada aplicada." }); }}
                  className={buttonClass("accent", "sm")}
                >
                  Aplicar versión mejorada
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Editor */}
        <div className="space-y-3">
          <label className="flex flex-col gap-1 text-xs text-zinc-500">
            Mensaje / copy
            <textarea value={mensaje} onChange={(e) => setMensaje(e.target.value)} rows={6} className={inputCls} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-zinc-500">
            Enlace (FB / X / YouTube)
            <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…" className={inputCls} />
          </label>
          <ImageUpload
            name="imageUrl_difusion"
            value=""
            aspect={1}
            recommend="Obligatoria para Instagram. Para TikTok/YouTube subís el video aparte."
            label="Imagen"
            onChange={setImageUrl}
          />
        </div>

        {/* Preview */}
        <div className="space-y-2">
          <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-400">Previsualización</div>
          <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex items-center gap-2 px-3 py-2">
              <div className="h-8 w-8 rounded-full bg-[oklch(52%_0.13_255)]/20" aria-hidden />
              <div className="text-xs font-semibold text-zinc-800 dark:text-zinc-100">Tu organización</div>
            </div>
            {mensaje && <p className="whitespace-pre-wrap px-3 pb-2 text-sm text-zinc-800 dark:text-zinc-100">{mensaje}</p>}
            {imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imageUrl} alt="" className="w-full object-cover" />
            )}
            {link && !imageUrl && (
              <div className="m-3 rounded-lg border border-zinc-200 px-3 py-2 text-xs text-zinc-500 dark:border-zinc-800">🔗 {link}</div>
            )}
            {!mensaje && !imageUrl && !link && (
              <p className="px-3 pb-3 text-sm text-zinc-400">Escribí o generá contenido.</p>
            )}
          </div>
        </div>
      </div>

      {/* Redes */}
      <div className="space-y-2">
        <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-400">Publicar en</div>
        <div className="flex flex-wrap gap-2">
          {PLATFORMS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={p.onClick}
              disabled={p.disabled}
              title={p.hint}
              className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              <span>{p.icon}</span>
              {p.label}
              <span className="text-[10px] font-normal text-zinc-400">
                {p.kind === "native" ? "nativo" : p.kind === "intent" ? "abre X" : "copia+abre"}
              </span>
            </button>
          ))}
        </div>
        {!ready && (
          <p className="text-[11px] text-amber-600 dark:text-amber-400">
            Facebook/Instagram corren en modo mock hasta configurar el conector Meta.
          </p>
        )}
        <p className="text-[11px] text-zinc-400">
          Facebook e Instagram publican por API. X, TikTok y YouTube todavía no
          tienen conexión directa: se copia el contenido y se abre su creador
          (X prellena el texto). Para TikTok/YouTube subís el video desde el
          Estudio.
        </p>
        {note.ok !== null && (
          <p className={`text-xs ${note.ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
            {note.text}
          </p>
        )}
      </div>
    </div>
  );
}
