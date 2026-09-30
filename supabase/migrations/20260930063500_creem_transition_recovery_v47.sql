-- Averis v47 Creem transition recovery and transition-aware idempotency.
--
-- Goals:
-- 1. Preserve the canonical paid plan on fail-closed provider states so a later
--    provider recovery can restore the same paid entitlement without treating a
--    sync-only event as a brand-new purchase.
-- 2. Make subscription.updated_at represent a material provider-state change,
--    not a same-state webhook resend.
-- 3. Include that transition timestamp in the semantic webhook key so repeated
--    legitimate pause/resume cycles in one billing period are not collapsed.
-- 4. Derive the user profile from the strongest currently-entitled Creem
--    subscription so a stale event from an older subscription cannot revoke a
--    newer valid subscription.

create or replace function public.guard_creem_subscription_entitlement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- The API intentionally evaluates past_due/unpaid/paused as Free access.
  -- Preserve the already-linked canonical paid plan in the subscription row,
  -- however, so a later signed provider recovery event can restore that same
  -- entitlement without allowing an unrelated sync-only event to create one.
  if old.provider = 'creem'
     and new.provider = 'creem'
     and new.status in ('past_due', 'unpaid', 'paused')
     and old.plan in ('student', 'pro')
     and new.plan = 'free'
     and new.provider_product_id is not distinct from old.provider_product_id
  then
    new.plan := old.plan;
  end if;

  return new;
end;
$$;

revoke all on function public.guard_creem_subscription_entitlement() from public;

-- PostgreSQL fires same-timing triggers alphabetically. This trigger name sorts
-- before subscriptions_touch_updated_at, so updated_at sees the guarded row.
drop trigger if exists subscriptions_creem_entitlement_guard on public.subscriptions;
create trigger subscriptions_creem_entitlement_guard
before update on public.subscriptions
for each row
execute function public.guard_creem_subscription_entitlement();

-- Same-state provider resends must not manufacture a new transition timestamp.
create or replace function public.touch_subscription_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if row(
    new.user_id,
    new.provider,
    new.provider_subscription_id,
    new.provider_customer_id,
    new.provider_variant_id,
    new.provider_product_id,
    new.plan,
    new.cadence,
    new.status,
    new.renews_at,
    new.ends_at
  ) is distinct from row(
    old.user_id,
    old.provider,
    old.provider_subscription_id,
    old.provider_customer_id,
    old.provider_variant_id,
    old.provider_product_id,
    old.plan,
    old.cadence,
    old.status,
    old.renews_at,
    old.ends_at
  ) then
    new.updated_at := now();
  else
    new.updated_at := old.updated_at;
  end if;

  return new;
end;
$$;

-- Keep the existing six-argument RPC contract used by the deployed API.
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
  semantic_key_value text;
  event_subscription record;
  entitled_subscription record;
  desired_plan text;
  desired_allowance integer;
  current_credits integer;
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

  -- The API upserts the affected subscription immediately before invoking this
  -- RPC. A material provider-state transition receives a new updated_at value;
  -- an identical resend keeps the old one. The most recently changed row is
  -- therefore the best event-local identity available through the unchanged
  -- v43 RPC contract.
  select
    s.provider_subscription_id,
    s.provider_product_id,
    s.plan,
    s.cadence,
    s.status,
    s.renews_at,
    s.ends_at,
    s.updated_at
  into event_subscription
  from public.subscriptions s
  where s.user_id = p_user_id
    and s.provider = 'creem'
  order by s.updated_at desc, s.created_at desc
  limit 1;

  if found then
    semantic_key_value := concat_ws(
      '|',
      'v47',
      p_event_type,
      coalesce(event_subscription.provider_subscription_id, ''),
      coalesce(event_subscription.provider_product_id, ''),
      coalesce(event_subscription.plan, ''),
      coalesce(event_subscription.cadence, ''),
      coalesce(event_subscription.status, ''),
      coalesce(to_char(event_subscription.updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'), ''),
      coalesce(to_char(event_subscription.renews_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'), ''),
      coalesce(to_char(event_subscription.ends_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'), '')
    );
  else
    semantic_key_value := null;
  end if;

  insert into public.billing_entitlement_events(
    provider,
    event_id,
    user_id,
    event_type,
    semantic_key
  )
  values (
    'creem',
    p_event_id,
    p_user_id,
    p_event_type,
    semantic_key_value
  )
  on conflict do nothing;

  get diagnostics inserted_rows = row_count;
  if inserted_rows = 0 then
    return false;
  end if;

  -- Compute the strongest entitlement across all linked Creem subscriptions.
  -- This prevents a late webhook from an older/refunded subscription from
  -- downgrading a newer active paid subscription for the same user.
  select
    s.provider_subscription_id,
    s.plan,
    s.status,
    s.ends_at,
    s.renews_at
  into entitled_subscription
  from public.subscriptions s
  where s.user_id = p_user_id
    and s.provider = 'creem'
    and s.plan in ('student', 'pro')
    and (
      (
        s.status in ('active', 'trialing')
        and (s.ends_at is null or s.ends_at > now())
      )
      or (
        s.status in ('scheduled_cancel', 'canceled')
        and s.ends_at is not null
        and s.ends_at > now()
      )
    )
  order by
    case s.plan when 'pro' then 2 when 'student' then 1 else 0 end desc,
    greatest(
      coalesce(s.ends_at, '-infinity'::timestamptz),
      coalesce(s.renews_at, '-infinity'::timestamptz),
      s.updated_at
    ) desc,
    s.updated_at desc
  limit 1;

  if found then
    desired_plan := entitled_subscription.plan;
    desired_allowance := case desired_plan
      when 'pro' then 200
      when 'student' then 50
      else 5
    end;
  else
    desired_plan := 'free';
    desired_allowance := 5;
  end if;

  select p.credits_remaining
  into current_credits
  from public.profiles p
  where p.user_id = p_user_id
  for update;

  if not found then
    raise exception 'billing profile not found';
  end if;

  update public.profiles
  set
    plan = desired_plan,
    monthly_credit_allowance = desired_allowance,
    credits_remaining = case
      when desired_plan = 'free' then 5
      -- Only the subscription that currently wins the entitlement selection
      -- may refill credits on a paid/reset event. A stale paid event for an
      -- older subscription therefore cannot refill the active subscription.
      when p_reset_credits
           and p_plan = desired_plan
           and event_subscription.provider_subscription_id = entitled_subscription.provider_subscription_id
        then desired_allowance
      -- Recovery/synchronization events never refill credits. Preserve the
      -- existing balance but clamp it to the active plan's allowance.
      else least(current_credits, desired_allowance)
    end
  where user_id = p_user_id;

  return true;
end;
$$;

revoke all on function public.apply_billing_profile_event(text, uuid, text, text, integer, boolean)
  from public, anon, authenticated;
grant execute on function public.apply_billing_profile_event(text, uuid, text, text, integer, boolean)
  to service_role;

comment on function public.guard_creem_subscription_entitlement() is
  'Preserves the already-linked canonical paid plan while Creem is in a fail-closed pause/payment-failure state.';

comment on column public.subscriptions.updated_at is
  'Timestamp of the last material synchronized provider-state change; unchanged for same-state webhook resends.';

comment on function public.apply_billing_profile_event(text, uuid, text, text, integer, boolean) is
  'Applies exact-ID and transition-aware semantic idempotency, then reconciles the profile to the strongest currently-entitled Creem subscription.';
