import Link from "next/link";
import { buttonClass } from "@/components/ui/button";
import { auth } from "@/lib/auth";
import { getCredentialFor } from "@/lib/mailbox/credentials";
import { FormStatus, SubmitButton } from "@/components/ui/submit-button";
import { sendMail } from "../actions";

export const metadata = { title: "Redactar · Mail · Tronador" };

const inputCls =
  "w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900";

export default async function ComposePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | undefined>>;
}) {
  const sp = (await searchParams) ?? {};
  const session = await auth();
  const userEmail = session?.user?.email?.toLowerCase();
  const cred = userEmail ? await getCredentialFor(userEmail) : null;

  const errMap: Record<string, string> = {
    no_recipients: "Tenés que poner al menos un destinatario.",
    no_subject: "El asunto no puede estar vacío.",
    no_body: "El cuerpo del mensaje no puede estar vacío.",
    send: `Error enviando: ${sp.msg ?? ""}`,
  };
  const errMsg = sp.error ? errMap[sp.error] ?? sp.error : null;

  if (!cred) {
    return (
      <div className="mx-auto max-w-3xl space-y-3">
        <h1 className="text-xl font-semibold tracking-tight">
          Provisioná tu casilla primero
        </h1>
        <p className="text-sm text-zinc-500">
          Necesitás una dirección <code>@tronador.net.ar</code> para
          poder enviar mensajes.
        </p>
        <Link
          href="/mail"
          className={buttonClass("primary")}
        >
          Ir a Mail
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <nav>
        <Link
          href="/mail"
          className="text-sm text-zinc-500 underline-offset-4 hover:underline"
        >
          ← Volver a la bandeja
        </Link>
      </nav>

      <header>
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          Redactar mensaje
        </h1>
        <p className="mt-1 text-xs text-zinc-500">
          Enviar desde{" "}
          <code className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-xs dark:bg-zinc-800">
            {cred.address}
          </code>
        </p>
      </header>

      <form action={sendMail} className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">
            Para
          </span>
          <input
            type="text"
            name="to"
            required
            defaultValue={sp.to ?? ""}
            placeholder="ejemplo@dominio.com, otro@dominio.com"
            className={inputCls}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">
            CC <span className="font-normal normal-case text-zinc-400">(opcional)</span>
          </span>
          <input type="text" name="cc" className={inputCls} placeholder="" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">
            Asunto
          </span>
          <input
            type="text"
            name="subject"
            required
            defaultValue={sp.subject ?? ""}
            className={inputCls}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">
            Mensaje
          </span>
          <textarea
            name="body"
            required
            rows={12}
            className={`${inputCls} resize-y font-sans leading-relaxed`}
          />
        </label>
        {sp.inReplyTo && (
          <input type="hidden" name="inReplyTo" value={sp.inReplyTo} />
        )}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <SubmitButton pendingLabel="Enviando…">Enviar</SubmitButton>
            <Link
              href="/mail"
              className="text-sm text-zinc-500 underline-offset-4 hover:underline"
            >
              Cancelar
            </Link>
          </div>
          <FormStatus ok={null} error={errMsg} />
        </div>
      </form>
    </div>
  );
}
