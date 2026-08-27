# MAP Portal — Architecture

> **Canonical live map:** https://github.com/myautomationpartner/map-operating-system/blob/main/docs/LIVE.md
> **GitHub:** https://github.com/myautomationpartner/map-portal
> **Customer URL:** https://myautomationpartner.com/portal/<client-slug>
> **Dancescapes pilot:** https://dancescapes.portal.myautomationpartner.com

This repo is the customer portal application (React + Vite + Capacitor), deployed as a Cloudflare Worker/shared portal runtime.

`dancescapes-portal.kennymonico.workers.dev` is a technical host, not the customer-facing URL. Browser visits should land on MAP-owned domains.

## What it is

A shared multi-tenant portal. Every customer gets the same MAP product. Dancescapes is tenant one and the UX benchmark. Brand/business data is Partner context, not a per-client theme.

Live tenants: Dancescapes, MAP (`my-automation-partner`).

## Stack

| Layer | Technology |
|---|---|
| UI | React 19, Vite, Tailwind, React Router, TanStack Query |
| Auth + DB | Supabase (`zgkxrlednyovuytaejok`) |
| Automation | n8n at `https://n8n.myautomationpartner.com` |
| Media | Cloudflare R2 |
| Social | Zernio |
| Inbox (live target) | Chatwoot |
| Deploy | Cloudflare Workers (Wrangler) |

## Inbox warning

Live ops docs say Chatwoot is the inbox. This GitHub tree still has Tidio panel/deep-link leftovers in `src/pages/Inbox.jsx` and `tidio_project_url` on clients. Do not treat those Tidio strings as the live product, and do not "fix" Inbox.jsx in a docs pass.

## Also leftover in this tree

- Dropbox Chooser in `src/lib/dropboxApi.js` (legacy upload path; R2 is the target)
- Dashboard shortcuts that still name Tidio

## Auth

Supabase email/password. JWT claims use `user_role` (not `role`), plus `client_id` and `client_slug`. Unauthenticated routes redirect to `/login`.

## n8n

Portal calls n8n webhooks for publish, R2 upload, and Zernio connect/sync. n8n often returns HTTP 200 even on failure. Check `response.success !== false`.

## Not this repo

- Public marketing site: `myautomationpartner-homepage`
- Admin: `map-ops-command-center`
- Durable docs: `map-operating-system`
- Delphi / Pacesetter: separate company, not MAP
