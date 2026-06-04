-- Fase 3b: reshape de PKs/índices a por-proyecto para escucha + cuotas.
-- project_id ya existe + backfilleado + NOT NULL + DEFAULT (0018/0019).
-- Idempotente.

-- cuotas: PK compuesta (project_id, connector_id).
alter table cuotas drop constraint if exists cuotas_pkey;
alter table cuotas add primary key (project_id, connector_id);

-- listening_config: dejar de ser singleton id=1 → PK = project_id.
alter table listening_config drop constraint if exists listening_config_pkey;
alter table listening_config add primary key (project_id);
alter table listening_config drop column if exists id;

-- listening_items: dedupe de url ahora es por proyecto.
drop index if exists listening_items_url_idx;
create unique index if not exists listening_items_project_url_idx
  on listening_items (project_id, url) where url is not null;

-- x_handle_queue: PK compuesta (project_id, handle).
alter table x_handle_queue drop constraint if exists x_handle_queue_pkey;
alter table x_handle_queue add primary key (project_id, handle);

-- RPC v2: increment_quota con project_id. Atómico INSERT ... ON CONFLICT
-- (project_id, connector_id) DO UPDATE SET used = used + n RETURNING used.
create or replace function increment_quota(
  p_project_id uuid,
  p_connector_id text,
  p_n int default 1
) returns int language sql as $$
  insert into cuotas (project_id, connector_id, used, resets_at, updated_at)
  values (p_project_id, p_connector_id, p_n,
          date_trunc('month', now()) + interval '1 month', now())
  on conflict (project_id, connector_id) do update
    set used = cuotas.used + excluded.used,
        resets_at = coalesce(cuotas.resets_at, excluded.resets_at),
        updated_at = now()
  returning used;
$$;

-- Compat: el RPC 2-arg viejo (code previo al deploy) sigue funcionando pero
-- escribe bajo el proyecto default. Se dropea en un migration posterior cuando
-- todo el código use la firma de 3 args.
create or replace function increment_quota(
  p_connector_id text,
  p_n int default 1
) returns int language sql as $$
  select increment_quota(
    '00000000-0000-0000-0000-000000000001'::uuid, p_connector_id, p_n);
$$;
