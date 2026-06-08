import { LegalShell, CONTACT_EMAIL } from "@/components/legal/legal-shell";

export const metadata = {
  title: "Términos y Condiciones del Servicio · Tronador",
  robots: { index: true },
};

const UPDATED = "8 de junio de 2026";

export default function TerminosPage() {
  return (
    <LegalShell title="Términos y Condiciones del Servicio" updated={UPDATED}>
      <p>
        Al usar la plataforma Tronador (&ldquo;el Servicio&rdquo;) aceptás estos
        términos. El Servicio es una herramienta de gestión de relevamientos de
        opinión pública (contactos, segmentos, encuestas, campañas multicanal,
        escucha y contenido).
      </p>

      <h2>Uso del Servicio</h2>
      <ul>
        <li>
          El operador es responsable de los datos que carga y de contar con base
          legal para contactar a las personas del padrón.
        </li>
        <li>
          Está prohibido el uso para spam, fines ilícitos, o mensajes que
          infrinjan derechos de terceros o normativa electoral aplicable.
        </li>
        <li>
          Toda comunicación debe respetar el derecho de baja (opt-out) de los
          destinatarios.
        </li>
      </ul>

      <h2>Cuentas y acceso</h2>
      <p>
        El acceso es para usuarios autorizados del equipo. Sos responsable de
        resguardar tus credenciales y las de los servicios que conectes.
      </p>

      <h2>Integraciones de terceros</h2>
      <p>
        El Servicio se integra con plataformas externas (Meta/Facebook, Google,
        Resend, SiliconFlow, entre otras). El uso de esas integraciones está
        sujeto además a los términos y políticas de cada proveedor. El operador
        es responsable de cumplir las políticas de publicidad y contenido de cada
        plataforma, incluyendo la declaración de anuncios de temática política
        cuando corresponda.
      </p>

      <h2>Contenido generado con IA</h2>
      <p>
        Las funciones de IA asisten en la creación de contenido; el operador es
        responsable de revisar y aprobar lo que publica o envía.
      </p>

      <h2>Limitación de responsabilidad</h2>
      <p>
        El Servicio se ofrece &ldquo;tal cual&rdquo;. No garantizamos
        disponibilidad ininterrumpida ni resultados de las campañas. No somos
        responsables por el uso que el operador haga de los datos o las
        integraciones.
      </p>

      <h2>Ley aplicable</h2>
      <p>Estos términos se rigen por las leyes de la República Argentina.</p>

      <h2>Contacto</h2>
      <p>
        Consultas: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. Podemos
        actualizar estos términos; la versión vigente queda publicada en esta URL.
      </p>
    </LegalShell>
  );
}
