-- Tracking de email por destinatario (Plan 03/04): aperturas + clicks.
-- Cada envío lleva un token único (survey_tokens). El pixel /api/track/o/<token>
-- registra 'open'; el redirect /api/track/c/<token>?u=… registra 'click'.
-- Scopeado por proyecto (multi-tenant). Idempotente.
create table if not exists email_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null default '00000000-0000-0000-0000-000000000001'
    references projects(id) on delete cascade,
  token text not null,
  campaign_id text,
  dni text,
  kind text not null check (kind in ('open', 'click')),
  url text,
  user_agent text,
  at timestamptz not null default now()
);

create index if not exists email_events_project_idx on email_events (project_id);
create index if not exists email_events_token_idx on email_events (token);
create index if not exists email_events_campaign_idx on email_events (campaign_id);

alter table email_events enable row level security;
