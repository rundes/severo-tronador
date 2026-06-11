create table if not exists escucha_marcas (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  item_key text not null,
  kind text not null,                 -- 'feed' | 'topic'
  payload jsonb not null,             -- snapshot: text, source, author, url, sentiment, etc.
  created_at timestamptz not null default now(),
  unique (project_id, item_key)
);
create index if not exists escucha_marcas_project_idx on escucha_marcas (project_id, created_at desc);
