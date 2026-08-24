# gdelt-worker

Ingesta de prensa online (GDELT DOC API 2.0) hacia `listening_items`, corrida
desde GitHub Actions (`.github/workflows/gdelt-worker.yml`, cada 6 h).

## Por qué no corre en el cron de Vercel

GDELT limita a **1 request cada 5 s por IP**. Desde la IP de egreso compartida
de Vercel devuelve `429` al primer intento aunque el conector serialice y
reintente (medido 2026-08-24). Un runner de Actions tiene IP propia por
corrida, igual que `infra/fb-worker`. Por eso `pullAllSources` salta `gdelt`
(ver `EXTERNALLY_INGESTED` en `lib/listening.ts`) y este worker lo reemplaza.

`gdelt` sigue siendo una fuente togglable por proyecto: el worker sólo procesa
los proyectos que la tienen en `listening_config.fuentes` (o sin fuentes).

## Correr local

```bash
pip install -r requirements.txt
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... python worker.py
python test_worker.py
```

Env opcionales: `MAX_RECORDS` (250), `GAP_SECONDS` (6).
