// Setup checklist productivo del servicio de mail @tronador.net.ar
// (Plan 04 F1-F5). Render server-side: lee env vars y muestra qué falta
// para que el mailbox esté operativo.

interface Check {
  label: string;
  detail: string;
  ok: boolean;
}

interface Props {
  hasStalwart: boolean;
  hasStalwartAdmin: boolean;
  hasRepliesEnabled: boolean;
  hasRepliesCreds: boolean;
  hasCronSecret: boolean;
  hasConfigKey: boolean;
}

export function MailSetupChecklist(props: Props) {
  const checks: Check[] = [
    {
      label: "Stalwart Mail Server desplegado",
      detail: "STALWART_URL apunta a JMAP del VPS.",
      ok: props.hasStalwart,
    },
    {
      label: "Admin API token configurado",
      detail: "STALWART_ADMIN_TOKEN para provisioning de mailboxes.",
      ok: props.hasStalwartAdmin,
    },
    {
      label: "Routing de replies activado",
      detail:
        "MAIL_REPLIES_ENABLED=1 inyecta reply-to en cada envío de campaña email.",
      ok: props.hasRepliesEnabled,
    },
    {
      label: "Mailbox de replies provisionado",
      detail:
        "MAIL_REPLIES_USER + MAIL_REPLIES_PASSWORD (cuenta JMAP que recibe replies+token@…).",
      ok: props.hasRepliesCreds,
    },
    {
      label: "Cron mail-sync con auth",
      detail:
        "CRON_SECRET + workflow GitHub Actions /api/cron/mail-sync cada 10min.",
      ok: props.hasCronSecret,
    },
    {
      label: "CONFIG_MASTER_KEY para encriptar credenciales",
      detail: "AES-GCM 32 bytes base64 en credentials store.",
      ok: props.hasConfigKey,
    },
  ];
  const completed = checks.filter((c) => c.ok).length;
  const total = checks.length;
  const operativo = completed === total;
  return (
    <section
      aria-labelledby="setup-titulo"
      className={`rounded-lg border p-4 ${
        operativo
          ? "border-emerald-300 bg-emerald-50 dark:border-emerald-900/40 dark:bg-emerald-950/30"
          : "border-amber-300 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/30"
      }`}
    >
      <div className="flex items-baseline justify-between">
        <h2
          id="setup-titulo"
          className={`text-sm font-semibold ${
            operativo
              ? "text-emerald-900 dark:text-emerald-200"
              : "text-amber-900 dark:text-amber-200"
          }`}
        >
          {operativo
            ? "Mail productivo operativo"
            : "Setup productivo de mail"}
        </h2>
        <span
          className={`font-mono text-[10px] uppercase tracking-wider ${
            operativo
              ? "text-emerald-700 dark:text-emerald-400"
              : "text-amber-700 dark:text-amber-400"
          }`}
        >
          {completed}/{total}
        </span>
      </div>
      <ul className="mt-3 space-y-1.5 text-xs">
        {checks.map((c) => (
          <li key={c.label} className="flex items-baseline gap-2">
            <span
              aria-hidden
              className={`inline-block h-1.5 w-1.5 shrink-0 translate-y-0.5 rounded-full ${
                c.ok ? "bg-emerald-500" : "bg-amber-500"
              }`}
            />
            <span>
              <span
                className={
                  c.ok
                    ? "text-emerald-900 dark:text-emerald-200"
                    : "text-amber-900 dark:text-amber-200"
                }
              >
                {c.label}
              </span>
              <span className="ml-1 text-zinc-600 dark:text-zinc-400">
                · {c.detail}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
