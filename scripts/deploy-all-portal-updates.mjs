#!/usr/bin/env node

import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { deployPortalUpdate, isProtectedMainSiteDomain, loadDeployableClients } from './deploy-portal-update.mjs'

const SHARED_PORTAL_WORKER_NAME = 'map-shared-portal'
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const PORTAL_REGRESSION_TESTS = [
  '../src/lib/portalApi.source.test.mjs',
]

function isSharedPortalClient(client) {
  return client?.worker_name === SHARED_PORTAL_WORKER_NAME
}

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

function runPortalRegressionGuards() {
  const testFiles = PORTAL_REGRESSION_TESTS.map((filePath) => resolve(SCRIPT_DIR, filePath))
  const result = spawnSync(process.execPath, ['--test', ...testFiles], {
    cwd: resolve(SCRIPT_DIR, '..'),
    stdio: 'inherit',
  })

  if (result.status !== 0) {
    throw new Error('Portal regression guards failed. Fix them before deploying customer portals.')
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const dryRun = Boolean(args['dry-run'])
  const confirmed = Boolean(args.yes)

  if (!dryRun && !confirmed) {
    throw new Error('Deploying all customer portals requires --yes. Run with --dry-run first, then rerun with --yes after testing.')
  }

  runPortalRegressionGuards()

  const deployableClients = await loadDeployableClients()
  const skipped = deployableClients.filter((client) => isProtectedMainSiteDomain(client.portal_domain) && !isSharedPortalClient(client))
  const clients = deployableClients.filter((client) => !isProtectedMainSiteDomain(client.portal_domain) || isSharedPortalClient(client))

  if (skipped.length) {
    process.stdout.write('\nProtected main website domains skipped\n')
    process.stdout.write(`${skipped.map((client) => `- ${client.slug} -> ${client.portal_domain} (${client.worker_name})`).join('\n')}\n`)
  }

  if (!clients.length) {
    throw new Error('No deployable customer portals were found after excluding protected main website domains.')
  }

  process.stdout.write('\nCustomer portals queued for update\n')
  process.stdout.write(`${clients.map((client) => `- ${client.slug} -> ${client.portal_domain} (${client.worker_name})`).join('\n')}\n`)

  const results = []
  for (const client of clients) {
    try {
      const result = await deployPortalUpdate(client, {
        dryRun,
        allowProtectedMainSiteDomain: isSharedPortalClient(client),
      })
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
  process.stdout.write(`${JSON.stringify({
    dryRun,
    total: results.length,
    skippedProtectedMainSiteDomains: skipped.map((client) => ({
      clientSlug: client.slug,
      workerName: client.worker_name,
      portalDomain: client.portal_domain,
    })),
    failed: failed.length,
    results,
  }, null, 2)}\n`)

  if (failed.length) process.exit(1)
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
})
