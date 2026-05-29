// Mail placeholder. La integración real requiere Stalwart Mail Server
// desplegado en VPS + DNS + provisioning de cuentas. Plan completo en
// plans/04-mailboxes-tronador.md.
//
// Esta página existe para que el link en el sidebar tenga destino y
// para mostrar el estado del proyecto al usuario.
import Link from "next/link";

export const metadata = { title: "Mail · Tronador" };

interface RoadmapItem {
  fase: string;
  titulo: string;
  detalle: string;
  estado: "todo" | "doing" | "done";
}

const ROADMAP: RoadmapItem[] = [
  {
    fase: "F1",
    titulo: "Provisionar mailbox admin",
    detalle:
      "Levantar Stalwart Mail Server en VPS · DNS A/MX/SPF/DKIM/DMARC · admin@tronador.net.ar funcionando.",
    estado: "todo",
  },
  {
    fase: "F2",
    titulo: "Cliente JMAP en Tronador",
    detalle:
      "lib/mailbox.ts con métodos list/get/send · credenciales encriptadas (AES-GCM) por usuario.",
    estado: "todo",
  },
  {
    fase: "F3",
    titulo: "Provisioning UI",
    detalle:
      "Botón 'Provisionar mi casilla nombre@tronador.net.ar' con Stalwart Admin API.",
    estado: "todo",
  },
  {
    fase: "F4",
    titulo: "Webmail MVP",
    detalle: "Folders · lista paginada · vista de mensaje · composer simple.",
    estado: "todo",
  },
  {
    fase: "F5",
    titulo: "Auto-routing respuestas",
    detalle:
      "Listener inbox detecta replies a campañas Resend y los archiva como respuestas cualitativas.",
    estado: "todo",
  },
];

const STATUS_LABEL: Record<RoadmapItem["estado"], { label: string; cls: string }> =
  {
    todo: { label: "todo", cls: "text-zinc-400" },
    doing: { label: "en progreso", cls: "text-amber-600" },
    done: { label: "listo", cls: "text-emerald-600" },
  };

export default function MailPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          Tronador Mail
        </h1>
        <p className="mt-1 max-w-[60ch] text-sm text-zinc-500">
          Casillas <code>@tronador.net.ar</code> para el equipo del Centro:
          enviar/recibir correos individuales desde Tronador, con stack
          self-hosted (Stalwart Mail Server).
        </p>
      </header>

      <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/40 dark:bg-amber-950/30">
        <h2 className="text-sm font-semibold text-amber-900 dark:text-amber-200">
          Pendiente de despliegue
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-amber-800 dark:text-amber-300">
          El servicio de correo requiere levantar el server de Stalwart en
          un VPS y configurar los DNS records de <code>tronador.net.ar</code>.
          Plan completo de arquitectura, fases y costos en{" "}
          <code>plans/04-mailboxes-tronador.md</code>.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">
          Roadmap
        </h2>
        <ol className="space-y-2">
          {ROADMAP.map((item) => {
            const meta = STATUS_LABEL[item.estado];
            return (
              <li
                key={item.fase}
                className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"
              >
                <div className="flex items-baseline justify-between">
                  <span className="text-sm font-medium text-zinc-800 dark:text-zinc-100">
                    <span className="mr-2 font-mono text-xs text-[oklch(60%_0.13_80)]">
                      {item.fase}
                    </span>
                    {item.titulo}
                  </span>
                  <span
                    className={`font-mono text-[10px] uppercase tracking-wider ${meta.cls}`}
                  >
                    {meta.label}
                  </span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-zinc-500">
                  {item.detalle}
                </p>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="rounded-lg border border-zinc-200 p-4 text-xs text-zinc-500 dark:border-zinc-800">
        <h2 className="mb-2 text-xs font-medium uppercase tracking-[0.18em] text-zinc-400">
          Stack elegido
        </h2>
        <ul className="space-y-1">
          <li>
            <strong className="font-medium text-zinc-700 dark:text-zinc-300">
              Stalwart Mail Server
            </strong>{" "}
            (Rust, single binary, IMAP / POP3 / SMTP / JMAP)
          </li>
          <li>
            Hetzner CX22 (~4€/mes) o cualquier VPS Debian 12 con IP fija.
          </li>
          <li>
            JMAP first-class para integración con Next.js sin reinventar SMTP
            client.
          </li>
          <li>
            Storage Postgres compartido con Supabase o instancia local.
          </li>
        </ul>
        <p className="mt-3">
          Documentación:{" "}
          <a
            href="https://stalw.art/docs/install/overview"
            target="_blank"
            rel="noreferrer"
            className="underline hover:text-zinc-800 dark:hover:text-zinc-200"
          >
            stalw.art/docs
          </a>
        </p>
      </section>

      <Link
        href="/conectores"
        className="inline-block text-sm text-zinc-500 underline-offset-4 hover:underline"
      >
        ← Volver al panel
      </Link>
    </div>
  );
}
