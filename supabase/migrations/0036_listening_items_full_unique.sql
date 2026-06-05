-- Fix upsert de listening_items: el índice único era PARCIAL
-- (project_id, url) WHERE url IS NOT NULL → PostgREST no lo matchea en
-- on_conflict=(project_id,url) (error 42P10), así que el upsert del cron de
-- listening (y del worker de X) fallaba silencioso y el cache quedaba vacío.
-- Índice full: NULLs distintos en Postgres (múltiples url NULL OK) y ahora
-- on_conflict infiere el índice.
drop index if exists listening_items_project_url_idx;
create unique index if not exists listening_items_project_url_idx
  on listening_items (project_id, url);
