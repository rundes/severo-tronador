-- Send window opcional por flow (Plan 02 F5). Hora UTC (0-23). Si están
-- seteados, el cron no despacha envíos fuera de la ventana.
alter table flows add column if not exists send_window_start_hour int;
alter table flows add column if not exists send_window_end_hour int;
