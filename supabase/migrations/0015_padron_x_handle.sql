-- Handle X (Twitter) opcional por contacto del padrón.
-- Permite mapear contenido específico de cada ciudadano en /escucha vía
-- X API + relacionarlo con la persona durante el análisis.
alter table padron add column if not exists x_handle text;
create index if not exists padron_x_handle_idx on padron (x_handle)
  where x_handle is not null;
