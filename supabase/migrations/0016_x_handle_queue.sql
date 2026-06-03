-- Cola de timelines de X por handle del padrón (escucha activa).
--
-- Al importar contactos, cada x_handle se encola acá en estado 'pending'.
-- El cron /api/cron/x-timeline drena la cola respetando el free tier
-- (1.500 tweets/mes compartido con la búsqueda): por cada handle trae los
-- últimos 5 posteos vía /2/users/:id/tweets y los upserta en
-- listening_items. author_id/username se cachean tras el primer lookup
-- para no re-resolver el handle en corridas futuras.
create table if not exists x_handle_queue (
  handle text primary key,
  author_id text,
  username text,
  status text not null default 'pending',   -- pending | done | error
  attempts int not null default 0,
  posts_fetched int not null default 0,
  enqueued_at timestamptz not null default now(),
  last_fetched_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now()
);

-- Índice parcial sobre la cola activa: el processor selecciona pending
-- ordenado por enqueued_at (FIFO) y limitado por la capacidad de cuota.
create index if not exists x_handle_queue_pending_idx
  on x_handle_queue (enqueued_at) where status = 'pending';

-- RLS deny-all (el service-role la bypasea); coherente con el resto del esquema.
alter table x_handle_queue enable row level security;
