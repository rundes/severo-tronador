-- Drip flows: secuencias multi-step de envíos a un mismo segmento con
-- delays y condiciones sobre respuestas de pasos anteriores
-- (Plan 02 F3).
create table if not exists flows (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  segment_filter jsonb not null default '{}',
  estado text not null default 'draft',
  metrics jsonb not null default '{}',
  created_by text,
  created_at timestamptz default now(),
  started_at timestamptz
);

create table if not exists flow_steps (
  id uuid primary key default gen_random_uuid(),
  flow_id uuid not null references flows(id) on delete cascade,
  position int not null,
  delay_days int not null default 0,
  channel text not null,
  template_id text not null,
  condition_kind text not null default 'always',
  unique (flow_id, position)
);

alter table flows enable row level security;
alter table flow_steps enable row level security;

alter table envio_queue add column if not exists flow_id uuid references flows(id) on delete set null;
alter table envio_queue add column if not exists flow_step_position int;
alter table envio_queue add column if not exists condition_kind text;

create index if not exists idx_flow_steps_flow on flow_steps(flow_id, position);
create index if not exists idx_envio_queue_flow on envio_queue(flow_id, flow_step_position) where flow_id is not null;
