-- Carpeta Enviados in-app (modo Cloudflare+Resend): inbound_emails ahora
-- guarda también los salientes enviados por Resend. direction='in' = recibido
-- (Cloudflare), 'out' = enviado (Resend). Filas existentes = 'in'.
alter table inbound_emails
  add column if not exists direction text not null default 'in'
  check (direction in ('in', 'out'));

-- Listado por carpeta: (project_id, direction, received_at desc).
create index if not exists inbound_emails_dir_idx
  on inbound_emails (project_id, direction, received_at desc);
