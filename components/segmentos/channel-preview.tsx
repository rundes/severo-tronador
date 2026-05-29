// Preview específico por canal en la creación de campaña (Plan 02 — F2).
// Sustituye la nota genérica con info accionable: para SMS cuenta segments;
// para Voz estima duración; para WhatsApp recuerda el modo template.
import type { Channel } from "@/lib/relationship";
import { countSmsSegments } from "@/lib/sms-segments";
import { estimateVoiceScript } from "@/lib/voice-estimate";

interface Template {
  asunto?: string | null;
  cuerpo: string;
}

export function ChannelPreview({
  channel,
  template,
}: {
  channel: Channel;
  template: Template;
}) {
  switch (channel) {
    case "email":
      return <EmailPreview template={template} />;
    case "whatsapp":
      return <WhatsAppPreview template={template} />;
    case "sms":
      return <SmsPreview template={template} />;
    case "voice":
      return <VoicePreview template={template} />;
  }
}

function EmailPreview({ template }: { template: Template }) {
  const previewText = template.cuerpo
    .replace(/\{\{[^}]+\}\}/g, "…")
    .slice(0, 80);
  return (
    <div className="rounded-lg border border-zinc-200 p-3 text-sm dark:border-zinc-800">
      <div className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-400">
        📧 Vista previa bandeja
      </div>
      <div className="space-y-1">
        <div className="font-mono text-xs">
          <span className="text-zinc-500">De: </span>
          <span className="text-zinc-700 dark:text-zinc-300">
            Equipo · relevamiento@…
          </span>
        </div>
        <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          {template.asunto || "(sin asunto)"}
        </div>
        <div className="text-xs text-zinc-500">{previewText}…</div>
      </div>
    </div>
  );
}

function WhatsAppPreview({ template }: { template: Template }) {
  const vars = Array.from(template.cuerpo.matchAll(/\{\{(\w+)\}\}/g)).map(
    (m) => m[1],
  );
  return (
    <div className="rounded-lg border border-zinc-200 p-3 text-sm dark:border-zinc-800">
      <div className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-400">
        💬 WhatsApp
      </div>
      <div className="space-y-1 text-xs text-zinc-600 dark:text-zinc-300">
        <div>
          Variables a interpolar:{" "}
          {vars.length ? (
            vars.map((v) => (
              <code
                key={v}
                className="ml-1 rounded bg-zinc-100 px-1 py-0.5 dark:bg-zinc-800"
              >
                {`{{${v}}}`}
              </code>
            ))
          ) : (
            <span className="italic text-zinc-400">ninguna</span>
          )}
        </div>
        <div className="text-zinc-400">
          Hoy el envío real usa <code>type=text</code> (válido en ventana 24h).
          Plantillas pre-aprobadas con Meta pueden mapearse cuando estén
          disponibles.
        </div>
      </div>
    </div>
  );
}

function SmsPreview({ template }: { template: Template }) {
  // Simulamos la interpolación: vars sin valor cuentan ~10 chars (alto).
  const sampleText = template.cuerpo.replace(/\{\{\w+\}\}/g, "Juan Centro");
  const r = countSmsSegments(sampleText);
  return (
    <div className="rounded-lg border border-zinc-200 p-3 text-sm dark:border-zinc-800">
      <div className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-400">
        📱 SMS
      </div>
      <div className="space-y-1 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-zinc-500">Encoding</span>
          <span className="font-mono text-zinc-700 dark:text-zinc-300">
            {r.encoding}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-zinc-500">Caracteres</span>
          <span className="font-mono text-zinc-700 dark:text-zinc-300">
            {r.length} / {r.perPart * r.parts}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-zinc-500">Partes (cobradas)</span>
          <span
            className={`font-mono ${
              r.parts > 1 ? "text-amber-600" : "text-zinc-700 dark:text-zinc-300"
            }`}
          >
            {r.parts}
          </span>
        </div>
        <div className="text-zinc-400">
          Cada parte se cobra como SMS independiente. Telnyx ~$0.04/parte
          AR.
        </div>
      </div>
    </div>
  );
}

function VoicePreview({ template }: { template: Template }) {
  const est = estimateVoiceScript(template.cuerpo);
  return (
    <div className="rounded-lg border border-zinc-200 p-3 text-sm dark:border-zinc-800">
      <div className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-400">
        ☎️ Voz · TTS
      </div>
      <div className="space-y-1 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-zinc-500">Palabras</span>
          <span className="font-mono text-zinc-700 dark:text-zinc-300">
            {est.words}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-zinc-500">Duración estimada</span>
          <span
            className={`font-mono ${
              est.seconds > 60 ? "text-amber-600" : "text-zinc-700 dark:text-zinc-300"
            }`}
          >
            {est.seconds}s
          </span>
        </div>
        {est.pauses > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-zinc-500">Pausas detectadas</span>
            <span className="font-mono text-zinc-700 dark:text-zinc-300">
              {est.pauses}
            </span>
          </div>
        )}
        <div className="text-zinc-400">
          Estimación TTS ~150 palabras/min. Llamadas largas tienen peor tasa
          de respuesta — mantené el guion bajo 30s.
        </div>
      </div>
    </div>
  );
}
