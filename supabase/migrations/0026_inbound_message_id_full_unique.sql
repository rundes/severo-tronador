-- Fix recepción: inbox-store usa upsert(onConflict:"message_id"), que genera
-- ON CONFLICT (message_id) SIN predicado. El índice único era PARCIAL
-- (WHERE message_id IS NOT NULL) → Postgres no lo matchea (error 42P10) →
-- storeInbound fallaba silencioso y los entrantes se perdían (0 filas).
--
-- Índice único FULL: Postgres trata los NULL como distintos (permite múltiples
-- message_id NULL igual que el parcial), pero ahora ON CONFLICT (message_id)
-- sí infiere el índice y el dedupe de reintentos del Worker funciona.
drop index if exists inbound_emails_message_id_uk;
create unique index if not exists inbound_emails_message_id_uk
  on inbound_emails (message_id);
