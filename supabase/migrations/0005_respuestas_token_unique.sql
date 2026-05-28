-- Dedupe atómico de respuestas: una respuesta por token (#11 STABILIZATION).
-- El check app-level (hasResponded → addResponse) puede correr en concurrencia.
-- Con UNIQUE en DB el segundo insert falla con código 23505 y addResponse lo
-- mapea a "ya respondida".
alter table public.respuestas
  add constraint respuestas_token_unique unique (token);
