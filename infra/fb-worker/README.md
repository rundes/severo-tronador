# fb-worker

Trae posts de **páginas y grupos públicos de Facebook** a `listening_items`
(feed de /escucha). Complemento del conector RSS para comunidades chicas donde
la conversación pasa por 2-3 páginas/grupos de FB y no por sitios de noticias.

## Cómo se configuran las fuentes

En `/escucha → Config → Feeds RSS` se pegan URLs de Facebook junto con los
feeds normales; la app las saltea en el conector RSS y este worker las toma:

```
https://www.facebook.com/MunicipalidadDeIbicuy
https://www.facebook.com/groups/vecinosdeibicuy
```

Solo páginas públicas y grupos públicos. Grupos privados no salen ni con
cookies de un miembro (y no deberían: expectativa de privacidad).

## Correr

```bash
pip install -r requirements.txt
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... python worker.py
```

Opcional `FB_COOKIES` (contenido de un cookies.txt exportado de una sesión de
navegador con una cuenta **quemable**): el modo anónimo funciona a veces;
con cookies llega más lejos.

En GitHub Actions corre 2×/día vía `.github/workflows/fb-worker.yml` con los
mismos secrets de Supabase que x-worker (+ `FB_WORKER_COOKIES` opcional).

## Riesgos

- Scraping viola los ToS de Facebook → cuenta quemable, nunca personal.
- IPs de datacenter (Actions) pueden ser bloqueadas más agresivamente que una
  IP residencial. Si falla en Actions, correr local sigue funcionando.
- `facebook-scraper` se rompe cada tanto cuando FB cambia el HTML; si deja de
  traer posts, revisar issues del paquete antes de debuggear acá.
