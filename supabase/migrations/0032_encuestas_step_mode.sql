-- Stepper agrupable: step_mode = 'one' (una pregunta por paso) | 'manual'
-- (agrupadas por el campo step de cada pregunta, dentro del jsonb preguntas).
alter table encuestas
  add column if not exists step_mode text not null default 'one';
