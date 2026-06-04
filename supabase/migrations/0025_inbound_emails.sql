-- Bandeja de entrada in-app sin Stalwart (modo Cloudflare+Resend).
-- El webhook /api/webhooks/mail-in (Cloudflare Email Worker) persiste cada
-- mail entrante acá; /mail lo lee como bandeja. Scopeado por proyecto
-- (replies de campaña → proyecto del envío; resto → proyecto default).
create table if not exists inbound_emails (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null default '00000000-0000-0000-0000-000000000001'
    references projects(id) on delete cascade,
  message_id text,
  from_email text not null,
  from_name text,
  to_email text,
  subject text,
  preview text,
  body_text text,
  body_html text,
  received_at timestamptz not null default now(),
  read_at timestamptz
);

-- Dedupe por message_id cuando viene (reintentos del Worker).
create unique index if not exists inbound_emails_message_id_uk
  on inbound_emails (message_id) where message_id is not null;
create index if not exists inbound_emails_project_idx
  on inbound_emails (project_id, received_at desc);

alter table inbound_emails enable row level security;
