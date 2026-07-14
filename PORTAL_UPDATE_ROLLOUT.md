# Portal update rollout

Use this when a shared portal code change should move from the template repo to customer portals.

## 1. Test shared portal first

Use the shared MAP tenant or a dedicated smoke/test tenant for first verification. Dancescapes is reset-pending and should not be used as the default test customer for launch readiness.

```bash
npm run deploy:portal -- --client-slug my-automation-partner --dry-run
```

If a dedicated legacy/customer Worker must be tested, run the test-portal command against the explicitly selected tenant:

```bash
npm run deploy:test-portal -- --client-slug <client-slug> --dry-run
```

## 2. Deploy all customer portals

Run a dry run first:

```bash
npm run deploy:all-portals -- --dry-run
```

After the shared path and any required legacy/dedicated tenant have been verified:

```bash
npm run deploy:all-portals -- --yes
```

The all-portal script deploys every client with `portal_domain`, `worker_name`, and `portal_subdomain` set, excluding inactive/canceled billing statuses.

## Notes

- Each customer gets a tenant-specific Vite build so branding and portal host values are correct.
- Wrangler deploys with `--keep-vars`, preserving each existing Worker's runtime secrets.
- The rollout scripts do not provision Chatwoot, webhooks, onboarding records, or initial radar runs. Use `npm run provision:client` only for first-time portal provisioning.

## Roll back one legacy/dedicated portal

Rollback requires the Cloudflare Worker version ID to restore.

```bash
npm run rollback:portal -- --client-slug <client-slug> --version-id <cloudflare-version-id>
```

The admin panel dispatches the same rollback through GitHub Actions so the action is logged and isolated to the selected customer portal.
