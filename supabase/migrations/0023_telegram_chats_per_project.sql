-- Fase 3c-3: chats de Telegram por proyecto. PK (project_id, dni).
-- chat_id sigue único global (un chat de Telegram pertenece a un proyecto).
-- project_id ya existe + NOT NULL + DEFAULT. 0 filas en prod. Idempotente.
alter table telegram_chats drop constraint if exists telegram_chats_pkey;
alter table telegram_chats add primary key (project_id, dni);
