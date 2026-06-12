-- Descartes de escucha: menciones que el usuario oculta del feed (señal de
-- "no relevante", reversible). Reversible = se puede restaurar borrando la fila.
-- Separada de escucha_marcas (relevantes → informe) porque comparten item_key
-- y son estados distintos; tabla propia evita colisión del unique.
create table if not exists escucha_descartes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  item_key text not null,
  payload jsonb not null,             -- snapshot: text, source, author, url, sentiment, publishedAt
  created_at timestamptz not null default now(),
  unique (project_id, item_key)
);
create index if not exists escucha_descartes_project_idx on escucha_descartes (project_id, created_at desc);

-- RLS habilitado como el resto del esquema: la app usa SERVICE_ROLE (bypass);
-- el anon key queda bloqueado. Sin policies (mismo patrón que las demás tablas).
alter table escucha_descartes enable row level security;
