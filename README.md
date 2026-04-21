# Dancescapes Portal

React 19 + Vite client portal for Dancescapes. The app uses Supabase for auth and data access, deployed Supabase Edge Functions for signed document workflows, and Cloudflare Workers for static hosting.

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

Configured worker:
- `dancescapes-portal`

Configured custom domain:
- `dancescapesportal.myautomationpartner.com`

## Notes

- Auth/session is handled entirely in the browser with Supabase Auth.
- Document preview/upload/share flows rely on live Edge Functions instead of duplicating signing logic in the frontend.
- The app is a SPA and depends on Worker asset routing for deep links like `/documents` and `/share/:token`.
