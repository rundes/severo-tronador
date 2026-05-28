-- Cola async de envíos. executeCampaign inserta acá; el cron
-- /api/cron/send-queue procesa en batches respetando rate-limit del provider.
create table if not exists envio_queue (
  id uuid primary key default gen_random_uuid(),
  campaign_id text not null,
  channel text not null,
  connector_id text not null,
  contact jsonb not null,
  template jsonb not null,
  token text not null,
  status text not null default 'pending',
  attempts int not null default 0,
  last_error text,
  provider_message_id text,
  scheduled_at timestamptz default now(),
  processed_at timestamptz,
  created_at timestamptz default now()
);
alter table public.envio_queue enable row level security;
create index if not exists idx_envio_queue_status_sched
  on envio_queue(status, scheduled_at) where status = 'pending';
create index if not exists idx_envio_queue_campaign on envio_queue(campaign_id);
