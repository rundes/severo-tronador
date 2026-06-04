-- Fase 1c: enforce de project_id — DEFAULT (proyecto default) + NOT NULL + FK
-- + índice en cada tabla scopeada.
--
-- IMPORTANTE (ordenamiento seguro): se mantiene un DEFAULT al proyecto default
-- para que los writes de la app ACTUAL (que todavía no envía project_id) sigan
-- funcionando — la app queda verde entre esta PR y las de Fase 3. NO se tocan
-- PKs ni constraints UNIQUE existentes (padron.dni, opt_outs/telegram_chats PK,
-- listening_config.id=1, cuotas.connector_id) ni el RPC increment_quota: esos
-- reshapes ocurren en las PRs de Fase 3, junto con el código que pasa a mandar
-- project_id explícito. Un migration posterior dropea los DEFAULT cuando el
-- código ya thread-ea project_id en todos lados.
--
-- Idempotente.

do $$
declare
  t text;
  default_project constant uuid := '00000000-0000-0000-0000-000000000001';
  -- Todas las tablas que recibieron project_id en 0018, más listening_config
  -- y cuotas (que también lo tienen ya, con su PK actual intacta).
  scoped text[] := array[
    'padron', 'segmentos', 'templates', 'campanas', 'envios', 'respuestas',
    'opt_outs', 'llamadas', 'survey_tokens', 'listening_items', 'x_handle_queue',
    'flows', 'flow_steps', 'telegram_chats', 'sheets_sync_queue', 'audit_log',
    'envio_queue', 'listening_config', 'cuotas'
  ];
begin
  foreach t in array scoped loop
    -- DEFAULT al proyecto default (writes legacy sin project_id siguen OK).
    execute format(
      'alter table %I alter column project_id set default %L', t, default_project);
    -- Por las dudas quedó algún null (no debería tras 0018).
    execute format(
      'update %I set project_id = %L where project_id is null', t, default_project);
    -- NOT NULL.
    execute format('alter table %I alter column project_id set not null', t);
    -- FK → projects(id), guardado contra duplicado (add constraint no soporta
    -- if not exists).
    begin
      execute format(
        'alter table %I add constraint %I foreign key (project_id) references projects(id) on delete cascade',
        t, t || '_project_fk');
    exception
      when duplicate_object then null;
    end;
    -- Índice por project_id (todas las queries scopeadas filtran por él).
    execute format(
      'create index if not exists %I on %I (project_id)', t || '_project_idx', t);
  end loop;
end $$;
