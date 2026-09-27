-- Averis self-service privacy controls.
-- Exposes only narrow authenticated wrappers; privileged work stays in private schema.

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create or replace function private.export_my_account_data_impl()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_identity jsonb;
  v_profile jsonb;
  v_scans jsonb;
  v_fingerprints jsonb;
  v_rate_limits jsonb;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select jsonb_build_object(
    'user_id', u.id,
    'email', u.email,
    'created_at', u.created_at
  )
  into v_identity
  from auth.users u
  where u.id = v_user_id;

  if v_identity is null then
    raise exception 'ACCOUNT_NOT_FOUND';
  end if;

  select to_jsonb(p)
  into v_profile
  from (
    select
      display_name,
      plan,
      credits_remaining,
      monthly_credit_allowance,
      created_at,
      updated_at
    from public.profiles
    where user_id = v_user_id
  ) p;

  select coalesce(jsonb_agg(to_jsonb(s) order by s.created_at desc), '[]'::jsonb)
  into v_scans
  from (
    select
      id,
      document_name,
      source_name,
      credits_used,
      similarity_percent,
      status,
      original_file_retained,
      created_at
    from public.scans
    where user_id = v_user_id
  ) s;

  select coalesce(jsonb_agg(to_jsonb(f) order by f.created_at desc), '[]'::jsonb)
  into v_fingerprints
  from (
    select
      id,
      scan_id,
      document_hash,
      fingerprint_version,
      original_text_retained,
      created_at
    from public.submission_fingerprints
    where user_id = v_user_id
  ) f;

  select coalesce(jsonb_agg(to_jsonb(r) order by r.window_start desc), '[]'::jsonb)
  into v_rate_limits
  from (
    select
      action,
      window_start,
      request_count,
      updated_at
    from public.api_rate_limits
    where user_id = v_user_id
  ) r;

  return jsonb_build_object(
    'schema_version', 'averis-account-export-v1',
    'generated_at', now(),
    'identity', v_identity,
    'profile', coalesce(v_profile, 'null'::jsonb),
    'scans', v_scans,
    'submission_fingerprints', v_fingerprints,
    'api_rate_limits', v_rate_limits,
    'storage_note', 'Original uploaded assignment files are not retained by the beta flow.'
  );
end;
$$;

revoke all on function private.export_my_account_data_impl() from public, anon;
grant execute on function private.export_my_account_data_impl() to authenticated;

create or replace function public.export_my_account_data()
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.export_my_account_data_impl();
$$;

revoke all on function public.export_my_account_data() from public, anon;
grant execute on function public.export_my_account_data() to authenticated;

create or replace function private.delete_my_account_impl(p_confirmation text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if p_confirmation is distinct from 'DELETE MY ACCOUNT' then
    raise exception 'CONFIRMATION_REQUIRED';
  end if;

  delete from auth.users
  where id = v_user_id;

  if not found then
    raise exception 'ACCOUNT_NOT_FOUND';
  end if;

  return true;
end;
$$;

revoke all on function private.delete_my_account_impl(text) from public, anon;
grant execute on function private.delete_my_account_impl(text) to authenticated;

create or replace function public.delete_my_account(p_confirmation text)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.delete_my_account_impl(p_confirmation);
$$;

revoke all on function public.delete_my_account(text) from public, anon;
grant execute on function public.delete_my_account(text) to authenticated;

comment on function public.export_my_account_data() is
  'Returns an authenticated student export containing explicit Averis account/profile/scan/fingerprint/rate-limit fields only.';
comment on function public.delete_my_account(text) is
  'Deletes only the authenticated caller after the exact confirmation phrase. FK cascades remove Averis user-owned rows.';
