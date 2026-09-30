-- v47 follow-up: trigger helper is internal-only and must not be exposed as RPC.
revoke all on function public.guard_creem_subscription_entitlement()
  from public, anon, authenticated;
grant execute on function public.guard_creem_subscription_entitlement()
  to service_role;
