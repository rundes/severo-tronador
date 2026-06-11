-- Campos para campañas de tipo "Anuncio Meta" (Fase 1: asociar + medir).
-- segment_id: segmento guardado que define la audiencia objetivo.
-- meta_ad_id: id del anuncio en Meta (vinculado o creado).
-- meta_adset_id / meta_campaign_id: jerarquía Meta (opcionales).
-- meta_audience_id: reservado para Fase 2 (audience custom), nullable ahora.
alter table campanas
  add column if not exists segment_id uuid references segmentos(id) on delete set null,
  add column if not exists meta_ad_id text,
  add column if not exists meta_adset_id text,
  add column if not exists meta_campaign_id text,
  add column if not exists meta_audience_id text;
