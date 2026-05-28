-- Atomicidad de cuota: UPSERT con incremento atómico vía RETURNING.
-- Reemplaza el read-then-write de lib/quota.ts que carrera bajo envíos
-- concurrentes (#10 STABILIZATION).
create or replace function increment_quota(p_connector_id text, p_n int default 1)
returns int
language sql
as $$
  insert into cuotas (connector_id, used, resets_at, updated_at)
  values (
    p_connector_id,
    p_n,
    date_trunc('month', now()) + interval '1 month',
    now()
  )
  on conflict (connector_id) do update
  set used = cuotas.used + excluded.used,
      resets_at = coalesce(cuotas.resets_at, excluded.resets_at),
      updated_at = now()
  returning used;
$$;
