-- Credenciales encriptadas por usuario para mailbox @tronador.net.ar
-- (Plan 04 F2). Cada usuario del panel (login Google con email allowlist)
-- tiene una casilla provisionada en Stalwart. La contraseña JMAP se
-- guarda encriptada con AES-GCM (CONFIG_MASTER_KEY).
create table if not exists mailbox_credentials (
  user_email text primary key,
  mailbox_address text not null unique,
  jmap_password_encrypted text not null,
  provisioned_at timestamptz default now(),
  last_login_at timestamptz
);
alter table mailbox_credentials enable row level security;
