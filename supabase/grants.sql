-- ember — privilèges (à exécuter après schema.sql + rls.sql)
-- Les policies RLS contrôlent ce que chaque user voit ; les grants ouvrent juste
-- l'accès basique à la table pour les sessions authentifiées.

grant select, insert, update, delete on public.cigarettes to authenticated;
grant select, insert, update, delete on public.quit_plan  to authenticated;

-- Sécurité belt-and-suspenders : on retire tout au rôle anon.
revoke all on public.cigarettes from anon;
revoke all on public.quit_plan  from anon;
