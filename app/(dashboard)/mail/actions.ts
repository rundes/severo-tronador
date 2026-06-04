"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { log } from "@/lib/logger";
import {
  getCredentialFor,
  isAddressTakenByOther,
  touchLastLogin,
  updateAddress,
} from "@/lib/mailbox/credentials";
import { sendMail as jmapSend } from "@/lib/mailbox/jmap-client";
import { provisionMailbox } from "@/lib/mailbox/provision";
import type { EmailAddress } from "@/lib/mailbox/types";
import { requireProject } from "@/lib/workspace";

function requireSession() {
  return auth().then((s) => {
    if (!s?.user?.email) throw new Error("auth_required");
    return s.user.email.toLowerCase();
  });
}

export async function provisionMyMailbox() {
  const userEmail = await requireSession();
  const result = await provisionMailbox(userEmail);
  await logAudit({
    action: "mailbox.provision",
    actor: userEmail,
    entity_type: "mailbox",
    entity_id: result.address,
    details: {
      ok: result.ok,
      mode: result.mode,
      error: result.error,
    },
  });
  if (!result.ok) {
    log.error("mailbox.provision.failed", { userEmail, error: result.error });
    redirect(
      `/mail?error=provision&msg=${encodeURIComponent(
        result.error?.slice(0, 200) ?? "",
      )}`,
    );
  }
  log.info("mailbox.provision.ok", {
    userEmail,
    address: result.address,
    mode: result.mode,
  });
  revalidatePath("/mail");
  redirect(`/mail?ok=provisioned&mode=${result.mode}`);
}

const MAIL_DOMAIN = "tronador.net.ar";

// Local-parts reservados: roles/funciones que no debe poder reclamar un usuario
// (suplantación, abuso de confianza, rebote de RFC 2142).
const RESERVED_LOCAL = new Set([
  "admin",
  "administrator",
  "root",
  "postmaster",
  "hostmaster",
  "webmaster",
  "abuse",
  "security",
  "noreply",
  "no-reply",
  "support",
  "billing",
  "info",
  "contact",
  "mail",
  "mailer-daemon",
  "daemon",
  "replies",
  "bounce",
  "system",
]);

// Sanitiza el local-part a chars RFC válidos. Devuelve "" si no queda nada útil.
function sanitizeLocalPart(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/@.*$/, "") // por si pegan el address completo
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 32);
}

export async function updateMyMailboxAddress(formData: FormData) {
  const userEmail = await requireSession();
  const cred = await getCredentialFor(userEmail);
  if (!cred) redirect("/mail?error=no_mailbox");

  const local = sanitizeLocalPart(String(formData.get("local") ?? ""));
  if (!local) redirect("/mail?error=bad_address");
  if (RESERVED_LOCAL.has(local)) redirect("/mail?error=reserved_address");
  const address = `${local}@${MAIL_DOMAIN}`;

  if (address === cred.address) {
    redirect("/mail?ok=address");
  }

  if (await isAddressTakenByOther(address, userEmail)) {
    redirect("/mail?error=address_taken");
  }

  await updateAddress(userEmail, address);
  await logAudit({
    action: "mailbox.address.update",
    actor: userEmail,
    entity_type: "mailbox",
    entity_id: address,
    details: { from: cred.address, to: address },
  });
  log.info("mailbox.address.updated", { userEmail, address });
  revalidatePath("/mail");
  redirect("/mail?ok=address");
}

function parseRecipients(raw: string): EmailAddress[] {
  return raw
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((email) => ({ email }));
}

export async function sendMail(formData: FormData) {
  const userEmail = await requireSession();
  const to = parseRecipients(String(formData.get("to") ?? ""));
  const cc = parseRecipients(String(formData.get("cc") ?? ""));
  const subject = String(formData.get("subject") ?? "").trim();
  const bodyText = String(formData.get("body") ?? "");

  if (to.length === 0) redirect("/mail/compose?error=no_recipients");
  if (!subject) redirect("/mail/compose?error=no_subject");
  if (!bodyText.trim()) redirect("/mail/compose?error=no_body");

  const cred = await getCredentialFor(userEmail);
  const creds = cred
    ? { address: cred.address, password: cred.password }
    : undefined;
  const { id: projectId } = await requireProject();
  const result = await jmapSend(
    { to, cc: cc.length ? cc : undefined, subject, bodyText },
    creds,
    projectId,
  );

  await logAudit({
    action: "mailbox.send",
    actor: userEmail,
    entity_type: "mailbox",
    details: {
      ok: result.ok,
      to: to.map((t) => t.email),
      subject,
      error: result.error,
    },
  });

  if (!result.ok) {
    log.error("mailbox.send.failed", { error: result.error });
    redirect(
      `/mail/compose?error=send&msg=${encodeURIComponent(
        result.error?.slice(0, 200) ?? "",
      )}`,
    );
  }
  if (cred) await touchLastLogin(userEmail);
  revalidatePath("/mail");
  redirect(`/mail?ok=sent`);
}
