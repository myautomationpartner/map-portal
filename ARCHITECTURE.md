# MAP Portal — Architecture & Working Guide

> **Default customer URL:** `https://myautomationpartner.com/portal/<client-slug>`  
> **Legacy/dedicated customer URL pattern:** `<client-slug>.portal.myautomationpartner.com` only when explicitly approved  
> **GitHub:** https://github.com/myautomationpartner/map-portal  
> **Local folder:** `/Users/kennymonico/Documents/MyAutomationPartner/map-portal/portal-app`

## What It Is

The MAP Portal is the shared customer portal for My Automation Partner. It gives each customer one authenticated workspace for Today, Files, Publisher, Campaign Partner, Inbox/My Partner, billing/setup, and social-channel operations.

The portal is a multi-tenant React app deployed through Cloudflare Workers. Customer business data, brand context, website context, social connections, and training inputs personalize recommendations and support context, but they do not create a separate customer-specific app fork.

## Current Tenant Model

Default launch tenants use the shared path model:

```text
https://myautomationpartner.com/portal/<client-slug>
```

Dedicated per-customer Workers/domains remain supported for legacy, premium, or explicitly approved custom-domain cases. Dancescapes was the first pilot and is now reset-pending; do not use old Dancescapes-specific URLs, worker names, or screenshots as the current onboarding model.

## Tech Stack

| Layer                | Technology                                        |
| -------------------- | ------------------------------------------------- |
| UI Framework         | React 19                                          |
| Build Tool           | Vite                                              |
| Styling              | Tailwind CSS v4                                   |
| Routing              | React Router                                      |
| Data Fetching        | TanStack Query                                    |
| Charts               | Recharts                                          |
| Icons                | Lucide React                                      |
| Auth + Database      | Supabase                                          |
| Automation           | n8n                                               |
| File Storage         | Supabase Storage: `documents`, `secure-documents` |
| Social Integration   | Zernio                                            |
| Inbox/Support Engine | Chatwoot behind MAP portal UX                     |
| Deployment           | Cloudflare Workers                                |

## Core Routes

| Route        | Purpose                                               |
| ------------ | ----------------------------------------------------- |
| `/login`     | Customer sign-in and setup completion entry.          |
| `/`          | Today / priority queue for same-day work.             |
| `/dashboard` | Dashboard and customer workspace overview.            |
| `/documents` | Files/Secure Documents.                               |
| `/calendar`  | Publisher calendar.                                   |
| `/post`      | Create/edit/review a Publisher post.                  |
| `/campaigns` | Campaign Partner.                                     |
| `/inbox`     | Customer-facing Inbox, Comments, DMs, and My Partner. |
| `/settings`  | Account, billing, notification, and social setup.     |

## Data Architecture

The portal loads the signed-in Supabase user, resolves the matching `public.users` row, and scopes customer data through `client_id`.

Primary surfaces:

| Table                                                          | Purpose                                                           |
| -------------------------------------------------------------- | ----------------------------------------------------------------- |
| `clients`                                                      | Customer business/runtime/billing/Zernio profile fields.          |
| `users`                                                        | Portal user accounts and roles.                                   |
| `posts`                                                        | Scheduled and published social posts.                             |
| `social_drafts`                                                | Publisher drafts, recommendations, and manual publish references. |
| `social_connections`                                           | Zernio connected social accounts.                                 |
| `client_website_chat_settings`                                 | Chatwoot account/inbox settings.                                  |
| `documents`, `secure_documents`                                | File metadata.                                                    |
| `portal_workspace_preferences`                                 | User workspace and Today queue state.                             |
| `client_local_opportunities`, `client_opportunity_suggestions` | Opportunity Radar/Partner ideas.                                  |
| `portal_push_subscriptions`                                    | Customer device notification subscriptions.                       |

## Automation Layer

n8n and Supabase Edge Functions handle server-side work that should not run directly in browser code:

- onboarding/provisioning
- portal bootstrap/runtime metadata
- social publishing and provider callbacks
- Content Partner/My Partner draft creation
- secure document signed upload/download
- billing webhooks
- push notification delivery

## Provisioning Model

Fresh customers should be provisioned through the current customer onboarding flow and shared-path portal model. The portal helper still supports dedicated Workers when needed:

```bash
npm run provision:client -- --client-slug <client-slug> --dry-run
npm run provision:client -- --client-slug <client-slug>
```

Use dedicated-domain flags only when the customer has an explicitly approved legacy/custom-domain requirement. New customer docs, support emails, and operator checklists should point to the shared path unless that exception is approved.

## Deployment

For a shared portal code change:

```bash
npm run build
npm run deploy:all-portals -- --dry-run
npm run deploy:all-portals -- --yes
```

For the shared Worker path, verify:

- `https://myautomationpartner.com/portal/<client-slug>` returns the portal/login shell.
- Authenticated routes resolve under the same path.
- Deep links such as `/portal/<client-slug>/inbox` and `/portal/<client-slug>/post` work.
- Dedicated/legacy workers are not used as proof for fresh customer onboarding unless that is the intended target.

## Local Development

```bash
npm install
cp .env.example .env.local
npm run dev
npm run build
npm run lint
```

Required browser values:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Optional runtime values are documented in `README.md` and `TENANT_TEMPLATE.md`.

## Legacy Notes

- Older Dancescapes-specific docs, URLs, and screenshots are pilot history only.
- The former `dancescapes-portal` standalone repo/plain-HTML prototype is not the production codebase.
- Current source of truth for new customer URL strategy is `docs/path-based-portal-routing.md`.
- Current source of truth for onboarding execution is `docs/runbooks/new-customer-onboarding.md`.
