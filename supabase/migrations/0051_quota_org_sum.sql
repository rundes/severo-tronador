-- 0051: uso org-wide de un conector sumado en SQL (F1.4 del plan de mejoras).
--
-- getOrgUsage traía TODAS las filas de `cuotas` del conector y las sumaba en
-- JS. PostgREST corta en 1000 filas sin avisar, así que con muchos proyectos el
-- guard org-wide del free tier veía un número más chico que el real y dejaba
-- pasar envíos por encima del límite compartido.
create or replace function public.sum_quota_used(p_connector_id text)
returns bigint
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(sum(used), 0)::bigint
    from cuotas
   where connector_id = p_connector_id;
$$;
