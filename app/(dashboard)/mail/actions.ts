"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { log } from "@/lib/logger";
import {
  getCredentialFor,
  touchLastLogin,
} from "@/lib/mailbox/credentials";
import { sendMail as jmapSend } from "@/lib/mailbox/jmap-client";
import { provisionMailbox } from "@/lib/mailbox/provision";
import type { EmailAddress } from "@/lib/mailbox/types";

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
  const result = await jmapSend(
    { to, cc: cc.length ? cc : undefined, subject, bodyText },
    creds,
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
