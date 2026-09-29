-- Averis v43 Creem webhook idempotency boundary.
-- Provider webhook retries are expected; a repeated event must never refill
-- scan credits or re-run another profile entitlement mutation.

create table if not exists public.billing_entitlement_events (
  provider text not null default 'creem' check (provider = 'creem'),
  event_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null,
  created_at timestamptz not null default now(),
  primary key (provider, event_id)
);

alter table public.billing_entitlement_events enable row level security;

revoke all on table public.billing_entitlement_events from anon, authenticated;

create or replace function public.apply_billing_profile_event(
  p_event_id text,
  p_user_id uuid,
  p_event_type text,
  p_plan text,
  p_allowance integer,
  p_reset_credits boolean
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_rows integer;
begin
  if p_event_id is null or btrim(p_event_id) = '' then
    raise exception 'billing event id is required';
  end if;

  if p_event_type is null or btrim(p_event_type) = '' then
    raise exception 'billing event type is required';
  end if;

  if p_plan not in ('free', 'student', 'pro') then
    raise exception 'invalid billing plan';
  end if;

  if p_allowance < 0 then
    raise exception 'invalid billing allowance';
  end if;

  insert into public.billing_entitlement_events(provider, event_id, user_id, event_type)
  values ('creem', p_event_id, p_user_id, p_event_type)
  on conflict (provider, event_id) do nothing;

  get diagnostics inserted_rows = row_count;
  if inserted_rows = 0 then
    return false;
  end if;

  update public.profiles
  set
    plan = p_plan,
    monthly_credit_allowance = p_allowance,
    credits_remaining = case
      when p_reset_credits then p_allowance
      else credits_remaining
    end
  where user_id = p_user_id;

  if not found then
    raise exception 'billing profile not found';
  end if;

  return true;
end;
$$;

revoke all on function public.apply_billing_profile_event(text, uuid, text, text, integer, boolean) from public, anon, authenticated;
grant execute on function public.apply_billing_profile_event(text, uuid, text, text, integer, boolean) to service_role;

comment on table public.billing_entitlement_events is
  'Server-only Creem webhook event ledger preventing duplicate profile/credit mutations.';
