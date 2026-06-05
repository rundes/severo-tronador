-- Plantillas de email con diseño HTML. `formato` distingue texto plano
-- (default, retrocompatible) de HTML; `cuerpo_html` guarda el HTML crudo del
-- editor cuando formato = 'html'. El cuerpo en texto (`cuerpo`) se mantiene
-- siempre como fallback y para los canales no-email.
alter table templates add column if not exists formato text not null default 'texto';
alter table templates add column if not exists cuerpo_html text;
