"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  SUPPORTED_VARS,
  SUPPORTED_VAR_KEYS,
  extractUsedVars,
  interpolateWithMap,
} from "@/lib/interpolate-vars";

interface VarOption {
  key: string;
  desc: string;
}

const CHANNEL_OPTS = [
  { value: "email", label: "📧 Email" },
  { value: "whatsapp", label: "💬 WhatsApp" },
  { value: "sms", label: "📱 SMS" },
  { value: "voice", label: "☎️ Voz (guion IVR)" },
];

const inputCls =
  "rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm focus:border-zinc-900 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-100";

export function TemplateEditor({
  action,
  varMap,
  sampleContactLabel,
}: {
  action: (formData: FormData) => Promise<void>;
  varMap: Record<string, string>;
  sampleContactLabel: string;
}) {
  const [channel, setChannel] = useState<string>("email");
  const [nombre, setNombre] = useState("");
  const [asunto, setAsunto] = useState("");
  const [cuerpo, setCuerpo] = useState(
    "{{saludo}}, {{nombre}}.\n\nDesde {{org}} estamos haciendo un relevamiento. ¿Podés responder unas preguntas?\n\n{{encuesta_url}}\n\n{{firma}}",
  );

  // Autocomplete: cuando el cursor está justo después de `{{`, mostramos el
  // dropdown filtrando por lo escrito hasta el cursor.
  const cuerpoRef = useRef<HTMLTextAreaElement | null>(null);
  const [ac, setAc] = useState<{
    open: boolean;
    prefix: string;
    insertAt: number;
  }>({ open: false, prefix: "", insertAt: 0 });
  const [acIdx, setAcIdx] = useState(0);

  function handleCuerpoChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const v = e.target.value;
    setCuerpo(v);
    const cursor = e.target.selectionStart ?? v.length;
    updateAutocomplete(v, cursor);
  }

  function updateAutocomplete(text: string, cursor: number) {
    // Buscar la `{{` más cercana hacia atrás. Si entre cursor y la `{{` hay
    // un `}}` ya estamos fuera de una variable abierta.
    const before = text.slice(0, cursor);
    const open = before.lastIndexOf("{{");
    if (open < 0) return setAc({ open: false, prefix: "", insertAt: 0 });
    const closeBetween = before.slice(open).indexOf("}}");
    if (closeBetween >= 0)
      return setAc({ open: false, prefix: "", insertAt: 0 });
    const prefix = before.slice(open + 2).trim();
    if (/[^\w]/.test(prefix))
      return setAc({ open: false, prefix: "", insertAt: 0 });
    setAc({ open: true, prefix, insertAt: open });
    setAcIdx(0);
  }

  const filteredVars = useMemo<VarOption[]>(() => {
    if (!ac.open) return [];
    const p = ac.prefix.toLowerCase();
    return SUPPORTED_VARS.filter((v) =>
      p === "" ? true : v.key.toLowerCase().startsWith(p),
    ).slice(0, 8);
  }, [ac]);

  function insertVar(key: string) {
    if (!cuerpoRef.current) return;
    const ta = cuerpoRef.current;
    const start = ac.insertAt;
    const cursor = ta.selectionStart ?? cuerpo.length;
    const next = cuerpo.slice(0, start) + `{{${key}}}` + cuerpo.slice(cursor);
    setCuerpo(next);
    setAc({ open: false, prefix: "", insertAt: 0 });
    // Reposicionar cursor al final del insert.
    requestAnimationFrame(() => {
      const pos = start + key.length + 4;
      ta.focus();
      ta.setSelectionRange(pos, pos);
    });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!ac.open || filteredVars.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setAcIdx((i) => (i + 1) % filteredVars.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setAcIdx((i) => (i - 1 + filteredVars.length) % filteredVars.length);
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      insertVar(filteredVars[acIdx].key);
    } else if (e.key === "Escape") {
      setAc({ open: false, prefix: "", insertAt: 0 });
    }
  }

  // Validación: vars usadas vs soportadas + campos de Contact conocidos.
  const usedVars = useMemo(() => extractUsedVars(asunto + " " + cuerpo), [
    asunto,
    cuerpo,
  ]);
  const invalidVars = usedVars.filter(
    (v) => !SUPPORTED_VAR_KEYS.has(v) && !varMap[v],
  );

  // Preview interpolado.
  const previewAsunto = useMemo(
    () => interpolateWithMap(asunto, varMap),
    [asunto, varMap],
  );
  const previewCuerpo = useMemo(
    () => interpolateWithMap(cuerpo, varMap),
    [cuerpo, varMap],
  );

  // Cerrar dropdown al click fuera.
  useEffect(() => {
    if (!ac.open) return;
    const close = (e: MouseEvent) => {
      if (!cuerpoRef.current?.contains(e.target as Node)) {
        setAc({ open: false, prefix: "", insertAt: 0 });
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [ac.open]);

  return (
    <form action={action} className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {/* ── Editor ─────────────────────────────────────────────────────── */}
      <div className="space-y-3">
        <h2 className="text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">
          Editor
        </h2>

        <label className="flex flex-col gap-1 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
          Canal
          <select
            name="channel"
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
            className={inputCls}
          >
            {CHANNEL_OPTS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
          Nombre interno
          <input
            name="nombre"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            required
            placeholder="ej: Invitación encuesta Mayo"
            className={inputCls}
          />
        </label>

        {channel === "email" && (
          <label className="flex flex-col gap-1 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
            Asunto
            <input
              name="asunto"
              value={asunto}
              onChange={(e) => setAsunto(e.target.value)}
              placeholder="Admite variables: {{nombre}}, {{barrio}}, …"
              className={inputCls}
            />
          </label>
        )}

        <label className="relative flex flex-col gap-1 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
          Cuerpo
          <textarea
            ref={cuerpoRef}
            name="cuerpo"
            value={cuerpo}
            onChange={handleCuerpoChange}
            onKeyDown={onKeyDown}
            onSelect={(e) => {
              const ta = e.currentTarget;
              updateAutocomplete(ta.value, ta.selectionStart ?? 0);
            }}
            required
            rows={12}
            className={`${inputCls} font-mono`}
          />
          {ac.open && filteredVars.length > 0 && (
            <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-60 overflow-y-auto rounded-md border border-zinc-300 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
              {filteredVars.map((v, i) => (
                <button
                  type="button"
                  key={v.key}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    insertVar(v.key);
                  }}
                  onMouseEnter={() => setAcIdx(i)}
                  className={`flex w-full items-baseline justify-between gap-3 px-3 py-1.5 text-left text-sm ${
                    i === acIdx
                      ? "bg-zinc-100 dark:bg-zinc-800"
                      : "hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
                  }`}
                >
                  <code className="font-mono text-xs text-zinc-800 dark:text-zinc-200">
                    {`{{${v.key}}}`}
                  </code>
                  <span className="truncate text-[10px] text-zinc-500">
                    {v.desc}
                  </span>
                </button>
              ))}
            </div>
          )}
        </label>

        {usedVars.length > 0 && (
          <div className="space-y-1 rounded-lg border border-zinc-200 p-2 dark:border-zinc-800">
            <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
              Variables usadas ({usedVars.length})
            </div>
            <div className="flex flex-wrap gap-1.5">
              {usedVars.map((v) => {
                const ok = SUPPORTED_VAR_KEYS.has(v) || varMap[v];
                return (
                  <code
                    key={v}
                    className={`rounded px-1.5 py-0.5 font-mono text-xs ${
                      ok
                        ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400"
                        : "bg-red-50 text-red-700 ring-1 ring-red-300 dark:bg-red-950/30 dark:text-red-400"
                    }`}
                    title={ok ? "Reconocida" : "Variable desconocida"}
                  >
                    {`{{${v}}}`}
                  </code>
                );
              })}
            </div>
            {invalidVars.length > 0 && (
              <p className="text-xs text-red-600 dark:text-red-400">
                {invalidVars.length} variable{invalidVars.length > 1 ? "s" : ""}{" "}
                desconocida{invalidVars.length > 1 ? "s" : ""}: van a quedar
                vacías al enviar.
              </p>
            )}
          </div>
        )}

        <button
          type="submit"
          className="rounded bg-zinc-900 px-3 py-1.5 text-sm text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900"
        >
          Guardar plantilla
        </button>
      </div>

      {/* ── Preview ────────────────────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">
            Preview
          </h2>
          <span className="font-mono text-[10px] text-zinc-400">
            destinatario: {sampleContactLabel}
          </span>
        </div>

        {channel === "email" && (
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-800">
            <div className="space-y-1 border-b border-zinc-200 bg-zinc-50/60 px-4 py-3 text-xs dark:border-zinc-800 dark:bg-zinc-900/40">
              <div>
                <span className="text-zinc-500">De: </span>
                Equipo · {varMap.org}
              </div>
              <div>
                <span className="text-zinc-500">Asunto: </span>
                <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                  {previewAsunto || "(sin asunto)"}
                </span>
              </div>
            </div>
            <pre className="whitespace-pre-wrap p-4 font-sans text-sm leading-relaxed text-zinc-800 dark:text-zinc-200">
              {previewCuerpo}
            </pre>
          </div>
        )}

        {channel !== "email" && (
          <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
            <div className="mb-2 text-[10px] uppercase tracking-wider text-zinc-500">
              Mensaje
            </div>
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-zinc-800 dark:text-zinc-200">
              {previewCuerpo}
            </pre>
          </div>
        )}

        <p className="text-xs text-zinc-500">
          El preview usa un contacto random del padrón. Las variables
          desconocidas se renderizan como vacío. Tipeá <code>{`{{`}</code>{" "}
          para autocompletar.
        </p>
      </div>
    </form>
  );
}
