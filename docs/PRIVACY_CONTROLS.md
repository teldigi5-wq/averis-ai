# Account privacy controls

Averis provides self-service account portability and deletion for the student beta without introducing a service-role secret into the browser or API.

## Export

`public.export_my_account_data()` is an authenticated, security-invoker wrapper around a private security-definer function. The private function resolves `auth.uid()` and returns only explicit fields for that user:

- authentication identity: user ID, email, account creation time
- profile: display name, plan, credits, allowance, timestamps
- scan metadata: document/source names, similarity percentage, credit usage, status, retention flag, timestamps
- derived submission fingerprints: hashes/version metadata only, never original submission text
- per-user API rate-limit counters

The web app converts the returned JSON to a local browser download. Averis does not upload or persist the export file.

## Account deletion

`public.delete_my_account(text)` delegates to a private security-definer function that:

1. requires an authenticated caller
2. requires the exact phrase `DELETE MY ACCOUNT`
3. deletes only the `auth.users` row whose ID equals `auth.uid()`

Existing foreign keys use `ON DELETE CASCADE`, so the profile, scans, derived submission fingerprints, and API rate-limit counters are removed with the account. Shared scholarly source catalog records are not user-owned and are not deleted.

## Privacy boundary

Original uploaded student documents are not retained in the current beta flow, so there is no stored original assignment file to include in export or deletion.

A deleted user may later create a new account and receive whatever onboarding allowance is then active. Averis intentionally does not retain a hidden email tombstone in this beta solely to prevent free-credit recreation; future paid anti-abuse controls must be designed explicitly and disclosed rather than weakening the meaning of account deletion.
