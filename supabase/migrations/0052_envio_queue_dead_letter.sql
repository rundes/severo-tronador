-- 0052: dead-letter de la cola de envíos (F1.5 del plan de mejoras).
--
-- Las filas que agotaban los reintentos quedaban como 'failed', mezcladas para
-- siempre con los rechazos legítimos del proveedor y sin ninguna métrica: nadie
-- se enteraba de que una caída de Resend se había comido 200 envíos.
--
-- Ahora se distinguen:
--   'failed' → el proveedor rechazó el mensaje (email inválido, sin opt-in…).
--              No tiene sentido reintentarlo.
--   'dead'   → nos rendimos nosotros tras MAX_ATTEMPTS de fallos transitorios.
--              Es candidato a reintento manual una vez resuelto el problema.
--
-- El índice parcial hace baratos el conteo del backlog que el cron loguea en
-- cada tick y la futura pantalla de revisión.
create index if not exists idx_envio_queue_dead
  on envio_queue (created_at desc)
  where status = 'dead';

-- Reclasifica lo que ya está en la tabla: una fila 'failed' que llegó al tope
-- de intentos es, por definición, de las que se rindieron por reintentos.
-- MAX_ATTEMPTS es 3 en el cron.
update envio_queue
   set status = 'dead'
 where status = 'failed'
   and attempts >= 3;
