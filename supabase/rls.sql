-- ember — Row Level Security
-- À exécuter après schema.sql.
-- Chaque utilisateur ne peut voir / écrire QUE ses propres lignes.

-- cigarettes
alter table public.cigarettes enable row level security;

create policy "cigarettes_select_own" on public.cigarettes
  for select using (auth.uid() = user_id);

create policy "cigarettes_insert_own" on public.cigarettes
  for insert with check (auth.uid() = user_id);

create policy "cigarettes_update_own" on public.cigarettes
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "cigarettes_delete_own" on public.cigarettes
  for delete using (auth.uid() = user_id);

-- quit_plan
alter table public.quit_plan enable row level security;

create policy "quit_plan_select_own" on public.quit_plan
  for select using (auth.uid() = user_id);

create policy "quit_plan_insert_own" on public.quit_plan
  for insert with check (auth.uid() = user_id);

create policy "quit_plan_update_own" on public.quit_plan
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "quit_plan_delete_own" on public.quit_plan
  for delete using (auth.uid() = user_id);
