-- Grupos de contactos: colecciones con nombre dentro de un proyecto. Cada
-- contacto del padrón puede pertenecer a un grupo (grupo_id). Útil para cargar
-- listas a mano y segmentar/operar sobre ese conjunto.
create table if not exists grupos (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null default '00000000-0000-0000-0000-000000000001'
    references projects(id) on delete cascade,
  nombre text not null,
  created_at timestamptz not null default now()
);
create index if not exists grupos_project_idx on grupos (project_id, created_at desc);
alter table grupos enable row level security;

alter table padron
  add column if not exists grupo_id uuid references grupos(id) on delete set null;
create index if not exists padron_grupo_idx on padron (project_id, grupo_id);
