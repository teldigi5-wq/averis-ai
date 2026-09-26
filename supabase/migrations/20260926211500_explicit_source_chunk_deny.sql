-- Make the server-only source chunk boundary explicit for database advisors.
-- Browser roles still have no table privileges; this deny-all policy documents
-- and enforces that no anon/authenticated row access is permitted.

drop policy if exists "source_chunks_deny_client_access" on public.source_chunks;
create policy "source_chunks_deny_client_access"
  on public.source_chunks
  for all
  to anon, authenticated
  using (false)
  with check (false);
