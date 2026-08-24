"""
Worker de páginas/grupos/perfiles públicos de Facebook → listening_items.

v2: Playwright (Chromium headless) con la sesión de una cuenta QUEMABLE.
facebook-scraper quedó obsoleto (el layout 2026 le devuelve vacío hasta en
páginas grandes); un navegador real con sesión es la única vía robusta sin
API. Meta no ofrece lectura de contenido de terceros por Graph API.

Fuentes: URLs de facebook.com en listening_config.rss_feeds (la app las
saltea en el conector RSS):
  https://www.facebook.com/<pagina-o-perfil-publico>
  https://www.facebook.com/groups/<id-o-slug>   (solo grupos públicos)
  https://www.facebook.com/profile.php?id=<id>  (perfil público)

Por cada fuente: abre la URL, scrollea, toma los posts visibles del feed y
abre los primeros COMMENTS_POSTS permalinks para levantar comentarios
públicos (kind="comment" con parent_url al post; la UI agrupa el thread).

⚠️ Scraping viola ToS de Facebook: cuenta quemable, nunca personal. IPs de
datacenter pueden ser bloqueadas; si falla en Actions, correr local.

Env:
  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
  FB_COOKIES        (cookies.txt Netscape de la sesión; REQUERIDO en v2)
  POSTS_PER_SOURCE  (default 10)
  COMMENTS_POSTS    (posts por fuente a abrir para comentarios, default 5)
  COMMENTS_PER_POST (default 20)
  SCROLLS           (default 4)
"""
import json
import os
import re
import sys
from http.cookiejar import MozillaCookieJar
from urllib.parse import parse_qs, urlparse

import httpx
from playwright.sync_api import TimeoutError as PWTimeout
from playwright.sync_api import sync_playwright

SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SERVICE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
POSTS_PER_SOURCE = int(os.environ.get("POSTS_PER_SOURCE", "10"))
COMMENTS_POSTS = int(os.environ.get("COMMENTS_POSTS", "5"))
COMMENTS_PER_POST = int(os.environ.get("COMMENTS_PER_POST", "20"))
SCROLLS = int(os.environ.get("SCROLLS", "4"))

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)


def rest(method: str, path: str, **kw) -> httpx.Response:
    headers = {
        "apikey": SERVICE_KEY,
        "authorization": f"Bearer {SERVICE_KEY}",
        "content-type": "application/json",
    }
    headers.update(kw.pop("headers", {}))
    return httpx.request(
        method, f"{SUPABASE_URL}/rest/v1/{path}", headers=headers, timeout=30, **kw
    )


def parse_fb_source(url: str) -> tuple[str, str] | None:
    """("group"|"page"|"profile", identificador) o None si no es FB útil."""
    try:
        u = urlparse(url)
    except ValueError:
        return None
    host = u.hostname or ""
    if not host.endswith("facebook.com"):
        return None
    parts = [p for p in u.path.split("/") if p]
    if not parts:
        return None
    if parts[0] == "groups" and len(parts) >= 2:
        return ("group", parts[1])
    if parts[0] == "profile.php":
        pid = parse_qs(u.query).get("id", [""])[0]
        return ("profile", pid) if pid.isdigit() else None
    if parts[0] in ("people", "watch", "events", "marketplace"):
        return None
    return ("page", parts[0])


def load_sources() -> list[tuple[str, str, str, str]]:
    """[(project_id, kind, ident, url)] de listening_config de todos los proyectos."""
    out = []
    r = rest("GET", "listening_config?select=project_id,rss_feeds")
    r.raise_for_status()
    for row in r.json():
        for url in row.get("rss_feeds") or []:
            src = parse_fb_source(url)
            if src:
                out.append((row["project_id"], src[0], src[1], url))
    return out


def upsert_items(rows: list[dict]) -> None:
    if not rows:
        return
    r = rest(
        "POST",
        "listening_items?on_conflict=project_id,url",
        headers={"prefer": "resolution=merge-duplicates,return=minimal"},
        content=json.dumps(rows),
    )
    if r.status_code >= 300:
        print(f"  upsert error {r.status_code}: {r.text[:200]}", file=sys.stderr)


def load_cookies() -> list[dict]:
    raw = os.environ.get("FB_COOKIES", "").strip()
    if not raw:
        sys.exit("FB_COOKIES es requerido (cookies.txt de cuenta quemable)")
    import tempfile

    f = tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False, encoding="utf-8")
    f.write(raw)
    f.close()
    jar = MozillaCookieJar(f.name)
    jar.load(ignore_discard=True, ignore_expires=True)
    cookies = []
    for c in jar:
        if "facebook" not in (c.domain or ""):
            continue
        cookies.append(
            {
                "name": c.name,
                "value": c.value,
                "domain": c.domain,
                "path": c.path or "/",
                "secure": bool(c.secure),
            }
        )
    if not any(c["name"] == "c_user" for c in cookies):
        sys.exit("FB_COOKIES sin c_user: export incompleto")
    return cookies


# Botones/labels de la UI que quedan pegados al FINAL del texto de posts y
# comentarios: timestamps ("1w", "3 h", "2y"), acciones (Like/Reply/Share y
# sus variantes en español) y "See translation". Tras la última acción suele
# venir el conteo de reacciones ("… Like Reply See translation 5"): ese
# número SOLO se recorta si va precedido por un token de UI. Un número final
# sin UI antes ("Fiesta 2026") es texto legítimo y no se toca.
_UI_TOKEN = (
    r"\d+\s?(?:h|d|w|m|y|min|sem|a)\b\.?"
    r"|Like|Reply|Comment|Share|See translation|See more|Edited|Author|Top fan"
    r"|Me gusta|Responder|Comentar|Compartir|Ver traducci[oó]n|Ver m[aá]s|Editado"
    r"|Todas las reacciones|All reactions|Most relevant|M[aá]s relevantes"
)
_UI_TAIL = re.compile(
    rf"(?:\s*(?:{_UI_TOKEN}))+(?:\s+\d+)?\s*$",
    re.IGNORECASE,
)


def strip_ui_tail(s: str) -> str:
    prev = None
    while prev != s:
        prev = s
        s = _UI_TAIL.sub("", s)
    return s.strip()


def clean_text(s: str) -> str:
    s = re.sub(r"\s+", " ", s or "").strip()
    # El textContent del contenedor arrastra el link de Messenger de la página
    # ("m.me/<usuario>") pegado al inicio del texto, sin espacio.
    s = re.sub(r"^m\.me[\w.\-/]*\s*", "", s)
    # Badges que preceden al autor en comentarios.
    s = re.sub(r"^(?:Top fan|Fan destacado|Author|Autor)\s+", "", s, flags=re.IGNORECASE)
    # El innerText de un article arrastra chrome de UI; corta sufijos típicos.
    for marker in ("Me gusta Comentar", "Like Comment", "Todas las reacciones"):
        i = s.find(marker)
        if i > 40:
            s = s[:i]
    return strip_ui_tail(s.strip())


# Formatos de permalink que FB usa hoy: /posts/, /permalink/, /videos/, /reel/,
# fotos (/photo/?fbid=… y photo.php?fbid=…), share-links (/share/p/…) y los ids
# pfbid/story_fbid. Los posts de FOTO — la mayoría en páginas municipales —
# solo llevan el formato /photo/, que el patrón viejo no cubría: por eso el
# worker veía articles y descartaba todos.
PERMALINK_PAT = re.compile(
    r"/(posts|permalink|videos|reel)/|/share/p/|photo\.php|/photo/?\?|pfbid|story_fbid|comment_id"
)
HREF_IN_HTML_PAT = re.compile(r'href="([^"]+)"')


def canonical_permalink(href: str) -> str | None:
    if not href:
        return None
    href = href.replace("&amp;", "&")
    if not PERMALINK_PAT.search(href):
        return None
    u = urlparse(href if href.startswith("http") else f"https://www.facebook.com{href}")
    keep = {k: v for k, v in parse_qs(u.query).items() if k in ("story_fbid", "id", "fbid", "comment_id")}
    q = "&".join(f"{k}={v[0]}" for k, v in sorted(keep.items()))
    return f"https://www.facebook.com{u.path}" + (f"?{q}" if q else "")


# Extracción a nivel PÁGINA: el layout 2026 ya no envuelve los posts del feed
# en div[role=article] de forma confiable (los que quedan suelen ser
# comentarios). En vez de adivinar el contenedor, se parte de los <a> cuyo
# href es un permalink de post y se sube hasta un ancestro con texto
# suficiente — eso ES el post, tenga el role que tenga.
_COLLECT_JS = """
() => {
  const pat = /\\/(posts|permalink|videos|reel)\\/|\\/share\\/p\\/|photo\\.php|\\/photo\\/?\\?|pfbid|story_fbid/;
  const out = [];
  const seen = new Set();
  for (const a of document.querySelectorAll('a[href]')) {
    const href = a.getAttribute('href') || '';
    if (!pat.test(href) || /comment_id/.test(href)) continue;
    if (seen.has(href)) continue;
    seen.add(href);
    // textContent, no innerText: innerText fuerza layout y sobre ancestros
    // grandes del DOM de FB tarda segundos — con 80 anchors x 14 niveles la
    // corrida se colgaba (>20 min). textContent es O(subtree) sin layout.
    let node = a.parentElement;
    let hops = 0;
    while (node && hops < 14) {
      const len = (node.textContent || '').length;
      if (len >= 80) break;
      node = node.parentElement;
      hops++;
    }
    // innerText solo sobre el contenedor chico ya elegido (una llamada por
    // anchor); si el climb no cerro en un nodo acotado, textContent y listo.
    let text = '';
    if (node && hops < 14 && (node.textContent || '').length < 4000) {
      text = node.innerText || node.textContent || '';
    } else if (node) {
      text = node.textContent || '';
    }
    out.push({ href, text: text.slice(0, 1500) });
    if (out.length >= 40) break;
  }
  return out;
}
"""


# href que FB deja como placeholder hasta que el mouse pasa por el link del
# timestamp: vacío, "#", o SOLO la query de tracking sin path
# ("?__cft__[0]=…&__tn__=%2CO%2CP-R#?jfb"). Visto en municipalidad.ibicuyof
# (posts de video): la página rendereaba 3 posts y el worker veía 0 porque
# ninguno de esos href matcheaba PERMALINK_PAT ni el chequeo ''/'#'.
def _is_deferred_href(href: str) -> bool:
    if href in ("", "#"):
        return True
    return href.startswith("?") or (href.startswith("#") and "__tn__" in href)


def _hover_deferred_links(page) -> None:
    """FB difiere el href real de algunos timestamps hasta hover. Hoverear
    los links del feed fuerza a que el href real aparezca en el DOM."""
    try:
        links = page.locator("a[role='link']").all()[:60]
    except Exception:
        return
    for a in links:
        try:
            href = a.get_attribute("href") or ""
            if _is_deferred_href(href):
                a.hover(timeout=800)
                page.wait_for_timeout(150)
        except Exception:
            continue


# Texto que delata que el "post" es chrome del perfil (el panel Photos, la
# cabecera con followers, contact info) y no un post del feed. Los thumbnails
# de la caja Photos también llevan href /photo/?fbid=…, así que el permalink
# solo no alcanza para distinguirlos.
CHROME_MARKERS = (
    "followers •", "seguidores •",
    "Personal details", "Detalles personales",
    "Contact info", "Información de contacto",
    "See all photos", "Ver todas las fotos",
)


def extract_feed_posts(page, limit: int) -> list[dict]:
    """Posts visibles: [{text, url}] partiendo de los permalinks de la página."""
    pairs = page.evaluate(_COLLECT_JS)
    # Antes solo se hovereaba con 0 pares; una página con 2 posts de foto y 8
    # de video (href diferido) quedaba en 2. Si no alcanza el cupo, hoverear.
    if len(pairs) < limit:
        _hover_deferred_links(page)
        pairs = page.evaluate(_COLLECT_JS)
    out, seen, seen_text = [], set(), set()
    for p in pairs:
        href = canonical_permalink(p.get("href") or "")
        if not href or "comment_id" in href or href in seen:
            continue
        text = clean_text(p.get("text") or "")
        if len(text) < 30:
            continue
        if any(m in text for m in CHROME_MARKERS):
            continue
        # Un set de fotos genera N fbid distintos con el mismo texto: uno solo.
        tkey = text[:80]
        if tkey in seen_text:
            continue
        seen.add(href)
        seen_text.add(tkey)
        out.append({"text": text[:400], "url": href})
        if len(out) >= limit:
            break
    if not out:
        _debug_dump_anchors(page)
    return out


# Instrumentación cuando una fuente da 0 posts: qué anchors vio la página y
# cómo son por dentro los posts (role=article) que sí renderizó, para iterar
# el patrón de permalinks con evidencia y no adivinando.
_DEBUG_JS = """
() => {
  const short = (s) => (s || '').replace(/\\s+/g, ' ').slice(0, 220);
  const deferred = Array.from(document.querySelectorAll('a[href]'))
    .filter(a => /^\\?|^#|__tn__/.test(a.getAttribute('href') || ''))
    .slice(0, 6)
    .map(a => ({ href: a.getAttribute('href'), role: a.getAttribute('role'),
                 label: a.getAttribute('aria-label'), html: short(a.outerHTML) }));
  const articles = Array.from(document.querySelectorAll('div[role="article"]'))
    .slice(0, 5)
    .map(el => ({
      text: short(el.innerText).slice(0, 120),
      hrefs: Array.from(el.querySelectorAll('a[href]')).map(a => a.getAttribute('href')).slice(0, 8),
      labels: Array.from(el.querySelectorAll('[aria-label]')).map(e => e.getAttribute('aria-label')).slice(0, 8),
    }));
  return { deferred, articles };
}
"""


def _debug_dump_anchors(page) -> None:
    try:
        hrefs = page.evaluate(
            "() => Array.from(document.querySelectorAll('a[href]'))"
            ".map(a => a.getAttribute('href')).filter(h => h && h.length > 1).slice(0, 40)"
        )
        print(f"  debug hrefs ({len(hrefs)}): {hrefs}", file=sys.stderr)
        info = page.evaluate(_DEBUG_JS)
        for d in info.get("deferred", []):
            print(f"  debug deferred: {d}", file=sys.stderr)
        for a in info.get("articles", []):
            print(f"  debug article: {a}", file=sys.stderr)
    except Exception as e:
        print(f"  debug dump failed: {e}", file=sys.stderr)


def extract_comments(page, limit: int) -> list[dict]:
    """Comentarios en la vista de un post: articles con aria-label de comentario."""
    out, seen = [], set()
    sel = (
        'div[role="article"][aria-label*="omentario"], '
        'div[role="article"][aria-label*="omment"]'
    )
    for c in page.locator(sel).all()[: limit * 2]:
        try:
            label = c.get_attribute("aria-label") or ""
            # aria-label: 'Comentario de <autor> hace N h' / 'Comment by <name>
            # a week ago'. El corte por '\s+hace|\s+\d' no cubría los relativos
            # en inglés sin dígito ("a week ago", "an hour ago", "yesterday") y
            # el autor quedaba con el timestamp pegado.
            m = re.search(r"(?:de|by)\s+(.+?)(?:\s+hace|\s+\d|$)", label)
            author = (m.group(1).strip() if m else "")[:80]
            author = re.sub(
                r"\s+(?:an?\s+(?:few\s+)?(?:second|minute|hour|day|week|month|year)s?\s+ago"
                r"|yesterday|just\s+now|ayer|reci[eé]n)\b.*$",
                "",
                author,
                flags=re.IGNORECASE,
            ).strip()
            text = clean_text(c.inner_text(timeout=2000))
            if author and text.startswith(author):
                text = text[len(author):].strip()
            if len(text) < 5:
                continue
            href = None
            for a in c.locator("a[href*='comment_id']").all()[:5]:
                href = canonical_permalink(a.get_attribute("href") or "")
                if href:
                    break
            key = href or f"{author}:{text[:60]}"
            if key in seen:
                continue
            seen.add(key)
            out.append({"text": text[:400], "url": href, "author": author or None})
            if len(out) >= limit:
                break
        except PWTimeout:
            continue
    return out


def scrape_source(page, kind: str, ident: str, url: str, project_id: str) -> list[dict]:
    target = url if kind != "group" else f"https://www.facebook.com/groups/{ident}?sorting_setting=CHRONOLOGICAL"
    page.goto(target, wait_until="domcontentloaded", timeout=45000)
    page.wait_for_timeout(4000)
    if "login" in page.url or "checkpoint" in page.url:
        raise RuntimeError(f"sesión rechazada en {page.url[:80]}")
    if kind == "group":
        # Un grupo privado no muestra feed (y no debería scrapearse: expectativa
        # de privacidad). Sin este chequeo el grupo aparece como "0 posts" y
        # nadie entiende por qué.
        body = page.locator("body").inner_text(timeout=5000)
        if "Private group" in body or "Grupo privado" in body:
            raise RuntimeError(
                "grupo PRIVADO — no accesible (sacarlo de las fuentes o esperar "
                "aprobación de membresía de la cuenta del worker)"
            )
    for _ in range(SCROLLS):
        page.mouse.wheel(0, 2500)
        page.wait_for_timeout(1500)

    posts = extract_feed_posts(page, POSTS_PER_SOURCE)
    if not posts:
        # Diagnóstico: qué renderizó realmente la página (para iterar selectores).
        n_art = page.locator('div[role="article"]').count()
        n_feed = page.locator('div[role="feed"]').count()
        body = clean_text(page.locator("body").inner_text(timeout=5000))[:400]
        print(
            f"  debug {ident}: url={page.url[:90]} title={page.title()[:60]!r} "
            f"articles={n_art} feeds={n_feed}",
            file=sys.stderr,
        )
        print(f"  debug body: {body}", file=sys.stderr)
        try:
            page.screenshot(path=f"debug-{ident}.png")
        except Exception:
            pass
    # Sin published_at: la fecha real del post no se scrapea (por ahora) y un
    # NULL deja el item fuera de toda ventana del feed. Se OMITE la columna
    # para que aplique el default now() de la DB en el insert — y para que el
    # upsert de corridas siguientes no la pise (merge-duplicates solo toca las
    # columnas presentes en el payload).
    rows = [
        {
            "project_id": project_id,
            "connector_id": "fb-pages",
            "source": f"facebook/{ident}",
            "text": p["text"],
            "url": p["url"],
            "author": ident,
            "kind": "post",
            "parent_url": None,
        }
        for p in posts
    ]

    for p in posts[:COMMENTS_POSTS]:
        try:
            page.goto(p["url"], wait_until="domcontentloaded", timeout=45000)
            page.wait_for_timeout(3500)
            for c in extract_comments(page, COMMENTS_PER_POST):
                rows.append(
                    {
                        "project_id": project_id,
                        "connector_id": "fb-pages",
                        "source": f"facebook/{ident}",
                        "text": c["text"],
                        "url": c["url"] or f"{p['url']}#c-{abs(hash(c['text'])) % 10**10}",
                        "author": c["author"],
                        "kind": "comment",
                        "parent_url": p["url"],
                    }
                )
        except Exception as e:
            print(f"  comentarios de {p['url'][:60]}: skip ({type(e).__name__})", file=sys.stderr)
    return rows


def main() -> None:
    sources = load_sources()
    print(f"{len(sources)} fuentes de Facebook configuradas")
    if not sources:
        return
    cookies = load_cookies()
    ok = 0
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        ctx = browser.new_context(user_agent=UA, viewport={"width": 1366, "height": 900}, locale="es-AR")
        ctx.add_cookies(cookies)
        page = ctx.new_page()
        # Probe de sesión
        page.goto("https://www.facebook.com/", wait_until="domcontentloaded", timeout=45000)
        page.wait_for_timeout(3000)
        if "login" in page.url or "checkpoint" in page.url:
            sys.exit(f"sesión RECHAZADA ({page.url[:80]}) — re-exportar cookies")
        print("sesión: activa")

        for i, (project_id, kind, ident, url) in enumerate(sources, 1):
            label = f"{kind}:{ident}"
            try:
                rows = scrape_source(page, kind, ident, url, project_id)
                upsert_items(rows)
                if rows:
                    ok += 1
                n_com = sum(1 for r in rows if r["kind"] == "comment")
                print(f"[{i}/{len(sources)}] {label}: {len(rows) - n_com} posts + {n_com} comentarios")
            except Exception as e:
                print(f"[{i}/{len(sources)}] {label}: skip ({type(e).__name__}: {e})", file=sys.stderr)
            page.wait_for_timeout(5000)
        browser.close()
    print(f"listo: {ok}/{len(sources)} fuentes con datos")


if __name__ == "__main__":
    main()
