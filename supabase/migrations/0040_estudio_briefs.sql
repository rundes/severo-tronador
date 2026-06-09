-- Contextos (briefs) guardados del Estudio de contenido: prompt + referencias
-- (links, imágenes, videos) + plataformas, reutilizables entre sesiones.
-- RLS deny-all como el resto: el service-role del backend lo bypassa.
create table if not exists public.estudio_briefs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null default '00000000-0000-0000-0000-000000000001'
    references public.projects(id) on delete cascade,
  nombre text not null,
  prompt text not null default '',
  links text[] not null default '{}',
  images text[] not null default '{}',
  videos text[] not null default '{}',
  platforms text[] not null default '{}',
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.estudio_briefs enable row level security;

create index if not exists estudio_briefs_project_idx
  on public.estudio_briefs (project_id, updated_at desc);
