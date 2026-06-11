-- Fija search_path en ambas sobrecargas de increment_quota (advisor de Supabase
-- function_search_path_mutable). Son SECURITY INVOKER y se llaman server-side
-- vía service-role: riesgo bajo, pero deja la resolución de objetos determinística.
alter function public.increment_quota(text, integer) set search_path = public;
alter function public.increment_quota(uuid, text, integer) set search_path = public;
