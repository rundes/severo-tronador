-- 0053: credenciales de conectores con scope por proyecto (F2.2 del plan).
--
-- `conector_config` tenía PK (connector_id) a secas: una sola fila por conector
-- para toda la organización. El owner de CUALQUIER proyecto podía pisar las API
-- keys de Resend, Meta o Anthropic de todos los demás desde /conectores.
--
-- Modelo nuevo, en dos niveles:
--   project_id IS NULL → fila de organización. Es el fallback compartido (la
--                        cuenta de Resend/Meta es una sola y es de la org) y
--                        desde el panel es de sólo lectura.
--   project_id = <id>  → override del proyecto. Es lo único que escribe el
--                        panel, así que un proyecto nunca toca al otro.
--
-- La resolución en lib/connectors/config.ts es env < org < proyecto.

alter table conector_config add column if not exists project_id uuid;

-- La PK vieja impide tener dos filas del mismo conector. Se reemplaza por un
-- unique compuesto. NULLS NOT DISTINCT (PG15+) hace que la fila de organización
-- (project_id null) siga siendo única por conector.
alter table conector_config drop constraint if exists conector_config_pkey;
create unique index if not exists conector_config_connector_project_uq
  on conector_config (connector_id, project_id) nulls not distinct;

-- Lectura del override en cada resolución de config.
create index if not exists idx_conector_config_project
  on conector_config (project_id)
  where project_id is not null;
