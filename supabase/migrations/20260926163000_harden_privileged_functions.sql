-- Move privileged Supabase functions out of the exposed public schema.
-- The public credit RPC remains SECURITY INVOKER and delegates to a private implementation.

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, display_name)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'display_name',
      split_part(coalesce(new.email, ''), '@', 1)
    )
  )
  on conflict (user_id) do nothing;

  return new;
end;
$$;

revoke all on function private.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

drop function if exists public.handle_new_user();

create or replace function private.consume_scan_credit_impl(
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
  )
  returning id into v_scan_id;

  return query
  select v_scan_id, v_remaining;
end;
$$;

revoke all on function private.consume_scan_credit_impl(text, text, numeric)
  from public, anon;
grant execute on function private.consume_scan_credit_impl(text, text, numeric)
  to authenticated;

create or replace function public.consume_scan_credit(
  p_document_name text,
  p_source_name text,
  p_similarity_percent numeric
)
returns table (scan_id uuid, credits_remaining integer)
language sql
security invoker
set search_path = ''
as $$
  select *
  from private.consume_scan_credit_impl(
    p_document_name,
    p_source_name,
    p_similarity_percent
  );
$$;

revoke all on function public.consume_scan_credit(text, text, numeric)
  from public, anon;
grant execute on function public.consume_scan_credit(text, text, numeric)
  to authenticated;
