-- Espejadas a Sheets
create table if not exists padron (
  id uuid primary key default gen_random_uuid(),
  dni text unique not null,
  nombre text, apellido text, fecha_nac text, sexo text, domicilio text,
  barrio text, circuito text, mesa text, telefono text, email text,
  source text, imported_at timestamptz default now()
);
create table if not exists segmentos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null, filtros jsonb not null default '{}',
  created_by text, created_at timestamptz default now()
);
create table if not exists templates (
  id text primary key, channel text not null, nombre text not null,
  asunto text, cuerpo text not null, estado text not null default 'activo',
  created_at timestamptz default now()
);
create table if not exists campanas (
  id text primary key, nombre text not null, channel text not null,
  template_id text, segment_filter jsonb, preguntas jsonb,
  estado text, metrics jsonb, created_at timestamptz default now()
);
create table if not exists envios (
  id uuid primary key default gen_random_uuid(),
  campaign_id text not null, dni text, nombre text, destino text,
  estado text, reason text, provider_message_id text, delivery text,
  token text, created_at timestamptz default now()
);
create table if not exists respuestas (
  id uuid primary key default gen_random_uuid(),
  token text not null, campaign_id text, dni text,
  answers jsonb not null default '[]', created_at timestamptz default now()
);
create table if not exists opt_outs (
  dni text primary key, at timestamptz default now(), reason text
);
create table if not exists llamadas (
  id uuid primary key default gen_random_uuid(),
  dni text not null, at timestamptz default now(), outcome text, notes text
);
-- Solo Supabase
create table if not exists conector_config (
  connector_id text primary key, config jsonb, enabled boolean default false,
  updated_at timestamptz default now()
);
create table if not exists cuotas (
  connector_id text primary key, used int not null default 0,
  period text, resets_at timestamptz, updated_at timestamptz default now()
);
create table if not exists listening_config (
  id int primary key default 1, geo jsonb, keywords text[], fuentes text[],
  radio int, updated_at timestamptz default now()
);
create table if not exists survey_tokens (
  token text primary key, campaign_id text not null, dni text not null,
  created_at timestamptz default now()
);
create table if not exists listening_items (
  id uuid primary key default gen_random_uuid(),
  source text, text text, url text, published_at timestamptz, topic text
);
create table if not exists sheets_sync_queue (
  id uuid primary key default gen_random_uuid(),
  entity text not null, op text not null, payload jsonb not null,
  status text not null default 'pending', attempts int default 0,
  last_error text, created_at timestamptz default now()
);
create index if not exists idx_padron_dni on padron(dni);
create index if not exists idx_envios_token on envios(token);
create index if not exists idx_sync_status on sheets_sync_queue(status);
