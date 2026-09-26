-- Averis zero-cost SaaS foundation.
-- Apply this migration to a Supabase Free project before enabling SAAS_MODE.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  plan text not null default 'free' check (plan in ('free', 'student', 'pro')),
  credits_remaining integer not null default 5 check (credits_remaining >= 0),
  monthly_credit_allowance integer not null default 5 check (monthly_credit_allowance >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.scans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  document_name text not null,
  source_name text not null default 'manual-reference',
  credits_used smallint not null default 1 check (credits_used > 0),
  similarity_percent numeric(5,2) check (similarity_percent between 0 and 100),
  status text not null default 'completed' check (status in ('completed', 'failed', 'deleted')),
  original_file_retained boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists scans_user_created_idx
  on public.scans (user_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.scans enable row level security;

revoke all on table public.profiles from anon, authenticated;
revoke all on table public.scans from anon, authenticated;
grant select on table public.profiles to authenticated;
grant select, delete on table public.scans to authenticated;

create policy "profiles_select_own"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create policy "scans_select_own"
  on public.scans for select
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create policy "scans_delete_own"
  on public.scans for delete
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(coalesce(new.email, ''), '@', 1)))
  on conflict (user_id) do nothing;
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public;

-- Safe for applying the migration after test users already exist.
insert into public.profiles (user_id, display_name)
select id, coalesce(raw_user_meta_data ->> 'display_name', split_part(coalesce(email, ''), '@', 1))
from auth.users
on conflict (user_id) do nothing;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.consume_scan_credit(
  p_document_name text,
  p_source_name text,
  p_similarity_percent numeric
)
returns table (scan_id uuid, credits_remaining integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_remaining integer;
  v_scan_id uuid;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  update public.profiles
     set credits_remaining = public.profiles.credits_remaining - 1,
         updated_at = now()
   where user_id = v_user_id
     and public.profiles.credits_remaining > 0
   returning public.profiles.credits_remaining into v_remaining;

  if v_remaining is null then
    raise exception 'INSUFFICIENT_CREDITS';
  end if;

  insert into public.scans (
    user_id,
    document_name,
    source_name,
    credits_used,
    similarity_percent,
    original_file_retained
  ) values (
    v_user_id,
    left(coalesce(nullif(trim(p_document_name), ''), 'submission'), 255),
    left(coalesce(nullif(trim(p_source_name), ''), 'reference'), 255),
    1,
    greatest(0, least(100, p_similarity_percent)),
    false
  ) returning id into v_scan_id;

  return query select v_scan_id, v_remaining;
end;
$$;

revoke all on function public.consume_scan_credit(text, text, numeric) from public, anon;
grant execute on function public.consume_scan_credit(text, text, numeric) to authenticated;
