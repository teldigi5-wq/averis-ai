-- Averis v46 semantic Creem webhook idempotency.
--
-- Creem's dashboard "Resend" action can redeliver the same semantic webhook
-- with a new provider event ID. Exact event-id idempotency therefore remains
-- necessary but is not sufficient to protect entitlement/credit mutations.
--
-- This migration adds a second server-only semantic key derived from the
-- current synchronized Creem subscription state. Legitimate later billing
-- periods remain distinct because renews_at / ends_at change across periods.

alter table public.billing_entitlement_events
  add column if not exists semantic_key text;

-- Backfill only the latest currently-canceled event for each canceled Creem
-- subscription. Older duplicate audit rows stay untouched, while another
-- resend of the current cancellation is blocked immediately after migration.
with current_canceled as (
  select distinct on (s.user_id)
    s.user_id,
    s.provider_subscription_id,
    s.provider_product_id,
    s.plan,
    s.cadence,
    s.status,
    s.renews_at,
    s.ends_at
  from public.subscriptions s
  where s.provider = 'creem'
    and s.status = 'canceled'
  order by
    s.user_id,
    greatest(
      coalesce(s.ends_at, '-infinity'::timestamptz),
      coalesce(s.renews_at, '-infinity'::timestamptz),
      s.created_at
    ) desc,
    s.created_at desc
), latest_canceled_event as (
  select distinct on (e.user_id)
    e.provider,
    e.event_id,
    e.user_id
  from public.billing_entitlement_events e
  where e.provider = 'creem'
    and e.event_type = 'subscription.canceled'
    and e.semantic_key is null
  order by e.user_id, e.created_at desc
)
update public.billing_entitlement_events e
set semantic_key = concat_ws(
  '|',
  'v46',
  'subscription.canceled',
  coalesce(s.provider_subscription_id, ''),
  coalesce(s.provider_product_id, ''),
  coalesce(s.plan, ''),
  coalesce(s.cadence, ''),
  coalesce(s.status, ''),
  coalesce(to_char(s.renews_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'), ''),
  coalesce(to_char(s.ends_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'), '')
)
from latest_canceled_event l
join current_canceled s on s.user_id = l.user_id
where e.provider = l.provider
  and e.event_id = l.event_id;

create unique index if not exists billing_entitlement_events_provider_semantic_key_uq
  on public.billing_entitlement_events(provider, semantic_key)
  where semantic_key is not null;

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
  subscription_row record;
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

  -- The API synchronizes the provider subscription row before invoking this
  -- RPC. Choose the current Creem row with the furthest billing boundary so
  -- the semantic key changes naturally on a legitimate later billing period.
  select
    s.provider_subscription_id,
    s.provider_product_id,
    s.plan,
    s.cadence,
    s.status,
    s.renews_at,
    s.ends_at
  into subscription_row
  from public.subscriptions s
  where s.user_id = p_user_id
    and s.provider = 'creem'
  order by
    greatest(
      coalesce(s.ends_at, '-infinity'::timestamptz),
      coalesce(s.renews_at, '-infinity'::timestamptz),
      s.created_at
    ) desc,
    s.created_at desc
  limit 1;

  if found then
    semantic_key_value := concat_ws(
      '|',
      'v46',
      p_event_type,
      coalesce(subscription_row.provider_subscription_id, ''),
      coalesce(subscription_row.provider_product_id, ''),
      coalesce(subscription_row.plan, ''),
      coalesce(subscription_row.cadence, ''),
      coalesce(subscription_row.status, ''),
      coalesce(to_char(subscription_row.renews_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'), ''),
      coalesce(to_char(subscription_row.ends_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'), '')
    );
  else
    -- Preserve the original exact-event-id boundary if a provider row is not
    -- available for any reason. No semantic guess is made in that case.
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

revoke all on function public.apply_billing_profile_event(text, uuid, text, text, integer, boolean)
  from public, anon, authenticated;
grant execute on function public.apply_billing_profile_event(text, uuid, text, text, integer, boolean)
  to service_role;

comment on column public.billing_entitlement_events.semantic_key is
  'Server-derived Creem semantic delivery key preventing duplicate entitlement/credit mutations when a resend receives a new provider event ID.';

comment on table public.billing_entitlement_events is
  'Server-only Creem webhook ledger preventing both exact event-ID replays and semantic resend duplicates from mutating profile entitlements.';
