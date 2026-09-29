-- Averis v43 Creem billing provider migration.
-- Keeps the legacy Lemon Squeezy rows readable while new writes use Creem.

alter table public.subscriptions
  drop constraint if exists subscriptions_provider_check;

alter table public.subscriptions
  alter column provider set default 'creem';

alter table public.subscriptions
  add constraint subscriptions_provider_check
  check (provider in ('lemon_squeezy', 'creem'));

alter table public.subscriptions
  add column if not exists provider_product_id text;

comment on column public.subscriptions.provider_product_id is
  'Provider product identifier used for entitlement mapping. Creem uses product IDs directly.';
