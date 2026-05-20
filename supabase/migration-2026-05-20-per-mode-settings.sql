-- ember — migration 2026-05-20
-- Sépare les paramètres du plan par mode de tracking (cigarette / pastille).
--
-- Bug avant cette migration : `daily_quota`, `baseline_per_day`,
-- `min_delay_minutes` et `weekly_reduction` étaient partagés entre les deux
-- modes. Conséquence : régler le quota en mode pastille écrasait aussi le
-- quota du mode cigarette (et vice-versa). Le commentaire de state.js disait
-- pourtant « chaque mode son compteur, son historique, ses stats » — mais
-- les paramètres du plan n'avaient jamais été dédoublés.
--
-- Solution : 8 nouvelles colonnes (4 champs × 2 modes). Les anciennes sont
-- conservées pour cette release (réversibilité, principe « modifiable à la
-- main »). Une migration ultérieure les droppera quand le code stable aura
-- prouvé qu'il n'en a plus besoin.
--
-- Backfill : valeurs actuelles copiées dans cigarette_* (le mode historique
-- d'Alex). Les pastille_* prennent les defaults du schéma (15/null/60/1).
-- L'user les ajustera depuis l'écran réglages en passant en mode pastille.
--
-- À exécuter une fois dans Supabase Studio → SQL Editor sur le projet ember.

alter table public.quit_plan
  add column cigarette_daily_quota       int     not null default 15,
  add column pastille_daily_quota        int     not null default 15,
  add column cigarette_baseline_per_day  int,
  add column pastille_baseline_per_day   int,
  add column cigarette_min_delay_minutes int     not null default 60,
  add column pastille_min_delay_minutes  int     not null default 60,
  add column cigarette_weekly_reduction  int     not null default 1,
  add column pastille_weekly_reduction   int     not null default 1;

-- Backfill : copie les valeurs partagées existantes dans le mode cigarette.
update public.quit_plan
  set cigarette_daily_quota       = daily_quota,
      cigarette_baseline_per_day  = baseline_per_day,
      cigarette_min_delay_minutes = min_delay_minutes,
      cigarette_weekly_reduction  = weekly_reduction;
