import { describe, it, expect } from "vitest";
import {
  escapeHtml,
  textToHtml,
  wrapEmailShell,
  wrapEmailMinimal,
  ctaButton,
} from "@/lib/email-html";

describe("escapeHtml", () => {
  it("escapa caracteres peligrosos", () => {
    expect(escapeHtml(`<a href="x">&'`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;&amp;&#39;",
    );
  });
});

describe("textToHtml", () => {
  it("separa bloques por línea en blanco en <p>", () => {
    const html = textToHtml("Hola\n\nChau");
    expect(html.match(/<p /g)?.length).toBe(2);
    expect(html).toContain("Hola");
    expect(html).toContain("Chau");
  });

  it("convierte saltos simples en <br>", () => {
    const html = textToHtml("uno\ndos");
    expect(html).toContain("uno<br>dos");
  });

  it("auto-linkea URLs http(s)", () => {
    const html = textToHtml("mirá https://tronador.net.ar/encuesta/abc acá");
    expect(html).toContain('<a href="https://tronador.net.ar/encuesta/abc"');
    expect(html).toContain("</a>");
  });

  it("escapa HTML del texto plano (no inyecta tags)", () => {
    const html = textToHtml("<script>alert(1)</script>");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("wrapEmailShell", () => {
  it("incluye el contenido, el org y la nota de opt-out por defecto", () => {
    const html = wrapEmailShell({
      contentHtml: "<p>cuerpo</p>",
      orgName: "Equipo XYZ",
    });
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("<p>cuerpo</p>");
    expect(html).toContain("Equipo XYZ");
    expect(html.toLowerCase()).toContain("baja");
  });

  it("inyecta el preheader oculto y el trailing HTML (pixel)", () => {
    const html = wrapEmailShell({
      contentHtml: "<p>x</p>",
      preheader: "vista previa",
      trailingHtml: '<img src="http://x/pixel.gif">',
    });
    expect(html).toContain("vista previa");
    expect(html).toContain('<img src="http://x/pixel.gif">');
  });

  it("permite ocultar la nota de opt-out", () => {
    const html = wrapEmailShell({
      contentHtml: "<p>x</p>",
      optOutNote: null,
    });
    expect(html.toLowerCase()).not.toContain("baja");
  });
});

describe("wrapEmailMinimal", () => {
  it("envuelve el contenido en un doc válido SIN marca ni nota de baja", () => {
    const html = wrapEmailMinimal({ contentHtml: "<p>todo mío</p>" });
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("<p>todo mío</p>");
    // sin encabezado de marca ni opt-out automático
    expect(html.toLowerCase()).not.toContain("baja");
    expect(html).not.toContain("border-bottom:3px solid");
  });

  it("inyecta preheader y trailing HTML", () => {
    const html = wrapEmailMinimal({
      contentHtml: "<p>x</p>",
      preheader: "preview",
      trailingHtml: '<img src="http://x/p.gif">',
    });
    expect(html).toContain("preview");
    expect(html).toContain('<img src="http://x/p.gif">');
  });
});

describe("ctaButton", () => {
  it("genera un <a> con el href y el label", () => {
    const btn = ctaButton("Responder", "https://x/encuesta/1");
    expect(btn).toContain('href="https://x/encuesta/1"');
    expect(btn).toContain("Responder");
  });
});
