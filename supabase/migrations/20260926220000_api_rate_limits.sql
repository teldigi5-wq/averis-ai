-- Averis zero-cost distributed per-user request limits.
-- Hourly counters live in Supabase so Vercel/serverless instance churn cannot reset them.

create table if not exists public.api_rate_limits (
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (length(action) between 1 and 64),
  window_start timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, action, window_start)
);

alter table public.api_rate_limits enable row level security;
revoke all on table public.api_rate_limits from anon, authenticated;

drop policy if exists "api_rate_limits_deny_browser" on public.api_rate_limits;
create policy "api_rate_limits_deny_browser"
  on public.api_rate_limits
  for all
  to authenticated
  using (false)
  with check (false);

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create or replace function private.consume_api_rate_limit_impl(
  p_action text,
  p_limit integer
)
returns table (
  allowed boolean,
  remaining integer,
  retry_after_seconds integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_window_start timestamptz := date_trunc('hour', now());
  v_count integer;
  v_retry integer;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if p_limit < 1 or p_limit > 1000 then
    raise exception 'INVALID_RATE_LIMIT';
  end if;

  if p_action not in (
    'document_extract',
    'similarity_compare',
    'source_search',
    'source_resolve',
    'reference_parse',
    'reference_audit',
    'reference_verify'
  ) then
    raise exception 'INVALID_RATE_LIMIT_ACTION';
  end if;

  -- Keep only a short rolling audit of the caller's own expired buckets.
  delete from public.api_rate_limits
   where user_id = v_user_id
     and window_start < v_window_start - interval '48 hours';

  insert into public.api_rate_limits (
    user_id,
    action,
    window_start,
    request_count,
    updated_at
  ) values (
    v_user_id,
    p_action,
    v_window_start,
    1,
    now()
  )
  on conflict (user_id, action, window_start)
  do update set
    request_count = public.api_rate_limits.request_count + 1,
    updated_at = now()
  returning public.api_rate_limits.request_count into v_count;

  v_retry := greatest(
    1,
    ceil(extract(epoch from ((v_window_start + interval '1 hour') - now())))::integer
  );

  return query
  select
    v_count <= p_limit,
    greatest(p_limit - v_count, 0),
    v_retry;
end;
$$;

revoke all on function private.consume_api_rate_limit_impl(text, integer)
  from public, anon;
grant execute on function private.consume_api_rate_limit_impl(text, integer)
  to authenticated;

create or replace function public.consume_api_rate_limit(
  p_action text,
  p_limit integer
)
returns table (
  allowed boolean,
  remaining integer,
  retry_after_seconds integer
)
language sql
security invoker
set search_path = ''
as $$
  select *
  from private.consume_api_rate_limit_impl(p_action, p_limit);
$$;

revoke all on function public.consume_api_rate_limit(text, integer)
  from public, anon;
grant execute on function public.consume_api_rate_limit(text, integer)
  to authenticated;

comment on table public.api_rate_limits is
  'Distributed per-user hourly request counters used by the Averis API. Browser roles have no direct table access.';
comment on function public.consume_api_rate_limit(text, integer) is
  'Authenticated wrapper for atomically consuming an Averis per-user hourly API rate-limit bucket.';
