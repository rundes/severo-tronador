-- Imagen de cierre (se muestra en la pantalla de "gracias" al finalizar).
-- La de portada ya existe (image_url, migración 0031).
alter table encuestas
  add column if not exists image_end_url text;
