-- ember — migration 2026-05-15
-- Sépare la « conso de référence » (ce que tu fumais/prenais avant de décider
-- de réduire) du « quota » (la cible que tu te fixes, qui baisse chaque semaine).
--
-- Jusqu'ici les deux étaient confondus dans `daily_quota` : impossible de dire
-- « je fumais 20/j mais je me fixe 12 ». La nouvelle colonne `baseline_per_day`
-- fige cette référence pour calculer honnêtement les économies et les clopes
-- évitées. Nullable : les plans existants retombent sur `daily_quota` côté
-- code (fallback `effectiveBaseline`), donc rien ne casse sans cette migration.
--
-- À exécuter une fois dans Supabase Studio → SQL Editor sur le projet ember.

alter table public.quit_plan
  add column baseline_per_day int
  check (baseline_per_day is null or baseline_per_day > 0);

-- Backfill : pour les plans déjà créés, la meilleure approximation de la
-- conso de départ est le quota initial saisi à l'onboarding (ils étaient
-- égaux par construction). On le copie pour ne pas afficher 0 € d'économies.
update public.quit_plan
  set baseline_per_day = daily_quota
  where baseline_per_day is null;
