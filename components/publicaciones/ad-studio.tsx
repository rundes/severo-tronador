"use client";

import { useEffect, useState, useTransition, type Dispatch, type SetStateAction } from "react";
import type {
  Proposal,
  Platform,
  BriefRefs,
} from "@/lib/ad-proposals";
import type { PreviewFrame, ProposalMedia } from "@/lib/meta-ads";
import type { GenProposalsResult } from "@/app/(dashboard)/publicaciones/actions";
import type { SavedBrief, BriefInput } from "@/lib/estudio-briefs";
import { buttonClass } from "@/components/ui/button";
import { ImageUpload } from "@/components/encuestas/image-upload";

type GenAction = (prompt: string, platforms: string[], brief?: BriefRefs) => Promise<GenProposalsResult>;
type RefineAction = (
  base: Proposal,
  refinePrompt: string,
  platforms: string[],
  brief?: BriefRefs,
) => Promise<{ ok: boolean; proposal?: Proposal; msg: string }>;
type PublishAction = (
  mensaje: string,
  targets: string[],
  imageUrl?: string,
) => Promise<{ ok: boolean; msg: string }>;
type ImageAction = (prompt: string) => Promise<{ ok: boolean; url?: string; msg: string }>;
type VideoAction = (prompt: string) => Promise<{ ok: boolean; requestId?: string; msg: string }>;
type VideoStatusAction = (
  requestId: string,
) => Promise<{ ok: boolean; status: string; url?: string; reason?: string }>;

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
    segmentId?: string;
  };
}) => Promise<{ ok: boolean; id?: string; msg: string }>;
type ListRefAction = () => Promise<{ id: string; name: string }[]>;
type ListAdsetsAction = (campaignId: string) => Promise<{ id: string; name: string }[]>;
type ListSegmentsAction = () => Promise<{ id: string; nombre: string }[]>;

interface MediaState {
  imgPrompt?: string;
  imageUrl?: string;
  imgBusy?: boolean;
  imgMsg?: string;
  vidPrompt?: string;
  videoReq?: string;
  videoUrl?: string;
  videoStatus?: string;
  vidBusy?: boolean;
  vidMsg?: string;
}

const PLATFORMS: { id: Platform; label: string; icon: string }[] = [
  { id: "instagram", label: "Instagram", icon: "📸" },
  { id: "facebook", label: "Facebook", icon: "📘" },
  { id: "whatsapp", label: "WhatsApp", icon: "💬" },
  { id: "x", label: "X", icon: "✖️" },
  { id: "tiktok", label: "TikTok", icon: "🎵" },
  { id: "youtube", label: "YouTube", icon: "▶️" },
];

const inputCls =
  "rounded border border-zinc-300 bg-white px-2.5 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900";

const BRIEF_STORAGE_KEY = "adstudio:brief:v1";

function fieldText(v: string | string[]): string {
  return Array.isArray(v) ? v.join("\n") : String(v);
}
function platformText(content: Record<string, string | string[]>): string {
  return Object.entries(content)
    .map(([k, v]) => `${k}:\n${fieldText(v)}`)
    .join("\n\n");
}

type SaveBriefAction = (
  input: BriefInput,
  id?: string,
) => Promise<{ ok: boolean; brief?: SavedBrief; msg: string }>;
type DeleteBriefAction = (id: string) => Promise<{ ok: boolean; msg: string }>;

export function AdStudio({
  genAction,
  refineAction,
  publishAction,
  imageAction,
  videoAction,
  videoStatusAction,
  previewAdAction,
  crearAdAction,
  listCampaignsAction,
  listAdsetsAction,
  listSegmentsAction,
  models,
  savedBriefs,
  saveBriefAction,
  deleteBriefAction,
  listBriefsAction,
}: {
  genAction: GenAction;
  refineAction: RefineAction;
  publishAction: PublishAction;
  imageAction: ImageAction;
  videoAction: VideoAction;
  videoStatusAction: VideoStatusAction;
  previewAdAction: PreviewAdAction;
  crearAdAction: CrearAdAction;
  listCampaignsAction: ListRefAction;
  listAdsetsAction: ListAdsetsAction;
  listSegmentsAction: ListSegmentsAction;
  models: string[];
  savedBriefs: SavedBrief[];
  saveBriefAction: SaveBriefAction;
  deleteBriefAction: DeleteBriefAction;
  listBriefsAction: () => Promise<SavedBrief[]>;
}) {
  const [step, setStep] = useState(1);
  const [prompt, setPrompt] = useState("");
  // Referencias del brief: links/imágenes/videos que alimentan a los modelos.
  // Persisten en localStorage para no perderse entre pasos ni al recargar.
  const [links, setLinks] = useState<string[]>([]);
  const [images, setImages] = useState<string[]>([]);
  const [videos, setVideos] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [platforms, setPlatforms] = useState<Set<Platform>>(
    new Set(PLATFORMS.map((p) => p.id)),
  );

  // Hidratar desde localStorage post-montaje (no en el initializer) para evitar
  // un mismatch de hidratación entre el HTML del server y el cliente.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(BRIEF_STORAGE_KEY);
      if (raw) {
        const d = JSON.parse(raw) as Partial<BriefRefs & { prompt: string }>;
        if (typeof d.prompt === "string") setPrompt(d.prompt);
        if (Array.isArray(d.links)) setLinks(d.links);
        if (Array.isArray(d.images)) setImages(d.images);
        if (Array.isArray(d.videos)) setVideos(d.videos);
      }
    } catch {
      // ignore (storage no disponible / JSON inválido)
    }
    setLoaded(true);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(BRIEF_STORAGE_KEY, JSON.stringify({ prompt, links, images, videos }));
    } catch {
      // ignore
    }
  }, [loaded, prompt, links, images, videos]);

  const brief: BriefRefs = { links, images, videos };
  const refCount = links.length + images.length + videos.length;

  // Contextos guardados (servidor): cargar / guardar / actualizar / eliminar.
  const [briefs, setBriefs] = useState<SavedBrief[]>(savedBriefs);
  const [currentBriefId, setCurrentBriefId] = useState<string | null>(null);
  const [briefName, setBriefName] = useState("");
  const [briefMsg, setBriefMsg] = useState("");
  const [briefBusy, startBrief] = useTransition();

  function loadBrief(b: SavedBrief) {
    setPrompt(b.prompt ?? "");
    setLinks(b.links ?? []);
    setImages(b.images ?? []);
    setVideos(b.videos ?? []);
    if (b.platforms?.length) setPlatforms(new Set(b.platforms as Platform[]));
    setCurrentBriefId(b.id);
    setBriefName(b.nombre);
    setBriefMsg(`Contexto «${b.nombre}» cargado.`);
  }

  function saveBrief(asNew: boolean) {
    const nombre = briefName.trim();
    if (!nombre) {
      setBriefMsg("Poné un nombre para guardar el contexto.");
      return;
    }
    const input: BriefInput = { nombre, prompt, links, images, videos, platforms: [...platforms] };
    const targetId = asNew ? undefined : currentBriefId ?? undefined;
    startBrief(async () => {
      const r = await saveBriefAction(input, targetId);
      setBriefMsg(r.msg);
      if (r.ok && r.brief) {
        setCurrentBriefId(r.brief.id);
        setBriefName(r.brief.nombre);
        try {
          setBriefs(await listBriefsAction());
        } catch {
          // mantenemos la lista actual si falla el refresh
        }
      }
    });
  }

  function removeBrief() {
    if (!currentBriefId) return;
    startBrief(async () => {
      const r = await deleteBriefAction(currentBriefId);
      setBriefMsg(r.msg);
      if (r.ok) {
        setCurrentBriefId(null);
        try {
          setBriefs(await listBriefsAction());
        } catch {
          // ignore
        }
      }
    });
  }
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [refinePrompts, setRefinePrompts] = useState<Record<string, string>>({});
  const [media, setMedia] = useState<Record<string, MediaState>>({});
  const [msg, setMsg] = useState<{ ok: boolean | null; text: string }>({ ok: null, text: "" });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function patchMedia(id: string, patch: Partial<MediaState>) {
    setMedia((m) => ({ ...m, [id]: { ...m[id], ...patch } }));
  }

  const [adState, setAdState] = useState<Record<string, {
    link?: string;
    cta?: string;
    previews?: PreviewFrame[];
    fmtIdx?: number;
    busy?: boolean;
    msg?: string;
  }>>({});
  function patchAd(id: string, patch: Partial<(typeof adState)[string]>) {
    setAdState((s) => ({ ...s, [id]: { ...s[id], ...patch } }));
  }
  const CTAS = ["LEARN_MORE", "SIGN_UP", "GET_OFFER", "CONTACT_US", "WATCH_MORE"];

  function previsualizarAd(p: Proposal) {
    const st = adState[p.id] ?? {};
    const link = (st.link ?? "").trim();
    if (!/^https?:\/\//i.test(link)) {
      patchAd(p.id, { msg: "Poné un link de destino válido (https://…)." });
      return;
    }
    const adMedia: ProposalMedia = { imageUrl: media[p.id]?.imageUrl, videoUrl: media[p.id]?.videoUrl };
    patchAd(p.id, { busy: true, msg: "" });
    start(async () => {
      const r = await previewAdAction(p, adMedia, link, st.cta ?? "LEARN_MORE");
      patchAd(p.id, { busy: false, msg: r.msg, ...(r.ok ? { previews: r.previews, fmtIdx: 0 } : {}) });
    });
  }

  const [crearState, setCrearState] = useState<Record<string, {
    campaigns?: { id: string; name: string }[];
    adsets?: { id: string; name: string }[];
    campaignId?: string;
    adsetId?: string;
    modoNuevo?: boolean;
    campaignName?: string;
    adsetName?: string;
    presupuesto?: number;
    dias?: number;
    pais?: string;
    segmentId?: string;
    busy?: boolean;
    msg?: string;
    adId?: string;
  }>>({});
  function patchCrear(id: string, patch: Partial<(typeof crearState)[string]>) {
    setCrearState((s) => ({ ...s, [id]: { ...s[id], ...patch } }));
  }

  // Segmentos guardados: se cargan la primera vez que el usuario abre el panel
  // "Crear campaña/conjunto nuevos" (lazy, para no bloquear la carga inicial).
  const [segments, setSegments] = useState<{ id: string; nombre: string }[]>([]);
  const [segmentsLoaded, setSegmentsLoaded] = useState(false);

  function ensureSegmentsLoaded() {
    if (segmentsLoaded) return;
    setSegmentsLoaded(true);
    start(async () => {
      try {
        const segs = await listSegmentsAction();
        setSegments(segs);
      } catch {
        // Ignoramos: el picker simplemente no muestra segmentos guardados.
      }
    });
  }

  function cargarCampaigns(p: Proposal) {
    start(async () => {
      const campaigns = await listCampaignsAction();
      patchCrear(p.id, { campaigns });
    });
  }
  function cargarAdsets(p: Proposal, campaignId: string) {
    patchCrear(p.id, { campaignId, adsetId: undefined });
    start(async () => {
      const adsets = await listAdsetsAction(campaignId);
      patchCrear(p.id, { adsets });
    });
  }

  function crearAd(p: Proposal) {
    const st = crearState[p.id] ?? {};
    const ad = adState[p.id] ?? {};
    const link = (ad.link ?? "").trim();
    if (!/^https?:\/\//i.test(link)) {
      patchCrear(p.id, { msg: "Poné el link de destino en el preview de arriba." });
      return;
    }
    const adMedia: ProposalMedia = { imageUrl: media[p.id]?.imageUrl, videoUrl: media[p.id]?.videoUrl };
    if (!adMedia.imageUrl && !adMedia.videoUrl) {
      patchCrear(p.id, { msg: "Generá una imagen o video primero." });
      return;
    }
    patchCrear(p.id, { busy: true, msg: "" });
    start(async () => {
      const r = await crearAdAction({
        proposal: p,
        media: adMedia,
        link,
        cta: ad.cta ?? "LEARN_MORE",
        ...(st.modoNuevo || !st.adsetId
          ? {
              nuevo: {
                campaignName: st.campaignName?.trim() || `Estudio · ${p.label}`,
                objective: "OUTCOME_TRAFFIC",
                adsetName: st.adsetName?.trim() || `Estudio · ${p.label} · conjunto`,
                dailyBudgetUsd: st.presupuesto ?? 5,
                days: st.dias ?? 7,
                pais: st.pais ?? "AR",
                ...(st.segmentId ? { segmentId: st.segmentId } : {}),
              },
            }
          : { adsetId: st.adsetId }),
      });
      patchCrear(p.id, { busy: false, msg: r.msg, ...(r.ok ? { adId: r.id } : {}) });
    });
  }

  const platformList = [...platforms];

  function togglePlatform(p: Platform) {
    setPlatforms((s) => {
      const n = new Set(s);
      if (n.has(p)) n.delete(p);
      else n.add(p);
      return n;
    });
  }
  function toggleSelect(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function generar() {
    if (!prompt.trim() || pending) return;
    start(async () => {
      const r = await genAction(prompt, platformList, brief);
      setMsg({ ok: r.ok, text: r.msg });
      if (r.ok) {
        setProposals(r.proposals);
        setSelected(new Set());
        setStep(2);
      }
    });
  }

  function afinar(p: Proposal) {
    const rp = refinePrompts[p.id]?.trim();
    if (!rp || pending) return;
    setBusyId(p.id);
    start(async () => {
      const r = await refineAction(p, rp, platformList, brief);
      setBusyId(null);
      if (r.ok && r.proposal) {
        setProposals((list) => list.map((x) => (x.id === p.id ? r.proposal! : x)));
        setMsg({ ok: true, text: `«${p.label}» afinada.` });
      } else {
        setMsg({ ok: false, text: r.msg });
      }
    });
  }

  function publicarFb(text: string, id: string, imageUrl?: string) {
    setBusyId(id);
    start(async () => {
      const r = await publishAction(text, ["fb"], imageUrl);
      setBusyId(null);
      setMsg({ ok: r.ok, text: r.msg });
    });
  }

  function genImagen(p: Proposal) {
    const prompt = (media[p.id]?.imgPrompt ?? p.angle ?? "").trim();
    if (!prompt) {
      patchMedia(p.id, { imgMsg: "Escribí un prompt para la imagen." });
      return;
    }
    patchMedia(p.id, { imgBusy: true, imgMsg: "" });
    start(async () => {
      const r = await imageAction(prompt);
      patchMedia(p.id, { imgBusy: false, imgMsg: r.msg, ...(r.ok && r.url ? { imageUrl: r.url } : {}) });
    });
  }

  function genVideo(p: Proposal) {
    const prompt = (media[p.id]?.vidPrompt ?? p.angle ?? "").trim();
    if (!prompt) {
      patchMedia(p.id, { vidMsg: "Escribí un prompt para el video." });
      return;
    }
    patchMedia(p.id, { vidBusy: true, vidMsg: "" });
    start(async () => {
      const r = await videoAction(prompt);
      patchMedia(p.id, {
        vidBusy: false,
        vidMsg: r.msg,
        ...(r.ok && r.requestId ? { videoReq: r.requestId, videoStatus: "pending" } : {}),
      });
    });
  }

  function consultarVideo(p: Proposal) {
    const req = media[p.id]?.videoReq;
    if (!req) return;
    patchMedia(p.id, { vidBusy: true });
    start(async () => {
      const r = await videoStatusAction(req);
      patchMedia(p.id, {
        vidBusy: false,
        videoStatus: r.status,
        vidMsg: r.status === "pending" ? "Todavía en proceso…" : r.status === "failed" ? (r.reason ?? "Falló") : "Video listo.",
        ...(r.url ? { videoUrl: r.url } : {}),
      });
    });
  }

  const selectedProposals = proposals.filter((p) => selected.has(p.id));

  return (
    <div className="space-y-4">
      {/* Contexto guardado: cargar / guardar / actualizar / eliminar */}
      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
        <label className="flex flex-col gap-1 text-xs text-zinc-500">
          Contexto guardado
          <select
            value={currentBriefId ?? ""}
            onChange={(e) => {
              const b = briefs.find((x) => x.id === e.target.value);
              if (b) loadBrief(b);
              else {
                setCurrentBriefId(null);
                setBriefMsg("");
              }
            }}
            className={`${inputCls} min-w-52`}
          >
            <option value="">— Nuevo / sin guardar —</option>
            {briefs.map((b) => (
              <option key={b.id} value={b.id}>
                {b.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-zinc-500">
          Nombre
          <input
            value={briefName}
            onChange={(e) => setBriefName(e.target.value)}
            placeholder="Ej: «Encuesta seguridad Maipú»"
            className={`${inputCls} min-w-48`}
          />
        </label>
        <button
          type="button"
          onClick={() => saveBrief(false)}
          disabled={briefBusy || !briefName.trim()}
          className={buttonClass("secondary", "sm")}
        >
          {briefBusy ? "Guardando…" : currentBriefId ? "Guardar cambios" : "Guardar contexto"}
        </button>
        {currentBriefId && (
          <button
            type="button"
            onClick={() => saveBrief(true)}
            disabled={briefBusy}
            className={buttonClass("ghost", "sm")}
          >
            Guardar como nuevo
          </button>
        )}
        {currentBriefId && (
          <button
            type="button"
            onClick={removeBrief}
            disabled={briefBusy}
            className={buttonClass("ghost", "sm")}
          >
            Eliminar
          </button>
        )}
        {briefMsg && <span className="text-[11px] text-zinc-500">{briefMsg}</span>}
      </div>

      {/* Stepper */}
      <ol className="flex flex-wrap gap-2 text-xs">
        {["Brief", "Propuestas", "Afinar", "Difundir"].map((label, i) => {
          const n = i + 1;
          return (
            <li
              key={label}
              className={`rounded-full px-3 py-1 ${
                step === n
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : step > n
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                    : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800"
              }`}
            >
              {n}. {label}
            </li>
          );
        })}
      </ol>

      {msg.ok !== null && (
        <p className={`text-xs ${msg.ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
          {msg.text}
        </p>
      )}

      {/* Brief siempre a mano (pasos 2-4): editable + regenerar con cambios */}
      {step > 1 && (
        <details className="rounded-lg border border-zinc-200 bg-zinc-50/60 dark:border-zinc-800 dark:bg-zinc-900/40">
          <summary className="cursor-pointer select-none px-3 py-2 text-xs font-medium text-zinc-600 dark:text-zinc-300">
            📌 Brief y referencias
            {refCount > 0 && (
              <span className="ml-1.5 rounded-full bg-zinc-200 px-1.5 py-0.5 text-[10px] tabular-nums text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300">
                {refCount} ref
              </span>
            )}
            <span className="ml-1.5 font-normal text-zinc-400">— ajustá y volvé a generar</span>
          </summary>
          <div className="space-y-3 border-t border-zinc-200 p-3 dark:border-zinc-800">
            <BriefEditor
              prompt={prompt}
              setPrompt={setPrompt}
              links={links}
              setLinks={setLinks}
              images={images}
              setImages={setImages}
              videos={videos}
              setVideos={setVideos}
            />
            <button
              type="button"
              onClick={generar}
              disabled={pending || !prompt.trim() || models.length === 0}
              className={buttonClass("secondary", "sm")}
            >
              {pending ? "Generando…" : "↻ Volver a generar con estos cambios"}
            </button>
          </div>
        </details>
      )}

      {/* Paso 1 — Brief */}
      {step === 1 && (
        <div className="space-y-3">
          <BriefEditor
            prompt={prompt}
            setPrompt={setPrompt}
            links={links}
            setLinks={setLinks}
            images={images}
            setImages={setImages}
            videos={videos}
            setVideos={setVideos}
          />
          <div className="flex flex-col gap-1 text-xs text-zinc-500">
            <span>Plataformas (formatos a generar)</span>
            <div className="flex flex-wrap gap-2 pt-1">
              {PLATFORMS.map((p) => (
                <label
                  key={p.id}
                  className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-zinc-300 px-2.5 py-1.5 text-xs has-[:checked]:border-[oklch(52%_0.13_255)] has-[:checked]:bg-[oklch(52%_0.13_255)]/8 dark:border-zinc-700"
                >
                  <input
                    type="checkbox"
                    checked={platforms.has(p.id)}
                    onChange={() => togglePlatform(p.id)}
                    className="sr-only"
                  />
                  {p.icon} {p.label}
                </label>
              ))}
            </div>
          </div>
          <p className="text-[11px] text-zinc-400">
            Modelos disponibles: {models.length ? models.join(", ") : "ninguno (configurá SiliconFlow / Google AI / Claude en Conectores)"}.
          </p>
          <button
            type="button"
            onClick={generar}
            disabled={pending || !prompt.trim() || platforms.size === 0 || models.length === 0}
            className="inline-flex items-center gap-2 rounded bg-[oklch(52%_0.13_255)] px-4 py-2 text-sm font-medium text-white hover:bg-[oklch(47%_0.13_255)] disabled:opacity-50"
          >
            {pending ? "Generando con todos los modelos…" : "✦ Generar propuestas"}
          </button>
        </div>
      )}

      {/* Paso 2 — Propuestas (preseleccionar) */}
      {step === 2 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-500">
              {proposals.length} propuestas · seleccioná las que quieras afinar
            </span>
            <div className="flex gap-2">
              <button type="button" onClick={() => setStep(1)} className="rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700">
                ← Brief
              </button>
              <button
                type="button"
                onClick={() => setStep(3)}
                disabled={selected.size === 0}
                className={buttonClass("primary", "sm")}
              >
                Afinar {selected.size} →
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {proposals.map((p) => (
              <ProposalCard key={p.id} p={p} selectable selected={selected.has(p.id)} onSelect={() => toggleSelect(p.id)} />
            ))}
          </div>
        </div>
      )}

      {/* Paso 3 — Afinar cada propuesta */}
      {step === 3 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-500">Afiná cada propuesta con un prompt particular.</span>
            <div className="flex gap-2">
              <button type="button" onClick={() => setStep(2)} className="rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700">
                ← Propuestas
              </button>
              <button type="button" onClick={() => setStep(4)} className={buttonClass("primary", "sm")}>
                Difundir →
              </button>
            </div>
          </div>
          <div className="space-y-3">
            {selectedProposals.map((p) => (
              <div key={p.id} className="space-y-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
                <ProposalCard p={p} />
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    value={refinePrompts[p.id] ?? ""}
                    onChange={(e) => setRefinePrompts((m) => ({ ...m, [p.id]: e.target.value }))}
                    placeholder="Ajuste: ej «más corto y con una pregunta directa»"
                    className={`${inputCls} flex-1`}
                  />
                  <button
                    type="button"
                    onClick={() => afinar(p)}
                    disabled={pending || !(refinePrompts[p.id] ?? "").trim()}
                    className={buttonClass("primary")}
                  >
                    {busyId === p.id ? "Afinando…" : "Afinar"}
                  </button>
                </div>

                {/* Medios: imagen + video */}
                <div className="grid grid-cols-1 gap-3 rounded-md border border-zinc-100 p-2 dark:border-zinc-800 sm:grid-cols-2">
                  <div className="space-y-1">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">🖼️ Imagen</span>
                    <input
                      value={media[p.id]?.imgPrompt ?? p.angle ?? ""}
                      onChange={(e) => patchMedia(p.id, { imgPrompt: e.target.value })}
                      placeholder="Prompt de la imagen"
                      className={`${inputCls} w-full`}
                    />
                    <button
                      type="button"
                      onClick={() => genImagen(p)}
                      disabled={pending}
                      className="rounded bg-zinc-700 px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50 dark:bg-zinc-200 dark:text-zinc-900"
                    >
                      {media[p.id]?.imgBusy ? "Generando…" : "Generar imagen"}
                    </button>
                    {media[p.id]?.imageUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={media[p.id]!.imageUrl} alt="" className="mt-2 max-h-[32rem] w-full rounded-lg border border-zinc-200 object-contain dark:border-zinc-800" />
                    )}
                    {media[p.id]?.imgMsg && <p className="text-[11px] text-zinc-400">{media[p.id]!.imgMsg}</p>}
                  </div>
                  <div className="space-y-1">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">🎬 Video</span>
                    <input
                      value={media[p.id]?.vidPrompt ?? p.angle ?? ""}
                      onChange={(e) => patchMedia(p.id, { vidPrompt: e.target.value })}
                      placeholder="Prompt del video (SiliconFlow)"
                      className={`${inputCls} w-full`}
                    />
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => genVideo(p)}
                        disabled={pending}
                        className="rounded bg-zinc-700 px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50 dark:bg-zinc-200 dark:text-zinc-900"
                      >
                        {media[p.id]?.vidBusy ? "Procesando…" : "Generar video"}
                      </button>
                      {media[p.id]?.videoReq && !media[p.id]?.videoUrl && (
                        <button
                          type="button"
                          onClick={() => consultarVideo(p)}
                          disabled={pending}
                          className="rounded border border-zinc-300 px-2.5 py-1 text-xs disabled:opacity-50 dark:border-zinc-700"
                        >
                          Consultar estado
                        </button>
                      )}
                    </div>
                    {media[p.id]?.videoUrl && (
                      <video src={media[p.id]!.videoUrl} controls className="mt-2 max-h-[32rem] w-full rounded-lg border border-zinc-200 dark:border-zinc-800" />
                    )}
                    {media[p.id]?.vidMsg && <p className="text-[11px] text-zinc-400">{media[p.id]!.vidMsg}</p>}
                  </div>
                </div>

                {/* Anuncio Meta: preview en todos los placements */}
                <details open className="rounded-md border border-indigo-100 bg-indigo-50/30 p-2 dark:border-indigo-900/40 dark:bg-indigo-950/20">
                  <summary className="cursor-pointer select-none text-xs font-semibold text-zinc-700 dark:text-zinc-200">
                    📣 Anuncio Meta — previsualizá y publicá con la API de Meta
                  </summary>
                  <div className="space-y-2 pt-2">
                    <div className="flex flex-wrap gap-2">
                      <input
                        value={adState[p.id]?.link ?? ""}
                        onChange={(e) => patchAd(p.id, { link: e.target.value })}
                        placeholder="Link de destino (https://…)"
                        className={`${inputCls} flex-1`}
                      />
                      <select
                        value={adState[p.id]?.cta ?? "LEARN_MORE"}
                        onChange={(e) => patchAd(p.id, { cta: e.target.value })}
                        className={inputCls}
                      >
                        {CTAS.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => previsualizarAd(p)}
                        disabled={pending || (!media[p.id]?.imageUrl && !media[p.id]?.videoUrl)}
                        className={buttonClass("secondary", "sm")}
                      >
                        {adState[p.id]?.busy ? "Generando…" : "Previsualizar anuncio"}
                      </button>
                    </div>
                    {!media[p.id]?.imageUrl && !media[p.id]?.videoUrl && (
                      <p className="text-[11px] text-zinc-400">Generá una imagen o video arriba para previsualizar el anuncio.</p>
                    )}
                    {adState[p.id]?.previews?.length ? (
                      <div className="space-y-2">
                        <div className="flex flex-wrap gap-1">
                          {adState[p.id]!.previews!.map((f, i) => (
                            <button
                              key={f.format}
                              type="button"
                              onClick={() => patchAd(p.id, { fmtIdx: i })}
                              className={`rounded border px-2 py-0.5 text-[10px] ${
                                (adState[p.id]?.fmtIdx ?? 0) === i
                                  ? "border-[oklch(52%_0.13_255)] text-zinc-900 dark:text-zinc-100"
                                  : "border-zinc-200 text-zinc-500 dark:border-zinc-700"
                              }`}
                            >
                              {f.format}
                            </button>
                          ))}
                        </div>
                        <iframe
                          title={`adpreview-${p.id}`}
                          sandbox="allow-scripts allow-same-origin allow-popups"
                          srcDoc={adState[p.id]!.previews![adState[p.id]?.fmtIdx ?? 0]?.html ?? ""}
                          className="h-[480px] w-full rounded-md border border-zinc-200 bg-white dark:border-zinc-800"
                        />
                      </div>
                    ) : null}
                    {adState[p.id]?.msg && <p className="text-[11px] text-zinc-400">{adState[p.id]!.msg}</p>}

                    {/* Crear el anuncio (PAUSED) */}
                    <div className="space-y-2 rounded-md border border-zinc-100 p-2 dark:border-zinc-800">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">Crear anuncio (pausado)</span>
                        <button
                          type="button"
                          onClick={() => {
                            const goingNuevo = !crearState[p.id]?.modoNuevo;
                            patchCrear(p.id, { modoNuevo: goingNuevo });
                            if (!crearState[p.id]?.campaigns) cargarCampaigns(p);
                            if (goingNuevo) ensureSegmentsLoaded();
                          }}
                          className="text-[11px] text-zinc-500 underline-offset-2 hover:underline"
                        >
                          {crearState[p.id]?.modoNuevo ? "Usar existente" : "Crear campaña/conjunto nuevos"}
                        </button>
                      </div>

                      {crearState[p.id]?.modoNuevo ? (
                        <div className="space-y-2">
                          <div className="grid grid-cols-2 gap-2">
                            <input className={inputCls} placeholder="Nombre campaña" value={crearState[p.id]?.campaignName ?? ""} onChange={(e) => patchCrear(p.id, { campaignName: e.target.value })} />
                            <input className={inputCls} placeholder="Nombre conjunto" value={crearState[p.id]?.adsetName ?? ""} onChange={(e) => patchCrear(p.id, { adsetName: e.target.value })} />
                            <input className={inputCls} type="number" min={1} placeholder="USD/día" value={crearState[p.id]?.presupuesto ?? 5} onChange={(e) => patchCrear(p.id, { presupuesto: Number(e.target.value) })} />
                            <input className={inputCls} type="number" min={1} placeholder="Días" value={crearState[p.id]?.dias ?? 7} onChange={(e) => patchCrear(p.id, { dias: Number(e.target.value) })} />
                            <input className={`${inputCls} uppercase`} maxLength={2} placeholder="País" value={crearState[p.id]?.pais ?? "AR"} onChange={(e) => patchCrear(p.id, { pais: e.target.value })} />
                          </div>
                          {/* Segmento / Custom Audience */}
                          <div className="space-y-0.5">
                            <label className="flex flex-col gap-1 text-[11px] text-zinc-500">
                              Targetear segmento (Custom Audience)
                              <select
                                className={inputCls}
                                value={crearState[p.id]?.segmentId ?? ""}
                                onFocus={ensureSegmentsLoaded}
                                onChange={(e) => patchCrear(p.id, { segmentId: e.target.value || undefined })}
                              >
                                <option value="">— Sin segmento (targeting nativo de Meta) —</option>
                                {segments.map((s) => (
                                  <option key={s.id} value={s.id}>{s.nombre}</option>
                                ))}
                              </select>
                            </label>
                            <p className="text-[10px] text-zinc-400">
                              Los emails/teléfonos del segmento se hashean con SHA-256 antes de enviarse a Meta. Requiere aceptar los Términos de Custom Audiences en Meta Business.
                            </p>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          <select
                            className={inputCls}
                            value={crearState[p.id]?.campaignId ?? ""}
                            onFocus={() => { if (!crearState[p.id]?.campaigns) cargarCampaigns(p); }}
                            onChange={(e) => cargarAdsets(p, e.target.value)}
                          >
                            <option value="">— Campaña —</option>
                            {crearState[p.id]?.campaigns?.map((c) => (
                              <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                          </select>
                          <select
                            className={inputCls}
                            value={crearState[p.id]?.adsetId ?? ""}
                            onChange={(e) => patchCrear(p.id, { adsetId: e.target.value })}
                            disabled={!crearState[p.id]?.adsets?.length}
                          >
                            <option value="">— Conjunto —</option>
                            {crearState[p.id]?.adsets?.map((a) => (
                              <option key={a.id} value={a.id}>{a.name}</option>
                            ))}
                          </select>
                        </div>
                      )}

                      <button type="button" onClick={() => crearAd(p)} disabled={pending || crearState[p.id]?.busy} className={buttonClass("primary", "sm")}>
                        {crearState[p.id]?.busy ? "Creando…" : "Crear anuncio (pausado)"}
                      </button>
                      {crearState[p.id]?.adId && (
                        <a href="/difusion" className="text-[11px] text-[oklch(52%_0.13_255)] underline-offset-2 hover:underline">
                          Ver en Difusión → ({crearState[p.id]!.adId})
                        </a>
                      )}
                      {crearState[p.id]?.msg && <p className="text-[11px] text-zinc-400">{crearState[p.id]!.msg}</p>}
                    </div>
                  </div>
                </details>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Paso 4 — Difundir (elegir canal recién acá) */}
      {step === 4 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-500">
              Elegí por dónde difundir cada propuesta. Copiá el contenido o publicalo donde haya conexión.
            </span>
            <button type="button" onClick={() => setStep(3)} className="rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700">
              ← Afinar
            </button>
          </div>
          {selectedProposals.map((p) => (
            <div key={p.id} className="space-y-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
              <div className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                {p.label} {p.angle && <span className="font-normal text-zinc-400">· {p.angle}</span>}
              </div>
              {(media[p.id]?.imageUrl || media[p.id]?.videoUrl) && (
                <div className="flex flex-wrap gap-3">
                  {media[p.id]?.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={media[p.id]!.imageUrl} alt="" className="max-h-32 rounded object-cover" />
                  )}
                  {media[p.id]?.videoUrl && (
                    <video src={media[p.id]!.videoUrl} controls className="max-h-32 rounded" />
                  )}
                </div>
              )}
              {Object.entries(p.platforms).map(([plat, content]) => (
                <div key={plat} className="space-y-1 rounded-md border border-zinc-100 p-2 dark:border-zinc-800">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">{plat}</span>
                    <div className="flex gap-2">
                      <CopyButton text={platformText(content)} />
                      {plat === "facebook" && (
                        <button
                          type="button"
                          onClick={() => publicarFb(fieldText(content.post ?? platformText(content)), p.id + plat, media[p.id]?.imageUrl)}
                          disabled={pending}
                          className="rounded bg-[#1877F2] px-2 py-0.5 text-[11px] font-medium text-white disabled:opacity-50"
                        >
                          {busyId === p.id + plat ? "Publicando…" : "Publicar en Facebook"}
                        </button>
                      )}
                    </div>
                  </div>
                  <PlatformFields content={content} />
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ProposalCard({
  p,
  selectable,
  selected,
  onSelect,
}: {
  p: Proposal;
  selectable?: boolean;
  selected?: boolean;
  onSelect?: () => void;
}) {
  return (
    <div className={`space-y-2 rounded-lg border p-3 ${selected ? "border-[oklch(52%_0.13_255)]" : "border-zinc-200 dark:border-zinc-800"}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">{p.label}</div>
          {p.angle && <div className="text-xs text-zinc-500">{p.angle}</div>}
        </div>
        {selectable && (
          <label className="flex items-center gap-1 text-xs text-zinc-500">
            <input type="checkbox" checked={!!selected} onChange={onSelect} />
            Elegir
          </label>
        )}
      </div>
      <div className="space-y-1.5">
        {Object.entries(p.platforms).map(([plat, content]) => (
          <details key={plat} className="rounded border border-zinc-100 dark:border-zinc-800">
            <summary className="cursor-pointer px-2 py-1 text-xs font-medium uppercase tracking-wide text-zinc-500">
              {plat}
            </summary>
            <div className="px-2 pb-2">
              <PlatformFields content={content} />
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}

function PlatformFields({ content }: { content: Record<string, string | string[]> }) {
  return (
    <div className="space-y-1.5">
      {Object.entries(content).map(([k, v]) => (
        <div key={k} className="text-xs">
          <span className="font-medium text-zinc-500">{k}: </span>
          <span className="whitespace-pre-wrap text-zinc-800 dark:text-zinc-200">{fieldText(v)}</span>
        </div>
      ))}
    </div>
  );
}

// Editor del brief: el prompt + tres listas de referencias (links, imágenes,
// videos). Se reusa en el paso 1 y en el panel plegable de los pasos 2-4.
function BriefEditor({
  prompt,
  setPrompt,
  links,
  setLinks,
  images,
  setImages,
  videos,
  setVideos,
}: {
  prompt: string;
  setPrompt: Dispatch<SetStateAction<string>>;
  links: string[];
  setLinks: Dispatch<SetStateAction<string[]>>;
  images: string[];
  setImages: Dispatch<SetStateAction<string[]>>;
  videos: string[];
  setVideos: Dispatch<SetStateAction<string[]>>;
}) {
  const add = (setter: Dispatch<SetStateAction<string[]>>) => (url: string) => {
    const u = url.trim();
    if (!u) return;
    setter((arr) => (arr.includes(u) ? arr : [...arr, u]));
  };
  const removeAt = (setter: Dispatch<SetStateAction<string[]>>) => (i: number) =>
    setter((arr) => arr.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-3">
      <label className="flex flex-col gap-1 text-xs text-zinc-500">
        Brief del aviso (un solo prompt para todos los modelos)
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={4}
          placeholder="Ej: «Invitar a vecinos de Maipú a una encuesta de opinión sobre seguridad y servicios. Tono cercano, no partidario, con llamado a participar»."
          className={`${inputCls} w-full`}
        />
      </label>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <RefList
          label="🔗 Links de referencia"
          hint="Notas, fuentes o ejemplos a tener en cuenta."
          placeholder="https://nota-o-fuente…"
          items={links}
          onAdd={add(setLinks)}
          onRemove={removeAt(setLinks)}
        />
        <RefList
          label="🖼️ Imágenes de referencia"
          hint="Inspiración visual / estilo. Pegá una URL o subí una."
          placeholder="https://…/imagen.jpg"
          items={images}
          onAdd={add(setImages)}
          onRemove={removeAt(setImages)}
          isImage
          withUpload
        />
        <RefList
          label="🎬 Videos de referencia"
          hint="Tono o formato a imitar (YouTube, TikTok…)."
          placeholder="https://youtube.com/…"
          items={videos}
          onAdd={add(setVideos)}
          onRemove={removeAt(setVideos)}
        />
      </div>
      <p className="text-[11px] text-zinc-400">
        Las referencias se mantienen en este navegador y se le pasan a la IA como
        contexto en cada generación y ajuste. Los modelos de texto no &laquo;ven&raquo; las
        imágenes/videos: usan las URLs y tu descripción para alinear el estilo.
      </p>
    </div>
  );
}

// Lista editable de URLs de referencia. Agregar con Enter o el botón; quitar
// con la ×. Con `withUpload` ofrece subir una imagen y agrega su URL.
function RefList({
  label,
  hint,
  placeholder,
  items,
  onAdd,
  onRemove,
  isImage,
  withUpload,
}: {
  label: string;
  hint?: string;
  placeholder: string;
  items: string[];
  onAdd: (url: string) => void;
  onRemove: (i: number) => void;
  isImage?: boolean;
  withUpload?: boolean;
}) {
  const [val, setVal] = useState("");
  const commit = () => {
    if (!val.trim()) return;
    onAdd(val);
    setVal("");
  };
  return (
    <div className="space-y-1.5">
      <div className="flex flex-col">
        <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">{label}</span>
        {hint && <span className="text-[11px] text-zinc-400">{hint}</span>}
      </div>
      <div className="flex gap-1.5">
        <input
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            }
          }}
          placeholder={placeholder}
          className={`${inputCls} min-w-0 flex-1`}
        />
        <button
          type="button"
          onClick={commit}
          disabled={!val.trim()}
          className="shrink-0 rounded border border-zinc-300 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          Agregar
        </button>
      </div>
      {withUpload && (
        <ImageUpload
          name="ref-image-upload"
          value=""
          aspect={1}
          label="…o subir imagen"
          recommend="Se agrega como referencia (no se publica)."
          onChange={(url) => url && onAdd(url)}
        />
      )}
      {items.length > 0 && (
        <ul className="space-y-1">
          {items.map((it, i) => (
            <li
              key={`${it}-${i}`}
              className="flex items-center gap-2 rounded border border-zinc-200 bg-white px-2 py-1 text-xs dark:border-zinc-800 dark:bg-zinc-900"
            >
              {isImage && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={it} alt="" className="h-8 w-8 shrink-0 rounded object-cover" />
              )}
              <a
                href={it}
                target="_blank"
                rel="noopener noreferrer"
                className="min-w-0 flex-1 truncate text-zinc-600 underline-offset-2 hover:underline dark:text-zinc-300"
                title={it}
              >
                {it}
              </a>
              <button
                type="button"
                onClick={() => onRemove(i)}
                className="shrink-0 text-zinc-400 hover:text-red-600 dark:hover:text-red-400"
                aria-label="Quitar referencia"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
      className="rounded border border-zinc-300 px-2 py-0.5 text-[11px] text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
    >
      {done ? "✓ Copiado" : "Copiar"}
    </button>
  );
}
