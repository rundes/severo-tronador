// Genera el sitio de documentación estático para GitHub Pages a partir de los
// markdown del repo. Renderiza solo los archivos listados (ignora la app
// Next.js), reescribe los links .md → .html, y envuelve en una plantilla con
// sidebar. Salida: ../site/
import { marked } from "marked";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(root, "site");
const REPO = "https://github.com/rundes/severo-tronador";

// Orden del sidebar. src relativo al root del repo; out es el nombre final.
const PAGES = [
  { src: "README.md", out: "index.html", nav: "Inicio" },
  { src: "VISION.md", out: "VISION.html", nav: "Visión" },
  { src: "PLAN.md", out: "PLAN.html", nav: "Plan / Roadmap" },
  { src: "ARCHITECTURE.md", out: "ARCHITECTURE.html", nav: "Arquitectura" },
  { src: "PROVIDERS.md", out: "PROVIDERS.html", nav: "Providers" },
  { src: "docs/INTEGRATIONS.md", out: "INTEGRATIONS.html", nav: "Integraciones" },
  { src: "docs/STABILIZATION.md", out: "STABILIZATION.html", nav: "Estabilización" },
];

// Mapa basename .md → página de salida (para reescribir links internos).
const linkMap = new Map([
  ["README.md", "index.html"],
  ...PAGES.filter((p) => p.src !== "README.md").map((p) => [
    p.src.split("/").pop(),
    p.out,
  ]),
]);

function rewriteLinks(html) {
  return html.replace(/href="([^"]+)"/g, (m, href) => {
    // Anchors y URLs absolutas se dejan igual.
    if (/^(https?:|#|mailto:)/.test(href)) return m;
    const [path, hash = ""] = href.split("#");
    const base = path.split("/").pop();
    if (base && linkMap.has(base)) {
      return `href="${linkMap.get(base)}${hash ? "#" + hash : ""}"`;
    }
    // .docx u otros archivos del repo → al blob de GitHub.
    if (/\.(docx|js|ts|tsx)$/.test(base ?? "")) {
      return `href="${REPO}/blob/main/${path.replace(/^\.?\//, "")}"`;
    }
    return m;
  });
}

const navHtml = (current) =>
  PAGES.map(
    (p) =>
      `<a href="${p.out}"${p.out === current ? ' class="active"' : ""}>${p.nav}</a>`,
  ).join("\n");

const template = (title, nav, body) => `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} · Severo Tronador</title>
<style>
:root{--fg:#1a1a1a;--muted:#666;--bg:#fff;--border:#e5e5e5;--accent:#111;--code:#f5f5f5}
@media(prefers-color-scheme:dark){:root{--fg:#e8e8e8;--muted:#999;--bg:#0d0d0d;--border:#262626;--accent:#fff;--code:#1a1a1a}}
*{box-sizing:border-box}
body{margin:0;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:var(--fg);background:var(--bg);line-height:1.6}
.layout{display:flex;max-width:1100px;margin:0 auto;min-height:100vh}
aside{width:230px;flex:0 0 230px;border-right:1px solid var(--border);padding:2rem 1rem;position:sticky;top:0;height:100vh;overflow:auto}
aside .brand{font-family:ui-monospace,monospace;font-weight:600;margin-bottom:1.5rem;display:block;color:var(--accent);text-decoration:none}
aside a{display:block;padding:.35rem .5rem;border-radius:6px;color:var(--muted);text-decoration:none;font-size:.9rem}
aside a:hover{background:var(--code);color:var(--fg)}
aside a.active{background:var(--code);color:var(--fg);font-weight:600}
main{flex:1;min-width:0;padding:2.5rem 3rem;max-width:780px}
main img{max-width:100%}
h1,h2,h3{line-height:1.25;margin-top:2rem}
h1{margin-top:0}
a{color:#2563eb}
code{background:var(--code);padding:.15em .4em;border-radius:4px;font-size:.88em;font-family:ui-monospace,monospace}
pre{background:var(--code);padding:1rem;border-radius:8px;overflow:auto;font-size:.82rem;line-height:1.45}
pre code{background:none;padding:0}
table{border-collapse:collapse;width:100%;font-size:.9rem;margin:1rem 0;display:block;overflow:auto}
th,td{border:1px solid var(--border);padding:.5rem .7rem;text-align:left}
th{background:var(--code)}
blockquote{border-left:3px solid var(--border);margin:1rem 0;padding:.2rem 1rem;color:var(--muted)}
hr{border:none;border-top:1px solid var(--border);margin:2rem 0}
.footer{margin-top:3rem;padding-top:1rem;border-top:1px solid var(--border);font-size:.8rem;color:var(--muted)}
@media(max-width:760px){.layout{flex-direction:column}aside{width:auto;flex:none;height:auto;position:static;border-right:none;border-bottom:1px solid var(--border)}main{padding:1.5rem}}
</style>
</head>
<body>
<div class="layout">
<aside>
<a class="brand" href="index.html">severo·tronador</a>
${nav}
<div class="footer"><a href="${REPO}">Código en GitHub →</a></div>
</aside>
<main>${body}
<div class="footer">Generado desde los markdown del repo · <a href="${REPO}">github.com/rundes/severo-tronador</a></div>
</main>
</div>
</body>
</html>`;

mkdirSync(outDir, { recursive: true });

for (const page of PAGES) {
  const md = readFileSync(resolve(root, page.src), "utf8");
  const body = rewriteLinks(marked.parse(md));
  const title = (md.match(/^#\s+(.+)$/m)?.[1] ?? page.nav).replace(/[#*`]/g, "");
  writeFileSync(resolve(outDir, page.out), template(title, navHtml(page.out), body));
  console.log(`✓ ${page.src} → site/${page.out}`);
}

// .nojekyll para que Pages sirva los archivos tal cual.
writeFileSync(resolve(outDir, ".nojekyll"), "");
console.log(`Sitio en ${outDir} (${PAGES.length} páginas)`);
