import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { getCredentialFor } from "@/lib/mailbox/credentials";
import { getMessage, markRead } from "@/lib/mailbox/jmap-client";
import { sanitizeEmailHtml } from "@/lib/mailbox/sanitize";
import { requireProject } from "@/lib/workspace";

export const metadata = { title: "Mensaje · Mail · Tronador" };

function formatFull(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("es-AR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function MessageDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ messageId: string }>;
  searchParams?: Promise<Record<string, string | undefined>>;
}) {
  const { messageId } = await params;
  const { id: projectId } = await requireProject();
  const sp = (await searchParams) ?? {};
  const box = sp.box ?? "inbox";
  const session = await auth();
  const userEmail = session?.user?.email?.toLowerCase();
  const cred = userEmail ? await getCredentialFor(userEmail) : null;
  const creds = cred
    ? { address: cred.address, password: cred.password }
    : undefined;

  const id = decodeURIComponent(messageId);
  const message = await getMessage(id, creds, projectId);
  if (!message) notFound();
  // Marcar leído al abrir.
  await markRead(id, creds, projectId);

  const safeHtml = message.bodyHtml ? sanitizeEmailHtml(message.bodyHtml) : null;

  const replyHref = `/mail/compose?to=${encodeURIComponent(
    message.from.email,
  )}&subject=${encodeURIComponent(`Re: ${message.subject}`)}&inReplyTo=${encodeURIComponent(message.id)}`;

  return (
    <article className="mx-auto max-w-4xl space-y-5">
      <nav className="flex items-center justify-between">
        <Link
          href={`/mail?box=${box}`}
          className="text-sm text-zinc-500 underline-offset-4 hover:underline"
        >
          ← Volver a la bandeja
        </Link>
        <Link
          href={replyHref}
          className="rounded bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          Responder
        </Link>
      </nav>

      <header className="border-b border-zinc-200 pb-4 dark:border-zinc-800">
        <h1 className="text-xl font-semibold leading-tight text-zinc-900 dark:text-zinc-100">
          {message.subject}
        </h1>
        <div className="mt-3 grid gap-1 text-xs text-zinc-500">
          <div>
            <span className="inline-block w-12 font-mono text-zinc-400">de</span>
            <span className="text-zinc-700 dark:text-zinc-300">
              {message.from.name
                ? `${message.from.name} <${message.from.email}>`
                : message.from.email}
            </span>
          </div>
          <div>
            <span className="inline-block w-12 font-mono text-zinc-400">para</span>
            <span className="text-zinc-700 dark:text-zinc-300">
              {message.to.map((t) => t.email).join(", ") || "—"}
            </span>
          </div>
          {message.cc && message.cc.length > 0 && (
            <div>
              <span className="inline-block w-12 font-mono text-zinc-400">cc</span>
              <span className="text-zinc-700 dark:text-zinc-300">
                {message.cc.map((t) => t.email).join(", ")}
              </span>
            </div>
          )}
          <div>
            <span className="inline-block w-12 font-mono text-zinc-400">fecha</span>
            <span className="text-zinc-700 dark:text-zinc-300">
              {formatFull(message.receivedAt)}
            </span>
          </div>
        </div>
      </header>

      <section>
        {safeHtml ? (
          <div
            className="prose prose-sm max-w-none text-sm dark:prose-invert"
            dangerouslySetInnerHTML={{ __html: safeHtml }}
          />
        ) : (
          <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-zinc-800 dark:text-zinc-200">
            {message.bodyText}
          </pre>
        )}
        {message.hasAttachment && (
          <p className="mt-4 rounded border border-zinc-200 px-3 py-2 text-xs text-zinc-500 dark:border-zinc-800">
            📎 Este mensaje tiene archivos adjuntos. Descarga de adjuntos
            llega cuando Stalwart esté conectado.
          </p>
        )}
      </section>
    </article>
  );
}
