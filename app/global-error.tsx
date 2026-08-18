"use client";

// Último recurso: error que revienta el layout raíz.
//
// El error boundary del dashboard cubre los fallos dentro del segmento, pero si
// lo que falla es el layout raíz —o algo antes de él— Next no tiene dónde
// renderizar y el usuario ve la pantalla de error genérica del framework, sin
// marca, sin explicación y sin salida. global-error reemplaza el documento
// completo, así que trae su propio <html> y <body>.
//
// Sin estilos de la app a propósito: si lo que falló fue el layout, el CSS
// puede ser justamente lo que no cargó. Todo inline.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="es">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#fafafa",
          color: "#18181b",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        }}
      >
        <main style={{ maxWidth: 480, padding: 24 }}>
          <p
            style={{
              margin: 0,
              fontSize: 11,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "#71717a",
            }}
          >
            Severo Tronador
          </p>
          <h1 style={{ margin: "8px 0 0", fontSize: 22, fontWeight: 600 }}>
            La aplicación no pudo arrancar
          </h1>
          <p style={{ marginTop: 12, fontSize: 14, lineHeight: 1.6, color: "#3f3f46" }}>
            Falló algo antes de poder mostrar la pantalla. No se perdió ningún
            dato: los envíos y las respuestas viven en la base, no en esta
            pantalla.
          </p>
          {error.digest && (
            <p
              style={{
                marginTop: 12,
                fontFamily: "ui-monospace, SFMono-Regular, monospace",
                fontSize: 12,
                color: "#71717a",
              }}
            >
              ref: {error.digest}
            </p>
          )}
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: 20,
              padding: "8px 14px",
              fontSize: 14,
              fontWeight: 600,
              color: "#fff",
              background: "#3b53a8",
              border: 0,
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            Reintentar
          </button>
        </main>
      </body>
    </html>
  );
}
