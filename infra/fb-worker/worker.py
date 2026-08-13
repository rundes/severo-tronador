"""
Worker de páginas/grupos públicos de Facebook → Supabase listening_items.

Usa facebook-scraper (sin API oficial: Meta no ofrece lectura de páginas o
grupos de terceros en el Graph API). Para comunidades chicas el pueblo entero
publica en 2-3 páginas/grupos de FB; esto los trae al feed de /escucha.

Las fuentes se toman de listening_config.rss_feeds: toda URL de facebook.com
en esa lista se interpreta acá (la app las saltea en el conector RSS). Formas
aceptadas:
  https://www.facebook.com/<pagina>
  https://www.facebook.com/groups/<id-o-slug>   (solo grupos públicos)

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
from urllib.parse import urlparse

import httpx
from facebook_scraper import get_posts

SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SERVICE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
POSTS_PAGES = int(os.environ.get("POSTS_PAGES", "2"))
DELAY_SECONDS = float(os.environ.get("DELAY_SECONDS", "60"))


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
    """Devuelve ("group"|"page", identificador) o None si no es FB útil."""
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
    if parts[0] in ("profile.php", "people", "watch", "events", "marketplace"):
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
            kwargs = {"pages": POSTS_PAGES, "cookies": ck}
            posts = (
                get_posts(group=ident, **kwargs)
                if kind == "group"
                else get_posts(ident, **kwargs)
            )
            rows = []
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
                    }
                )
            upsert_items(rows)
            ok += 1
            print(f"[{i}/{len(sources)}] {label}: {len(rows)} posts")
        except Exception as e:
            print(
                f"[{i}/{len(sources)}] {label}: skip ({type(e).__name__}: {e})",
                file=sys.stderr,
            )
        time.sleep(DELAY_SECONDS)
    print(f"listo: {ok}/{len(sources)} fuentes con datos")


if __name__ == "__main__":
    main()
