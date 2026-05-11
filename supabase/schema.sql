-- ember — schéma de base
-- À exécuter une fois dans Supabase Studio → SQL Editor sur le projet ember.
-- Pré-requis : extension pgcrypto disponible (Supabase l'active par défaut).

-- 1) cigarettes : une ligne par clope fumée
create table public.cigarettes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  smoked_at   timestamptz not null default now(),
  trigger_tag text,                       -- 'stress' | 'cafe' | 'social' | 'ennui' | 'repas' | 'autre' | null
  note        text,
  created_at  timestamptz not null default now()
);

create index cigarettes_user_smoked_idx
  on public.cigarettes (user_id, smoked_at desc);

-- 2) quit_plan : une ligne par utilisateur (paramètres du sevrage)
create table public.quit_plan (
  user_id              uuid primary key references auth.users(id) on delete cascade,
  daily_quota          int not null default 15,
  min_delay_minutes    int not null default 60,
  weekly_reduction     int not null default 1,    -- décrément automatique du quota tous les 7 jours
  price_per_pack       numeric(6,2) default 12.50,
  cigs_per_pack        int default 20,
  start_date           date not null default current_date,
  updated_at           timestamptz not null default now()
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
