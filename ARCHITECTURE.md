# Dancescapes Portal — Architecture & Working Guide

> **Current technical URL:** https://dancescapes-portal.kennymonico.workers.dev  
> **Recommended customer-facing URL:** https://dancescapes.portal.myautomationpartner.com  
> **GitHub:** https://github.com/myautomationpartner/map-portal  
> **Local folder:** `~/Desktop/Dancescapes Portal/MAP-PORTAL/`

---

## What It Is

A private client portal for Dancescapes (a dance studio). It gives the studio owner a single dashboard to monitor social media performance, publish content to multiple platforms, manage their inbox, and configure account settings. It's a multi-page React app deployed as a Cloudflare Worker (SPA).

---

## Tech Stack

| Layer | Technology |
|---|---|
| UI Framework | React 19 |
| Build Tool | Vite 8 |
| Styling | Tailwind CSS v4 (via `@tailwindcss/vite` plugin) |
| Routing | React Router v7 |
| Data Fetching | TanStack Query v5 |
| Charts | Recharts |
| Icons | Lucide React |
| Auth + Database | Supabase |
| Automation | n8n (self-hosted at `n8n.myautomationpartner.com`) |
| Media Storage | Cloudflare R2 |
| Social OAuth | Zernio |
| Deployment | Cloudflare Workers (via Wrangler) |

---

## Project Structure

```
MAP-PORTAL/
├── src/
│   ├── main.jsx              # React entry point
│   ├── App.jsx               # Router, auth guard, layout shell
│   ├── index.css             # Global Tailwind styles
│   ├── App.css               # App-level styles
│   ├── lib/
│   │   └── supabase.js       # Supabase client (reads env vars)
│   ├── components/
│   │   ├── Sidebar.jsx       # Desktop left nav
│   │   └── BottomNav.jsx     # Mobile bottom tab bar
│   └── pages/
│       ├── Login.jsx         # Auth page
│       ├── Dashboard.jsx     # KPI cards + follower growth chart
│       ├── Inbox.jsx         # Tidio communications hub
│       ├── CreatePost.jsx    # Social media publisher
│       ├── PostHistory.jsx   # Past posts log
│       └── Settings.jsx      # Account + social connections
├── public/
│   ├── favicon.svg
│   ├── icons.svg
│   └── privacy.html          # Meta App compliance privacy policy
├── index.html                # Vite HTML entry
├── vite.config.js            # Vite + Tailwind + React plugins
├── wrangler.toml             # Cloudflare Worker config
├── package.json
└── .gitignore
```

---

## Pages & Routes

| Route | Page | What it does |
|---|---|---|
| `/login` | Login | Supabase email/password auth. Redirects to `/` if already logged in. |
| `/` | Dashboard | Shows KPI cards (Instagram, Facebook, Google, TikTok followers), website analytics (page views, unique visitors), and a 30-day follower growth line chart. |
| `/inbox` | Inbox | Launches Tidio live chat panel. Desktop opens Tidio web panel; mobile deep-links to Tidio app with App Store/Play Store fallback. |
| `/post` | Create Post | Social media publisher. Write content, attach media, choose platforms (Facebook, Instagram, Google Business, TikTok), post now or schedule. |
| `/post/history` | Post History | Log of all published, scheduled, and failed posts. |
| `/settings` | Settings | Account info, business profile, social media connections (Zernio OAuth), and password change. |

---

## Auth Flow

1. User lands on `/login`, enters email + password.
2. Supabase Auth validates credentials.
3. On success, `App.jsx`'s `AuthProvider` sets the session.
4. `ProtectedLayout` wraps all authenticated routes — unauthenticated requests redirect to `/login`.
5. Session is passed via React Router's `useOutletContext` to every page.

---

## Data Architecture (Supabase)

All data is fetched via the Supabase JS client using TanStack Query (5-minute cache, 1 retry).

### Tables

| Table | Purpose |
|---|---|
| `users` | Portal user accounts. Has `client_id` FK linking to `clients`. |
| `clients` | Studio/business info: `business_name`, `contact_email`, `website_url`, `tidio_project_url`. |
| `daily_metrics` | One row per day per platform. Columns: `client_id`, `platform`, `metric_date`, `followers`, `reach`, `engagement_rate`. |
| `website_analytics` | Daily website stats: `client_id`, `recorded_date`, `page_views`, `unique_visitors`. |
| `posts` | Social posts: `client_id`, `content`, `media_url`, `platforms[]`, `status`, `scheduled_for`, `published_at`, `n8n_execution_id`. |
| `social_connections` | Zernio OAuth connections: `client_id`, `platform`, `zernio_account_id`, `username`, `connected_at`. |

### Key Data Query Pattern
Every page fetches the user's profile first (`users` → `clients`), then uses `profile.client_id` to scope all subsequent queries.

---

## Automation Layer (n8n)

n8n runs at `https://n8n.myautomationpartner.com` and handles everything that requires server-side execution. The portal calls n8n webhooks; n8n handles the actual platform APIs.

| Webhook | Method | What it does |
|---|---|---|
| `/webhook/social-publish` | POST | Publishes or schedules a post to selected social platforms via Zernio. Returns `{ success, zernioPostId }`. |
| `/webhook/r2-upload` | POST (multipart) | Accepts an image file, uploads it to Cloudflare R2, returns `{ publicUrl }`. |
| `/webhook/zernio-connect-url` | POST | Returns an OAuth URL to connect a social platform via Zernio. |
| `/webhook/zernio-sync-accounts` | POST | Syncs connected Zernio accounts to `social_connections` table in Supabase. Returns `{ success, synced }`. |

**Important:** n8n always returns HTTP 200, even on failure. Check `response.success !== false` to determine the real outcome.

---

## Social Publishing Flow

```
User fills out CreatePost form
        ↓
(if image) POST to /webhook/r2-upload → Cloudflare R2 → returns publicUrl
        ↓
Insert post to Supabase posts table (status: "draft")
        ↓
POST to /webhook/social-publish with { postId, clientId, content, mediaUrl, platforms, scheduledFor }
        ↓
n8n calls Zernio API → posts to Facebook / Instagram / Google / TikTok
        ↓
Update post status in Supabase: "published" | "scheduled" | "failed"
```

---

## Deployment

### Build & Deploy to Cloudflare

```bash
# 1. Install deps (first time only)
npm install

# 2. Build the React app
npm run build
# → outputs to ./dist/

# 3. Deploy to Cloudflare Worker
npx wrangler deploy
# → deploys to: dancescapes-portal.kennymonico.workers.dev
```

The `wrangler.toml` configures:
- Worker name: `dancescapes-portal`
- Assets dir: `./dist`
- SPA mode: all 404s rewrite to `/index.html` (required for React Router)

Recommended worker env for MAP-owned cutover:
```bash
npx wrangler secret put PORTAL_CANONICAL_HOST
# value: dancescapes.portal.myautomationpartner.com
```

With `PORTAL_CANONICAL_HOST` set, non-API browser requests hitting the technical host can be redirected to the MAP-owned customer-facing host while `/api/*` routes continue to work on the technical host during transition.

### Environment Variables

The app needs two env vars. Create a `.env.local` file in MAP-PORTAL (never commit this):

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_N8N_BASE_URL=https://n8n.myautomationpartner.com
```

> `VITE_N8N_BASE_URL` defaults to `https://n8n.myautomationpartner.com` if not set.  
> Supabase credentials are required — the app will not function without them.

For Cloudflare Worker deployment, set these as Worker secrets via the Cloudflare dashboard or:
```bash
npx wrangler secret put VITE_SUPABASE_URL
npx wrangler secret put VITE_SUPABASE_ANON_KEY
```

---

## Local Development

```bash
# Start Vite dev server with hot reload
npm run dev
# → http://localhost:5173

# Lint
npm run lint

# Preview production build locally
npm run build && npm run preview
```

---

## Git Workflow

```bash
# 1. Make changes to src/ files

# 2. Test locally
npm run dev

# 3. Build to confirm no errors
npm run build

# 4. Commit and push to GitHub
git add .
git commit -m "feat: description of what changed"
git push origin main

# 5. Deploy to Cloudflare
npx wrangler deploy
```

> **Rule:** Always build before committing — a broken build means a broken deployment.

---

## Repository

- **GitHub:** https://github.com/myautomationpartner/map-portal
- **Branch:** `main` (single branch, deploy directly from main)
- **Note:** The old `dancescapes-portal` GitHub repo contains the legacy plain-HTML prototype. It is no longer used. This React app (`map-portal`) is the production codebase.

---

## Dropbox Chooser Integration

The Publish page (`CreatePost.jsx`) lets users attach files directly from their Dropbox accounts using the Dropbox Chooser widget. Files are **never uploaded to the server** — they are passed as preview links through the publishing pipeline.

### Module

All Dropbox logic lives in `src/lib/dropboxApi.js`. It lazily injects the Dropbox dropin script at runtime (no changes to `index.html` needed) and exports one function:

```js
import { openDropboxChooser } from '../lib/dropboxApi'

const files = await openDropboxChooser({ multiselect: true, linkType: 'preview' })
// files: [{ name, size, link, thumbnail }]
// resolves with [] on cancel — not an error
```

Accepted file types: `.jpg`, `.jpeg`, `.png`, `.mp4`, `.pdf`, `.docx`

### Publishing pipeline changes

The n8n `/webhook/social-publish` payload now includes a `dropboxLinks` array:

```json
{
  "mediaUrl": "<R2 URL or null>",
  "dropboxLinks": [{ "name": "hero.jpg", "link": "https://...", "size": 204800 }]
}
```

`media_url` in Supabase stores the R2 URL if a local file was uploaded, or falls back to the first Dropbox link if no local file was attached.

---

## External Services Summary

| Service | Role | Access |
|---|---|---|
| Supabase | Database + Auth | Supabase dashboard |
| n8n | Automation workflows | https://n8n.myautomationpartner.com |
| Cloudflare | Worker hosting + R2 storage | Cloudflare dashboard |
| Zernio | Social media OAuth + posting API | Zernio dashboard |
| Tidio | Live chat inbox | https://www.tidio.com |
| Dropbox | File Chooser for post attachments (link-based, no upload) | https://www.dropbox.com/developers/apps |
