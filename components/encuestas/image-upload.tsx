"use client";

import { useCallback, useState } from "react";
import Cropper from "react-easy-crop";
import { getCroppedBlob, type PixelCrop } from "./crop-utils";
import { buttonClass } from "@/components/ui/button";

// Sube una imagen PNG/JPG con recorte (aspecto fijo) a /api/encuestas/upload.
// La URL resultante se guarda en un input hidden `name` (la consume el form
// del editor). Muestra preview + recomendación de tamaño.
export function ImageUpload({
  name,
  value,
  aspect,
  recommend,
  label,
  disabled,
  onChange,
}: {
  name: string;
  value: string;
  aspect: number;
  recommend: string;
  label: string;
  disabled?: boolean;
  // Notifica la URL actual (subida o quitada) para previews externos.
  onChange?: (url: string) => void;
}) {
  const [url, setUrlState] = useState(value);
  const setUrl = (u: string) => {
    setUrlState(u);
    onChange?.(u);
  };
  const [src, setSrc] = useState<string | null>(null); // imagen en edición (dataURL)
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [areaPx, setAreaPx] = useState<PixelCrop | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onCropComplete = useCallback((_a: unknown, px: PixelCrop) => {
    setAreaPx(px);
  }, []);

  function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = ""; // permite re-elegir el mismo archivo
    if (!f) return;
    if (!["image/png", "image/jpeg"].includes(f.type)) {
      setErr("Solo PNG o JPG.");
      return;
    }
    setErr(null);
    const reader = new FileReader();
    reader.onload = () => {
      setSrc(String(reader.result));
      setZoom(1);
      setCrop({ x: 0, y: 0 });
    };
    reader.readAsDataURL(f);
  }

  async function confirmCrop() {
    if (!src || !areaPx) return;
    setBusy(true);
    setErr(null);
    try {
      const blob = await getCroppedBlob(src, areaPx);
      const fd = new FormData();
      fd.append("file", new File([blob], "img.jpg", { type: "image/jpeg" }));
      const res = await fetch("/api/encuestas/upload", { method: "POST", body: fd });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error ?? "falló la subida");
      setUrl(data.url);
      setSrc(null);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <input type="hidden" name={name} value={url} />
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">
          {label}
        </span>
        <span className="text-[11px] text-zinc-400">{recommend}</span>
      </div>

      {url && !src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="max-h-40 w-full rounded-lg object-cover" />
      )}

      {/* Editor de recorte */}
      {src && (
        <div className="space-y-2">
          <div className="relative h-56 w-full overflow-hidden rounded-lg bg-zinc-900">
            <Cropper
              image={src}
              crop={crop}
              zoom={zoom}
              aspect={aspect}
              onCropChange={setCrop}
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
          <div className="flex gap-2">
            <button
              type="button"
              onClick={confirmCrop}
              disabled={busy}
              className={buttonClass("primary")}
            >
              {busy ? "Subiendo…" : "Recortar y subir"}
            </button>
            <button
              type="button"
              onClick={() => setSrc(null)}
              disabled={busy}
              className="rounded border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {!src && !disabled && (
        <div className="flex items-center gap-3">
          <label className="cursor-pointer rounded border border-dashed border-zinc-400 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-900">
            {url ? "Cambiar imagen" : "Subir imagen"}
            <input
              type="file"
              accept="image/png,image/jpeg"
              onChange={pickFile}
              className="hidden"
            />
          </label>
          {url && (
            <button
              type="button"
              onClick={() => setUrl("")}
              className="text-xs text-red-600 hover:underline"
            >
              Quitar
            </button>
          )}
        </div>
      )}

      {err && <p className="text-xs text-red-600">{err}</p>}
    </div>
  );
}
