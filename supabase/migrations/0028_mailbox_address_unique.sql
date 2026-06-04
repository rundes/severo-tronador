-- Anti-spoofing: la dirección @tronador.net.ar de una casilla debe ser única
-- entre usuarios (dos personas no pueden enviar como la misma casilla). La
-- app ya chequea en updateMyMailboxAddress; este índice cierra la carrera a
-- nivel DB. Case-insensitive sobre el address.
create unique index if not exists mailbox_credentials_address_uk
  on mailbox_credentials (lower(mailbox_address));
