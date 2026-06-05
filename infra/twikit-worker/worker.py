"""
Worker de timelines de X → Supabase listening_items (la app lee de ese cache).

Usa twscrape (más mantenida que twikit) en modo COOKIES: en vez de login con
usuario/pass (que X rompe con anti-bot), se cargan las cookies auth_token + ct0
de una sesión ya logueada en el navegador. Persiste la cuenta en accounts.db.

Estrategia lenta: recorre handles de a uno con delay; ante rate-limit twscrape
espera; upsert idempotente por url.

⚠️ Scraping con cuenta logueada viola los ToS de X; la cuenta puede ser
suspendida. No corre en Vercel (va en tu PC / VPS).

Env (.env):
  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, PROJECT_ID
  X_USERNAME, X_EMAIL, X_PASSWORD        (metadata de la cuenta)
  X_AUTH_TOKEN, X_CT0                    (cookies de la sesión del navegador)
  TWEETS_PER_HANDLE, DELAY_SECONDS
"""
import asyncio
import json
import os
import sys

import httpx
from twscrape import API, gather


def load_env(path: str = ".env") -> dict:
    kv = {}
    if os.path.exists(path):
        for line in open(path, encoding="utf-8"):
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                kv[k.strip()] = v.strip()
    kv.update({k: os.environ[k] for k in os.environ if k in kv or k.startswith("X_") or k.startswith("SUPABASE") or k in ("PROJECT_ID", "TWEETS_PER_HANDLE", "DELAY_SECONDS")})
    return kv


ENV = load_env()
SUPABASE_URL = ENV["SUPABASE_URL"].rstrip("/")
SERVICE_KEY = ENV["SUPABASE_SERVICE_ROLE_KEY"]
PROJECT_ID = ENV.get("PROJECT_ID", "00000000-0000-0000-0000-000000000001")
TWEETS_PER_HANDLE = int(ENV.get("TWEETS_PER_HANDLE", "5"))
DELAY_SECONDS = float(ENV.get("DELAY_SECONDS", "45"))


def rest(method: str, path: str, **kw) -> httpx.Response:
    headers = {
        "apikey": SERVICE_KEY,
        "authorization": f"Bearer {SERVICE_KEY}",
        "content-type": "application/json",
    }
    headers.update(kw.pop("headers", {}))
    return httpx.request(method, f"{SUPABASE_URL}/rest/v1/{path}", headers=headers, timeout=30, **kw)


def normalize_handle(raw: str) -> str:
    s = (raw or "").strip()
    for pre in ("https://twitter.com/", "http://twitter.com/", "https://x.com/", "http://x.com/"):
        if s.lower().startswith(pre):
            s = s[len(pre):]
            break
    return s.split("/")[0].split("?")[0].lstrip("@").strip().lower()


def load_handles() -> list[str]:
    handles: set[str] = set()
    r = rest("GET", f"listening_config?project_id=eq.{PROJECT_ID}&select=x_handles")
    if r.status_code == 200 and r.json():
        for h in (r.json()[0].get("x_handles") or []):
            if (n := normalize_handle(h)):
                handles.add(n)
    r = rest("GET", f"padron?project_id=eq.{PROJECT_ID}&x_handle=not.is.null&select=x_handle&limit=2000")
    if r.status_code == 200:
        for row in r.json():
            if (n := normalize_handle(row.get("x_handle") or "")):
                handles.add(n)
    return sorted(handles)


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


async def ensure_account(api: API) -> None:
    auth_token = ENV.get("X_AUTH_TOKEN", "")
    ct0 = ENV.get("X_CT0", "")
    if not (auth_token and ct0):
        sys.exit("Faltan X_AUTH_TOKEN y X_CT0 (cookies del navegador). Ver README.")
    cookies = f"auth_token={auth_token}; ct0={ct0}"
    try:
        await api.pool.add_account(
            ENV["X_USERNAME"], ENV.get("X_PASSWORD", "x"),
            ENV.get("X_EMAIL", ""), ENV.get("X_EMAIL_PASSWORD", ""),
            cookies=cookies,
        )
        print("cuenta agregada al pool")
    except Exception as e:
        print(f"cuenta ya existente o re-set ({e})")
    await api.pool.login_all()  # con cookies marca la cuenta activa


async def main() -> None:
    api = API()  # accounts.db en el cwd
    await ensure_account(api)

    handles = load_handles()
    print(f"{len(handles)} handles a procesar (delay {DELAY_SECONDS}s, {TWEETS_PER_HANDLE}/handle)")

    ok = 0
    for i, handle in enumerate(handles, 1):
        try:
            user = await api.user_by_login(handle)
            if not user:
                print(f"[{i}/{len(handles)}] @{handle}: no existe", file=sys.stderr)
            else:
                tweets = await gather(api.user_tweets(user.id, limit=TWEETS_PER_HANDLE))
                rows = [
                    {
                        "project_id": PROJECT_ID,
                        "connector_id": "x-api",
                        "source": "x-api",
                        "text": t.rawContent,
                        "url": t.url,
                        "published_at": t.date.isoformat() if t.date else None,
                        "author": handle,
                    }
                    for t in tweets
                ]
                upsert_items(rows)
                ok += 1
                print(f"[{i}/{len(handles)}] @{handle}: {len(rows)} tweets")
        except Exception as e:
            print(f"[{i}/{len(handles)}] @{handle}: skip ({type(e).__name__}: {e})", file=sys.stderr)
        await asyncio.sleep(DELAY_SECONDS)

    print(f"listo: {ok}/{len(handles)} handles con datos")


if __name__ == "__main__":
    asyncio.run(main())
