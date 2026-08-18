-- 0058: constraints de estado, índice muerto y sobrecarga legacy (F6.5).

-- ── Índice muerto ───────────────────────────────────────────────────────────
-- `idx_padron_dni on padron(dni)` nació junto al `dni text unique`, que ya
-- creaba su propio índice único. Cuando 0021 pasó la unicidad a
-- (project_id, dni), el único quedó cubierto por padron_dni_project_uk y este
-- índice quedó sin ninguna consulta que lo use: toda lectura del padrón filtra
-- por proyecto. Un índice que nadie lee se paga igual en cada INSERT.
drop index if exists idx_padron_dni;

-- ── Sobrecarga legacy de increment_quota ────────────────────────────────────
-- La versión de 2 argumentos existía como compat para el código previo a
-- 0020, y escribía TODO bajo el proyecto default. Hoy el único caller
-- (lib/quota.ts) pasa los 3 argumentos, así que la sobrecarga sólo queda como
-- una forma silenciosa de contaminar el tenant default si alguien la llama.
drop function if exists public.increment_quota(text, integer);

-- ── CHECKs de estado ────────────────────────────────────────────────────────
-- Las tablas históricas guardan el estado como text libre: un typo en el código
-- ('sended' en vez de 'sent') entra sin protestar y desaparece de todos los
-- conteos, que filtran por el valor correcto. Los CHECK convierten eso en un
-- error en el INSERT.
--
-- Se agregan como NOT VALID: la constraint aplica a lo nuevo sin re-verificar
-- las filas existentes (que pueden traer valores viejos de antes de que el
-- vocabulario se estabilizara). Validarlas es un paso aparte, cuando se limpie
-- el histórico.
do $$
begin
  -- envios.estado — lo que ve el dashboard de campaña.
  if not exists (
    select 1 from pg_constraint where conname = 'envios_estado_check'
  ) then
    alter table envios add constraint envios_estado_check
      check (estado in ('sent', 'failed', 'skipped')) not valid;
  end if;

  -- envio_queue.status — el ciclo de vida de la cola, incluidos 'processing'
  -- (0050) y 'dead' (0052).
  if not exists (
    select 1 from pg_constraint where conname = 'envio_queue_status_check'
  ) then
    alter table envio_queue add constraint envio_queue_status_check
      check (status in ('pending', 'processing', 'done', 'failed', 'dead'))
      not valid;
  end if;

  -- sheets_sync_queue.status — 'unsupported' es el estado honesto de los
  -- removes que el espejo todavía no implementa.
  if not exists (
    select 1 from pg_constraint where conname = 'sheets_sync_queue_status_check'
  ) then
    alter table sheets_sync_queue add constraint sheets_sync_queue_status_check
      check (status in ('pending', 'done', 'error', 'unsupported')) not valid;
  end if;

  -- campanas.estado — el vocabulario es CampaignEstado en lib/campaigns.ts.
  if not exists (
    select 1 from pg_constraint where conname = 'campanas_estado_check'
  ) then
    alter table campanas add constraint campanas_estado_check
      check (estado in ('enviada', 'encolada', 'enviando', 'activa'))
      not valid;
  end if;
end $$;
