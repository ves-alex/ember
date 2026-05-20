-- ember — schéma de base
-- À exécuter une fois dans Supabase Studio → SQL Editor sur le projet ember.
-- Pré-requis : extension pgcrypto disponible (Supabase l'active par défaut).

-- 1) cigarettes : une ligne par clope fumée OU pastille prise (selon tracking_mode)
create table public.cigarettes (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  smoked_at     timestamptz not null default now(),
  trigger_tag   text,                       -- 'stress' | 'cafe' | 'social' | 'ennui' | 'repas' | 'autre' | null
  note          text,
  tracking_mode text not null default 'cigarette'
                check (tracking_mode in ('cigarette', 'pastille')),
  created_at    timestamptz not null default now()
);

create index cigarettes_user_smoked_idx
  on public.cigarettes (user_id, smoked_at desc);

-- 2) quit_plan : une ligne par utilisateur (paramètres du sevrage)
--
-- Les 4 paramètres « réglables » (quota, baseline, délai, réduction hebdo) sont
-- dédoublés par mode de tracking depuis la migration 2026-05-20 : régler la
-- pastille n'écrase plus la cigarette. Les anciennes colonnes scalaires
-- (daily_quota, baseline_per_day, min_delay_minutes, weekly_reduction) sont
-- conservées temporairement pour réversibilité, plus utilisées par le code.
create table public.quit_plan (
  user_id                      uuid primary key references auth.users(id) on delete cascade,
  daily_quota                  int not null default 15,         -- déprécié (cf. migration 2026-05-20)
  baseline_per_day             int,                              -- déprécié (cf. migration 2026-05-20)
  min_delay_minutes            int not null default 60,         -- déprécié (cf. migration 2026-05-20)
  weekly_reduction             int not null default 1,          -- déprécié (cf. migration 2026-05-20)
  cigarette_daily_quota        int not null default 15,
  pastille_daily_quota         int not null default 15,
  cigarette_baseline_per_day   int,
  pastille_baseline_per_day    int,
  cigarette_min_delay_minutes  int not null default 60,
  pastille_min_delay_minutes   int not null default 60,
  cigarette_weekly_reduction   int not null default 1,
  pastille_weekly_reduction    int not null default 1,
  price_per_pack               numeric(6,2) default 12.50,
  cigs_per_pack                int default 20,
  start_date                   date not null default current_date,
  tracking_mode                text not null default 'cigarette'
                               check (tracking_mode in ('cigarette', 'pastille')),
  substitute_form              text,                            -- forme substitut (cf. migration 2026-05-18) ; NULL → 'pastille'
  substitute_label             text,                            -- nom de produit libre, optionnel
  updated_at                   timestamptz not null default now()
);

-- Trigger pour maintenir quit_plan.updated_at à jour
create or replace function public.touch_quit_plan_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger quit_plan_set_updated_at
before update on public.quit_plan
for each row execute function public.touch_quit_plan_updated_at();
