"""
Worker de páginas/grupos públicos de Facebook → Supabase listening_items.

Usa facebook-scraper (sin API oficial: Meta no ofrece lectura de páginas o
grupos de terceros en el Graph API). Para comunidades chicas el pueblo entero
publica en 2-3 páginas/grupos de FB; esto los trae al feed de /escucha.

Las fuentes se toman de listening_config.rss_feeds: toda URL de facebook.com
en esa lista se interpreta acá (la app las saltea en el conector RSS). Formas
aceptadas:
  https://www.facebook.com/<pagina-o-perfil-publico>
  https://www.facebook.com/groups/<id-o-slug>   (solo grupos públicos)
  https://www.facebook.com/profile.php?id=<id>  (perfil público)

Además de los posts trae los COMENTARIOS públicos de cada post
(COMMENTS_PER_POST, default 20; 0 desactiva): cada comentario entra como
item kind="comment" con parent_url al post, y la UI de escucha los agrupa.

Modo anónimo funciona a veces; con cookies de una sesión (cuenta QUEMABLE,
formato Netscape cookies.txt en FB_COOKIES) llega más lejos.

⚠️ Scraping viola los ToS de Facebook; la cuenta puede ser suspendida y las
IPs de datacenter (GitHub Actions) pueden ser bloqueadas. Mismo trade-off
documentado que el worker de X. Si falla acá, correr local (run.cmd).

Env:
  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
  FB_COOKIES        (opcional: contenido de cookies.txt)
  POSTS_PAGES       (páginas de scroll por fuente, default 2)
  DELAY_SECONDS     (default 60)
"""
import json
import os
import re
import sys
import tempfile
import time
from urllib.parse import parse_qs, urlparse

import httpx
from facebook_scraper import get_posts

SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SERVICE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
POSTS_PAGES = int(os.environ.get("POSTS_PAGES", "2"))
DELAY_SECONDS = float(os.environ.get("DELAY_SECONDS", "60"))
COMMENTS_PER_POST = int(os.environ.get("COMMENTS_PER_POST", "20"))


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
    """Devuelve ("group"|"page"|"profile", identificador) o None si no es FB útil.

    "page" cubre páginas y perfiles públicos con username (facebook.com/<name>):
    no se distinguen por URL; el fetch intenta como página y cae a perfil.
    """
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


def load_sources() -> list[tuple[str, str, str]]:
    """[(project_id, kind, ident)] desde listening_config de todos los proyectos."""
    out: list[tuple[str, str, str]] = []
    r = rest("GET", "listening_config?select=project_id,rss_feeds")
    r.raise_for_status()
    for row in r.json():
        for url in row.get("rss_feeds") or []:
            src = parse_fb_source(url)
            if src:
                out.append((row["project_id"], src[0], src[1]))
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


def cookies_file() -> str | None:
    raw = os.environ.get("FB_COOKIES", "").strip()
    if not raw:
        return None
    f = tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False, encoding="utf-8")
    f.write(raw)
    f.close()
    return f.name


def clean_text(s: str) -> str:
    return re.sub(r"\s+", " ", s or "").strip()[:2000]


def main() -> None:
    sources = load_sources()
    print(f"{len(sources)} fuentes de Facebook configuradas")
    if not sources:
        return
    ck = cookies_file()
    ok = 0
    for i, (project_id, kind, ident) in enumerate(sources, 1):
        label = f"{kind}:{ident}"
        try:
            rows = fetch_source(kind, ident, project_id, ck)
            upsert_items(rows)
            ok += 1
            n_com = sum(1 for r in rows if r["kind"] == "comment")
            print(f"[{i}/{len(sources)}] {label}: {len(rows) - n_com} posts + {n_com} comentarios")
        except Exception as e:
            print(
                f"[{i}/{len(sources)}] {label}: skip ({type(e).__name__}: {e})",
                file=sys.stderr,
            )
        time.sleep(DELAY_SECONDS)
    print(f"listo: {ok}/{len(sources)} fuentes con datos")


def post_rows(kind: str, ident: str, project_id: str, posts) -> list[dict]:
    rows: list[dict] = []
    for p in posts:
        text = clean_text(p.get("text") or "")
        url = p.get("post_url")
        if not text or not url:
            continue
        rows.append(
            {
                "project_id": project_id,
                "connector_id": "fb-pages",
                "source": f"facebook/{ident}",
                "text": text[:400],
                "url": url,
                "published_at": p["time"].isoformat() if p.get("time") else None,
                "author": p.get("username") or ident,
                "kind": "post",
                "parent_url": None,
            }
        )
        # Comentarios públicos del post → items kind="comment" con parent_url;
        # la UI de escucha los agrupa bajo el post (threading ya existente).
        for c in (p.get("comments_full") or [])[:COMMENTS_PER_POST]:
            ctext = clean_text(c.get("comment_text") or "")
            curl = c.get("comment_url")
            if not ctext or not curl:
                continue
            ctime = c.get("comment_time")
            rows.append(
                {
                    "project_id": project_id,
                    "connector_id": "fb-pages",
                    "source": f"facebook/{ident}",
                    "text": ctext[:400],
                    "url": curl,
                    "published_at": ctime.isoformat() if ctime else None,
                    "author": clean_text(c.get("commenter_name") or "")[:80] or None,
                    "kind": "comment",
                    "parent_url": url,
                }
            )
    return rows


def fetch_source(kind: str, ident: str, project_id: str, ck: str | None) -> list[dict]:
    opts = {"progress": False}
    if COMMENTS_PER_POST > 0:
        opts["comments"] = COMMENTS_PER_POST
    kwargs = {"pages": POSTS_PAGES, "cookies": ck, "options": opts}
    if kind == "group":
        return post_rows(kind, ident, project_id, get_posts(group=ident, **kwargs))
    if kind == "profile":
        return post_rows(kind, ident, project_id, get_posts(account=ident, **kwargs))
    # "page": puede ser página o perfil público con username; se intenta como
    # página y, si no devuelve nada o falla, como perfil (account=).
    try:
        rows = post_rows(kind, ident, project_id, get_posts(ident, **kwargs))
        if rows:
            return rows
    except Exception as e:
        print(f"  {ident}: como página falló ({type(e).__name__}), pruebo perfil", file=sys.stderr)
    return post_rows(kind, ident, project_id, get_posts(account=ident, **kwargs))


if __name__ == "__main__":
    main()
