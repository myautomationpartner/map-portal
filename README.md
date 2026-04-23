# MAP Portal Template

React 19 + Vite multi-tenant client portal template for My Automation Partner. The app uses Supabase for auth and data access, deployed Supabase Edge Functions for signed document workflows, and Cloudflare Workers for static hosting.

## Local Development

1. Install dependencies:

```bash
npm install
```

2. Create a local env file from `.env.example` and set the public browser values:

```bash
cp .env.example .env.local
```

Required values:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Optional:
- `VITE_N8N_BASE_URL`
- `VITE_PORTAL_DISPLAY_NAME`
- `VITE_PORTAL_LABEL`
- `VITE_PORTAL_SUPPORT_EMAIL`
- `VITE_PORTAL_LOGO_URL`
- `VITE_PORTAL_CANONICAL_HOST`
- `VITE_PORTAL_WORKER_NAME`

Worker/runtime env for domain cutover:
- `PORTAL_CANONICAL_HOST`

3. Start the app:

```bash
npm run dev
```

4. Verify production build:

```bash
npm run build
npm run preview
```

## Production Build

This is a Vite SPA, so the public Supabase values must be present at build time.

```bash
NEXT_PUBLIC_SUPABASE_URL=... \
NEXT_PUBLIC_SUPABASE_ANON_KEY=... \
npm run build
```

## Deploy

Cloudflare Worker config lives in `wrangler.toml`.

```bash
npm run build
npx wrangler deploy
```

Current pilot worker:
- `dancescapes-portal`

Recommended MAP-managed production pattern:
- `<client-slug>.portal.myautomationpartner.com`

Current cutover behavior:
- if `PORTAL_CANONICAL_HOST` is set on the worker, non-API `GET`/`HEAD` requests hitting the technical `*.workers.dev` or `*.pages.dev` host will redirect to the canonical MAP-owned host
- API routes stay on the technical host so internal webhook/proxy paths are not broken during rollout
- document share links now prefer the tenant canonical host when one is configured

## Provision A New Client Portal

The shared template now includes a real provisioning helper that automates the current per-client worker model.

```bash
npm run provision:client -- --client-slug dancescapes-performing-arts --dry-run
```

Live deploy:

```bash
npm run provision:client -- --client-slug dancescapes-performing-arts
```

What it does:
- loads the client row from Supabase
- builds the SPA with tenant branding/canonical-host env
- deploys a dedicated Cloudflare Worker with the MAP-managed custom domain
- preserves existing worker vars/secrets while updating the current runtime secret set
- optionally registers and tests the Zernio account-events webhook
- mirrors deployment state back into onboarding tables when a matching signup/run exists

Required runtime inputs:
- `CLOUDFLARE_API_TOKEN`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_URL`

Optional but recommended:
- `CLOUDFLARE_ACCOUNT_ID`
- `ZERNIO_WEBHOOK_SECRET`
- `N8N_BASE_URL`
- `PORTAL_WEBHOOK_BASE_URL`

Notes:
- `SUPABASE_ANON_KEY` can come from env, Supabase secrets naming, or the repo fallback constant in `src/lib/supabase.js`.
- If `ZERNIO_WEBHOOK_SECRET` is unavailable, the script still deploys the portal but leaves the onboarding run in follow-up mode because the signed Settings webhook cannot be registered safely for a brand-new worker.
- Use `--skip-webhook-config` if you want to deploy first and wire Zernio later.

## Notes

- Auth/session is handled entirely in the browser with Supabase Auth.
- Document preview/upload/share flows rely on live Edge Functions instead of duplicating signing logic in the frontend.
- The app is a SPA and depends on Worker asset routing for deep links like `/documents` and `/share/:token`.
- Customer-facing branding, support contact, and canonical host should come from runtime/provisioning config, not hardcoded client literals.
