// Sanitización del HTML de plantillas (F6 del plan de mejoras: era el módulo
// sin cubrir de mayor riesgo).
//
// El operador escribe HTML crudo en el editor de plantillas y ese HTML se manda
// por mail. Sin sanitizar, cualquier cosa que pegue —de una plantilla
// descargada, del portapapeles— va a la casilla del destinatario. Además el
// render lo inyecta con dangerouslySetInnerHTML en el preview del panel, así que
// un script ahí corre en la sesión del operador.
import { describe, it, expect } from "vitest";
import { sanitizeEmailHtml } from "@/lib/email-sanitize";

describe("sanitizeEmailHtml · lo que tiene que sobrevivir", () => {
  it("conserva el formato de texto y la estructura", () => {
    const html =
      "<p>Hola <strong>Ana</strong>, mirá <em>esto</em>.</p><ul><li>uno</li></ul>";
    expect(sanitizeEmailHtml(html)).toBe(html);
  });

  it("conserva las tablas de layout, que es como se maqueta un email", () => {
    const html =
      '<table role="presentation" width="600" cellpadding="0"><tbody><tr><td bgcolor="#ffffff">x</td></tr></tbody></table>';
    const out = sanitizeEmailHtml(html);
    expect(out).toContain("<table");
    expect(out).toContain('bgcolor="#ffffff"');
  });

  it("conserva estilos inline (única forma de estilar un mail)", () => {
    const out = sanitizeEmailHtml('<p style="color:#333;font-size:14px">x</p>');
    expect(out).toContain("style=");
    expect(out).toContain("color:#333");
  });

  it("conserva las variables de plantilla sin tocarlas", () => {
    const out = sanitizeEmailHtml("<p>Hola {{nombre}} de {{barrio}}</p>");
    expect(out).toContain("{{nombre}}");
    expect(out).toContain("{{barrio}}");
  });
});

describe("sanitizeEmailHtml · XSS", () => {
  it("saca los <script>", () => {
    const out = sanitizeEmailHtml('<p>ok</p><script>alert(1)</script>');
    expect(out).not.toContain("<script");
    expect(out).not.toContain("alert(1)");
    expect(out).toContain("<p>ok</p>");
  });

  it("saca los handlers inline", () => {
    const out = sanitizeEmailHtml('<p onclick="alert(1)">x</p>');
    expect(out).not.toContain("onclick");
  });

  it("saca onerror de una imagen", () => {
    // El vector clásico: la imagen falla a propósito y corre el handler.
    const out = sanitizeEmailHtml('<img src="x" onerror="alert(1)">');
    expect(out).not.toContain("onerror");
  });

  it("bloquea href javascript:", () => {
    const out = sanitizeEmailHtml('<a href="javascript:alert(1)">click</a>');
    expect(out).not.toContain("javascript:");
  });

  it("bloquea un href data: (evasión por documento embebido)", () => {
    const out = sanitizeEmailHtml(
      '<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">x</a>',
    );
    expect(out).not.toContain("data:text/html");
  });

  it("saca <iframe>, <object> y <embed>", () => {
    const out = sanitizeEmailHtml(
      '<iframe src="http://malo"></iframe><object data="x"></object><embed src="x">',
    );
    expect(out).not.toContain("<iframe");
    expect(out).not.toContain("<object");
    expect(out).not.toContain("<embed");
  });

  it("saca <style> y <link> (exfiltración por CSS y carga remota)", () => {
    const out = sanitizeEmailHtml(
      '<style>body{background:url(http://malo)}</style><link rel="stylesheet" href="http://malo">',
    );
    expect(out).not.toContain("<style");
    expect(out).not.toContain("<link");
  });

  it("saca <form> (un mail no debería postear a ningún lado)", () => {
    const out = sanitizeEmailHtml(
      '<form action="http://malo"><input name="pass"></form>',
    );
    expect(out).not.toContain("<form");
    expect(out).not.toContain("<input");
  });

  it("una imagen data: sí pasa (assets embebidos legítimos)", () => {
    const out = sanitizeEmailHtml(
      '<img src="data:image/png;base64,iVBORw0KGgo=" alt="">',
    );
    expect(out).toContain("data:image/png");
  });
});

describe("sanitizeEmailHtml · links salientes", () => {
  it("fuerza target y rel en todos los links", () => {
    // Un link de un mail se abre desde el webmail: sin noopener, la página
    // destino puede tocar la ventana que lo abrió.
    const out = sanitizeEmailHtml('<a href="https://ok.ar">x</a>');
    expect(out).toContain('target="_blank"');
    expect(out).toContain('rel="noopener noreferrer"');
  });

  it("pisa un target o rel que venga puesto por el usuario", () => {
    const out = sanitizeEmailHtml(
      '<a href="https://ok.ar" target="_self" rel="opener">x</a>',
    );
    expect(out).toContain('target="_blank"');
    expect(out).toContain('rel="noopener noreferrer"');
    expect(out).not.toContain('rel="opener"');
  });

  it("mailto sigue funcionando", () => {
    expect(sanitizeEmailHtml('<a href="mailto:a@b.com">x</a>')).toContain(
      "mailto:a@b.com",
    );
  });
});

describe("sanitizeEmailHtml · bordes", () => {
  it("string vacío no rompe", () => {
    expect(sanitizeEmailHtml("")).toBe("");
  });

  it("HTML roto no rompe", () => {
    expect(() => sanitizeEmailHtml("<p><div>sin cerrar")).not.toThrow();
  });

  it("texto plano pasa como texto", () => {
    expect(sanitizeEmailHtml("hola")).toBe("hola");
  });
});
