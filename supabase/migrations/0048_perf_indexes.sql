-- 0048: índices de rendimiento para las lecturas más calientes (auditoría).
-- Todo aditivo e idempotente (CREATE INDEX IF NOT EXISTS).

-- listening_items: runListening filtra project_id + published_at >= since y
-- ordena published_at desc en CADA carga de /escucha (y en analytics). Hoy sólo
-- hay índices de columna única (published_at, connector_id, project_id); el
-- planner no podía cubrir filtro+orden con uno solo.
create index if not exists listening_items_project_published_idx
  on listening_items (project_id, published_at desc);

-- envios: reconcile (estado + created_at) y analytics filtran por proyecto y
-- ventana temporal; estado se usa en head-counts por campaña.
create index if not exists idx_envios_project_created
  on envios (project_id, created_at desc);
create index if not exists idx_envios_estado on envios (estado);

-- respuestas / survey_tokens: lookups por campaña (listEncuestaResponsesForCampaign,
-- atribución de tokens).
create index if not exists idx_respuestas_campaign on respuestas (campaign_id);
create index if not exists idx_survey_tokens_campaign on survey_tokens (campaign_id);

-- envio_queue: el drain del cron send-queue toma lo pending por connector. El
-- parcial actual (status, scheduled_at) where status='pending' no incluye
-- connector_id, así que el filtro por connector escanea todo lo pending.
create index if not exists idx_envio_queue_pending_connector
  on envio_queue (connector_id, scheduled_at) where status = 'pending';
