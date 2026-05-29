-- El conector google-sheets se separó en dos conceptos:
-- · google-sheets-padron (read del padrón)
-- · google-sheets-archive (write-behind a un Sheet de preservación)
-- Las filas existentes con el ID viejo apuntaban a la lectura del padrón,
-- así que las migramos al nuevo ID -padron.
update conector_config set connector_id = 'google-sheets-padron'
  where connector_id = 'google-sheets';
