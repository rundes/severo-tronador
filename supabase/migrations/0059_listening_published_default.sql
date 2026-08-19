-- 0059: default para listening_items.published_at.
--
-- El feed de /escucha lee la cache con `published_at >= since`: una fila con
-- published_at NULL no entra a NINGUNA ventana y queda invisible para
-- siempre. El fb-worker (y cualquier ingesta sin fecha de publicación
-- conocida) insertaba NULL — sus items existían en la tabla pero jamás se
-- veían. Con el default, la fecha de captura hace de fecha de publicación
-- cuando la real no se conoce; el worker OMITE la columna en el payload para
-- que el default aplique en el insert y el upsert posterior no la pise.
alter table listening_items alter column published_at set default now();

-- Backfill: lo ya ingestado sin fecha toma su created_at.
update listening_items set published_at = created_at where published_at is null;
