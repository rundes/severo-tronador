-- Registro de cada grabación de programa de radio: alimenta el dedup (no
-- re-grabar) y la agenda visual (grabado / perdido / en curso). Además guarda
-- la URL del audio en GCS para reproducirlo.
create table if not exists radio_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  station text not null,
  programa text not null,
  scheduled_date date not null,            -- fecha del programa (dedup por día)
  scheduled_start timestamptz,             -- inicio programado (para la agenda)
  started_at timestamptz not null default now(),
  status text not null default 'recording', -- recording | done | failed
  audio_object text,                       -- objeto en gs://maipu-pba/radios/...
  duration_sec integer,
  mentions integer not null default 0,
  created_at timestamptz not null default now(),
  unique (project_id, station, programa, scheduled_date)
);
create index if not exists radio_runs_project_idx on radio_runs (project_id, scheduled_start desc);
alter table radio_runs enable row level security;

-- meta jsonb en listening_items: para items de radio guarda { audioObject,
-- start, end, programa } y habilita reproducir la mención con ±10s.
alter table listening_items add column if not exists meta jsonb;
