-- Feeds RSS/Atom de medios locales, editables por el usuario en /escucha.
-- El conector rss-medios los lee como fuente de escucha gratuita (sin API key).
alter table listening_config
  add column if not exists rss_feeds jsonb not null default '[]'::jsonb;
