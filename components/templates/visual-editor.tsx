"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Cropper from "react-easy-crop";
import { getCroppedBlob, type PixelCrop } from "@/components/encuestas/crop-utils";
import { SUPPORTED_VARS } from "@/lib/interpolate-vars";

// Editor visual (WYSIWYG) para el cuerpo HTML de las plantillas de email.
// contentEditable + execCommand para formato de texto; manejo propio para
// imágenes (insertar, redimensionar, recortar, quitar). Emite el HTML al
// padre en cada cambio → el preview se actualiza en vivo. El HTML se sanitiza
// server-side antes de enviar (lib/email-sanitize.ts), así que acá producimos
// tags y estilos inline dentro de ese allowlist (p, h2/h3, ul/ol, a, img,
// strong/em/u, div con text-align, img con width/height/style).

const WIDTH_PRESETS: { label: string; value: string }[] = [
  { label: "S", value: "25%" },
  { label: "M", value: "50%" },
  { label: "L", value: "75%" },
  { label: "Full", value: "100%" },
];

type Align = "left" | "center" | "right";

export function VisualEditor({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (html: string) => void;
  disabled?: boolean;
}) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const lastHtml = useRef<string>(value);
  const fileRef = useRef<HTMLInputElement | null>(null);
  // El nodo <img> seleccionado se guarda en un ref (es un nodo DOM mutable,
  // fuera del control de React); `hasSel` solo dispara el re-render de la
  // barra de imagen.
  const selImgRef = useRef<HTMLImageElement | null>(null);
  const [hasSel, setHasSel] = useState(false);

  // Estado del recortador (modal). `cropTargetRef` apunta a la imagen
  // existente cuando se recorta una ya insertada (null = inserción nueva).
  const cropTargetRef = useRef<HTMLImageElement | null>(null);
  const [crop, setCrop] = useState<{ src: string } | null>(null);
  const [cropPos, setCropPos] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [areaPx, setAreaPx] = useState<PixelCrop | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // ── Sincronización contentEditable (uncontrolled) ──────────────────────
  // Lee el HTML sin el marcador de selección de imágenes (data-ve-sel).
  const readHtml = useCallback((): string => {
    const el = editorRef.current;
    if (!el) return "";
    const clone = el.cloneNode(true) as HTMLElement;
    clone.querySelectorAll("[data-ve-sel]").forEach((n) => {
      n.removeAttribute("data-ve-sel");
    });
    return clone.innerHTML;
  }, []);

  const emit = useCallback(() => {
    const html = readHtml();
    lastHtml.current = html;
    onChange(html);
  }, [onChange, readHtml]);

  // Carga inicial + cambios externos (presets, vista código → visual).
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    if (value !== lastHtml.current) {
      el.innerHTML = value;
      lastHtml.current = value;
    }
  }, [value]);

  // ── Comandos de formato ────────────────────────────────────────────────
  function exec(command: string, arg?: string) {
    if (disabled) return;
    editorRef.current?.focus();
    document.execCommand(command, false, arg);
    emit();
  }

  function formatBlock(tag: string) {
    // Algunos navegadores requieren los <> alrededor del tag.
    exec("formatBlock", `<${tag}>`);
  }

  function insertLink() {
    const url = window.prompt("URL del enlace (https://…)");
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) {
      setErr("El enlace debe empezar con http:// o https://");
      return;
    }
    setErr(null);
    exec("createLink", url);
  }

  function insertVar(key: string) {
    exec("insertText", `{{${key}}}`);
  }

  // ── Imágenes ────────────────────────────────────────────────────────────
  function pickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!["image/png", "image/jpeg"].includes(f.type)) {
      setErr("Solo PNG o JPG.");
      return;
    }
    setErr(null);
    const reader = new FileReader();
    reader.onload = () => {
      cropTargetRef.current = null;
      setCrop({ src: String(reader.result) });
      setZoom(1);
      setCropPos({ x: 0, y: 0 });
    };
    reader.readAsDataURL(f);
  }

  const onCropComplete = useCallback((_a: unknown, px: PixelCrop) => {
    setAreaPx(px);
  }, []);

  async function confirmCrop() {
    if (!crop || !areaPx) return;
    setBusy(true);
    setErr(null);
    try {
      const blob = await getCroppedBlob(crop.src, areaPx);
      const fd = new FormData();
      fd.append("file", new File([blob], "img.jpg", { type: "image/jpeg" }));
      const res = await fetch("/api/encuestas/upload", { method: "POST", body: fd });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error ?? "falló la subida");

      const target = cropTargetRef.current;
      if (target) {
        // Recorte de una imagen existente: reemplaza el src.
        target.setAttribute("src", data.url);
      } else {
        // Inserción nueva.
        editorRef.current?.focus();
        document.execCommand(
          "insertHTML",
          false,
          `<img src="${data.url}" alt="" style="max-width:100%;height:auto;display:block;" />`,
        );
      }
      cropTargetRef.current = null;
      setCrop(null);
      selImgRef.current = null;
      setHasSel(false);
      emit();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // Selección de imagen por click dentro del editor.
  function onEditorClick(e: React.MouseEvent) {
    const t = e.target as HTMLElement;
    // limpiar marca anterior
    editorRef.current
      ?.querySelectorAll("[data-ve-sel]")
      .forEach((n) => n.removeAttribute("data-ve-sel"));
    if (t.tagName === "IMG") {
      t.setAttribute("data-ve-sel", "1");
      selImgRef.current = t as HTMLImageElement;
      setHasSel(true);
    } else {
      selImgRef.current = null;
      setHasSel(false);
    }
  }

  function setImgWidth(w: string) {
    const img = selImgRef.current;
    if (!img) return;
    img.style.width = w;
    img.style.maxWidth = "100%";
    img.style.height = "auto";
    emit();
  }

  function nudgeImg(deltaPct: number) {
    const img = selImgRef.current;
    if (!img) return;
    // ancho actual en % del contenedor; si no hay, asumimos 100.
    const parent = img.parentElement?.clientWidth || img.naturalWidth || 1;
    const curPx = img.getBoundingClientRect().width;
    const curPct = Math.round((curPx / parent) * 100);
    const next = Math.max(10, Math.min(100, curPct + deltaPct));
    setImgWidth(`${next}%`);
  }

  function setImgAlign(align: Align) {
    const img = selImgRef.current;
    if (!img) return;
    img.style.display = "block";
    img.style.marginLeft = align === "left" ? "0" : "auto";
    img.style.marginRight = align === "right" ? "0" : "auto";
    emit();
  }

  function recortarSel() {
    const img = selImgRef.current;
    if (!img) return;
    cropTargetRef.current = img;
    setCrop({ src: img.src });
    setZoom(1);
    setCropPos({ x: 0, y: 0 });
  }

  function removeSel() {
    const img = selImgRef.current;
    if (!img) return;
    img.remove();
    selImgRef.current = null;
    setHasSel(false);
    emit();
  }

  const btn =
    "rounded px-2 py-1 text-sm text-zinc-600 hover:bg-zinc-200 disabled:opacity-40 dark:text-zinc-300 dark:hover:bg-zinc-700";
  const sep = "mx-0.5 w-px self-stretch bg-zinc-200 dark:bg-zinc-700";

  return (
    <div className="space-y-2">
      <style>{`[data-ve-sel]{outline:2px solid #2b3350;outline-offset:2px;}`}</style>

      {/* Barra de herramientas */}
      <div className="flex flex-wrap items-center gap-0.5 rounded-t-lg border border-zinc-300 bg-zinc-50 px-1.5 py-1 dark:border-zinc-700 dark:bg-zinc-900">
        <button type="button" className={`${btn} font-bold`} title="Negrita" onMouseDown={(e) => e.preventDefault()} onClick={() => exec("bold")} disabled={disabled}>B</button>
        <button type="button" className={`${btn} italic`} title="Cursiva" onMouseDown={(e) => e.preventDefault()} onClick={() => exec("italic")} disabled={disabled}>I</button>
        <button type="button" className={`${btn} underline`} title="Subrayado" onMouseDown={(e) => e.preventDefault()} onClick={() => exec("underline")} disabled={disabled}>U</button>
        <div className={sep} aria-hidden />
        <button type="button" className={btn} title="Título" onMouseDown={(e) => e.preventDefault()} onClick={() => formatBlock("h2")} disabled={disabled}>H1</button>
        <button type="button" className={btn} title="Subtítulo" onMouseDown={(e) => e.preventDefault()} onClick={() => formatBlock("h3")} disabled={disabled}>H2</button>
        <button type="button" className={btn} title="Párrafo" onMouseDown={(e) => e.preventDefault()} onClick={() => formatBlock("p")} disabled={disabled}>¶</button>
        <button type="button" className={btn} title="Cita" onMouseDown={(e) => e.preventDefault()} onClick={() => formatBlock("blockquote")} disabled={disabled}>❝</button>
        <div className={sep} aria-hidden />
        <button type="button" className={btn} title="Lista con viñetas" onMouseDown={(e) => e.preventDefault()} onClick={() => exec("insertUnorderedList")} disabled={disabled}>•</button>
        <button type="button" className={btn} title="Lista numerada" onMouseDown={(e) => e.preventDefault()} onClick={() => exec("insertOrderedList")} disabled={disabled}>1.</button>
        <div className={sep} aria-hidden />
        <button type="button" className={btn} title="Alinear a la izquierda" onMouseDown={(e) => e.preventDefault()} onClick={() => exec("justifyLeft")} disabled={disabled}>⬅</button>
        <button type="button" className={btn} title="Centrar" onMouseDown={(e) => e.preventDefault()} onClick={() => exec("justifyCenter")} disabled={disabled}>↔</button>
        <button type="button" className={btn} title="Alinear a la derecha" onMouseDown={(e) => e.preventDefault()} onClick={() => exec("justifyRight")} disabled={disabled}>➡</button>
        <div className={sep} aria-hidden />
        <button type="button" className={btn} title="Insertar enlace" onMouseDown={(e) => e.preventDefault()} onClick={insertLink} disabled={disabled}>🔗</button>
        <button type="button" className={btn} title="Quitar enlace" onMouseDown={(e) => e.preventDefault()} onClick={() => exec("unlink")} disabled={disabled}>⛓️‍💥</button>
        <button type="button" className={btn} title="Insertar imagen" onMouseDown={(e) => e.preventDefault()} onClick={() => fileRef.current?.click()} disabled={disabled}>🖼️</button>
        <button type="button" className={btn} title="Limpiar formato" onMouseDown={(e) => e.preventDefault()} onClick={() => exec("removeFormat")} disabled={disabled}>✕</button>
        <div className={sep} aria-hidden />
        {/* Insertar variable */}
        <select
          aria-label="Insertar variable"
          className="rounded border border-zinc-300 bg-white px-1.5 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
          value=""
          disabled={disabled}
          onChange={(e) => {
            if (e.target.value) insertVar(e.target.value);
            e.target.value = "";
          }}
        >
          <option value="">{`{{ variable }}`}</option>
          {SUPPORTED_VARS.map((v) => (
            <option key={v.key} value={v.key}>
              {v.key} — {v.desc}
            </option>
          ))}
        </select>
      </div>

      {/* Controles de la imagen seleccionada */}
      {hasSel && !disabled && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-[oklch(52%_0.13_255)]/40 bg-[oklch(52%_0.13_255)]/8 px-2 py-1.5 text-xs">
          <span className="font-medium text-zinc-600 dark:text-zinc-300">Imagen:</span>
          <span className="text-zinc-500">Ancho</span>
          {WIDTH_PRESETS.map((w) => (
            <button key={w.value} type="button" className={btn} onClick={() => setImgWidth(w.value)}>{w.label}</button>
          ))}
          <button type="button" className={btn} title="Achicar" onClick={() => nudgeImg(-10)}>−</button>
          <button type="button" className={btn} title="Agrandar" onClick={() => nudgeImg(10)}>+</button>
          <div className={sep} aria-hidden />
          <button type="button" className={btn} title="Izquierda" onClick={() => setImgAlign("left")}>⬅</button>
          <button type="button" className={btn} title="Centrar" onClick={() => setImgAlign("center")}>↔</button>
          <button type="button" className={btn} title="Derecha" onClick={() => setImgAlign("right")}>➡</button>
          <div className={sep} aria-hidden />
          <button type="button" className={btn} onClick={recortarSel}>Recortar</button>
          <button type="button" className="rounded px-2 py-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30" onClick={removeSel}>Quitar</button>
        </div>
      )}

      {/* Lienzo editable */}
      <div
        ref={editorRef}
        contentEditable={!disabled}
        suppressContentEditableWarning
        onInput={emit}
        onClick={onEditorClick}
        role="textbox"
        aria-multiline="true"
        aria-label="Cuerpo del email"
        className="ve-canvas min-h-[320px] rounded-b-lg border border-t-0 border-zinc-300 bg-white p-4 text-sm leading-relaxed text-zinc-800 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
      />

      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg"
        onChange={pickImage}
        className="hidden"
      />

      {err && <p className="text-xs text-red-600">{err}</p>}

      <p className="text-[10px] text-zinc-400">
        Tipeá directamente. Hacé click en una imagen para redimensionarla,
        recortarla o moverla. El diseño se sanitiza al enviar.
      </p>

      {/* Modal de recorte */}
      {crop && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/50 p-4"
          onClick={() => !busy && setCrop(null)}
        >
          <div
            className="w-full max-w-lg space-y-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-xl dark:border-zinc-800 dark:bg-zinc-900"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Recortar imagen
            </h3>
            <div className="relative h-64 w-full overflow-hidden rounded-lg bg-zinc-900">
              <Cropper
                image={crop.src}
                crop={cropPos}
                zoom={zoom}
                onCropChange={setCropPos}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
              />
            </div>
            <input
              type="range"
              min={1}
              max={3}
              step={0.05}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="w-full"
              aria-label="Zoom"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCrop(null)}
                disabled={busy}
                className="rounded border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmCrop}
                disabled={busy}
                className="rounded bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
              >
                {busy ? "Subiendo…" : "Recortar y usar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
