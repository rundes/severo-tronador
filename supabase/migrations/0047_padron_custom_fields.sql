-- Campos personalizados del padrón, por proyecto.
-- Los valores custom se guardan en padron.custom (jsonb), keyed por la `key`
-- de cada definición. Las definiciones (qué campos extra existen) viven en
-- padron_field_defs, una fila por (proyecto, campo).

alter table padron
  add column if not exists custom jsonb not null default '{}'::jsonb;

create table if not exists padron_field_defs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  key text not null,
  label text not null,
  type text not null default 'text' check (type in ('text', 'number', 'date', 'select')),
  options text[] null,
  position int not null default 0,
  created_at timestamptz not null default now(),
  unique (project_id, key)
);

create index if not exists padron_field_defs_project_idx
  on padron_field_defs (project_id, position);

-- Acceso solo vía service role (app single-tenant, como el resto del padrón).
-- RLS habilitada sin políticas: niega anon/authenticated; service role la saltea.
alter table padron_field_defs enable row level security;
