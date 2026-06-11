-- Ingesta de radio en escucha: programas a grabar/transcribir por proyecto.
-- Array de { url, station, programa, days[], start "HH:MM", end "HH:MM" }.
alter table listening_config
  add column if not exists radio_streams jsonb not null default '[]'::jsonb;
