-- Mensajes entrantes de canales conversacionales (WhatsApp/SMS/Telegram).
-- Zona de aterrizaje cruda: SIEMPRE se inserta el entrante (matchee o no).
-- Las respuestas derivadas viven en `respuestas`; esta tabla es la espina
-- para la bandeja unificada y la encuesta conversacional futuras.
create table if not exists inbound_messages (
  id                  uuid primary key default gen_random_uuid(),
  project_id          uuid,
  channel             text not null,
  sender_external_id  text not null,
  dni                 text,
  body                text not null,
  provider_message_id text,
  envio_id            text,
  campaign_id         text,
  respuesta_token     text,
  is_opt_out          boolean not null default false,
  received_at         timestamptz not null default now(),
  processed_at        timestamptz,
  raw                 jsonb
);

-- Idempotencia ante reintentos del proveedor.
create unique index if not exists inbound_messages_provider_uq
  on inbound_messages (channel, provider_message_id)
  where provider_message_id is not null;

-- Lectura para la bandeja futura (por contacto, recientes primero).
create index if not exists inbound_messages_project_dni_idx
  on inbound_messages (project_id, dni, received_at desc);

-- RLS deny-all: acceso solo por service-role (igual que el resto del modelo).
alter table inbound_messages enable row level security;
