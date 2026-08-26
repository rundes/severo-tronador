import { describe, it, expect } from "vitest";
import { JSDOM } from "jsdom";
import { parseXProfile, parseXTimeline, parseXReplies } from "../infra/escucha-extension/core/xdom.js";

const tweet = (o: { handle: string; id: string; text: string; at?: string; label?: string }) => `
  <article data-testid="tweet" role="article">
    <div data-testid="User-Name">
      <a href="/${o.handle}"><span>${o.handle}</span></a>
      <a href="/${o.handle}/status/${o.id}">${o.at ? `<time datetime="${o.at}">hoy</time>` : ""}</a>
    </div>
    <div data-testid="tweetText">${o.text}</div>
    ${o.label ? `<div role="group" aria-label="${o.label}"></div>` : ""}
  </article>`;

const profileDoc = (body: string) =>
  new JSDOM(`<html><body>
    <a href="/FerroOficial/followers"><span>38,2 mil</span> Seguidores</a>
    <a href="/FerroOficial/following"><span>120</span> Siguiendo</a>
    ${body}
  </body></html>`).window.document;

describe("xdom · perfil", () => {
  it("seguidores del link /followers", () => {
    expect(parseXProfile(profileDoc(""))).toEqual({ followers: 38200 });
  });
  it("null si no está el link", () => {
    expect(parseXProfile(new JSDOM("<html><body></body></html>").window.document)).toBeNull();
  });
});

describe("xdom · timeline", () => {
  const doc = profileDoc(
    tweet({ handle: "FerroOficial", id: "111", text: "fijado viejo", at: "2026-08-01T10:00:00.000Z", label: "2 respuestas, 1 repost, 5 Me gusta, 300 reproducciones" }) +
    tweet({ handle: "FerroOficial", id: "222", text: "ganamos de local", at: "2026-08-25T20:00:00.000Z", label: "7 respuestas, 6 reposts, 23 Me gusta, 1 elemento guardado, 1828 reproducciones" }) +
    tweet({ handle: "FerroOficial", id: "333", text: "entradas a la venta", at: "2026-08-26T09:00:00.000Z", label: "1 respuesta, 0 reposts, 2 Me gusta" }),
  );

  it("filtra por datetime posterior a since, nunca por posición", () => {
    const items = parseXTimeline(doc, "FerroOficial", "2026-08-20T00:00:00.000Z");
    expect(items.map((i) => i.url)).toEqual([
      "https://x.com/FerroOficial/status/222",
      "https://x.com/FerroOficial/status/333",
    ]);
  });

  it("saca texto, autor, fecha y métricas del aria-label del group", () => {
    const [item] = parseXTimeline(doc, "FerroOficial", "2026-08-24T00:00:00.000Z");
    expect(item).toEqual({
      site: "x",
      kind: "post",
      text: "ganamos de local",
      url: "https://x.com/FerroOficial/status/222",
      author: "FerroOficial",
      publishedAt: "2026-08-25T20:00:00.000Z",
      metrics: { likeCount: 23, replyCount: 7, repostCount: 6, viewCount: 1828 },
    });
  });

  it("sin since devuelve todo y deduplica por url", () => {
    const dup = profileDoc(
      tweet({ handle: "FerroOficial", id: "222", text: "ganamos de local", at: "2026-08-25T20:00:00.000Z" }) +
      tweet({ handle: "FerroOficial", id: "222", text: "ganamos de local", at: "2026-08-25T20:00:00.000Z" }),
    );
    expect(parseXTimeline(dup, "FerroOficial", undefined)).toHaveLength(1);
  });

  it("timeline vacío → []", () => {
    expect(parseXTimeline(profileDoc(""), "FerroOficial", undefined)).toEqual([]);
  });
});

describe("xdom · respuestas", () => {
  it("saltea el primer artículo (la pieza madre) y devuelve kind comment", () => {
    const doc = new JSDOM(`<html><body>
      ${tweet({ handle: "FerroOficial", id: "222", text: "ganamos de local", at: "2026-08-25T20:00:00.000Z" })}
      ${tweet({ handle: "hincha1", id: "901", text: "vamos ferro", at: "2026-08-25T20:10:00.000Z", label: "0 respuestas, 0 reposts, 3 Me gusta" })}
      ${tweet({ handle: "FerroOficial", id: "902", text: "gracias", at: "2026-08-25T20:20:00.000Z" })}
      ${tweet({ handle: "hincha2", id: "903", text: "aguante", at: "2026-08-25T20:30:00.000Z" })}
    </body></html>`).window.document;
    const items = parseXReplies(doc, "https://x.com/FerroOficial/status/222", "FerroOficial");
    expect(items.map((i) => [i.author, i.kind])).toEqual([["hincha1", "comment"], ["hincha2", "comment"]]);
    expect(items[0]).toEqual({
      site: "x",
      kind: "comment",
      text: "vamos ferro",
      url: "https://x.com/hincha1/status/901",
      author: "hincha1",
      parentUrl: "https://x.com/FerroOficial/status/222",
      publishedAt: "2026-08-25T20:10:00.000Z",
      metrics: { likeCount: 3, replyCount: 0, repostCount: 0, viewCount: undefined },
    });
  });

  it("un solo artículo (sin respuestas) → []", () => {
    const doc = new JSDOM(`<html><body>${tweet({ handle: "FerroOficial", id: "222", text: "solo" })}</body></html>`).window.document;
    expect(parseXReplies(doc, "https://x.com/FerroOficial/status/222", "FerroOficial")).toEqual([]);
  });
});
