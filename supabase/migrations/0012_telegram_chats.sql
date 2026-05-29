-- Telegram opt-in store. Cada contacto que arranca el bot con
-- /start <token> queda vinculado a su chat_id. Sin este mapping no se
-- puede mensajear via Telegram (la API no acepta phone numbers).
create table if not exists telegram_chats (
  dni text primary key,
  chat_id bigint not null,
  username text,
  first_name text,
  opted_in_at timestamptz default now(),
  opted_out_at timestamptz
);
alter table telegram_chats enable row level security;
create index if not exists idx_telegram_chat_id on telegram_chats(chat_id);
