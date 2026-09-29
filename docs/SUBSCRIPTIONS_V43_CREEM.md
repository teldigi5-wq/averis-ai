# Averis v43 — Creem billing migration

Averis v43 migrates the optional subscription rail from Lemon Squeezy to Creem while preserving the existing student pricing, Supabase entitlement model, and fail-closed billing boundary.

## Release boundary

- Creem **Test Mode only** until checkout, signed webhooks, cancellation, renewal, portal access, retry idempotency, and entitlement downgrade are certified.
- `main`, PR #85, and PR #87 must not be merged as part of billing setup without explicit authorization.
- Averis never receives or stores PAN/CVV card details.
- `CREEM_API_KEY`, `CREEM_WEBHOOK_SECRET`, and `SUPABASE_SECRET_KEY` are server-only secrets. Never put them in GitHub, GitHub Pages, screenshots, chat messages, browser JavaScript, or any `NEXT_PUBLIC_*` variable.

## Pricing

| Averis plan | Price | Creem test product ID |
| --- | ---: | --- |
| Student Plus Monthly | USD 4.99 / month | `prod_4UCwnsKTZ4OpbFI7SsNS9u` |
| Student Plus Yearly | USD 49 / year | `prod_hiUEv6txc0ulZg8Gh8AXn` |
| Student Pro Monthly | USD 8.99 / month | `prod_2ZrvNf9IHJNhZbKlXTUARx` |
| Student Pro Yearly | USD 89 / year | `prod_ugF1SXkTkFf7ZYG4jQe3P` |

The extra test product `prod_5NZACBqAiPC7SkE3uQSmZ3` is an unused duplicate of Student Plus Monthly and must not be configured in Averis.

## Provider contract

- Test API: `https://test-api.creem.io`
- Production API: `https://api.creem.io`
- Authentication: server-only `x-api-key`
- Checkout creation: `POST /v1/checkouts`
- Customer portal: `POST /v1/customers/billing`
- Webhook signature header: `creem-signature`
- Signature algorithm: HMAC-SHA256 over the **raw** request body
- Access is granted from verified webhook state, never from the success redirect alone.
- Provider event IDs are required for state-changing webhook processing.

## Supabase migrations

Apply both v43 migrations before enabling billing:

1. `supabase/migrations/20260929233000_creem_billing_provider_v43.sql`
2. `supabase/migrations/20260929235500_creem_webhook_idempotency_v43.sql`

The provider migration:

- allows both legacy `lemon_squeezy` and new `creem` provider rows,
- changes the default provider for new rows to `creem`,
- adds `provider_product_id` for Creem product mapping,
- preserves the existing RLS/read-only student boundary.

The idempotency migration:

- creates server-only `public.billing_entitlement_events`, keyed by `(provider, event_id)`,
- enables RLS and grants no table access to `anon` or `authenticated`,
- creates `public.apply_billing_profile_event(...)`,
- records the Creem event and mutates the profile in one database transaction,
- returns without changing profile credits when the same event ID is delivered again,
- exposes RPC execution only to the server/service-role boundary.

This event ledger is required because Creem retries webhooks. A repeated `subscription.paid` or `checkout.completed` delivery must never refill credits after a student has already spent some of them.

## Azure App Service settings — Test Mode

Configure these on the API host only:

```text
BILLING_ENABLED=true
BILLING_PROVIDER=creem
CREEM_API_BASE_URL=https://test-api.creem.io
CREEM_API_KEY=<fresh Creem test API key>
CREEM_WEBHOOK_SECRET=<Creem test webhook secret>
CREEM_PRODUCT_STUDENT_MONTHLY=prod_4UCwnsKTZ4OpbFI7SsNS9u
CREEM_PRODUCT_STUDENT_YEARLY=prod_hiUEv6txc0ulZg8Gh8AXn
CREEM_PRODUCT_PRO_MONTHLY=prod_2ZrvNf9IHJNhZbKlXTUARx
CREEM_PRODUCT_PRO_YEARLY=prod_ugF1SXkTkFf7ZYG4jQe3P
BILLING_RETURN_URL=https://teldigi5-wq.github.io/averis-ai
SUPABASE_SECRET_KEY=<server-only Supabase secret key>
```

Keep the existing `SUPABASE_URL` and browser-safe Supabase publishable key configured for the API as well.

## Webhook

Public endpoint:

`https://averis-api-beta-db36dd7d.azurewebsites.net/api/v1/billing/webhook`

Subscribe to the Creem lifecycle events consumed by v43:

- `checkout.completed`
- `subscription.active`
- `subscription.paid`
- `subscription.scheduled_cancel`
- `subscription.canceled`
- `subscription.past_due`
- `subscription.unpaid`
- `subscription.expired`
- `subscription.update`
- `subscription.trialing`
- `subscription.paused`
- `refund.created`
- `dispute.created`

Behavior:

- `checkout.completed` is the primary purchase-linking event and requires one of the four canonical products plus server-created Averis metadata.
- `subscription.paid` may recover a missed checkout webhook and can establish/refresh a paid entitlement for a canonical product.
- synchronization-only events such as `subscription.active`, `subscription.update`, and `subscription.trialing` cannot establish a brand-new paid entitlement by themselves.
- plan/product changes outside the four canonical Creem product IDs fail closed and downgrade an existing linked subscription.
- `past_due`, `unpaid`, and `paused` states fail closed.
- scheduled/canceled subscriptions remain entitled only until their paid-through timestamp; after it passes, Averis persists a one-time downgrade to Free before further scan usage.
- `subscription.expired` alone does not revoke access because Creem can emit it during the payment-retry period; the object/provider status remains authoritative.
- a refunded canceled subscription is downgraded to Free.
- `dispute.created` fails closed and downgrades the affected linked subscription.
- every state-changing webhook profile mutation is keyed by Creem's event ID; duplicate deliveries do not refill or reapply credits.
- unknown Creem products never grant a paid Averis entitlement.

## Certification sequence

1. Keep `BILLING_ENABLED=false` until both Supabase migrations, a fresh test key, webhook secret, and four canonical product IDs are ready.
2. Apply both v43 Supabase migrations and verify RLS/privileges on the event ledger/RPC.
3. Rotate any test API key that has been exposed outside the secret store.
4. Configure the Azure server-only values above.
5. Register the signed Creem Test Mode webhook for the complete event list above.
6. Restart the Azure API.
7. Verify authenticated `GET /api/v1/billing/status` reports billing enabled while a new account remains Free.
8. Start Student Plus Monthly checkout from Averis and complete it with Creem's successful test card.
9. Confirm `checkout.completed` / `subscription.paid` update the `subscriptions` row and profile entitlement.
10. Confirm an invalid `creem-signature` returns HTTP 401.
11. Replay the same valid provider event ID and confirm credits do not change a second time.
12. Confirm customer portal generation works for the stored Creem customer.
13. Confirm scheduled cancellation remains paid only through `current_period_end_date` and then persists a Free downgrade.
14. Confirm `past_due`, `unpaid`, and `paused` fail closed and a later canonical `subscription.paid` restores the mapped plan.
15. Confirm a switch to an unknown/unconfigured product fails closed.
16. Confirm `dispute.created` and a canceled refund revoke the linked paid entitlement.
17. Only after the complete Test Mode checklist is green should a separate production/live promotion be considered.

## Test cards

Use only Creem Test Mode cards during certification:

- Success: `4111 1111 1111 1111`
- Declined: `4507 9900 0000 0028`
- Insufficient funds: `4507 9900 0000 0010`

Do not use real card details while the integration is under test certification.
