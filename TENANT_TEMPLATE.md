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

These runtime fields now also have a live home on `public.clients`:

- `support_email`
- `portal_subdomain`
- `portal_domain`
- `worker_name`

That means future portal runtime reads do not need to depend only on onboarding metadata once provisioning persists the final tenant state.

## Domain Strategy
Recommended MAP-managed default:

- `<client-slug>.myautomationpartner.com`

Current exception handling:

- older pilot and QA tenants can keep a legacy `*.portal.myautomationpartner.com` hostname until they are migrated
- Dancescapes remains the known live exception because the cleaner root subdomain was not available during the first cutover

Custom domains can be layered later as an optional path without changing the shared portal codebase.

## Canonical Redirect Behavior
MAP-managed tenant workers currently keep `workers_dev = true` so the technical host remains available as a fallback while the MAP-owned custom domain stays official.

If a worker is ever temporarily reachable on a technical host such as `*.workers.dev`, set:

- `PORTAL_CANONICAL_HOST=<client-slug>.myautomationpartner.com`

Current shared-worker behavior:
- non-API `GET` / `HEAD` requests on technical hosts redirect to `https://<client-slug>.myautomationpartner.com`
- the app shell also performs an immediate browser redirect so technical-host visits do not linger on the wrong hostname even if edge caching serves HTML first
- `/api/*` routes stay on the technical host so signed webhook/proxy integrations are not interrupted during temporary debugging
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

## Workspace Defaults And Persistence
The shared portal template now supports durable dashboard workspace preferences so customer launcher settings survive template deploys.

Current runtime pattern:
- launcher defaults can be derived from tenant data such as `website_url` and future client-specific tool URLs
- user-customized launcher state is stored in `public.portal_workspace_preferences`
- local browser storage remains a fallback path if the DB write fails or the preference row does not exist yet

Provisioning decision still open:
- onboarding can pre-seed starter workspace rows for each first admin user
- or the template can continue creating them lazily on first dashboard save

## Current Deployment Automation
The shared template now has a concrete provisioning helper for the current per-client worker model:

- script: `portal-app/scripts/provision-client-portal.mjs`
- npm entrypoint: `npm run provision:client -- --client-slug <slug>`

Current automation coverage:
- fetches the tenant runtime row from `public.clients`
- provisions/reuses the tenant Chatwoot account, customer agent, Website Chat inbox, Social Inbox API inbox, and inbox memberships during non-dry-run onboarding deploys
- builds the portal with tenant-facing branding env
- deploys a dedicated Cloudflare Worker named from `worker_name`
- attaches the MAP-managed custom domain from `portal_domain`
- uploads/refreshes the current worker secret set
- injects the tenant-specific Chatwoot account id, social inbox id, and webhook bridge secret into the Worker secret set
- can register the Zernio account-events webhook through the live n8n helper
- can mirror deployment completion/follow-up state back into onboarding tables
- sends/requests the customer's Chatwoot password reset after Chatwoot tenant provisioning

Current limitation:
- Chatwoot automation requires a MAP-owned `CHATWOOT_PLATFORM_API_ACCESS_TOKEN` plus the MAP operator user id before live provisioning can create accounts/users in production
- brand-new worker provisioning now expects one MAP-level `ZERNIO_WEBHOOK_SECRET` to be available to the provisioning helper at deploy time
- the current durable source on the operator machine is the macOS Keychain service `MAP_ZERNIO_WEBHOOK_SECRET` (with `ZERNIO_WEBHOOK_SECRET` as a legacy alias), and the helper also accepts env / `credential.txt` overrides when needed
- if the secret is truly missing, the portal can still be deployed, but onboarding should remain in follow-up mode until the signed webhook secret is added and the Zernio helper is run
