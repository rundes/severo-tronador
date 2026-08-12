import { describe, it, expect } from "vitest";
import {
  looksLikeFeed,
  discoverFeedUrl,
  scrapeHomeLinks,
  googleNewsFeeds,
  extractArticleMeta,
} from "@/lib/connectors/rss";

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
});
