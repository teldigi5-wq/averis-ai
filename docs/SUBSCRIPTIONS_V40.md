# Averis v40 subscriptions

Averis v40 adds an optional paid subscription rail without collecting card data in the Averis web application.

## Pricing displayed in Averis

| Plan | Monthly | Yearly | Monthly scan allowance |
| --- | ---: | ---: | ---: |
| Free | $0 / Rs. 0 | $0 / Rs. 0 | 5 |
| Student Plus | $4.99 / approx. Rs. 1,490 | $49 / approx. Rs. 14,900 | 50 |
| Student Pro | $8.99 / approx. Rs. 2,690 | $89 / approx. Rs. 26,900 | 200 |

The USD values are the intended provider variant prices. The LKR values are student-facing localized reference prices; the hosted checkout is authoritative and must show the final amount before the student pays.

## Why Lemon Squeezy

The integration is designed for Lemon Squeezy because it can be started with no monthly platform charge, supports subscriptions and Sri Lankan merchants/currencies, and hosts the card checkout. Transaction/payout fees still apply. Averis never receives or stores PAN/CVV card details.

## Required launch order

1. Apply `supabase/migrations/20260929102000_subscription_entitlements_v40.sql`.
2. Create one subscription product with four variants in the merchant dashboard:
   - Student Plus monthly: USD 4.99
   - Student Plus yearly: USD 49
   - Student Pro monthly: USD 8.99
   - Student Pro yearly: USD 89
3. Create a webhook pointing to:
   `https://averis-api-beta-db36dd7d.azurewebsites.net/api/v1/billing/webhook`
4. Subscribe at minimum to:
   - `subscription_created`
   - `subscription_updated`
   - `subscription_payment_success`
   - `subscription_expired`
5. Configure these **Azure App Service server-only settings**:

```text
BILLING_ENABLED=true
LEMON_SQUEEZY_API_KEY=<server secret>
LEMON_SQUEEZY_WEBHOOK_SECRET=<server secret>
LEMON_SQUEEZY_STORE_ID=<store id>
BILLING_VARIANT_STUDENT_MONTHLY=<variant id>
BILLING_VARIANT_STUDENT_YEARLY=<variant id>
BILLING_VARIANT_PRO_MONTHLY=<variant id>
BILLING_VARIANT_PRO_YEARLY=<variant id>
BILLING_RETURN_URL=https://teldigi5-wq.github.io/averis-ai
SUPABASE_SECRET_KEY=<server-only Supabase secret/service key>
```

Never place any of those values in `NEXT_PUBLIC_*`, GitHub Pages, repository files, screenshots, or chat messages.

6. Restart the Azure API.
7. Verify `/api/v1/billing/status` while authenticated.
8. Use the payment provider's test mode first. Confirm a valid signed webhook upgrades the profile and an invalid signature returns 401.
9. Verify cancellation/expiry moves the user back to the free entitlement.
10. Only then enable live-mode variants.

## Security model

- Checkout creation requires an authenticated Averis session.
- User ID is passed as provider custom data from the server-created checkout.
- Subscription state is accepted only from a webhook whose raw body passes HMAC-SHA256 `X-Signature` verification.
- The browser has read-only access to its own subscription row through Supabase RLS.
- Subscription/profile writes require the server-only Supabase secret key.
- Cloud AI becomes a server-verified Student Plus/Pro entitlement only after `BILLING_ENABLED=true` and the billing configuration is complete.
- During the existing free beta, billing remains disabled and current Cloud AI behavior is unchanged.
- No card number or CVV is posted to Averis.

## HTML / frontend security

Client HTML and JavaScript cannot be cryptographically hidden because a browser must receive them to render the site. Averis instead keeps privileged material out of the browser bundle, explicitly disables production browser source maps, scans tracked files for privileged credentials, scans the exported release bundle, and keeps sensitive authorization decisions on the API/database side.
