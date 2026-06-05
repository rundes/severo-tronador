-- Portada y cierre personalizables de la encuesta:
-- - image_url: imagen de cabecera (URL http/https).
-- - mensaje_final: texto al finalizar (reemplaza el "¡Gracias!" por defecto).
-- - cta_label / cta_url: botón/link opcional al sitio del autor en el cierre.
alter table encuestas
  add column if not exists image_url text,
  add column if not exists mensaje_final text,
  add column if not exists cta_label text,
  add column if not exists cta_url text;
