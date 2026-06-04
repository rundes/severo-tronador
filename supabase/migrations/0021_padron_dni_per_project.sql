-- Fase 3c-1: el DNI deja de ser único global → único POR PROYECTO.
-- Permite el mismo DNI en padrones de proyectos distintos. importPadron pasa a
-- usar onConflict (project_id, dni). project_id ya existe + NOT NULL (0018/0019).
-- Idempotente. Seguro: con 10.312 filas todas en el proyecto default y dni
-- antes globalmente único, (project_id, dni) también es único.
alter table padron drop constraint if exists padron_dni_key;
create unique index if not exists padron_dni_project_uk
  on padron (project_id, dni);
