# Worker twikit — timelines de X gratis (incluye cuentas chicas)

Trae los últimos tweets de cada handle (incluso cuentas de bajo alcance que la
sindicación gratis NO sirve) y los escribe en `listening_items` de Supabase. La
app **ya lee de ese cache** → no requiere cambios en el código.

> ⚠️ **ToS / riesgo.** twikit usa una cuenta de X logueada (scraping no oficial).
> Viola los Términos de X; la cuenta puede ser **suspendida**. Usá una cuenta
> **quemable**, no la institucional. Es lento a propósito para bajar el riesgo.
> No corre en Vercel (Python + sesión persistente): va en un host chico.

## Por qué un worker aparte
- twikit es **Python** y necesita **sesión logueada con cookies** persistentes.
- X **bloquea IPs de datacenter** en su API GraphQL → conviene IP residencial
  (tu PC) o aceptar el riesgo en un VPS. Vercel no sirve para esto.

## Setup
```bash
cd infra/twikit-worker
python -m venv .venv && . .venv/bin/activate   # (Windows: .venv\Scripts\activate)
pip install -r requirements.txt
cp .env.example .env        # completar SUPABASE_SERVICE_ROLE_KEY + cuenta X
python worker.py            # primer run: loguea y guarda cookies.json
```
El `SUPABASE_SERVICE_ROLE_KEY` está en Supabase → Project Settings → API.

Primera corrida: hace login con `X_USERNAME/X_EMAIL/X_PASSWORD` y guarda
`cookies.json`. Las siguientes reusan las cookies (no re-loguea). Si X pide
re-login (cookies vencidas), borrá `cookies.json` y volvé a correr.

## Qué handles procesa
1. `listening_config.x_handles` del proyecto (los que cargás en **/escucha**).
2. + `padron.x_handle` (los vecinos importados).
Dedupe + normaliza (@/URL → handle).

## Ritmo y rate-limit
- `DELAY_SECONDS=45` entre handles (subilo si te frenan).
- `TWEETS_PER_HANDLE=5` (poné `1` si solo querés el último tweet).
- Ante rate-limit duerme `RATELIMIT_SLEEP=900`s y el handle se reintenta en la
  próxima corrida. Con miles de handles tarda horas/días: es la naturaleza del
  scraping lento. Corré por cron seguido y va completando.

## Correr periódico (cron, en el host)
```cron
# cada 8 horas
0 */8 * * * cd /ruta/infra/twikit-worker && . .venv/bin/activate && python worker.py >> worker.log 2>&1
```
Fly.io / Railway: deploy como app con un scheduled job equivalente.

## Resultado
Inserta filas en `listening_items` con `source='x-api'`. En la app, **Escucha**
las muestra junto al resto (cache-first). Sin tocar nada más.
