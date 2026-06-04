-- Workspaces/proyectos (multi-tenant). Fase 1 de la feature de proyectos.
--
-- Un proyecto = un estudio aislado: su propio padrón, escucha, segmentos,
-- campañas, etc. Los usuarios acceden por membresía (rol owner/editor/viewer).
-- La identidad es el email de la sesión (NextAuth), no hay user_id.
--
-- Esta migración solo crea las tablas de proyectos y siembra un proyecto
-- "default" donde queda toda la data single-tenant existente (ver 0018/0019).
-- Idempotente: re-correr no duplica.

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  slug text unique not null,
  created_by text,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists project_members (
  project_id uuid not null references projects(id) on delete cascade,
  email text not null,                                   -- lowercase
  role text not null check (role in ('owner', 'editor', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (project_id, email)
);

-- Lookup por email en cada request (getActiveProject) → índice.
create index if not exists project_members_email_idx
  on project_members (lower(email));

-- RLS deny-all (service-role la bypasea), coherente con el resto del esquema.
alter table projects enable row level security;
alter table project_members enable row level security;

-- Proyecto default con id fijo: aloja toda la data prod existente. Idempotente
-- por slug único.
insert into projects (id, nombre, slug, created_by)
values (
  '00000000-0000-0000-0000-000000000001',
  'Proyecto principal',
  'default',
  'migration'
)
on conflict (slug) do nothing;

-- Owners del proyecto default: los emails que ya actuaron en la app
-- (audit_log.actor). SQL no lee ALLOWED_EMAILS (env de Vercel); el resto de la
-- allowlist se agrega desde la UI /proyectos cuando exista. Si audit_log está
-- vacío, el primer login crea/asume ownership vía la UI de onboarding (Fase 2).
insert into project_members (project_id, email, role)
select distinct '00000000-0000-0000-0000-000000000001'::uuid, lower(actor), 'owner'
from audit_log
where actor is not null and trim(actor) <> ''
on conflict (project_id, email) do nothing;
