# Portal update rollout

Use this when a shared portal code change should move from the template repo to customer portals.

## 1. Test portal first

Dancescapes is the live test customer.

```bash
npm run deploy:test-portal
```

Dry-run option:

```bash
npm run deploy:test-portal -- --dry-run
```

## 2. Deploy all customer portals

Run a dry run first:

```bash
npm run deploy:all-portals -- --dry-run
```

After the test portal has been verified:

```bash
npm run deploy:all-portals -- --yes
```

The all-portal script deploys every client with `portal_domain`, `worker_name`, and `portal_subdomain` set, excluding inactive/canceled billing statuses.

## Notes

- Each customer gets a tenant-specific Vite build so branding and portal host values are correct.
- Wrangler deploys with `--keep-vars`, preserving each existing Worker's runtime secrets.
- The rollout scripts do not provision Chatwoot, webhooks, onboarding records, or initial radar runs. Use `npm run provision:client` only for first-time portal provisioning.

## Roll back one portal

Rollback requires the Cloudflare Worker version ID to restore.

```bash
npm run rollback:portal -- --client-slug dancescapes-performing-arts --version-id <cloudflare-version-id>
```

The admin panel dispatches the same rollback through GitHub Actions so the action is logged and isolated to the selected customer portal.
