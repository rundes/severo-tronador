-- Fase 1b: agrega project_id NULLABLE a cada tabla scopeada y backfillea todo
-- al proyecto default. Separado del enforce (0019) para que el paso de datos
-- sea reversible y re-corrible. Idempotente.

do $$
declare
  t text;
  default_project constant uuid := '00000000-0000-0000-0000-000000000001';
  scoped text[] := array[
    'padron', 'segmentos', 'templates', 'campanas', 'envios', 'respuestas',
    'opt_outs', 'llamadas', 'survey_tokens', 'listening_items', 'x_handle_queue',
    'flows', 'flow_steps', 'telegram_chats', 'sheets_sync_queue', 'audit_log',
    'envio_queue'
  ];
begin
  foreach t in array scoped loop
    execute format('alter table %I add column if not exists project_id uuid', t);
    execute format('update %I set project_id = %L where project_id is null', t, default_project);
  end loop;
end $$;

-- listening_config: hoy es singleton (id=1). Agregamos project_id y migramos
-- esa fila al proyecto default (el reshape de PK ocurre en 0019).
alter table listening_config add column if not exists project_id uuid;
update listening_config
  set project_id = '00000000-0000-0000-0000-000000000001'
  where project_id is null;

-- cuotas: hoy PK = connector_id (global). Agregamos project_id y backfilleamos
-- (el reshape a PK compuesta ocurre en 0019).
alter table cuotas add column if not exists project_id uuid;
update cuotas
  set project_id = '00000000-0000-0000-0000-000000000001'
  where project_id is null;
