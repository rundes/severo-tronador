"use client";

import { useState, useTransition } from "react";
import type { Proposal } from "@/lib/ad-proposals";
import type { ProposalMedia, PreviewFrame } from "@/lib/meta-ads";
import { buttonClass } from "@/components/ui/button";

// Tipos de las server actions pasadas como props (igual que en ad-studio).
type PreviewAdAction = (
  proposal: Proposal,
  media: ProposalMedia,
  link: string,
  cta: string,
) => Promise<{ ok: boolean; previews: PreviewFrame[]; msg: string }>;

type CrearAdAction = (input: {
  proposal: Proposal;
  media: ProposalMedia;
  link: string;
  cta: string;
  adsetId?: string;
  nuevo?: {
    campaignName: string;
    objective: string;
    adsetName: string;
    dailyBudgetUsd: number;
    days: number;
    pais: string;
  };
}) => Promise<{ ok: boolean; id?: string; msg: string }>;

type ListRefAction = () => Promise<{ id: string; name: string }[]>;
type ListAdsetsAction = (campaignId: string) => Promise<{ id: string; name: string }[]>;

const CTAS = ["LEARN_MORE", "SIGN_UP", "GET_OFFER", "CONTACT_US", "WATCH_MORE"] as const;
type Cta = (typeof CTAS)[number];

const inputCls =
  "rounded border border-zinc-300 bg-white px-2.5 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900";

// Construye una Proposal mínima a partir del mensaje ingresado manualmente.
// El generador de Meta usa el campo `platforms.facebook.post` como mensaje.
function buildManualProposal(mensaje: string): Proposal {
  return {
    id: "difusion-manual",
    provider: "manual",
    modelName: "",
    label: "Difusión",
    angle: "",
    platforms: {
      facebook: { post: mensaje },
    },
  } satisfies Proposal;
}

export function MetaAdComposer({
  previewAdAction,
  crearAdAction,
  listCampaignsAction,
  listAdsetsAction,
}: {
  previewAdAction: PreviewAdAction;
  crearAdAction: CrearAdAction;
  listCampaignsAction: ListRefAction;
  listAdsetsAction: ListAdsetsAction;
}) {
  // ── Inputs del formulario ────────────────────────────────────────────────
  const [mensaje, setMensaje] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [link, setLink] = useState("");
  const [cta, setCta] = useState<Cta>("LEARN_MORE");

  // ── Estado del preview ───────────────────────────────────────────────────
  const [previews, setPreviews] = useState<PreviewFrame[]>([]);
  const [fmtIdx, setFmtIdx] = useState(0);
  const [previewMsg, setPreviewMsg] = useState("");

  // ── Estado de creación del anuncio ───────────────────────────────────────
  const [modoNuevo, setModoNuevo] = useState(true);
  const [campaigns, setCampaigns] = useState<{ id: string; name: string }[]>([]);
  const [adsets, setAdsets] = useState<{ id: string; name: string }[]>([]);
  const [campaignId, setCampaignId] = useState("");
  const [adsetId, setAdsetId] = useState("");
  const [campaignName, setCampaignName] = useState("");
  const [adsetName, setAdsetName] = useState("");
  const [presupuesto, setPresupuesto] = useState(5);
  const [dias, setDias] = useState(7);
  const [pais, setPais] = useState("AR");
  const [crearMsg, setCrearMsg] = useState("");
  const [adCreado, setAdCreado] = useState<string | null>(null);

  const [pending, start] = useTransition();

  // ── Previsualizar ────────────────────────────────────────────────────────
  function previsualizarAd() {
    if (!link.trim() || !/^https?:\/\//i.test(link)) {
      setPreviewMsg("Poné un link de destino válido (https://…).");
      return;
    }
    if (!imageUrl.trim() && !videoUrl.trim()) {
      setPreviewMsg("Ingresá al menos una URL de imagen o video.");
      return;
    }
    setPreviewMsg("");
    const proposal = buildManualProposal(mensaje);
    const media: ProposalMedia = {
      ...(imageUrl.trim() ? { imageUrl: imageUrl.trim() } : {}),
      ...(videoUrl.trim() ? { videoUrl: videoUrl.trim() } : {}),
    };
    start(async () => {
      const r = await previewAdAction(proposal, media, link.trim(), cta);
      setPreviewMsg(r.msg);
      if (r.ok) {
        setPreviews(r.previews);
        setFmtIdx(0);
      }
    });
  }

  // ── Cargar campañas/conjuntos ────────────────────────────────────────────
  function cargarCampaigns() {
    start(async () => {
      const list = await listCampaignsAction();
      setCampaigns(list);
    });
  }

  function cargarAdsets(cid: string) {
    setCampaignId(cid);
    setAdsetId("");
    start(async () => {
      const list = await listAdsetsAction(cid);
      setAdsets(list);
    });
  }

  // ── Crear anuncio ────────────────────────────────────────────────────────
  function crearAd() {
    if (!link.trim() || !/^https?:\/\//i.test(link)) {
      setCrearMsg("Poné el link de destino (https://…).");
      return;
    }
    if (!imageUrl.trim() && !videoUrl.trim()) {
      setCrearMsg("Ingresá al menos una URL de imagen o video.");
      return;
    }
    setCrearMsg("");
    setAdCreado(null);
    const proposal = buildManualProposal(mensaje);
    const media: ProposalMedia = {
      ...(imageUrl.trim() ? { imageUrl: imageUrl.trim() } : {}),
      ...(videoUrl.trim() ? { videoUrl: videoUrl.trim() } : {}),
    };
    start(async () => {
      const r = await crearAdAction({
        proposal,
        media,
        link: link.trim(),
        cta,
        ...(modoNuevo || !adsetId
          ? {
              nuevo: {
                campaignName: campaignName.trim() || "Difusión · campaña",
                objective: "OUTCOME_TRAFFIC",
                adsetName: adsetName.trim() || "Difusión · conjunto",
                dailyBudgetUsd: presupuesto,
                days: dias,
                pais: pais.toUpperCase().slice(0, 2) || "AR",
              },
            }
          : { adsetId }),
      });
      setCrearMsg(r.msg);
      if (r.ok && r.id) setAdCreado(r.id);
    });
  }

  return (
    <div className="space-y-5">
      {/* Encabezado explicativo */}
      <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-400">
        <p className="font-medium text-zinc-700 dark:text-zinc-300">
          ¿Cuál es la diferencia entre este compositor y el Estudio de propuestas?
        </p>
        <ul className="mt-1.5 list-disc space-y-0.5 pl-4">
          <li>
            <strong>Estudio de propuestas (pestaña de arriba)</strong>: la IA (Gemini / SiliconFlow / Claude)
            genera el <em>texto e imagen</em> del aviso a partir de un brief.
          </li>
          <li>
            <strong>Este compositor</strong>: vos redactás el copy directamente y usás el{" "}
            <strong>generador de Meta (Marketing API)</strong> para obtener la{" "}
            <em>vista previa oficial</em> del anuncio en cada placement y para
            publicarlo en PAUSADO.
          </li>
        </ul>
      </div>

      {/* ── Formulario de composición ──────────────────────────────────────── */}
      <div className="space-y-3">
        <label className="flex flex-col gap-1 text-xs text-zinc-500">
          Mensaje / copy del anuncio
          <textarea
            value={mensaje}
            onChange={(e) => setMensaje(e.target.value)}
            rows={4}
            placeholder="Escribí el texto que va a aparecer en el anuncio de Meta."
            className={`${inputCls} w-full`}
          />
        </label>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs text-zinc-500">
            URL de imagen
            <input
              type="url"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://…/imagen.jpg"
              className={`${inputCls} w-full font-mono`}
            />
            <span className="text-[11px] text-zinc-400">
              Podés pegar una URL generada por la IA o una imagen ya publicada.
            </span>
          </label>

          <label className="flex flex-col gap-1 text-xs text-zinc-500">
            URL de video (opcional)
            <input
              type="url"
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              placeholder="https://…/video.mp4"
              className={`${inputCls} w-full font-mono`}
            />
            <span className="text-[11px] text-zinc-400">
              Si usás video, se sube a Meta antes de crear la vista previa.
            </span>
          </label>
        </div>

        <div className="flex flex-wrap gap-3">
          <label className="flex flex-1 flex-col gap-1 text-xs text-zinc-500">
            Link de destino
            <input
              type="url"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://tu-encuesta-o-sitio.com"
              className={`${inputCls} w-full`}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-zinc-500">
            CTA (botón del anuncio)
            <select
              value={cta}
              onChange={(e) => setCta(e.target.value as Cta)}
              className={inputCls}
            >
              {CTAS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        </div>

        <button
          type="button"
          onClick={previsualizarAd}
          disabled={pending}
          className={buttonClass("secondary")}
        >
          {pending ? "Generando vista previa…" : "Previsualizar con el generador de Meta"}
        </button>
        {previewMsg && (
          <p className="text-[11px] text-zinc-400">{previewMsg}</p>
        )}
      </div>

      {/* ── Vista previa generada por Meta ─────────────────────────────────── */}
      {previews.length > 0 && (
        <div className="space-y-2 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">
              Vista previa generada por Meta (Marketing API)
            </span>
            <span className="rounded bg-zinc-100 px-2 py-0.5 text-[10px] uppercase tracking-wider text-zinc-500 dark:bg-zinc-800">
              {previews.length} placement{previews.length !== 1 ? "s" : ""}
            </span>
          </div>
          {/* Selector de placement */}
          <div className="flex flex-wrap gap-1">
            {previews.map((f, i) => (
              <button
                key={f.format}
                type="button"
                onClick={() => setFmtIdx(i)}
                className={`rounded border px-2 py-0.5 text-[10px] transition-colors ${
                  fmtIdx === i
                    ? "border-[oklch(52%_0.13_255)] text-[oklch(52%_0.13_255)]"
                    : "border-zinc-200 text-zinc-500 hover:border-zinc-400 dark:border-zinc-700 dark:hover:border-zinc-500"
                }`}
              >
                {f.format}
              </button>
            ))}
          </div>
          <iframe
            title="meta-ad-preview"
            sandbox="allow-scripts allow-same-origin allow-popups"
            srcDoc={previews[fmtIdx]?.html ?? ""}
            className="h-[480px] w-full rounded-md border border-zinc-200 bg-white dark:border-zinc-800"
          />
        </div>
      )}

      {/* ── Crear anuncio (pausado) ─────────────────────────────────────────── */}
      <div className="space-y-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">
            Crear anuncio (pausado)
          </span>
          <button
            type="button"
            onClick={() => {
              setModoNuevo(!modoNuevo);
              if (!campaigns.length) cargarCampaigns();
            }}
            className="text-[11px] text-zinc-500 underline-offset-2 hover:underline"
          >
            {modoNuevo ? "Usar campaña/conjunto existente" : "Crear campaña y conjunto nuevos"}
          </button>
        </div>

        <p className="text-[11px] text-zinc-400">
          Se crea en estado <strong>PAUSADO</strong>: no gasta hasta que lo actives en el
          Administrador de anuncios de Meta.
        </p>

        {modoNuevo ? (
          <div className="grid grid-cols-2 gap-2">
            <input
              className={inputCls}
              placeholder="Nombre de la campaña"
              value={campaignName}
              onChange={(e) => setCampaignName(e.target.value)}
            />
            <input
              className={inputCls}
              placeholder="Nombre del conjunto"
              value={adsetName}
              onChange={(e) => setAdsetName(e.target.value)}
            />
            <label className="flex flex-col gap-0.5 text-xs text-zinc-500">
              Presupuesto diario (USD)
              <input
                className={inputCls}
                type="number"
                min={1}
                step={1}
                value={presupuesto}
                onChange={(e) => setPresupuesto(Number(e.target.value))}
              />
            </label>
            <label className="flex flex-col gap-0.5 text-xs text-zinc-500">
              Días
              <input
                className={inputCls}
                type="number"
                min={1}
                max={90}
                value={dias}
                onChange={(e) => setDias(Number(e.target.value))}
              />
            </label>
            <label className="flex flex-col gap-0.5 text-xs text-zinc-500">
              País (ISO-2)
              <input
                className={`${inputCls} uppercase`}
                maxLength={2}
                value={pais}
                onChange={(e) => setPais(e.target.value)}
              />
            </label>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <select
              className={inputCls}
              value={campaignId}
              onFocus={() => {
                if (!campaigns.length) cargarCampaigns();
              }}
              onChange={(e) => cargarAdsets(e.target.value)}
            >
              <option value="">— Elegí una campaña —</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select
              className={inputCls}
              value={adsetId}
              onChange={(e) => setAdsetId(e.target.value)}
              disabled={!adsets.length}
            >
              <option value="">— Elegí un conjunto —</option>
              {adsets.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <button
          type="button"
          onClick={crearAd}
          disabled={pending}
          className={buttonClass("primary")}
        >
          {pending ? "Creando anuncio…" : "Crear anuncio (pausado)"}
        </button>

        {adCreado && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300">
            <p>
              Anuncio creado en PAUSADO.{" "}
              <span className="font-mono text-[11px]">{adCreado}</span>
            </p>
            <p className="mt-1 text-[11px]">
              Lo podés activar en{" "}
              <a
                href="?tab=anuncios"
                className="underline underline-offset-2 hover:text-emerald-700 dark:hover:text-emerald-200"
              >
                Mis anuncios
              </a>{" "}
              o en el Administrador de anuncios de Meta.
            </p>
          </div>
        )}

        {crearMsg && !adCreado && (
          <p className="text-[11px] text-zinc-400">{crearMsg}</p>
        )}
      </div>
    </div>
  );
}
