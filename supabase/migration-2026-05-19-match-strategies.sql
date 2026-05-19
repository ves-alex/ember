-- Phase B (RAG) — la recherche par le sens.
-- À exécuter dans Supabase Studio (SQL Editor).

-- Fonction : on lui passe les coordonnées d'une question, elle renvoie
-- les `match_count` fiches les plus proches par le sens.
--   <=>  = distance cosinus pgvector (les vecteurs sont normalisés)
--   similarite : 1 = sens identique, 0 = sans rapport
create or replace function public.match_strategies(
  query_embedding vector(384),
  match_count int default 3
)
returns table (
  id bigint,
  trigger_tag text,
  titre text,
  contenu text,
  similarite float
)
language sql
stable
as $$
  select
    id,
    trigger_tag,
    titre,
    contenu,
    1 - (embedding <=> query_embedding) as similarite
  from public.coaching_strategies
  where embedding is not null
  order by embedding <=> query_embedding
  limit match_count;
$$;

-- Autorise le concierge (clé publique) à appeler cette fonction en lecture.
grant execute on function public.match_strategies(vector, int) to anon, authenticated;
