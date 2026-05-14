-- ember — migration 2026-05-14
-- Ajoute une colonne `tracking_mode` sur quit_plan ET cigarettes pour permettre
-- de tracker au choix des cigarettes ('cigarette') ou des pastilles de substitut
-- nicotinique ('pastille', type Nicorette). Les users existants sont migrés
-- automatiquement en 'cigarette' via le default.
--
-- À exécuter une fois dans Supabase Studio → SQL Editor sur le projet ember.

alter table public.quit_plan
  add column tracking_mode text not null default 'cigarette'
  check (tracking_mode in ('cigarette', 'pastille'));

alter table public.cigarettes
  add column tracking_mode text not null default 'cigarette'
  check (tracking_mode in ('cigarette', 'pastille'));
