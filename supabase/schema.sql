-- Meal Mentor: én tabel med brugerens data (samme dokumenter som appen bruger).
-- Kør i Supabase → SQL Editor.
create table if not exists public.docs (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  body jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
alter table public.docs enable row level security;
drop policy if exists "læs egne" on public.docs;
drop policy if exists "opret egne" on public.docs;
drop policy if exists "ret egne" on public.docs;
drop policy if exists "slet egne" on public.docs;
create policy "læs egne"  on public.docs for select using (auth.uid() = user_id);
create policy "opret egne" on public.docs for insert with check (auth.uid() = user_id);
create policy "ret egne"  on public.docs for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "slet egne" on public.docs for delete using (auth.uid() = user_id);
