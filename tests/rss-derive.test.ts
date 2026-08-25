import { describe, it, expect } from "vitest";
import {
  looksLikeFeed,
  discoverFeedUrl,
  scrapeHomeLinks,
  googleNewsFeeds,
  extractArticleMeta,
  parseTelegramChannel,
  parseFeed,
  stripTags,
  dedupeByTitle,
} from "@/lib/connectors/rss";

// Google News: la descripción es HTML (`<a>título</a><font>medio</font>`) y
// cada query devuelve su propia URL para el mismo artículo. Ibicuy 2026-08-25
// mostraba "… — <a href=" y títulos repetidos en el feed.
describe("parseFeed · descripción HTML y dedupe por título", () => {
  const item = (title: string, desc: string, link: string) =>
    `<item><title>${title}</title><description>${desc}</description><link>${link}</link><pubDate>Tue, 25 Aug 2026 19:23:58 GMT</pubDate></item>`;

  it("stripTags quita tags, decodifica entidades y colapsa espacios", () => {
    expect(stripTags('<a href="x">Hola</a>&nbsp;&nbsp;<font>Medio</font>')).toBe("Hola Medio");
  });

  it("descripción HTML que solo repite el título → texto = título", () => {
    const xml = `<rss><channel>${item("Puerto de Ibicuy crece - El Cronista", '&lt;a href="https://news.google.com/x"&gt;Puerto de Ibicuy crece - El Cronista&lt;/a&gt;&amp;nbsp;&lt;font color="#6f6f6f"&gt;El Cronista&lt;/font&gt;', "https://news.google.com/rss/articles/A")}</channel></rss>`;
    const [it0] = parseFeed(xml, "https://news.google.com/rss/search?q=Ibicuy");
    expect(it0.text).toBe("Puerto de Ibicuy crece - El Cronista");
    expect(it0.text).not.toMatch(/<|&lt;/);
  });

  it("descripción con contenido propio se conserva, sin tags", () => {
    const xml = `<rss><channel>${item("Título", "&lt;p&gt;Bajada con &lt;b&gt;detalle&lt;/b&gt; propio&lt;/p&gt;", "https://m.ar/1")}</channel></rss>`;
    expect(parseFeed(xml, "https://m.ar/feed")[0].text).toBe("Título — Bajada con detalle propio");
  });

  it("dedupeByTitle deja una fila por título normalizado", () => {
    const items = [
      { source: "g", text: "Pueblo Belgrano e Ibicuy recibieron kits - R2820", url: "https://g/A" },
      { source: "g", text: "Pueblo Belgrano e Ibicuy recibieron kits - R2820", url: "https://g/B" },
      { source: "g", text: "Otra nota", url: "https://g/C" },
    ];
    expect(dedupeByTitle(items).map((i) => i.url)).toEqual(["https://g/A", "https://g/C"]);
  });
});

describe("looksLikeFeed", () => {
  it("reconoce RSS y Atom", () => {
    expect(looksLikeFeed('<?xml version="1.0"?><rss version="2.0">')).toBe(true);
    expect(looksLikeFeed('<feed xmlns="http://www.w3.org/2005/Atom">')).toBe(true);
  });
  it("rechaza HTML", () => {
    expect(looksLikeFeed("<!doctype html><html><head></head>")).toBe(false);
  });
});

describe("discoverFeedUrl", () => {
  it("encuentra el link alternate rss con atributos en cualquier orden", () => {
    const html =
      '<head><link type="application/rss+xml" href="/feed" rel="alternate" title="RSS"></head>';
    expect(discoverFeedUrl(html, "https://diario.example.com/")).toBe(
      "https://diario.example.com/feed",
    );
  });
  it("resuelve href absoluto y devuelve null sin link", () => {
    const html =
      '<link rel="alternate" type="application/atom+xml" href="https://cdn.example.com/atom.xml">';
    expect(discoverFeedUrl(html, "https://diario.example.com/")).toBe(
      "https://cdn.example.com/atom.xml",
    );
    expect(discoverFeedUrl("<link rel='stylesheet' href='/a.css'>", "https://x.com/")).toBeNull();
  });
});

describe("scrapeHomeLinks", () => {
  const html = `
    <nav><a href="/seccion/deportes">Deportes</a></nav>
    <article><a href="/nota/2026/08/el-municipio-anuncio-obras-de-cloacas-en-tres-barrios">
      El municipio anunció obras de cloacas en tres barrios del distrito
    </a></article>
    <a href="https://otrositio.com/nota-larga-de-otro-dominio-que-no-va">Nota externa con título bien largo para pasar el filtro</a>
    <a href="/nota/2026/08/el-municipio-anuncio-obras-de-cloacas-en-tres-barrios">
      El municipio anunció obras de cloacas en tres barrios del distrito
    </a>
    <a href="/contacto-institucional-del-diario">Contacto institucional del diario y sus redes sociales</a>
  `;
  it("extrae títulos same-host, dedupea y excluye navegación/institucionales", () => {
    const items = scrapeHomeLinks(html, "https://diario.example.com/");
    expect(items).toHaveLength(1);
    expect(items[0].url).toContain("/nota/2026/08/");
    expect(items[0].text).toContain("cloacas");
    expect(items[0].source).toBe("diario.example.com");
  });
});

describe("extractArticleMeta", () => {
  it("saca og:description, og:title y fecha con atributos en cualquier orden", () => {
    const html = `<head>
      <meta content="El intendente confirmó el cronograma de obras para 2026" property="og:description">
      <meta property="og:title" content="Obras confirmadas en Ibicuy" />
      <meta property="article:published_time" content="2026-08-12T10:00:00-03:00">
    </head>`;
    const m = extractArticleMeta(html);
    expect(m.description).toContain("cronograma de obras");
    expect(m.title).toBe("Obras confirmadas en Ibicuy");
    expect(m.publishedAt).toBe("2026-08-12T10:00:00-03:00");
  });
  it("cae a meta description y devuelve undefined sin metadata", () => {
    expect(
      extractArticleMeta('<meta name="description" content="Resumen de la nota larga">')
        .description,
    ).toBe("Resumen de la nota larga");
    expect(extractArticleMeta("<p>sin meta</p>").description).toBeUndefined();
  });
});

describe("parseTelegramChannel", () => {
  it("extrae texto, link y fecha de la vista pública t.me/s", () => {
    const html = `
      <div class="tgme_widget_message_bubble">
        <div class="tgme_widget_message_text js-message_text" dir="auto">Corte de agua programado para mañana en el barrio norte</div>
        <a class="tgme_widget_message_date" href="https://t.me/municipio/123"><time datetime="2026-08-13T09:00:00+00:00"></time></a>
      </div>
      <div class="tgme_widget_message_bubble">
        <div class="tgme_widget_message_text">ok</div>
      </div>`;
    const items = parseTelegramChannel(html, "municipio");
    expect(items).toHaveLength(1);
    expect(items[0].text).toContain("Corte de agua");
    expect(items[0].url).toBe("https://t.me/municipio/123");
    expect(items[0].publishedAt).toBe("2026-08-13T09:00:00+00:00");
    expect(items[0].source).toBe("t.me/municipio");
  });
});

describe("googleNewsFeeds", () => {
  it("arma feed por zona y por keyword acotada a la zona", () => {
    const feeds = googleNewsFeeds({
      keywords: ["inseguridad"],
      zona: "Maipú Mendoza",
      pais: "AR",
    });
    expect(feeds).toHaveLength(2);
    expect(feeds[0]).toContain("news.google.com/rss/search");
    expect(decodeURIComponent(feeds[0])).toContain('"Maipú Mendoza"');
    expect(decodeURIComponent(feeds[1])).toContain("inseguridad");
    expect(feeds[0]).toContain("gl=AR");
  });
  it("sin zona ni keywords no genera feeds", () => {
    expect(googleNewsFeeds({ keywords: [] })).toHaveLength(0);
  });
  it("zona con coma: ancla por la localidad, no por la frase entera", () => {
    // "Ibicuy, Entre Ríos" como frase exacta devolvía 0 resultados en Google
    // News (2026-08-25); "Ibicuy" solo devolvía 34 en 7 días.
    const feeds = googleNewsFeeds({ keywords: ["Inundaciones"], zona: "Ibicuy, Entre Ríos", pais: "AR" });
    const q = feeds.map((f) => decodeURIComponent(f));
    expect(q[0]).toContain("q=Ibicuy when:");
    expect(q[0]).not.toContain("Entre Ríos");
    expect(q[1]).toContain("q=Ibicuy Inundaciones when:");
    // una localidad de varias palabras sigue entre comillas
    const multi = googleNewsFeeds({ keywords: [], zona: "Villa Paranacito, Entre Ríos", pais: "AR" });
    expect(decodeURIComponent(multi[0])).toContain('q="Villa Paranacito" when:');
  });
});
