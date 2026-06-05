"""
Worker twikit: trae los últimos tweets de cada handle (incluso cuentas chicas
que la sindicación gratis NO sirve) y los escribe en listening_items de Supabase.
La app ya lee de ese cache, así que NO requiere cambios en el código de la app.

Estrategia (lento pero funciona):
  - Login UNA vez con una cuenta quemable; cookies persistidas (cookies.json),
    se reusan en cada corrida (no re-loguea).
  - Recorre los handles de a uno, con DELAY entre cada uno (default 45s).
  - Ante rate-limit (429 / TooManyRequests) duerme largo y retoma.
  - Upsert por url a listening_items (source='x-api'), idempotente.

⚠️ Usar twikit/scraping con cuenta logueada viola los ToS de X y la cuenta
puede ser suspendida. Usá una cuenta quemable. Esto NO corre en Vercel: va en
un VPS chico / Fly / Railway / tu PC con cron.

Uso:
    pip install -r requirements.txt
    cp .env.example .env   # completar credenciales
    python worker.py
"""
import asyncio
import json
import os
import sys

import httpx
from twikit import Client
from twikit.errors import TooManyRequests

SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SERVICE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
PROJECT_ID = os.environ.get("PROJECT_ID", "00000000-0000-0000-0000-000000000001")
TWEETS_PER_HANDLE = int(os.environ.get("TWEETS_PER_HANDLE", "5"))
DELAY_SECONDS = float(os.environ.get("DELAY_SECONDS", "45"))
RATELIMIT_SLEEP = float(os.environ.get("RATELIMIT_SLEEP", "900"))  # 15 min
COOKIES_FILE = os.environ.get("COOKIES_FILE", "cookies.json")

X_USERNAME = os.environ.get("X_USERNAME", "")
X_EMAIL = os.environ.get("X_EMAIL", "")
X_PASSWORD = os.environ.get("X_PASSWORD", "")


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


def normalize_handle(raw: str) -> str:
    s = (raw or "").strip()
    for pre in ("https://twitter.com/", "http://twitter.com/", "https://x.com/", "http://x.com/"):
        if s.lower().startswith(pre):
            s = s[len(pre):]
            break
    s = s.split("/")[0].split("?")[0]
    return s.lstrip("@").strip().lower()


def load_handles() -> list[str]:
    """x_handles de listening_config + x_handle del padrón (dedupe)."""
    handles: set[str] = set()
    r = rest("GET", f"listening_config?project_id=eq.{PROJECT_ID}&select=x_handles")
    if r.status_code == 200 and r.json():
        for h in (r.json()[0].get("x_handles") or []):
            n = normalize_handle(h)
            if n:
                handles.add(n)
    r = rest(
        "GET",
        f"padron?project_id=eq.{PROJECT_ID}&x_handle=not.is.null&select=x_handle&limit=2000",
    )
    if r.status_code == 200:
        for row in r.json():
            n = normalize_handle(row.get("x_handle") or "")
            if n:
                handles.add(n)
    return sorted(handles)


def upsert_items(rows: list[dict]) -> None:
    if not rows:
        return
    r = rest(
        "POST",
        "listening_items?on_conflict=url",
        headers={"prefer": "resolution=merge-duplicates,return=minimal"},
        content=json.dumps(rows),
    )
    if r.status_code >= 300:
        print(f"  upsert error {r.status_code}: {r.text[:200]}", file=sys.stderr)


async def main() -> None:
    client = Client("en-US")
    if os.path.exists(COOKIES_FILE):
        client.load_cookies(COOKIES_FILE)
        print(f"cookies cargadas de {COOKIES_FILE}")
    else:
        if not (X_USERNAME and X_PASSWORD):
            sys.exit("Falta X_USERNAME/X_PASSWORD para el primer login.")
        await client.login(
            auth_info_1=X_USERNAME, auth_info_2=X_EMAIL, password=X_PASSWORD
        )
        client.save_cookies(COOKIES_FILE)
        print(f"login ok, cookies guardadas en {COOKIES_FILE}")

    handles = load_handles()
    print(f"{len(handles)} handles a procesar (delay {DELAY_SECONDS}s)")

    ok = 0
    for i, handle in enumerate(handles, 1):
        try:
            user = await client.get_user_by_screen_name(handle)
            tweets = await user.get_tweets("Tweets", count=TWEETS_PER_HANDLE)
            rows = []
            for t in tweets:
                rows.append(
                    {
                        "project_id": PROJECT_ID,
                        "connector_id": "x-api",
                        "source": "x-api",
                        "text": t.text,
                        "url": f"https://x.com/{handle}/status/{t.id}",
                        "published_at": str(t.created_at) if t.created_at else None,
                        "author": handle,
                    }
                )
            upsert_items(rows)
            ok += 1
            print(f"[{i}/{len(handles)}] @{handle}: {len(rows)} tweets")
        except TooManyRequests:
            print(f"[{i}/{len(handles)}] rate limit; durmiendo {RATELIMIT_SLEEP}s")
            await asyncio.sleep(RATELIMIT_SLEEP)
            continue  # reintenta el mismo handle en la próxima corrida
        except Exception as e:  # cuenta inexistente/privada/suspendida → seguir
            print(f"[{i}/{len(handles)}] @{handle}: skip ({e})", file=sys.stderr)
        await asyncio.sleep(DELAY_SECONDS)

    print(f"listo: {ok}/{len(handles)} handles con datos")


if __name__ == "__main__":
    asyncio.run(main())
