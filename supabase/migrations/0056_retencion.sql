-- 0056: retención de datos (F3.4 del plan de mejoras).
--
-- El esquema no tenía NINGÚN pruning: `listening_items` crece con cada corrida
-- de escucha, `sheets_sync_queue` guarda para siempre lo que ya espejó,
-- `email_events` acumula cada apertura y cada click, y `envio_queue` conserva
-- las filas despachadas con el HTML renderizado adentro. Todo eso sólo sube.
--
-- El pruning corre por pg_cron cuando está disponible; si no lo está (proyectos
-- Supabase sin la extensión), queda la función para llamarla desde un cron
-- externo — el endpoint /api/cron/retencion.

create or replace function public.prune_retencion()
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  n_listening bigint := 0;
  n_mirror    bigint := 0;
  n_events    bigint := 0;
  n_queue     bigint := 0;
begin
  -- Escucha: el feed muestra ventanas cortas y los agregados se recalculan.
  -- Más de 90 días atrás nadie lo lee.
  delete from listening_items where published_at < now() - interval '90 days';
  get diagnostics n_listening = row_count;

  -- Cola del espejo: una fila ya drenada (o descartada) no se vuelve a mirar.
  -- Se conservan las pendientes y las que quedaron en error, sin importar edad.
  delete from sheets_sync_queue
   where status in ('done', 'unsupported')
     and created_at < now() - interval '30 days';
  get diagnostics n_mirror = row_count;

  if to_regclass('public.email_events') is not null then
    delete from email_events where created_at < now() - interval '180 days';
    get diagnostics n_events = row_count;
  end if;

  -- Cola de envíos: las filas terminadas guardan el cuerpo renderizado por
  -- destinatario (decenas de KB cada una). El registro del envío vive en
  -- `envios`, que no se toca; esto es sólo la cola de trabajo.
  delete from envio_queue
   where status in ('done', 'failed')
     and processed_at < now() - interval '30 days';
  get diagnostics n_queue = row_count;

  return jsonb_build_object(
    'listening_items',   n_listening,
    'sheets_sync_queue', n_mirror,
    'email_events',      n_events,
    'envio_queue',       n_queue
  );
end;
$$;

-- Agenda diaria si pg_cron está instalado. Idempotente: reprograma el job si ya
-- existe en vez de duplicarlo.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('prune_retencion')
      where exists (select 1 from cron.job where jobname = 'prune_retencion');
    perform cron.schedule('prune_retencion', '17 4 * * *', 'select public.prune_retencion()');
  end if;
exception
  when insufficient_privilege then
    raise notice 'pg_cron presente pero sin permisos para agendar; usar el cron externo';
end $$;

-- El pruning de `envio_queue` filtra por processed_at.
create index if not exists idx_envio_queue_processed
  on envio_queue (processed_at)
  where processed_at is not null;
