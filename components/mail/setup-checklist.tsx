// Setup checklist productivo del servicio de mail @tronador.net.ar
// (Plan 04 F1-F5). Detecta automáticamente el modo:
//   · cloudflare: webhook /api/webhooks/mail-in + Cloudflare Email Worker
//   · stalwart:   JMAP propio en VPS Hetzner
//   · mock:       nada configurado (dev)

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
  hasInboundSecret: boolean;
  hasCronSecret: boolean;
  hasConfigKey: boolean;
}

type Mode = "cloudflare" | "stalwart" | "mock";

function detectMode(p: Props): Mode {
  if (p.hasStalwart && p.hasStalwartAdmin) return "stalwart";
  if (p.hasInboundSecret) return "cloudflare";
  return "mock";
}

export function MailSetupChecklist(props: Props) {
  const mode = detectMode(props);
  const checks: Check[] = buildChecks(mode, props);
  const completed = checks.filter((c) => c.ok).length;
  const total = checks.length;
  const operativo = completed === total;
  const modeLabel: Record<Mode, string> = {
    cloudflare: "Cloudflare Email Worker + Vercel webhook",
    stalwart: "Stalwart JMAP propio (VPS)",
    mock: "Mock (sin backend configurado)",
  };
  return (
    <section
      aria-labelledby="setup-titulo"
      className={`rounded-lg border p-4 ${
        operativo
          ? "border-emerald-300 bg-emerald-50 dark:border-emerald-900/40 dark:bg-emerald-950/30"
          : "border-amber-300 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/30"
      }`}
    >
      <div className="flex items-baseline justify-between gap-3">
        <div>
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
          <p className="mt-0.5 text-[11px] uppercase tracking-wider text-zinc-500">
            Modo: {modeLabel[mode]}
          </p>
        </div>
        <span
          className={`shrink-0 font-mono text-[10px] uppercase tracking-wider ${
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

function buildChecks(mode: Mode, p: Props): Check[] {
  // Comunes a los dos modos productivos.
  const common: Check[] = [
    {
      label: "Routing de replies activado",
      detail:
        "MAIL_REPLIES_ENABLED=1 inyecta Reply-To en cada envío de campaña email.",
      ok: p.hasRepliesEnabled,
    },
    {
      label: "CONFIG_MASTER_KEY para HMAC + AES-GCM",
      detail: "32 bytes base64. Firma share tokens y encripta credenciales.",
      ok: p.hasConfigKey,
    },
  ];

  if (mode === "cloudflare") {
    return [
      {
        label: "Webhook inbound con HMAC",
        detail:
          "MAIL_INBOUND_SECRET compartido entre Vercel y el Worker Cloudflare.",
        ok: p.hasInboundSecret,
      },
      ...common,
    ];
  }

  if (mode === "stalwart") {
    return [
      {
        label: "Stalwart Mail Server desplegado",
        detail: "STALWART_URL apunta a JMAP del VPS.",
        ok: p.hasStalwart,
      },
      {
        label: "Admin API token configurado",
        detail: "STALWART_ADMIN_TOKEN para provisioning de mailboxes.",
        ok: p.hasStalwartAdmin,
      },
      {
        label: "Mailbox de replies provisionado",
        detail:
          "MAIL_REPLIES_USER + MAIL_REPLIES_PASSWORD (cuenta JMAP que recibe replies+token@…).",
        ok: p.hasRepliesCreds,
      },
      {
        label: "Cron mail-sync con auth",
        detail:
          "CRON_SECRET + workflow GitHub Actions /api/cron/mail-sync cada 10min.",
        ok: p.hasCronSecret,
      },
      ...common,
    ];
  }

  // Mock: lista de TODOs para elegir un modo.
  return [
    {
      label: "Elegir modo: Cloudflare o Stalwart",
      detail:
        "Cloudflare = $0/mes, sin VPS. Stalwart = ~$5/mes, webmail propio.",
      ok: false,
    },
    ...common,
  ];
}
