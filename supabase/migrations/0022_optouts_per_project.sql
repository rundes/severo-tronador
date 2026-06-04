-- Fase 3c-2: opt-out único POR PROYECTO (no global). project_id ya existe
-- + NOT NULL + DEFAULT (0018/0019). 0 filas en prod → trivial. Idempotente.
alter table opt_outs drop constraint if exists opt_outs_pkey;
alter table opt_outs add primary key (project_id, dni);
