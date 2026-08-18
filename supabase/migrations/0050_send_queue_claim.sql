-- 0050: integridad del pipeline de envío (F1.2 del plan de mejoras).
--
-- Problema: el cron leía las filas `pending` y recién las actualizaba DESPUÉS
-- de llamar al proveedor. Dos ticks solapados (o un corte a mitad de corrida,
-- que con BATCH=50 × 500ms roza el maxDuration=60) tomaban las mismas filas y
-- las enviaban dos veces. Sin claim y sin clave de idempotencia, nada lo
-- frenaba ni lo dejaba en evidencia.
--
-- Tres piezas, todas aditivas e idempotentes:
--   1. `claimed_at` + estado 'processing' → una fila tomada por un tick no la
--      puede tomar otro.
--   2. `claim_envio_queue()` → toma el lote con FOR UPDATE SKIP LOCKED, así dos
--      ticks concurrentes se reparten filas distintas en vez de pelearse.
--   3. unique parcial (campaign_id, token) en `envios` → aunque algo se escape,
--      el registro del envío no se duplica.

-- ── 1. Marca de claim ────────────────────────────────────────────────────────
alter table envio_queue add column if not exists claimed_at timestamptz;

-- El drain barre por connector + scheduled_at sobre lo tomable. El parcial de
-- 0048 sólo cubre status='pending'; ahora también hay que poder encontrar los
-- 'processing' vencidos (proceso que murió a mitad de envío).
create index if not exists idx_envio_queue_claimable
  on envio_queue (connector_id, scheduled_at)
  where status in ('pending', 'processing');

-- ── 2. Claim atómico ─────────────────────────────────────────────────────────
-- Devuelve hasta p_limit filas YA marcadas como 'processing' con attempts
-- incrementado. El intento se cuenta al TOMAR, no al fallar: si el proceso
-- muere entre el claim y la respuesta del proveedor, el reintento posterior
-- arranca del intento correcto en vez de reintentar para siempre.
--
-- p_stale_minutes recupera filas que quedaron 'processing' porque la función
-- se cortó (Vercel mata a los 60s). Tiene que ser holgadamente mayor que
-- maxDuration para no recuperar una fila que todavía se está enviando.
create or replace function public.claim_envio_queue(
  p_connector_id  text,
  p_limit         int,
  p_stale_minutes int default 15
)
returns setof envio_queue
language plpgsql
security invoker
set search_path = public
as $$
begin
  return query
  update envio_queue q
     set status     = 'processing',
         attempts   = q.attempts + 1,
         claimed_at = now()
   where q.id in (
     select c.id
       from envio_queue c
      where c.connector_id = p_connector_id
        and c.scheduled_at <= now()
        and (
          c.status = 'pending'
          or (
            c.status = 'processing'
            and c.claimed_at < now() - make_interval(mins => p_stale_minutes)
          )
        )
      order by c.created_at
      limit p_limit
      for update skip locked
   )
  returning q.*;
end;
$$;

-- ── 3. Idempotencia del registro de envío ────────────────────────────────────
-- Antes del unique hay que resolver los duplicados que el bug ya dejó. Un par
-- (campaign_id, token) repetido en `envios` es, por construcción, el MISMO
-- envío registrado dos veces: el token se emite una vez por (campaña, dni).
-- Conservamos el registro más viejo — el del envío que efectivamente salió
-- primero — y borramos las copias posteriores.
delete from envios e
 using envios keep
 where e.token is not null
   and keep.token is not null
   and e.campaign_id = keep.campaign_id
   and e.token = keep.token
   and (keep.created_at, keep.id) < (e.created_at, e.id);

-- No es parcial a propósito: `ON CONFLICT (campaign_id, token) DO NOTHING`
-- necesita inferir el índice, y con un unique parcial habría que repetir su
-- WHERE en la cláusula — algo que PostgREST no puede expresar. Un unique común
-- se comporta igual acá: los `token` null (envíos que no distribuyen encuesta)
-- son todos distintos entre sí para el índice y nunca colisionan.
create unique index if not exists envios_campaign_token_uq
  on envios (campaign_id, token);
