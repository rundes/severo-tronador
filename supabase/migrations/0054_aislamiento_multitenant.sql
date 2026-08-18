-- 0054: cierres de aislamiento multi-tenant (F2 del plan de mejoras).

-- ── Dedupe del inbox, por proyecto ───────────────────────────────────────────
-- El único era global por message_id: un tercero que conociera (o adivinara) el
-- Message-ID de un mail ajeno podía insertarlo primero en su propio proyecto y
-- suprimir la copia real del otro (upsert con ignoreDuplicates). El dedupe real
-- que se quería (reintentos del Worker) es por proyecto.
drop index if exists inbound_emails_message_id_uk;
create unique index if not exists inbound_emails_project_message_uk
  on inbound_emails (project_id, message_id);

-- ── FKs faltantes a projects ─────────────────────────────────────────────────
-- Estas tablas llevan project_id pero sin FK: un id inventado (o el de un
-- proyecto ya borrado) entraba igual y quedaba huérfano para siempre.
do $$
declare
  t text;
begin
  foreach t in array array[
    'escucha_marcas', 'radio_runs', 'padron_field_defs', 'inbound_messages'
  ] loop
    if to_regclass('public.' || t) is not null
       and not exists (
         select 1 from pg_constraint
          where conrelid = ('public.' || t)::regclass
            and conname = t || '_project_id_fkey'
       )
    then
      -- Limpia referencias colgadas antes de imponer la FK.
      execute format(
        'delete from %I where project_id is not null
           and not exists (select 1 from projects p where p.id = %I.project_id)',
        t, t);
      execute format(
        'alter table %I add constraint %I foreign key (project_id)
           references projects(id) on delete cascade',
        t, t || '_project_id_fkey');
    end if;
  end loop;
end $$;

-- ── Sin DEFAULT de project_id ────────────────────────────────────────────────
-- La migración 0019 puso `default '…0001'` en las 19 tablas para el backfill.
-- Con ese default puesto, un INSERT que se olvida del project_id no falla:
-- contamina en silencio el tenant default. Sacarlo convierte ese olvido en un
-- error de NOT NULL, que es donde se ve.
do $$
declare
  r record;
begin
  for r in
    select c.table_name
      from information_schema.columns c
     where c.table_schema = 'public'
       and c.column_name = 'project_id'
       and c.column_default is not null
  loop
    execute format('alter table %I alter column project_id drop default', r.table_name);
  end loop;
end $$;
