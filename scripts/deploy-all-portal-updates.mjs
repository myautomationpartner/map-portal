#!/usr/bin/env node

import { deployPortalUpdate, loadDeployableClients } from './deploy-portal-update.mjs'

function parseArgs(argv) {
  const args = {}
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index]
    if (!current.startsWith('--')) continue
    const key = current.slice(2)
    const next = argv[index + 1]
    if (!next || next.startsWith('--')) {
      args[key] = true
      continue
    }
    args[key] = next
    index += 1
  }
  return args
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const dryRun = Boolean(args['dry-run'])
  const confirmed = Boolean(args.yes)

  if (!dryRun && !confirmed) {
    throw new Error('Deploying all customer portals requires --yes. Run with --dry-run first, then rerun with --yes after testing.')
  }

  const clients = await loadDeployableClients()
  if (!clients.length) {
    throw new Error('No deployable customer portals were found.')
  }

  process.stdout.write('\nCustomer portals queued for update\n')
  process.stdout.write(`${clients.map((client) => `- ${client.slug} -> ${client.portal_domain} (${client.worker_name})`).join('\n')}\n`)

  const results = []
  for (const client of clients) {
    try {
      const result = await deployPortalUpdate(client, { dryRun })
      results.push(result)
    } catch (error) {
      results.push({
        ok: false,
        clientId: client.id,
        clientSlug: client.slug,
        workerName: client.worker_name,
        portalDomain: client.portal_domain,
        error: error instanceof Error ? error.message : String(error),
      })
      break
    }
  }

  const failed = results.filter((result) => !result.ok)
  process.stdout.write('\nAll-portal update summary\n')
  process.stdout.write(`${JSON.stringify({ dryRun, total: results.length, failed: failed.length, results }, null, 2)}\n`)

  if (failed.length) process.exit(1)
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
})
