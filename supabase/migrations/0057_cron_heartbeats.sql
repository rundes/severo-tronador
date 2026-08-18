-- 0057: latidos de los crons (F4.1 del plan de mejoras).
--
-- Los workflows críticos fallaban en silencio. No hay señal en "algo que deja
-- de pasar": si el endpoint devolvía 500, si rotaba el secret, o si GitHub
-- deshabilitaba el `schedule` tras 60 días sin actividad en el repo, la cola se
-- paraba y nadie se enteraba.
--
-- Cada cron deja su marca al terminar bien; un chequeo diario compara contra el
-- intervalo esperado. La ausencia de latido ES la alerta.
create table if not exists cron_heartbeats (
  job          text primary key,
  last_seen_at timestamptz not null default now(),
  details      jsonb not null default '{}'::jsonb
);

-- Sin project_id a propósito: es telemetría de la infraestructura, no dato de
-- ningún tenant. RLS deny-all igual que el resto; el acceso es por service-role.
alter table cron_heartbeats enable row level security;
