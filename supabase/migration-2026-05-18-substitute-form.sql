-- ember — migration 2026-05-18
-- Étend le mode « vert » (substituts nicotiniques) au-delà de la seule
-- pastille : gomme à mâcher, pastille/comprimé, spray buccal, inhaleur.
--
-- Choix d'archi : on NE touche PAS à la contrainte CHECK de `tracking_mode`
-- (elle reste 'cigarette' | 'pastille' — 'pastille' = toute la famille
-- substitut, un seul flux/compteur). La FORME précise et un nom de produit
-- libre sont deux colonnes additives nullable sur `quit_plan` :
--   - `substitute_form`  : 'pastille' | 'gomme' | 'spray' | 'inhaleur'
--   - `substitute_label` : nom libre saisi par l'user (« Nicopass 1,5 mg »…)
--
-- Nullable, pas de CHECK, pas de backfill : les plans existants gardent
-- NULL → le code retombe sur la forme 'pastille' (comportement identique à
-- l'avant-migration). Aucune donnée existante modifiée, risque quasi nul.
-- Validation de `substitute_form` faite côté client (liste fermée).
--
-- À exécuter une fois dans Supabase Studio → SQL Editor sur le projet ember.

alter table public.quit_plan add column substitute_form  text;
alter table public.quit_plan add column substitute_label text;
