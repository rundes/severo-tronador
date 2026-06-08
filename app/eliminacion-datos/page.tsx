import { LegalShell, CONTACT_EMAIL } from "@/components/legal/legal-shell";

export const metadata = {
  title: "Eliminación de datos · Tronador",
  robots: { index: true },
};

const UPDATED = "8 de junio de 2026";

export default function EliminacionDatosPage() {
  return (
    <LegalShell title="Eliminación de datos del usuario" updated={UPDATED}>
      <p>
        Respetamos tu derecho a que eliminemos tus datos. Esta página explica cómo
        solicitarlo, incluyendo los datos asociados a integraciones con
        Meta/Facebook.
      </p>

      <h2>Cómo pedir la eliminación</h2>
      <ul>
        <li>
          Escribí a <a href={`mailto:${CONTACT_EMAIL}?subject=Eliminar%20mis%20datos`}>{CONTACT_EMAIL}</a>{" "}
          con el asunto <strong>&ldquo;Eliminar mis datos&rdquo;</strong>, indicando
          el correo, teléfono o documento con el que figurás.
        </li>
        <li>
          O respondé <strong>BAJA</strong> a cualquier comunicación que hayas
          recibido: deja de contactarte y podés pedir el borrado total.
        </li>
      </ul>

      <h2>Qué eliminamos</h2>
      <p>
        Tus datos de contacto del padrón y tus respuestas atribuibles. Los datos
        ya incluidos en análisis agregados y anonimizados no permiten
        identificarte y pueden conservarse de forma anónima.
      </p>

      <h2>Datos de Meta / Facebook</h2>
      <p>
        No almacenamos perfiles de usuarios de Facebook. Si interactuaste con una
        publicación o aviso y querés que removamos cualquier dato asociado,
        indicalo en tu solicitud y lo eliminaremos de nuestros sistemas.
      </p>

      <h2>Plazo</h2>
      <p>
        Procesamos las solicitudes dentro de los <strong>30 días</strong> y te
        confirmamos por correo cuando se completó.
      </p>

      <h2>Contacto</h2>
      <p>
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
      </p>
    </LegalShell>
  );
}
