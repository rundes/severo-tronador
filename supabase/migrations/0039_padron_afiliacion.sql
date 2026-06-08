-- Afiliación política del contacto (texto libre). Dato sensible, solo para
-- segmentación interna. Idempotente.
alter table padron add column if not exists afiliacion text;

-- Índice parcial para filtrar por afiliación sin pesar cuando es null.
create index if not exists padron_afiliacion_idx
  on padron (project_id, afiliacion)
  where afiliacion is not null;
