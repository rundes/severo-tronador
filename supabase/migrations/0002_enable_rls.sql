-- Single-tenant: la app accede solo vía service-role (bypass RLS).
-- Habilitamos RLS sin policies para bloquear cualquier acceso anon/authenticated.
alter table public.padron enable row level security;
alter table public.segmentos enable row level security;
alter table public.templates enable row level security;
alter table public.campanas enable row level security;
alter table public.envios enable row level security;
alter table public.respuestas enable row level security;
alter table public.opt_outs enable row level security;
alter table public.llamadas enable row level security;
alter table public.conector_config enable row level security;
alter table public.cuotas enable row level security;
alter table public.listening_config enable row level security;
alter table public.survey_tokens enable row level security;
alter table public.listening_items enable row level security;
alter table public.sheets_sync_queue enable row level security;
