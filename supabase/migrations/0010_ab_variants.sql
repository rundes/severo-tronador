-- A/B testing: cada campaña puede tener N variantes con peso. Cada
-- envío deja constancia de qué variante recibió el destinatario.
alter table campanas add column if not exists variants jsonb not null default '[]';
alter table envios add column if not exists variant_id text;
alter table envio_queue add column if not exists variant_id text;
create index if not exists idx_envios_variant on envios(campaign_id, variant_id);
