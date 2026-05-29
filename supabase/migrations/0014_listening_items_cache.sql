-- Cache materializada de items de listening (Plan 05 F5).
-- runListening() prefiere leer de acá si la tabla tiene filas en la
-- ventana. Cron horario (/api/cron/listening-pull) pagina cada source
-- en 24h y hace upsert por url.
alter table listening_items
  add column if not exists author text,
  add column if not exists kind text,
  add column if not exists parent_url text,
  add column if not exists lat double precision,
  add column if not exists lng double precision,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

-- Idempotency: dedupe por url cuando viene seteada. Items sin url
-- (raros) caen en gen_random_uuid() del id como discriminador.
create unique index if not exists listening_items_url_idx
  on listening_items (url) where url is not null;

create index if not exists listening_items_published_at_idx
  on listening_items (published_at desc);

create index if not exists listening_items_source_idx
  on listening_items (source);

-- Connector que produjo el item. item.source puede ser distinto del id
-- del connector (Meta CL emite 'meta-ig'/'meta-fb' aunque su id sea
-- 'meta-content-library'). Necesario para filtrar por fuente habilitada
-- al leer la cache.
alter table listening_items
  add column if not exists connector_id text;

create index if not exists listening_items_connector_id_idx
  on listening_items (connector_id);
