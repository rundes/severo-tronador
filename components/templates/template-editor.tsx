"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import {
  SUPPORTED_VARS,
  SUPPORTED_VAR_KEYS,
  extractUsedVars,
  interpolateWithMap,
} from "@/lib/interpolate-vars";
import { textToHtml, wrapEmailShell, wrapEmailMinimal } from "@/lib/email-html";
import { SubmitButton, FormStatus } from "@/components/ui/submit-button";
import { VisualEditor } from "@/components/templates/visual-editor";
import { AiHtmlAssistant } from "@/components/templates/ai-html-assistant";
import type { AiHtmlState } from "@/app/(dashboard)/templates/actions";

interface VarOption {
  key: string;
  desc: string;
}

export interface PruebaState {
  ok: boolean | null;
  msg: string;
}

type TestAction = (
  prev: PruebaState,
  formData: FormData,
) => Promise<PruebaState>;

const CHANNEL_OPTS = [
  { value: "email", label: "📧 Email" },
  { value: "whatsapp", label: "💬 WhatsApp" },
  { value: "sms", label: "📱 SMS" },
  { value: "voice", label: "☎️ Voz (guion IVR)" },
];

const inputCls =
  "rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm focus:border-zinc-900 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-100";

// Plantillas HTML prediseñadas (contenido, sin el shell). Variables {{...}}
// se interpolan igual que en texto. El shell de marca + opt-out los agrega
// el render al enviar.
const HTML_PRESETS: { id: string; label: string; html: string }[] = [
  {
    id: "invitacion",
    label: "Invitación con botón",
    html: `<p>{{saludo}}, {{nombre}} 👋</p>
<p>Desde <strong>{{org}}</strong> estamos haciendo un relevamiento de opinión sobre <strong>{{barrio}}</strong>. No es campaña electoral ni vendemos nada: es investigación social.</p>
<p>¿Nos das 2 minutos?</p>
<p>
  <a href="{{encuesta_url}}" style="display:inline-block;padding:12px 26px;background:#2b3350;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:8px;">Responder la encuesta</a>
</p>
<p style="color:#6b6f7b;font-size:13px;">Si el botón no funciona, copiá este enlace: {{encuesta_url}}</p>
<p>{{firma}}</p>`,
  },
  {
    id: "recordatorio",
    label: "Recordatorio breve",
    html: `<p>Hola {{nombre}},</p>
<p>Te escribimos hace unos días sobre una breve encuesta de opinión en {{barrio}}. Si tenés un minuto, tu respuesta nos ayuda mucho.</p>
<p><a href="{{encuesta_url}}" style="color:#2b3350;font-weight:600;">Responder ahora →</a></p>
<p>{{firma}}</p>`,
  },
  {
    id: "aviso",
    label: "Aviso / comunicación",
    html: `<h2 style="margin:0 0 12px;color:#2b3350;font-size:20px;">Título del aviso</h2>
<p>{{saludo}}, {{nombre}}. Escribí acá la comunicación para los vecinos de {{barrio}}.</p>
<ul>
  <li>Punto uno</li>
  <li>Punto dos</li>
</ul>
<p>{{firma}}</p>`,
  },
];

// Andamiaje del "email completo": replica visualmente el shell de marca pero
// como HTML editable (encabezado con {{org}}, cuerpo, pie con nota de baja).
// El marcador data-full-shell evita re-envolver al re-activar el modo.
function fullEmailScaffold(inner: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" data-full-shell="1" style="background:#efe9da;">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #e4ddcd;border-radius:10px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<tr><td style="padding:20px 32px;border-bottom:3px solid #c8961e;">
<span style="font-size:13px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#2b3350;">{{org}}</span>
</td></tr>
<tr><td style="padding:28px 32px 8px;color:#2b2f3a;">
${inner}
</td></tr>
<tr><td style="padding:18px 32px 28px;border-top:1px solid #e4ddcd;">
<p style="margin:0;color:#6b6f7b;font-size:12px;line-height:1.5;">Recibís este mensaje por una investigación de opinión pública. Para no recibir más, respondé BAJA.</p>
</td></tr>
</table>
</td></tr>
</table>`;
}

const DEFAULT_TEXT_BODY =
  "{{saludo}}, {{nombre}}.\n\nDesde {{org}} estamos haciendo un relevamiento. ¿Podés responder unas preguntas?\n\n{{encuesta_url}}\n\n{{firma}}";

export function TemplateEditor({
  action,
  testAction,
  aiAction,
  varMap,
  sampleContactLabel,
  defaultTestEmail,
  statusOk,
  statusError,
  modelos = [],
}: {
  action: (formData: FormData) => Promise<void>;
  testAction?: TestAction;
  aiAction?: (prev: AiHtmlState, formData: FormData) => Promise<AiHtmlState>;
  varMap: Record<string, string>;
  sampleContactLabel: string;
  defaultTestEmail?: string;
  statusOk?: string | null;
  statusError?: string | null;
  // Diseños HTML guardados (plantillas email formato html) reutilizables como
  // modelo de partida para nuevas plantillas / campañas.
  modelos?: { id: string; nombre: string; html: string }[];
}) {
  const [channel, setChannel] = useState<string>("email");
  const [nombre, setNombre] = useState("");
  const [asunto, setAsunto] = useState("");
  const [formato, setFormato] = useState<"texto" | "html">("texto");
  const [cuerpo, setCuerpo] = useState(DEFAULT_TEXT_BODY);
  const [cuerpoHtml, setCuerpoHtml] = useState(HTML_PRESETS[0].html);
  // Sub-vista del modo HTML: editor visual (WYSIWYG), código crudo o asistente IA.
  const [htmlView, setHtmlView] = useState<"visual" | "code" | "ia">("visual");
  // "Email completo": el editor controla TODO el documento (encabezado + cuerpo
  // + pie) y se envía sin el envoltorio de marca ni la nota de baja automática.
  const [fullEmail, setFullEmail] = useState(false);

  const isEmail = channel === "email";
  const isHtml = isEmail && formato === "html";
  // Formato efectivo que se persiste/renderiza.
  const effFormato: "texto" | "html" | "html_full" = isHtml
    ? fullEmail
      ? "html_full"
      : "html"
    : "texto";

  // Activa el modo completo: envuelve el contenido actual en un andamiaje
  // editable (encabezado + cuerpo + pie con la nota de baja) para que el
  // usuario pueda editar todo. Al desactivar, vuelve al shell automático.
  function toggleFullEmail(on: boolean) {
    setFullEmail(on);
    if (on) {
      setCuerpoHtml((inner) =>
        inner.includes("data-full-shell") ? inner : fullEmailScaffold(inner),
      );
    }
  }

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
  const sourceForVars = isHtml ? asunto + " " + cuerpoHtml : asunto + " " + cuerpo;
  const usedVars = useMemo(() => extractUsedVars(sourceForVars), [sourceForVars]);
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

  // HTML del email para el preview (mismo shell que el envío real). En modo
  // HTML usa el cuerpo HTML interpolado; en texto, convierte el texto a HTML.
  const emailPreviewDoc = useMemo(() => {
    if (!isEmail) return "";
    const contentHtml = isHtml
      ? interpolateWithMap(cuerpoHtml, varMap)
      : textToHtml(previewCuerpo);
    // Modo completo: sin shell de marca (el contenido ES el email entero).
    if (isHtml && fullEmail) {
      return wrapEmailMinimal({
        contentHtml,
        preheader: previewAsunto || undefined,
      });
    }
    return wrapEmailShell({
      contentHtml,
      orgName: varMap.org,
      preheader: previewAsunto || undefined,
    });
  }, [isEmail, isHtml, fullEmail, cuerpoHtml, varMap, previewCuerpo, previewAsunto]);

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
    <div className="space-y-6">
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

          {isEmail && (
            <>
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

              {/* Toggle de formato + atajo al asistente IA (siempre visible
                  en email, para que la integración con IA se descubra sin
                  tener que entrar primero a "Diseño HTML"). */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1 rounded-full border border-zinc-200 p-1 text-xs dark:border-zinc-800">
                  {(["texto", "html"] as const).map((f) => (
                    <button
                      type="button"
                      key={f}
                      onClick={() => setFormato(f)}
                      className={`rounded-full px-3 py-1 transition-colors ${
                        formato === f
                          ? "bg-zinc-900 text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900"
                          : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
                      }`}
                    >
                      {f === "texto" ? "Texto plano" : "Diseño HTML"}
                    </button>
                  ))}
                </div>
                {aiAction && (
                  <button
                    type="button"
                    onClick={() => {
                      setFormato("html");
                      setHtmlView("ia");
                    }}
                    className="inline-flex items-center gap-1 rounded-full border border-[oklch(52%_0.13_255)]/40 bg-[oklch(52%_0.13_255)]/8 px-3 py-1.5 text-xs font-medium text-[oklch(45%_0.13_255)] transition-colors hover:bg-[oklch(52%_0.13_255)]/15 dark:text-[oklch(72%_0.12_255)]"
                    title="Generar el diseño con Claude a partir de tus indicaciones"
                  >
                    ✦ Diseñar con IA
                  </button>
                )}
              </div>
            </>
          )}

          {/* Hidden inputs que siempre se envían */}
          <input type="hidden" name="formato" value={effFormato} />
          {isHtml && (
            <input type="hidden" name="cuerpoHtml" value={cuerpoHtml} />
          )}

          {/* Cuerpo texto (siempre presente: fallback + canales no-email) */}
          <label
            className={`relative flex flex-col gap-1 text-[10px] font-medium uppercase tracking-wider text-zinc-500 ${
              isHtml ? "hidden" : ""
            }`}
          >
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

          {/* Cuerpo HTML — editor visual o código */}
          {isHtml && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                  Cuerpo del email
                </span>
                <div className="flex items-center gap-2">
                  {/* Toggle Visual / Código / IA */}
                  <div className="flex items-center gap-1 rounded-full border border-zinc-200 p-0.5 text-[11px] dark:border-zinc-800">
                    {(["visual", "code", ...(aiAction ? (["ia"] as const) : [])] as const).map((v) => (
                      <button
                        type="button"
                        key={v}
                        onClick={() => setHtmlView(v)}
                        className={`rounded-full px-2.5 py-0.5 transition-colors ${
                          htmlView === v
                            ? "bg-zinc-900 text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900"
                            : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
                        }`}
                      >
                        {v === "visual" ? "Visual" : v === "code" ? "Código" : "✦ Asistente IA"}
                      </button>
                    ))}
                  </div>
                  <select
                    aria-label="Insertar diseño o modelo guardado"
                    className="rounded border border-zinc-300 bg-white px-1.5 py-0.5 text-[10px] dark:border-zinc-700 dark:bg-zinc-900"
                    value=""
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v.startsWith("saved:")) {
                        const m = modelos.find((x) => x.id === v.slice(6));
                        if (m) setCuerpoHtml(m.html);
                      } else {
                        const p = HTML_PRESETS.find((x) => x.id === v);
                        if (p) setCuerpoHtml(p.html);
                      }
                    }}
                  >
                    <option value="">Insertar diseño…</option>
                    <optgroup label="Prediseñados">
                      {HTML_PRESETS.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label}
                        </option>
                      ))}
                    </optgroup>
                    {modelos.length > 0 && (
                      <optgroup label="Tus modelos guardados">
                        {modelos.map((m) => (
                          <option key={m.id} value={`saved:${m.id}`}>
                            {m.nombre}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                </div>
              </div>

              <label className="flex items-start gap-2 rounded-md border border-zinc-200 bg-zinc-50/60 px-3 py-2 text-xs dark:border-zinc-800 dark:bg-zinc-900/40">
                <input
                  type="checkbox"
                  checked={fullEmail}
                  onChange={(e) => toggleFullEmail(e.target.checked)}
                  className="mt-0.5"
                />
                <span className="text-zinc-600 dark:text-zinc-300">
                  <strong className="font-medium text-zinc-700 dark:text-zinc-200">
                    Editar email completo
                  </strong>{" "}
                  (encabezado + cuerpo + pie). Se envía tal cual, sin el
                  envoltorio de marca automático.{" "}
                  {fullEmail && (
                    <span className="text-amber-600 dark:text-amber-400">
                      Incluí vos la nota de baja/BAJA (obligatoria).
                    </span>
                  )}
                </span>
              </label>

              {htmlView === "visual" && (
                <VisualEditor value={cuerpoHtml} onChange={setCuerpoHtml} />
              )}
              {htmlView === "code" && (
                <textarea
                  value={cuerpoHtml}
                  onChange={(e) => setCuerpoHtml(e.target.value)}
                  rows={14}
                  spellCheck={false}
                  className={`${inputCls} w-full font-mono text-xs`}
                />
              )}
              {htmlView === "ia" && aiAction && (
                <AiHtmlAssistant
                  action={aiAction}
                  current={cuerpoHtml}
                  onApply={(html) => {
                    setCuerpoHtml(html);
                    setHtmlView("visual");
                  }}
                />
              )}
              <p className="text-[10px] text-zinc-400">
                HTML seguro (se sanitiza al enviar: se permiten p, a, img, table,
                listas, encabezados y <code>style</code> inline). El cuerpo de
                texto plano de arriba se guarda como respaldo.
              </p>
            </div>
          )}

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
                  {invalidVars.length} variable
                  {invalidVars.length > 1 ? "s" : ""} desconocida
                  {invalidVars.length > 1 ? "s" : ""}: van a quedar vacías al
                  enviar.
                </p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <SubmitButton pendingLabel="Guardando…">
              Guardar plantilla
            </SubmitButton>
            <FormStatus ok={statusOk} error={statusError} />
            <p className="text-[10px] text-zinc-400">
              Al guardar, la plantilla queda en la colección y se puede usar en
              campañas y encuestas.
              {isHtml && (
                <>
                  {" "}
                  Las plantillas HTML quedan además como{" "}
                  <strong className="font-medium text-zinc-500">modelo</strong>{" "}
                  reutilizable en «Insertar diseño…».
                </>
              )}
            </p>
          </div>
        </div>

        {/* ── Preview ────────────────────────────────────────────────────── */}
        <div className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">
              Preview {isEmail ? (isHtml ? "· HTML" : "· texto") : ""}
            </h2>
            <span className="font-mono text-[10px] text-zinc-400">
              destinatario: {sampleContactLabel}
            </span>
          </div>

          {isEmail && (
            <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
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
              <iframe
                title="Preview del email"
                srcDoc={emailPreviewDoc}
                sandbox=""
                className="h-[460px] w-full bg-white"
              />
            </div>
          )}

          {!isEmail && (
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
            El preview usa un contacto del padrón. Las variables desconocidas se
            renderizan como vacío. Tipeá <code>{`{{`}</code> para autocompletar
            en el cuerpo de texto.
          </p>
        </div>
      </form>

      {/* ── Envío de prueba ─────────────────────────────────────────────── */}
      {isEmail && testAction && (
        <TestSendBox
          testAction={testAction}
          channel={channel}
          asunto={asunto}
          cuerpo={cuerpo}
          formato={effFormato}
          cuerpoHtml={cuerpoHtml}
          defaultTestEmail={defaultTestEmail}
        />
      )}
    </div>
  );
}

// Caja de envío de prueba. Form separado (no anidado) con los valores actuales
// del editor en hidden inputs + un override opcional de destinatario.
function TestSendBox({
  testAction,
  channel,
  asunto,
  cuerpo,
  formato,
  cuerpoHtml,
  defaultTestEmail,
}: {
  testAction: TestAction;
  channel: string;
  asunto: string;
  cuerpo: string;
  formato: "texto" | "html" | "html_full";
  cuerpoHtml: string;
  defaultTestEmail?: string;
}) {
  const [state, formAction, pending] = useActionState(testAction, {
    ok: null,
    msg: "",
  } as PruebaState);

  return (
    <form
      action={formAction}
      className="rounded-lg border border-zinc-200 bg-zinc-50/50 p-4 dark:border-zinc-800 dark:bg-zinc-900/30"
    >
      <h3 className="text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">
        Enviar prueba
      </h3>
      <p className="mt-1 text-xs text-zinc-500">
        Mandate este email a tu casilla, renderizado igual que el envío real,
        para ver el diseño antes de lanzar la campaña.
      </p>
      <input type="hidden" name="channel" value={channel} />
      <input type="hidden" name="asunto" value={asunto} />
      <input type="hidden" name="cuerpo" value={cuerpo} />
      <input type="hidden" name="formato" value={formato} />
      <input type="hidden" name="cuerpoHtml" value={cuerpoHtml} />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          type="email"
          name="to"
          defaultValue={defaultTestEmail ?? ""}
          placeholder={defaultTestEmail || "tu@correo.com (default: tu sesión)"}
          className={`${inputCls} min-w-[16rem] flex-1`}
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-zinc-900 px-4 py-2 text-sm text-white hover:bg-zinc-700 disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {pending ? "Enviando…" : "Enviar prueba"}
        </button>
      </div>
      {state.ok !== null && (
        <p
          className={`mt-2 text-xs ${
            state.ok
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-red-600 dark:text-red-400"
          }`}
        >
          {state.msg}
        </p>
      )}
    </form>
  );
}
