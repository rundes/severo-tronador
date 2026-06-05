-- Módulo de Encuestas (entidad de primera clase, convive con preguntas-en-campaña).
-- - encuestas: la encuesta + sus preguntas tipadas (jsonb) + estado + slug público.
-- - encuesta_respuestas: respuestas (públicas anónimas o por token atribuidas a dni).
-- - survey_tokens.encuesta_id: un token puede resolver a campaña (legacy) o encuesta.
-- - campanas.encuesta_id: una campaña email puede distribuir una encuesta.
-- RLS deny-all como el resto (service-role bypassa). Default project = …0001.

create table if not exists encuestas (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null default '00000000-0000-0000-0000-000000000001'
    references projects(id) on delete cascade,
  titulo text not null,
  descripcion text,
  slug text,
  estado text not null default 'borrador'
    check (estado in ('borrador', 'publicada', 'cerrada')),
  preguntas jsonb not null default '[]'::jsonb,
  published_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists encuestas_slug_uk
  on encuestas (lower(slug)) where slug is not null;
create index if not exists encuestas_project_idx
  on encuestas (project_id, created_at desc);
alter table encuestas enable row level security;

create table if not exists encuesta_respuestas (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null default '00000000-0000-0000-0000-000000000001'
    references projects(id) on delete cascade,
  encuesta_id uuid not null references encuestas(id) on delete cascade,
  source text not null default 'publica'
    check (source in ('publica', 'email', 'manual')),
  dni text,
  token text,
  answers jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
-- Dedupe por destinatario (token único cuando viene).
create unique index if not exists encuesta_respuestas_token_uk
  on encuesta_respuestas (token) where token is not null;
create index if not exists encuesta_respuestas_enc_idx
  on encuesta_respuestas (project_id, encuesta_id, created_at desc);
alter table encuesta_respuestas enable row level security;

-- Un token puede atar a una encuesta (además del campaign legacy).
alter table survey_tokens
  add column if not exists encuesta_id uuid references encuestas(id) on delete cascade;
-- Permitir tokens sin campaña (encuesta-only).
alter table survey_tokens alter column campaign_id drop not null;

-- Una campaña email puede distribuir una encuesta (PR4).
alter table campanas
  add column if not exists encuesta_id uuid references encuestas(id) on delete set null;
