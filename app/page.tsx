// Landing pública de Tronador. Brand register: cream + navy + mustard
// del logo. Editorial-typographic: jerarquía con peso + escala, sin cards
// repetidas, ritmo de espacio variable, sin gradientes ni glass.
//
// Sin redirect automático a /conectores — eso vivía antes acá. El acceso
// al panel queda como CTA explícito; quien llega sin sesión ve la
// presentación.
import Image from "next/image";
import Link from "next/link";
import { VERSION_STRING } from "@/lib/version";
import { enviarContacto } from "./actions";

export const metadata = {
  title: "Tronador · Centro de Estudios Políticos y Electorales",
  description:
    "Una herramienta para potenciar el estudio de tendencias y sostener el vínculo con la ciudadanía a través de canales diversos.",
};

export default async function Landing({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | undefined>>;
}) {
  const params = (await searchParams) ?? {};

  return (
    <main
      className="min-h-screen text-[oklch(28%_0.06_250)]"
      style={{ backgroundColor: "oklch(93% 0.012 80)" }}
    >
      <NavBar />

      <Hero />
      <About />
      <DataEthics />
      <ApiSection />
      <AccessSection />
      <Contact state={params.contacto} />
      <Footer />
    </main>
  );
}

// ─── NavBar ────────────────────────────────────────────────────────────

function NavBar() {
  return (
    <nav
      className="sticky top-0 z-50 border-b border-[oklch(80%_0.02_80)]/0 backdrop-blur transition-colors duration-200 supports-[backdrop-filter]:bg-[oklch(93%_0.012_80)]/85"
      style={{ backgroundColor: "oklch(93% 0.012 80 / 0.92)" }}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4 sm:py-5">
      <Link href="#" className="flex items-center gap-3">
        <Image
          src="/brand/tronador-mark.jpeg"
          alt=""
          width={36}
          height={36}
          className="rounded-sm"
        />
        <span className="font-mono text-sm font-semibold tracking-[0.18em]">
          TRONADOR
        </span>
      </Link>
      <div className="flex items-center gap-6 text-sm">
        <Link
          href="#sobre"
          className="hidden text-[oklch(40%_0.04_250)] hover:text-[oklch(20%_0.06_250)] sm:inline"
        >
          Sobre
        </Link>
        <Link
          href="#datos"
          className="hidden text-[oklch(40%_0.04_250)] hover:text-[oklch(20%_0.06_250)] sm:inline"
        >
          Datos
        </Link>
        <Link
          href="#acceso"
          className="hidden text-[oklch(40%_0.04_250)] hover:text-[oklch(20%_0.06_250)] sm:inline"
        >
          Acceso
        </Link>
        <Link
          href="#contacto"
          className="hidden text-[oklch(40%_0.04_250)] hover:text-[oklch(20%_0.06_250)] sm:inline"
        >
          Contacto
        </Link>
        <Link
          href="/conectores"
          className="rounded-full bg-[oklch(28%_0.06_250)] px-4 py-1.5 text-sm font-medium text-[oklch(96%_0.01_80)] hover:bg-[oklch(20%_0.06_250)]"
        >
          Panel
        </Link>
      </div>
      </div>
    </nav>
  );
}

// ─── Hero ──────────────────────────────────────────────────────────────

function Hero() {
  return (
    <section className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-10 px-6 pt-14 pb-24 sm:pt-20 sm:pb-32 md:grid-cols-[1.6fr_1fr] md:gap-16">
      <div className="min-w-0">
        <p className="mb-5 font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-[oklch(55%_0.08_80)] sm:text-xs">
          Centro de Estudios Políticos y Electorales
        </p>
        <h1 className="leading-[0.98] tracking-tight">
          <span
            className="block font-light text-[oklch(40%_0.04_250)]"
            style={{ fontSize: "clamp(2.25rem, 5.5vw, 4rem)" }}
          >
            La voz del pueblo
            <span className="text-[oklch(60%_0.13_80)]">.</span>
          </span>
          <span
            className="mt-1 block font-extrabold"
            style={{
              color: "oklch(60% 0.13 80)",
              fontSize: "clamp(2.75rem, 7.5vw, 5.75rem)",
            }}
          >
            La fuerza de los datos
            <span className="text-[oklch(40%_0.04_250)]">.</span>
          </span>
        </h1>
        <p className="mt-8 max-w-prose text-base leading-relaxed text-[oklch(40%_0.04_250)] sm:text-lg">
          Una herramienta para potenciar el estudio de tendencias y sostener el
          vínculo con la ciudadanía a través de canales diversos.
        </p>
        <p className="mt-4 max-w-prose text-base font-medium leading-relaxed text-[oklch(30%_0.06_250)]">
          Escuchamos a la gente. Interpretamos los datos. Porque la realidad
          habla y los datos la confirman.
        </p>
        <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3">
          <Link
            href="/conectores"
            className="rounded-full bg-[oklch(28%_0.06_250)] px-6 py-3 text-sm font-medium text-[oklch(96%_0.01_80)] hover:bg-[oklch(20%_0.06_250)]"
          >
            Acceder al panel
          </Link>
          <Link
            href="#sobre"
            className="text-sm font-medium text-[oklch(30%_0.06_250)] underline-offset-4 hover:underline"
          >
            Conocer más
          </Link>
        </div>
      </div>
      <div className="hidden items-center justify-end md:flex">
        <Image
          src="/brand/tronador-logo.jpeg"
          alt="Tronador · Estudios Electorales"
          width={1043}
          height={1042}
          className="h-auto w-full max-w-[480px]"
          priority
        />
      </div>
    </section>
  );
}

// ─── About ────────────────────────────────────────────────────────────

function About() {
  return (
    <section id="sobre" className="border-t border-[oklch(80%_0.02_80)]/60">
      <div className="mx-auto grid max-w-5xl grid-cols-1 gap-10 px-6 py-24 md:grid-cols-[1fr_2fr]">
        <SectionLabel n="01" title="Sobre" />
        <div className="space-y-6 text-lg leading-relaxed text-[oklch(28%_0.06_250)]">
          <p>
            <strong className="font-semibold">Tronador</strong> es la
            plataforma de investigación que, a través de herramientas de
            análisis, monitoreo y metodologías de contacto, permite observar
            tendencias, comprender el clima social, detectar demandas
            emergentes, medir percepciones y anticipar escenarios. Combinamos
            escucha activa, análisis territorial y procesamiento de información
            para transformar datos en conocimiento estratégico, comprender la
            realidad y acompañar una mejor toma de decisiones. Porque quienes
            entienden antes lo que está pasando, toman mejores decisiones.
          </p>
          <p>
            La conversación pública no ocurre en un solo lugar. Tronador
            combina escucha en medios y redes, segmentación fina por
            territorio, y un abanico activable de canales de contacto que
            funcionan como conectores tipo plugin. Cada estrategia se
            despliega con propósito declarado, dentro de marcos
            metodológicos rigurosos.
          </p>
          <p className="text-[oklch(45%_0.04_250)]">
            Esto no es una herramienta de campaña, ni de propaganda. Es
            instrumental: enfocada en entender qué pasa y construir
            conocimiento accionable para quienes investigan.
          </p>
        </div>
      </div>
    </section>
  );
}

// ─── Data Ethics ──────────────────────────────────────────────────────

function DataEthics() {
  const principios = [
    {
      head: "Propósito declarado",
      body: "Cada contacto identifica el remitente y el motivo. Investigación social, no campaña, no propaganda.",
    },
    {
      head: "Minimización",
      body: "Trabajamos con los datos estrictamente necesarios para la pregunta de investigación. Nada más.",
    },
    {
      head: "Opt-out inmediato",
      body: "Cada mensaje incluye la vía para no recibir más comunicaciones. La baja se respeta cross-canal y de forma permanente.",
    },
    {
      head: "Credenciales encriptadas",
      body: "Las claves de los proveedores se guardan cifradas en reposo (AES-GCM). La interfaz nunca devuelve secretos al cliente.",
    },
    {
      head: "Trazabilidad",
      body: "Cada acción queda registrada con identidad responsable, fecha y propósito. Auditable a pedido.",
    },
    {
      head: "Derechos ARCO",
      body: "Acceso, rectificación, cancelación y oposición se atienden por escrito en el contacto declarado. Ley 25.326 de Protección de Datos Personales.",
    },
  ];
  return (
    <section
      id="datos"
      style={{ backgroundColor: "oklch(96% 0.012 80)" }}
      className="border-t border-[oklch(80%_0.02_80)]/60"
    >
      <div className="mx-auto grid max-w-5xl grid-cols-1 gap-10 px-6 py-24 md:grid-cols-[1fr_2fr]">
        <SectionLabel n="02" title="Cuidado de los datos" />
        <div className="space-y-10">
          <p className="max-w-[55ch] text-lg leading-relaxed">
            La correcta gestión de la información personal es parte central
            de la metodología. No un disclaimer al pie, sino una práctica
            que define qué hacemos y qué no.
          </p>
          <dl className="grid grid-cols-1 gap-x-12 gap-y-8 sm:grid-cols-2">
            {principios.map((p) => (
              <div key={p.head}>
                <dt className="text-sm font-semibold uppercase tracking-wider text-[oklch(20%_0.06_250)]">
                  {p.head}
                </dt>
                <dd className="mt-2 max-w-[42ch] text-sm leading-relaxed text-[oklch(40%_0.04_250)]">
                  {p.body}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}

// ─── API ──────────────────────────────────────────────────────────────

function ApiSection() {
  return (
    <section id="api" className="border-t border-[oklch(80%_0.02_80)]/60">
      <div className="mx-auto grid max-w-5xl grid-cols-1 gap-10 px-6 py-24 md:grid-cols-[1fr_2fr]">
        <SectionLabel n="03" title="API" />
        <div className="space-y-6">
          <p className="max-w-[55ch] text-lg leading-relaxed">
            Para integraciones y verificación de versión, Tronador expone
            algunos endpoints abiertos. El resto del API queda detrás de la
            autenticación del panel.
          </p>
          <div className="space-y-3 rounded-lg border border-[oklch(80%_0.02_80)]/80 bg-[oklch(98%_0.005_80)] p-5 font-mono text-sm">
            <Endpoint
              method="GET"
              path="/api/version"
              desc="Versión actual del deploy + commit"
            />
            <Endpoint
              method="POST"
              path="/api/webhooks/meta"
              desc="Webhook firmado (HMAC) de Meta WhatsApp"
            />
            <Endpoint
              method="GET"
              path="/api/cron/*"
              desc="Cron jobs (requiere Bearer CRON_SECRET)"
            />
          </div>
          <Link
            href="/api/version"
            className="inline-flex items-center gap-2 text-sm font-medium text-[oklch(30%_0.06_250)] underline-offset-4 hover:underline"
          >
            Probar /api/version
            <span aria-hidden>→</span>
          </Link>
        </div>
      </div>
    </section>
  );
}

// ─── Access ───────────────────────────────────────────────────────────

function AccessSection() {
  return (
    <section
      id="acceso"
      style={{ backgroundColor: "oklch(96% 0.012 80)" }}
      className="border-t border-[oklch(80%_0.02_80)]/60"
    >
      <div className="mx-auto grid max-w-5xl grid-cols-1 gap-10 px-6 py-24 md:grid-cols-[1fr_2fr]">
        <SectionLabel n="04" title="Acceso" />
        <div className="space-y-6">
          <p className="max-w-[55ch] text-lg leading-relaxed">
            El panel queda reservado para el equipo del Centro y
            colaboradores autorizados. El ingreso es con cuenta de Google y
            una allowlist explícita de mails: cada acceso queda
            identificado, sin auto-registro.
          </p>

          <div className="flex flex-wrap items-center gap-4 pt-2">
            <Link
              href="/conectores"
              className="inline-flex items-center gap-2 rounded-full bg-[oklch(28%_0.06_250)] px-6 py-3 text-sm font-medium text-[oklch(96%_0.01_80)] hover:bg-[oklch(20%_0.06_250)]"
            >
              <svg
                aria-hidden
                viewBox="0 0 24 24"
                className="h-4 w-4"
                fill="currentColor"
              >
                <path d="M21.35 11.1H12v2.9h5.35c-.23 1.4-1.66 4.1-5.35 4.1-3.22 0-5.85-2.66-5.85-5.95S8.78 6.2 12 6.2c1.84 0 3.07.78 3.77 1.45l2.57-2.48C16.71 3.6 14.55 2.7 12 2.7 6.92 2.7 2.8 6.8 2.8 12s4.12 9.3 9.2 9.3c5.32 0 8.83-3.74 8.83-9 0-.6-.07-1.05-.15-1.5z" />
              </svg>
              Ingresar con Google
            </Link>
            <Link
              href="#contacto"
              className="text-sm font-medium text-[oklch(30%_0.06_250)] underline-offset-4 hover:underline"
            >
              No tengo acceso, escribir
            </Link>
          </div>

          <ul className="grid max-w-[55ch] grid-cols-1 gap-x-8 gap-y-3 pt-3 text-sm text-[oklch(40%_0.04_250)] sm:grid-cols-2">
            <li className="flex items-baseline gap-3">
              <span
                aria-hidden
                className="font-mono text-[10px] text-[oklch(60%_0.13_80)]"
              >
                ▸
              </span>
              <span>Login con Google · sin contraseñas propias</span>
            </li>
            <li className="flex items-baseline gap-3">
              <span
                aria-hidden
                className="font-mono text-[10px] text-[oklch(60%_0.13_80)]"
              >
                ▸
              </span>
              <span>Allowlist por mail · sin auto-registro</span>
            </li>
            <li className="flex items-baseline gap-3">
              <span
                aria-hidden
                className="font-mono text-[10px] text-[oklch(60%_0.13_80)]"
              >
                ▸
              </span>
              <span>Sesión auditada · queda registro de cada acción</span>
            </li>
            <li className="flex items-baseline gap-3">
              <span
                aria-hidden
                className="font-mono text-[10px] text-[oklch(60%_0.13_80)]"
              >
                ▸
              </span>
              <span>Credenciales encriptadas en reposo (AES-GCM)</span>
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}

function Endpoint({
  method,
  path,
  desc,
}: {
  method: "GET" | "POST";
  path: string;
  desc: string;
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
      <span
        className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[oklch(96%_0.01_80)]"
        style={{
          backgroundColor:
            method === "GET" ? "oklch(50% 0.11 160)" : "oklch(55% 0.13 50)",
        }}
      >
        {method}
      </span>
      <code className="font-mono text-sm text-[oklch(25%_0.06_250)]">
        {path}
      </code>
      <span className="text-xs text-[oklch(50%_0.03_250)]">{desc}</span>
    </div>
  );
}

// ─── Contact ──────────────────────────────────────────────────────────

function Contact({ state }: { state?: string }) {
  const ok = state === "ok";
  const error = state === "error";
  const invalid = state === "invalido";
  return (
    <section
      id="contacto"
      style={{ backgroundColor: "oklch(28% 0.06 250)" }}
      className="text-[oklch(96%_0.01_80)]"
    >
      <div className="mx-auto grid max-w-5xl grid-cols-1 gap-10 px-6 py-24 md:grid-cols-[1fr_2fr]">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.22em] text-[oklch(70%_0.08_80)]">
            05 / Contacto
          </p>
          <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
            Escribinos.
          </h2>
          <p className="mt-4 max-w-[28ch] text-sm leading-relaxed text-[oklch(80%_0.02_250)]">
            Los mensajes llegan a{" "}
            <code className="font-mono text-[oklch(70%_0.08_80)]">
              contacto@cpelectoral.org
            </code>
            . Respondemos en días hábiles.
          </p>
        </div>

        <form
          action={enviarContacto}
          className="space-y-5"
          aria-describedby={
            ok || error || invalid ? "contacto-status" : undefined
          }
        >
          {ok && (
            <StatusNote tone="ok" id="contacto-status">
              Mensaje enviado. Vamos a responder.
            </StatusNote>
          )}
          {invalid && (
            <StatusNote tone="warn" id="contacto-status">
              Faltan datos o el formato no es válido. Revisá el formulario.
            </StatusNote>
          )}
          {error && (
            <StatusNote tone="error" id="contacto-status">
              No pudimos enviar el mensaje. Probá de nuevo en un rato, o
              escribí directo a{" "}
              <code className="text-[oklch(70%_0.08_80)]">
                contacto@cpelectoral.org
              </code>
              .
            </StatusNote>
          )}

          <ContactField label="Nombre">
            <input
              name="name"
              required
              minLength={2}
              maxLength={120}
              autoComplete="name"
              className="w-full border-0 border-b border-[oklch(60%_0.05_250)] bg-transparent px-0 py-2 text-base placeholder:text-[oklch(60%_0.04_250)] focus:border-[oklch(70%_0.08_80)] focus:outline-none focus:ring-0"
              placeholder="Tu nombre"
            />
          </ContactField>
          <ContactField label="Email">
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              className="w-full border-0 border-b border-[oklch(60%_0.05_250)] bg-transparent px-0 py-2 text-base placeholder:text-[oklch(60%_0.04_250)] focus:border-[oklch(70%_0.08_80)] focus:outline-none focus:ring-0"
              placeholder="tu@correo.com"
            />
          </ContactField>
          <ContactField label="Mensaje">
            <textarea
              name="message"
              required
              minLength={10}
              maxLength={5000}
              rows={5}
              className="w-full border-0 border-b border-[oklch(60%_0.05_250)] bg-transparent px-0 py-2 text-base placeholder:text-[oklch(60%_0.04_250)] focus:border-[oklch(70%_0.08_80)] focus:outline-none focus:ring-0"
              placeholder="En qué podemos colaborar"
            />
          </ContactField>

          <button
            type="submit"
            className="rounded-full bg-[oklch(70%_0.13_80)] px-6 py-3 text-sm font-semibold text-[oklch(20%_0.06_250)] hover:bg-[oklch(75%_0.13_80)]"
          >
            Enviar
          </button>
        </form>
      </div>
    </section>
  );
}

function ContactField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block font-mono text-[10px] uppercase tracking-[0.22em] text-[oklch(70%_0.05_250)]">
        {label}
      </span>
      {children}
    </label>
  );
}

function StatusNote({
  tone,
  id,
  children,
}: {
  tone: "ok" | "warn" | "error";
  id?: string;
  children: React.ReactNode;
}) {
  const bg =
    tone === "ok"
      ? "oklch(35% 0.08 160)"
      : tone === "warn"
        ? "oklch(45% 0.10 80)"
        : "oklch(40% 0.11 30)";
  return (
    <div
      id={id}
      role={tone === "error" ? "alert" : "status"}
      className="rounded-md px-4 py-3 text-sm"
      style={{ backgroundColor: bg }}
    >
      {children}
    </div>
  );
}

// ─── Footer ───────────────────────────────────────────────────────────

function Footer() {
  return (
    <footer
      className="border-t border-[oklch(80%_0.02_80)]/60"
      style={{ backgroundColor: "oklch(93% 0.012 80)" }}
    >
      <div className="mx-auto flex max-w-5xl flex-col items-start justify-between gap-6 px-6 py-12 sm:flex-row sm:items-center">
        <div className="space-y-1">
          <p className="font-mono text-xs uppercase tracking-[0.22em] text-[oklch(40%_0.04_250)]">
            Powered by
          </p>
          <p className="text-sm font-medium">
            Centro de Estudios Políticos y Electorales ·{" "}
            <a
              href="https://cpelectoral.org"
              target="_blank"
              rel="noreferrer"
              className="underline-offset-4 hover:underline"
            >
              cpelectoral.org
            </a>
          </p>
        </div>
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[oklch(50%_0.03_250)]">
          {VERSION_STRING}
        </p>
      </div>
    </footer>
  );
}

// ─── Helpers compartidos ──────────────────────────────────────────────

function SectionLabel({ n, title }: { n: string; title: string }) {
  return (
    <div>
      <p className="font-mono text-xs uppercase tracking-[0.22em] text-[oklch(55%_0.08_80)]">
        {n}
      </p>
      <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
        {title}
      </h2>
    </div>
  );
}
