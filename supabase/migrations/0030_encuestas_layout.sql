-- Diseño de render de la encuesta (minimal | stepper | futuros). Sin CHECK
-- para no requerir migración al sumar layouts; la app valida contra el catálogo
-- (lib/encuestas/layouts.ts). La descripción por pregunta vive dentro del jsonb
-- preguntas, no necesita columna.
alter table encuestas
  add column if not exists layout text not null default 'minimal';
