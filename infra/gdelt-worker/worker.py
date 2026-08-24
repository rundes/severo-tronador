"""
Worker de GDELT (prensa online, DOC API 2.0) → listening_items.

Por qué vive en GitHub Actions y no en el cron de Vercel: GDELT limita a
1 request cada 5 s POR IP y devuelve 429 al primer intento desde la IP de
egreso compartida de Vercel (medido 2026-08-24, con throttle y retry). Un
runner de Actions tiene IP propia por corrida, como infra/fb-worker.

Por cada proyecto con "gdelt" en listening_config.fuentes (o sin fuentes =
todas): arma la misma query que lib/connectors/gdelt.ts (keywords OR,
frases entre comillas, sourcelang:spa para AR, sourcecountry), pide hasta
MAX_RECORDS artículos de las últimas 24 h y upserta (project_id, url).

Env:
  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
  MAX_RECORDS   (default 250)
  GAP_SECONDS   (pausa mínima entre requests, default 90)
"""
import json
import os
import sys
import time
from datetime import datetime, timezone
from urllib.parse import urlencode

import httpx

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
MAX_RECORDS = int(os.environ.get("MAX_RECORDS", "250"))
GAP_SECONDS = float(os.environ.get("GAP_SECONDS", "90"))

ENDPOINT = "https://api.gdeltproject.org/api/v2/doc/doc"
CONNECTOR_ID = "gdelt"
TIMEOUT_SECONDS = 60
# 429 → esperar y reintentar. El "1 request / 5 s" documentado es optimista:
# medido 2026-08-24 desde un runner de Actions, la 1.ª query (250 registros)
# respondió 200 y la 2.ª dio 429 durante 6+10+20+40 s seguidos. La ventana
# real tras una query pesada ronda el minuto, de ahí GAP_SECONDS=90 en el
# workflow y este backoff.
RETRY_BACKOFF_SECONDS = (60, 120)
UA = "severo-tronador gdelt-worker (+https://github.com/rundes/severo-tronador)"


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


# GDELT responde 429 ("contact us for larger queries") a una query OR muy
# larga aunque la cadencia sea correcta: Maipú con 40 términos fallaba
# siempre; Ibicuy con 7 respondía 200. Se parte en lotes de MAX_TERMS y se
# hace un request por lote (con GAP_SECONDS entre medio).
MAX_TERMS = 7


def _terms(keywords: list[str], zona: str | None) -> list[str]:
    seen, out = set(), []
    for k in keywords:
        t = (k or "").strip()
        if t and t.lower() not in seen:
            seen.add(t.lower())
            out.append(t)
    if not out and zona and zona.strip():
        out = [zona.strip()]
    return out


def _query_for(terms: list[str], pais: str | None) -> str:
    quoted = [f'"{t}"' if any(c.isspace() for c in t) else t for t in terms]
    joined = " OR ".join(quoted)
    q = f"({joined})" if len(quoted) > 1 else joined
    if (pais or "").lower() == "ar":
        q = f"{q} sourcelang:spa"
    return q


def build_queries(keywords: list[str], zona: str | None, pais: str | None) -> list[str]:
    """Queries GDELT (mismo formato que lib/connectors/gdelt.ts) en lotes de
    MAX_TERMS términos, sin duplicados. [] si no hay términos."""
    terms = _terms(keywords, zona)
    return [_query_for(terms[i : i + MAX_TERMS], pais) for i in range(0, len(terms), MAX_TERMS)]


def build_query(keywords: list[str], zona: str | None, pais: str | None) -> str | None:
    """Una sola query con todos los términos (formato de gdelt.ts). None si no hay."""
    terms = _terms(keywords, zona)
    return _query_for(terms, pais) if terms else None


def build_url(query: str, pais: str | None) -> str:
    params = {
        "query": query,
        "format": "json",
        "maxrecords": str(MAX_RECORDS),
        "timespan": "24h",
    }
    if pais:
        params["sourcecountry"] = pais.lower()
    return f"{ENDPOINT}?{urlencode(params)}"


def parse_seendate(s: str | None) -> str | None:
    """'20260824T120000Z' → ISO 8601 UTC. None si no parsea."""
    if not s:
        return None
    try:
        return datetime.strptime(s, "%Y%m%dT%H%M%SZ").replace(tzinfo=timezone.utc).isoformat()
    except ValueError:
        return None


def to_rows(project_id: str, articles: list[dict]) -> list[dict]:
    rows, seen = [], set()
    for a in articles:
        url = (a.get("url") or "").strip()
        title = (a.get("title") or "").strip()
        if not url or not title or url in seen:
            continue
        seen.add(url)
        rows.append(
            {
                "project_id": project_id,
                "connector_id": CONNECTOR_ID,
                "source": a.get("domain") or "gdelt",
                "text": title[:400],
                "url": url,
                "published_at": parse_seendate(a.get("seendate")),
                "author": a.get("domain"),
                "kind": "post",
            }
        )
    return rows


def fetch_articles(client: httpx.Client, url: str) -> list[dict]:
    """GET con retry en 429. Lanza RuntimeError si agota los intentos o la
    respuesta no es JSON (GDELT devuelve HTML con 200 ante query inválida)."""
    attempts = len(RETRY_BACKOFF_SECONDS) + 1
    for i in range(attempts):
        r = client.get(url, timeout=TIMEOUT_SECONDS)
        if r.status_code == 429:
            if i == attempts - 1:
                break
            wait = RETRY_BACKOFF_SECONDS[i]
            print(f"  429 · reintento en {wait}s", file=sys.stderr)
            time.sleep(wait)
            continue
        if r.status_code != 200:
            raise RuntimeError(f"GDELT HTTP {r.status_code}")
        if "json" not in r.headers.get("content-type", ""):
            raise RuntimeError(f"GDELT respuesta no-JSON: {r.text[:160]!r}")
        return r.json().get("articles") or []
    raise RuntimeError("GDELT HTTP 429 (agotados los reintentos)")


def load_projects() -> list[dict]:
    r = rest("GET", "listening_config?select=project_id,keywords,fuentes,geo")
    r.raise_for_status()
    out = []
    for row in r.json():
        fuentes = row.get("fuentes") or []
        if fuentes and CONNECTOR_ID not in fuentes:
            continue
        geo = row.get("geo") or {}
        out.append(
            {
                "project_id": row["project_id"],
                "keywords": row.get("keywords") or [],
                "zona": geo.get("zona"),
                "pais": geo.get("pais"),
            }
        )
    return out


def upsert_items(rows: list[dict]) -> int:
    if not rows:
        return 0
    r = rest(
        "POST",
        "listening_items?on_conflict=project_id,url",
        headers={"prefer": "resolution=merge-duplicates,return=minimal"},
        content=json.dumps(rows),
    )
    if r.status_code >= 300:
        raise RuntimeError(f"upsert {r.status_code}: {r.text[:200]}")
    return len(rows)


def main() -> None:
    if not SUPABASE_URL or not SERVICE_KEY:
        sys.exit("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY requeridos")
    projects = load_projects()
    print(f"{len(projects)} proyectos con gdelt")
    failures = 0
    requests_made = 0
    with httpx.Client(headers={"user-agent": UA}) as client:
        for i, p in enumerate(projects):
            tag = f"[{i + 1}/{len(projects)}] {p['project_id'][-4:]}"
            queries = build_queries(p["keywords"], p["zona"], p["pais"])
            if not queries:
                print(f"{tag}: sin keywords ni zona, skip")
                continue
            articles: list[dict] = []
            errors: list[str] = []
            for query in queries:
                if requests_made:
                    time.sleep(GAP_SECONDS)
                requests_made += 1
                try:
                    articles.extend(fetch_articles(client, build_url(query, p["pais"])))
                except Exception as e:  # noqa: BLE001 — un lote no frena a los demás
                    errors.append(str(e))
            try:
                n = upsert_items(to_rows(p["project_id"], articles))
            except Exception as e:  # noqa: BLE001
                errors.append(str(e))
                n = 0
            print(f"{tag}: {len(queries)} lotes · {len(articles)} artículos → {n} upsert")
            for err in errors:
                print(f"{tag}: ERROR {err}", file=sys.stderr)
            if errors and not articles:
                failures += 1
    if failures and failures == len(projects):
        sys.exit("todas las fuentes fallaron")


if __name__ == "__main__":
    main()
