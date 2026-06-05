# Worker de timelines de X → Supabase (twscrape)

Trae los últimos tweets de cada handle (incluso **cuentas chicas** que la
sindicación gratis NO sirve) y los escribe en `listening_items` de Supabase. La
app **ya lee de ese cache** → no requiere cambios en el código.

Usa **twscrape** en modo **cookies** (auth_token + ct0 de una sesión logueada).
El login programático de X (usuario/pass) está roto por su anti-bot; las cookies
lo evitan. twikit quedó descartado ("Couldn't get KEY_BYTE indices").

> ⚠️ **ToS / riesgo.** Scraping con cuenta logueada viola los Términos de X; la
> cuenta puede ser **suspendida**. Usá una cuenta **quemable**. No corre en
> Vercel (Python + sesión persistente + IP residencial): va en tu PC / VPS.

## Setup
```powershell
cd infra\twikit-worker
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
Copy-Item .env.example .env   # completar valores
```

### Completar `.env`
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase → Settings → API → service_role.
- `X_USERNAME` / `X_EMAIL`: de la cuenta (metadata).
- `X_AUTH_TOKEN` + `X_CT0`: **cookies** de la sesión:
  1. Logueate en https://x.com en el navegador.
  2. F12 → **Application → Storage → Cookies → https://x.com**.
  3. Copiá los Value de `auth_token` y `ct0`.
- `TWEETS_PER_HANDLE=1` si solo querés el último tweet por cuenta.

## Correr
```powershell
.\.venv\Scripts\python.exe worker.py
```
- Agrega la cuenta al pool (`accounts.db`) la primera vez y la reusa.
- Procesa los handles de `listening_config.x_handles` (los que cargás en
  /escucha) + `padron.x_handle`, de a uno con `DELAY_SECONDS`.
- Upsert por url a `listening_items` (source `x-api`). Idempotente.
- **Lento**: 1000 handles × 45s ≈ 12 h. Corré por cron; va completando.

Si las cookies vencen (X pide re-login), repetí el paso de cookies y actualizá
`.env` (y borrá `accounts.db` si quedó la cuenta inactiva).

## Cron (Windows Task Scheduler)
Programá cada 8-12 h:
```
C:\...\infra\twikit-worker\.venv\Scripts\python.exe  C:\...\infra\twikit-worker\worker.py
```

## Resultado
Filas en `listening_items` con `source='x-api'` → aparecen en **Escucha**
(cache-first), sin tocar la app.

Archivos locales NO versionados (ver .gitignore): `.env`, `accounts.db`,
`cookies.json`, `.venv/`.
