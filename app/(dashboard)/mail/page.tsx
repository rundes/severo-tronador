// Webmail Tronador (Plan 04 F4). Lista inbox + folders + accesos a
// composer y detalle. Si STALWART_URL no está seteado, corre contra el
// dataset mock para que el flujo sea verificable antes del deploy real.
import Link from "next/link";
import { auth } from "@/lib/auth";
import {
  getCredentialFor,
} from "@/lib/mailbox/credentials";
import {
  getMailboxStatus,
  isLiveMode,
  listMailboxes,
  listMessages,
} from "@/lib/mailbox/jmap-client";
import { FormStatus, SubmitButton } from "@/components/ui/submit-button";
import { MailSetupChecklist } from "@/components/mail/setup-checklist";
import { provisionMyMailbox } from "./actions";
import type { Mailbox } from "@/lib/mailbox/types";

export const metadata = { title: "Mail · Tronador" };

const ROLE_LABEL: Record<Mailbox["role"], string> = {
  inbox: "Bandeja de entrada",
  sent: "Enviados",
  drafts: "Borradores",
  trash: "Papelera",
  spam: "Spam",
  archive: "Archivo",
  custom: "Otra",
};

function relativeDate(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "—";
  const diffMs = Date.now() - t;
  const m = Math.floor(diffMs / 60_000);
  if (m < 1) return "ahora";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} d`;
  return new Date(iso).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
  });
}

export default async function MailPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | undefined>>;
}) {
  const params = (await searchParams) ?? {};
  const session = await auth();
  const userEmail = session?.user?.email?.toLowerCase();

  const cred = userEmail ? await getCredentialFor(userEmail) : null;
  const creds = cred
    ? { address: cred.address, password: cred.password }
    : undefined;
  const status = await getMailboxStatus(creds);

  const selectedMailboxId = params.box ?? "inbox";
  const mailboxes = await listMailboxes(creds);
  const messages = await listMessages(selectedMailboxId, creds);
  const currentBox = mailboxes.find((m) => m.id === selectedMailboxId);

  const okMap: Record<string, string> = {
    provisioned:
      params.mode === "stalwart"
        ? `Casilla creada en Stalwart.`
        : `Casilla provisionada en modo mock (sin Stalwart conectado).`,
    sent: "Mensaje enviado.",
  };
  const errMap: Record<string, string> = {
    provision: `No se pudo provisionar: ${params.msg ?? ""}`,
    send: `Error enviando: ${params.msg ?? ""}`,
  };
  const okMsg = params.ok ? okMap[params.ok] ?? null : null;
  const errMsg = params.error ? errMap[params.error] ?? params.error : null;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            Tronador Mail
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            {cred ? (
              <>
                Casilla{" "}
                <code className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-xs dark:bg-zinc-800">
                  {cred.address}
                </code>{" "}
                · modo <span className="font-mono text-xs">{status.mode}</span>
              </>
            ) : (
              "Aún no tenés casilla @tronador.net.ar."
            )}
          </p>
        </div>
        {cred && (
          <Link
            href="/mail/compose"
            className="rounded bg-[oklch(35%_0.04_240)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
          >
            Redactar
          </Link>
        )}
      </header>

      <FormStatus ok={okMsg} error={errMsg} />

      <MailSetupChecklist
        hasStalwart={Boolean(process.env.STALWART_URL)}
        hasStalwartAdmin={Boolean(process.env.STALWART_ADMIN_TOKEN)}
        hasRepliesEnabled={Boolean(process.env.MAIL_REPLIES_ENABLED)}
        hasRepliesCreds={Boolean(
          process.env.MAIL_REPLIES_USER && process.env.MAIL_REPLIES_PASSWORD,
        )}
        hasCronSecret={Boolean(process.env.CRON_SECRET)}
        hasConfigKey={Boolean(process.env.CONFIG_MASTER_KEY)}
      />

      {!cred && (
        <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/40 dark:bg-amber-950/30">
          <h2 className="text-sm font-semibold text-amber-900 dark:text-amber-200">
            Provisioná tu casilla
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-amber-800 dark:text-amber-300">
            Se crea una dirección{" "}
            <code>{userEmail?.split("@")[0] ?? "tu-usuario"}@tronador.net.ar</code>
            . {isLiveMode()
              ? "El backend Stalwart está conectado: la casilla queda operativa."
              : "Stalwart aún no está conectado: la casilla corre en modo mock para validar el flujo."}
          </p>
          <form action={provisionMyMailbox} className="mt-3 flex items-center gap-2">
            <SubmitButton pendingLabel="Provisionando…">
              Crear mi casilla
            </SubmitButton>
          </form>
        </section>
      )}

      {!isLiveMode() && cred && (
        <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
          ⓘ Modo mock: el backend Stalwart no está conectado. Mensajes son
          un dataset de ejemplo. Setear <code>STALWART_URL</code> y{" "}
          <code>STALWART_ADMIN_TOKEN</code> para activarlo.
        </div>
      )}

      <div className="grid gap-5 md:grid-cols-[200px_1fr]">
        <aside>
          <h2 className="mb-2 text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">
            Carpetas
          </h2>
          <ul className="space-y-0.5">
            {mailboxes.map((mb) => {
              const isActive = mb.id === selectedMailboxId;
              return (
                <li key={mb.id}>
                  <Link
                    href={`/mail?box=${mb.id}`}
                    className={`flex items-center justify-between rounded px-2 py-1.5 text-sm transition-colors ${
                      isActive
                        ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                        : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900"
                    }`}
                  >
                    <span>{ROLE_LABEL[mb.role] ?? mb.name}</span>
                    {mb.unreadCount > 0 && (
                      <span
                        className={`rounded-full px-1.5 text-[10px] font-mono ${
                          isActive
                            ? "bg-white/20"
                            : "bg-[oklch(60%_0.13_80)] text-zinc-900"
                        }`}
                      >
                        {mb.unreadCount}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </aside>

        <section className="min-w-0">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">
              {currentBox ? ROLE_LABEL[currentBox.role] : selectedMailboxId}
            </h2>
            <span className="font-mono text-[11px] text-zinc-400">
              {messages.length} mensajes
            </span>
          </div>
          {messages.length === 0 ? (
            <p className="rounded border border-dashed border-zinc-300 px-4 py-8 text-center text-sm text-zinc-500 dark:border-zinc-700">
              Sin mensajes en esta carpeta.
            </p>
          ) : (
            <ol className="divide-y divide-zinc-200 overflow-hidden rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
              {messages.map((m) => (
                <li key={m.id}>
                  <Link
                    href={`/mail/${encodeURIComponent(m.id)}?box=${selectedMailboxId}`}
                    className={`flex items-baseline gap-3 px-3 py-2.5 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900 ${
                      m.isUnread ? "bg-white dark:bg-zinc-950" : "bg-zinc-50/50 dark:bg-zinc-900/30"
                    }`}
                  >
                    <span
                      aria-hidden
                      className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${
                        m.isUnread
                          ? "bg-[oklch(60%_0.13_80)]"
                          : "bg-transparent"
                      }`}
                    />
                    <span
                      className={`w-36 shrink-0 truncate text-sm ${
                        m.isUnread
                          ? "font-semibold text-zinc-900 dark:text-zinc-100"
                          : "text-zinc-600 dark:text-zinc-400"
                      }`}
                    >
                      {m.from.name ?? m.from.email}
                    </span>
                    <span className="flex-1 truncate text-sm">
                      <span
                        className={
                          m.isUnread
                            ? "font-medium text-zinc-900 dark:text-zinc-100"
                            : "text-zinc-700 dark:text-zinc-300"
                        }
                      >
                        {m.subject}
                      </span>
                      <span className="ml-2 text-zinc-500">{m.preview}</span>
                    </span>
                    {m.hasAttachment && (
                      <span aria-label="adjunto" className="text-zinc-400">
                        📎
                      </span>
                    )}
                    <span className="w-14 shrink-0 text-right font-mono text-[11px] text-zinc-500">
                      {relativeDate(m.receivedAt)}
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}
