-- Averis v40 subscription entitlements.
-- Billing writes are server-side only through the API's Supabase secret key.

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'lemon_squeezy' check (provider in ('lemon_squeezy')),
  provider_subscription_id text not null unique,
  provider_customer_id text,
  provider_variant_id text,
  plan text not null check (plan in ('free', 'student', 'pro')),
  cadence text check (cadence in ('monthly', 'yearly')),
  status text not null,
  renews_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists subscriptions_user_updated_idx
  on public.subscriptions (user_id, updated_at desc);

alter table public.subscriptions enable row level security;
revoke all on table public.subscriptions from public, anon, authenticated;
grant select on table public.subscriptions to authenticated;

create policy "subscriptions_select_own"
  on public.subscriptions for select
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create or replace function public.touch_subscription_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.touch_subscription_updated_at() from public, anon, authenticated;

drop trigger if exists subscriptions_touch_updated_at on public.subscriptions;
create trigger subscriptions_touch_updated_at
  before update on public.subscriptions
  for each row execute function public.touch_subscription_updated_at();

-- Profiles already use these exact plan values. Billing webhooks update them
-- through the trusted API only; students cannot write plan/credit fields through RLS.
comment on table public.subscriptions is
  'Server-synchronized subscription state. Students may read only their own row.';
