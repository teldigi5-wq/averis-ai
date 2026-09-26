-- Averis M2 semantic/source intelligence storage foundation.
-- This migration stores derived fingerprints and source metadata, not original student uploads.

create schema if not exists extensions;
create extension if not exists vector with schema extensions;

create table if not exists public.source_catalog (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('crossref', 'openalex', 'manual', 'institution')),
  external_id text not null,
  doi text,
  title text not null,
  url text,
  published_year integer check (published_year between 1000 and 9999),
  authors jsonb not null default '[]'::jsonb check (jsonb_typeof(authors) = 'array'),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, external_id)
);

create unique index if not exists source_catalog_doi_uidx
  on public.source_catalog (doi)
  where doi is not null;

create table if not exists public.source_chunks (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.source_catalog(id) on delete cascade,
  ordinal integer not null check (ordinal >= 0),
  text_hash text not null check (text_hash ~ '^[0-9a-f]{64}$'),
  minhash_signature jsonb not null default '[]'::jsonb check (jsonb_typeof(minhash_signature) = 'array'),
  embedding extensions.vector(1024),
  embedding_model text,
  fingerprint_version text not null default 'minhash64-v1',
  original_text_retained boolean not null default false check (original_text_retained = false),
  created_at timestamptz not null default now(),
  unique (source_id, ordinal)
);

create index if not exists source_chunks_source_idx
  on public.source_chunks (source_id, ordinal);

create table if not exists public.submission_fingerprints (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null unique references public.scans(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  document_hash text not null check (document_hash ~ '^[0-9a-f]{64}$'),
  minhash_signature jsonb not null default '[]'::jsonb check (jsonb_typeof(minhash_signature) = 'array'),
  fingerprint_version text not null default 'minhash64-v1',
  original_text_retained boolean not null default false check (original_text_retained = false),
  created_at timestamptz not null default now()
);

create index if not exists submission_fingerprints_user_created_idx
  on public.submission_fingerprints (user_id, created_at desc);

alter table public.source_catalog enable row level security;
alter table public.source_chunks enable row level security;
alter table public.submission_fingerprints enable row level security;

-- Source metadata is safe for signed-in students to read. Chunk fingerprints and
-- vectors stay server-only so the corpus cannot be bulk-extracted through the browser.
revoke all on table public.source_catalog from anon, authenticated;
revoke all on table public.source_chunks from anon, authenticated;
revoke all on table public.submission_fingerprints from anon, authenticated;
grant select on table public.source_catalog to authenticated;
grant select, delete on table public.submission_fingerprints to authenticated;

drop policy if exists "source_catalog_select_authenticated" on public.source_catalog;
create policy "source_catalog_select_authenticated"
  on public.source_catalog for select
  to authenticated
  using ((select auth.uid()) is not null);

drop policy if exists "submission_fingerprints_select_own" on public.submission_fingerprints;
create policy "submission_fingerprints_select_own"
  on public.submission_fingerprints for select
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "submission_fingerprints_delete_own" on public.submission_fingerprints;
create policy "submission_fingerprints_delete_own"
  on public.submission_fingerprints for delete
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

comment on table public.source_catalog is
  'Normalized scholarly/source metadata. No copyrighted full-text corpus is stored here.';
comment on table public.source_chunks is
  'Server-only derived chunk fingerprints and future BGE-M3 vectors; original chunk text is not retained.';
comment on table public.submission_fingerprints is
  'Per-scan derived fingerprints for future self/corpus matching. Deleting the parent scan cascades deletion.';
