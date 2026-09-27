# Reference-linked Revision v4 certification checklist

- [ ] API tests green, including author-year linkage, numeric linkage, DOI metadata attachment, Crossref outage fallback, and revision-route behavior.
- [ ] Security gate green.
- [ ] API container build and smoke test green.
- [ ] Web typecheck and production build green.
- [ ] Signed-in visual QA covers bibliography input, linked/unresolved markers, local-only references, and Crossref-verified DOI metadata.
- [ ] No changes to scan credits, primary similarity score, Supabase schema, original-upload retention, or CORS policy.
- [ ] `main` remains untouched until an explicit merge decision.
