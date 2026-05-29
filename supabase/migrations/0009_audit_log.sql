-- Audit log: registro inmutable de acciones del usuario en el panel
-- (Plan 02 F6). Persiste actor (email) + acción + entidad afectada +
-- detalles arbitrarios.
create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  actor text,
  action text not null,
  entity_type text,
  entity_id text,
  details jsonb not null default '{}'
);

alter table audit_log enable row level security;

create index if not exists idx_audit_at on audit_log(at desc);
create index if not exists idx_audit_actor on audit_log(actor);
create index if not exists idx_audit_action on audit_log(action);
