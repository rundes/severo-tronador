import { LegalShell, CONTACT_EMAIL } from "@/components/legal/legal-shell";

export const metadata = {
  title: "Política de Privacidad · Tronador",
  robots: { index: true },
};

const UPDATED = "8 de junio de 2026";

export default function PrivacidadPage() {
  return (
    <LegalShell title="Política de Privacidad" updated={UPDATED}>
      <p>
        Esta política describe cómo la plataforma Tronador (en adelante, &ldquo;la
        Plataforma&rdquo;), operada por nuestro equipo de estudios de opinión
        pública, recolecta, usa y protege la información. Es una herramienta de{" "}
        <strong>investigación de opinión</strong>, no de campaña electoral ni de
        venta de productos.
      </p>

      <h2>Qué datos tratamos</h2>
      <ul>
        <li>
          <strong>Datos de contacto del padrón</strong> que el responsable del
          estudio carga o importa: nombre, documento, correo, teléfono, barrio,
          y opcionalmente datos demográficos o de afiliación, usados solo para
          segmentar y contactar.
        </li>
        <li>
          <strong>Respuestas a encuestas</strong> (anónimas o atribuidas según el
          caso) para análisis agregado de opinión.
        </li>
        <li>
          <strong>Credenciales de servicios conectados</strong> (Meta/Facebook,
          Google, Resend, etc.): tokens de acceso que el operador configura. Se
          guardan cifrados y se usan únicamente para las acciones que el operador
          ejecuta (publicar en sus propias páginas, enviar correos, etc.).
        </li>
      </ul>

      <h2>Para qué los usamos</h2>
      <ul>
        <li>Construir segmentos y enviar encuestas o comunicaciones por los canales habilitados.</li>
        <li>Publicar y medir contenido en redes propias del operador (Facebook, Instagram).</li>
        <li>Producir análisis agregados de opinión pública.</li>
      </ul>

      <h2>Datos de Meta / Facebook</h2>
      <p>
        Cuando el operador conecta una cuenta de Meta, usamos su token solo para
        publicar contenido en sus Páginas/cuentas y leer métricas de esas
        publicaciones. <strong>No almacenamos perfiles ni datos personales de
        usuarios de Facebook</strong>, ni los vendemos ni los compartimos con
        terceros. El uso cumple las Políticas de la Plataforma de Meta.
      </p>

      <h2>Con quién compartimos</h2>
      <p>
        No vendemos ni cedemos datos personales a terceros. Solo se procesan a
        través de los proveedores que el operador configura (alojamiento, base de
        datos, envío de correo), sujetos a sus propias políticas.
      </p>

      <h2>Conservación y seguridad</h2>
      <p>
        Conservamos los datos mientras el estudio esté activo o según lo requiera
        la ley. Aplicamos cifrado de secretos, acceso restringido y políticas de
        base de datos con denegación por defecto.
      </p>

      <h2>Tus derechos</h2>
      <p>
        Podés solicitar acceso, rectificación o <strong>eliminación</strong> de
        tus datos, o dejar de recibir comunicaciones respondiendo{" "}
        <strong>BAJA</strong> a cualquier mensaje. Para eliminar tus datos seguí
        las instrucciones en{" "}
        <a href="/eliminacion-datos">Eliminación de datos</a>.
      </p>

      <h2>Contacto</h2>
      <p>
        Por cualquier consulta de privacidad escribinos a{" "}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>

      <h2>Cambios</h2>
      <p>
        Podemos actualizar esta política; publicaremos la versión vigente en esta
        misma URL con su fecha de actualización.
      </p>
    </LegalShell>
  );
}
