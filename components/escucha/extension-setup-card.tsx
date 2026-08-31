// Setup de la extensión de Chrome (descarga, instalación, token). Vive en la
// pestaña Entorno junto al resto de la configuración; el tab Informe solo lee.
import { ExtensionTokenButton } from "@/components/escucha/extension-token-button";

export function ExtensionSetupCard() {
  return (
    <section className="space-y-2 rounded-lg border border-zinc-200 p-5 dark:border-zinc-800">
      <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
        Extensión de Chrome
      </h2>
      <p className="max-w-[70ch] text-xs text-zinc-500">
        La extensión corre en tu navegador (tu sesión, tu IP): muestra el
        escenario y las keywords del proyecto, abre búsquedas complementarias
        en Google News, X, Facebook, Instagram y TikTok, y captura lo que ves
        para sumarlo al historial que alimenta el informe.
      </p>
      <ol className="max-w-[70ch] list-decimal space-y-1 pl-5 text-xs text-zinc-500">
        <li>
          Descargá el .zip y descomprimilo (&quot;Extraer todo&quot;) en una
          carpeta que no vayas a borrar: Chrome la lee desde ahí. Adentro
          tiene que quedar <code>manifest.json</code> directamente.
        </li>
        <li>
          <code>chrome://extensions</code> → activá &quot;Modo de
          desarrollador&quot; → &quot;Cargar descomprimida&quot; → elegí la
          carpeta.
        </li>
        <li>
          Generá el token (solo owner), y en Opciones de la extensión pegá la
          URL de esta app + el token.
        </li>
      </ol>
      <div className="flex flex-wrap items-center gap-2">
        <a
          href="/api/extension/download"
          download
          className="rounded bg-zinc-900 px-3 py-1.5 text-sm text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          Descargar extensión (.zip)
        </a>
        <ExtensionTokenButton />
      </div>
    </section>
  );
}
