-- Handles públicos de X a monitorear (intendente, medios, concejales…),
-- editables en /escucha, separados del padrón. La fuente X (sindicación gratis)
-- trae los timelines de estos handles. Si está vacío, cae a los handles del padrón.
alter table listening_config
  add column if not exists x_handles jsonb not null default '[]'::jsonb;
