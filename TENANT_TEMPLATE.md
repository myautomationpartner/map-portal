# MAP Portal Tenant Template

Last updated: 2026-04-23

## Purpose
This document defines the reusable tenant-config shape for the shared MAP portal platform.

## Runtime Config In The Portal App
These values are safe to expose to the client bundle and can come from build-time env or a future DB-backed tenant-config fetch:

- `displayName`
- `portalLabel`
- `supportEmail`
- `logoUrl`
- `canonicalHost`
- `workerName`
- `theme`
- `clientSlug`
- `billingStatus`
- `billingPortalUrl`
- `billingCheckoutUrl`

Current client-bundle env hooks:

- `VITE_PORTAL_DISPLAY_NAME`
- `VITE_PORTAL_LABEL`
- `VITE_PORTAL_SUPPORT_EMAIL`
- `VITE_PORTAL_LOGO_URL`
- `VITE_PORTAL_CANONICAL_HOST`
- `VITE_PORTAL_WORKER_NAME`
- `VITE_PORTAL_BILLING_STATUS`
- `VITE_PORTAL_BILLING_PORTAL_URL`
- `VITE_PORTAL_BILLING_CHECKOUT_URL`

## Worker Secrets / Server-Only Values
These stay in Worker secrets or server-side infrastructure:

- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_URL`
- `PORTAL_CLIENT_ID`
- `PORTAL_CANONICAL_HOST`
- `ZERNIO_WEBHOOK_SECRET`
- Dropbox refresh-token secrets

## DB / Provisioning Outputs
The onboarding pipeline should ultimately provision and store:

- `client_id`
- `client_slug`
- `portal_subdomain`
- `portal_domain`
- `worker_name`
- `branding_status`
- `brand_colors`
- `logo_upload_url` or resolved logo asset URL
- future billing/runtime access values:
  - `billing_status`
  - `billing_portal_url`
  - `billing_checkout_url`

These align with the live onboarding DB contract in:

- `db-agent/ONBOARDING_CONTRACT.md`

## Domain Strategy
Recommended MAP-managed default:

- `<client-slug>.portal.myautomationpartner.com`

Why this shape:

- simpler wildcard DNS and certificate management than `portal.<client-slug>.myautomationpartner.com`
- avoids personal `workers.dev` hostnames in customer-facing URLs
- stays compatible with a shared platform plus per-tenant runtime config

Custom domains can be layered later as an optional path without changing the shared portal codebase.

## Canonical Redirect Behavior
When a worker is still reachable on a technical host such as `*.workers.dev`, set:

- `PORTAL_CANONICAL_HOST=<client-slug>.portal.myautomationpartner.com`

Current shared-worker behavior:
- non-API `GET` / `HEAD` requests on technical hosts redirect to `https://<client-slug>.portal.myautomationpartner.com`
- `/api/*` routes stay on the technical host so signed webhook/proxy integrations are not interrupted during cutover
- share-link generation in the portal app prefers the canonical host when present

## Billing Hold Template Behavior
The shared portal template now supports a platform-level billing-hold mode for future customers.

Recommended first enforcement model:
- `trial_active` = normal portal access
- `trial_expiring` = normal portal access plus the day-25 billing warning CTA
- `payment_method_needed` = read-only portal access plus unlock CTA
- `active_paid` = normal portal access
- `past_due` = warning or read-only based on MAP policy
- `suspended` = harder recovery state after MAP proves the lifecycle

Current template behavior:
- the app shell can render a shared billing banner and CTA
- the sidebar and mobile nav can expose a shared billing action
- the first major write surfaces now block changes in read-only billing hold
- login and read-only workspace review remain available

Current implementation note:
- the template is future-safe for `billing_status`, `billing_portal_url`, and `billing_checkout_url`
- the preferred runtime pattern is authenticated on-demand Checkout / Billing Portal session creation, with stored billing URLs treated as optional fallback values rather than the primary unlock mechanism
- real Stripe-managed unlock/payment URLs still need to be provided by provisioning or billing workflows
