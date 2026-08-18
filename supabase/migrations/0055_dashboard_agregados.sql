-- 0055: agregados del dashboard en SQL (F3.2 del plan de mejoras).
--
-- loadDashboard traía las filas de `envios`, `respuestas`, `encuesta_respuestas`
-- y `opt_outs` de la ventana y contaba en JS. Sin `.limit()`, PostgREST corta en
-- 1000 filas SIN error: con más de 1000 envíos en la ventana las métricas
-- mentían y nadie se enteraba — el dashboard mostraba números plausibles pero
-- truncados.
--
-- Devuelve jsonb en vez de un set porque son tres agregaciones distintas
-- (por campaña, total de bajas, serie diaria) y así es un solo round-trip.
create or replace function public.dashboard_stats(
  p_project_id uuid,
  p_since      timestamptz
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
with respondidos as (
  -- Tokens con respuesta, de los dos modelos: `respuestas` (legacy) y
  -- `encuesta_respuestas` (módulo nuevo). Sólo los atribuibles a una campaña.
  select token from respuestas
   where project_id = p_project_id and created_at >= p_since and token is not null
  union
  select token from encuesta_respuestas
   where project_id = p_project_id and created_at >= p_since and token is not null
),
envios_ventana as (
  select e.campaign_id,
         e.estado,
         e.created_at,
         (e.token is not null and exists (
            select 1 from respondidos r where r.token = e.token
          )) as respondido
    from envios e
   where e.project_id = p_project_id
     and e.created_at >= p_since
),
por_campania as (
  select campaign_id,
         count(*) filter (where estado = 'sent')    as sent,
         count(*) filter (where estado = 'failed')  as failed,
         count(*) filter (where estado = 'skipped') as skipped,
         count(*) filter (where respondido)         as responses
    from envios_ventana
   group by campaign_id
),
por_dia as (
  select to_char(created_at, 'YYYY-MM-DD') as day,
         count(*)                          as envios,
         count(*) filter (where respondido) as responses
    from envios_ventana
   group by 1
   order by 1
)
select jsonb_build_object(
  'byCampaign', coalesce((select jsonb_agg(to_jsonb(c)) from por_campania c), '[]'::jsonb),
  'daily',      coalesce((select jsonb_agg(to_jsonb(d)) from por_dia d), '[]'::jsonb),
  'optOuts',    (select count(*) from opt_outs
                  where project_id = p_project_id and at >= p_since)
);
$$;

-- ── Índices que faltaban ────────────────────────────────────────────────────
-- Cada webhook de entrega busca el envío por el id del proveedor. Sin índice es
-- un seq scan de la tabla entera por webhook.
create index if not exists idx_envios_provider_message_id
  on envios (provider_message_id)
  where provider_message_id is not null;

-- Paginación del padrón: la tabla de /contactos ordena por apellido, nombre
-- dentro del proyecto.
create index if not exists idx_padron_project_apellido_nombre
  on padron (project_id, apellido, nombre);

-- Los joins por token de las agregaciones de arriba.
create index if not exists idx_respuestas_token on respuestas (token);
create index if not exists idx_encuesta_respuestas_token
  on encuesta_respuestas (token)
  where token is not null;
