-- Allow Averis AI revision routes to consume the existing per-user hourly rate-limit buckets.
-- This keeps the zero-cost distributed limiter enforced in Supabase while enabling
-- both local revision and opt-in cloud revision actions.

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
    'reference_verify',
    'ai_revision',
    'ai_cloud_revision'
  ) then
    raise exception 'INVALID_RATE_LIMIT_ACTION';
  end if;

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
