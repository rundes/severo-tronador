"use client";

import { useState, useTransition } from "react";
import type {
  Proposal,
  Platform,
} from "@/lib/ad-proposals";
import type { GenProposalsResult } from "@/app/(dashboard)/publicaciones/actions";

type GenAction = (prompt: string, platforms: string[]) => Promise<GenProposalsResult>;
type RefineAction = (
  base: Proposal,
  refinePrompt: string,
  platforms: string[],
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

function fieldText(v: string | string[]): string {
  return Array.isArray(v) ? v.join("\n") : String(v);
}
function platformText(content: Record<string, string | string[]>): string {
  return Object.entries(content)
    .map(([k, v]) => `${k}:\n${fieldText(v)}`)
    .join("\n\n");
}

export function AdStudio({
  genAction,
  refineAction,
  publishAction,
  imageAction,
  videoAction,
  videoStatusAction,
  models,
}: {
  genAction: GenAction;
  refineAction: RefineAction;
  publishAction: PublishAction;
  imageAction: ImageAction;
  videoAction: VideoAction;
  videoStatusAction: VideoStatusAction;
  models: string[];
}) {
  const [step, setStep] = useState(1);
  const [prompt, setPrompt] = useState("");
  const [platforms, setPlatforms] = useState<Set<Platform>>(
    new Set(PLATFORMS.map((p) => p.id)),
  );
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
      const r = await genAction(prompt, platformList);
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
      const r = await refineAction(p, rp, platformList);
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

      {/* Paso 1 — Brief */}
      {step === 1 && (
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
                className="rounded bg-zinc-900 px-3 py-1 text-xs font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
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
              <button type="button" onClick={() => setStep(4)} className="rounded bg-zinc-900 px-3 py-1 text-xs font-medium text-white dark:bg-zinc-100 dark:text-zinc-900">
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
                    className="rounded bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
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
                      <img src={media[p.id]!.imageUrl} alt="" className="mt-1 max-h-32 rounded object-cover" />
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
                      <video src={media[p.id]!.videoUrl} controls className="mt-1 max-h-40 w-full rounded" />
                    )}
                    {media[p.id]?.vidMsg && <p className="text-[11px] text-zinc-400">{media[p.id]!.vidMsg}</p>}
                  </div>
                </div>
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
