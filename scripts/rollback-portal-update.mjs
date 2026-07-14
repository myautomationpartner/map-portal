#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { loadClient } from './deploy-portal-update.mjs'

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

function requiredEnv(key) {
  const value = process.env[key]
  if (!value) throw new Error(`Missing required environment variable ${key}.`)
  return value
}

function shell(command, options = {}) {
  const result = spawnSync(command[0], command.slice(1), {
    cwd: options.cwd || process.cwd(),
    env: {
      ...process.env,
      ...(options.env || {}),
    },
    encoding: 'utf8',
    stdio: options.stdio || 'pipe',
  })

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `${command.join(' ')} failed.`)
  }

  return result
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const versionId = String(args['version-id'] || '').trim()
  if (!versionId) throw new Error('Provide --version-id with the Cloudflare Worker version to roll back to.')

  const client = await loadClient(args)
  if (!client?.worker_name) throw new Error(`Client ${client?.slug || 'unknown'} does not have a worker_name.`)

  const accountId = requiredEnv('CLOUDFLARE_ACCOUNT_ID')
  const token = requiredEnv('CLOUDFLARE_API_TOKEN')
  const message = String(args.message || `Admin rollback for ${client.slug}`).trim()

  process.stdout.write(`\nRolling back ${client.worker_name} (${client.slug}) to ${versionId}\n`)
  shell([
    'npx',
    'wrangler',
    'rollback',
    versionId,
    '--name',
    client.worker_name,
    '--message',
    message,
    '--yes',
  ], {
    env: {
      CLOUDFLARE_ACCOUNT_ID: accountId,
      CLOUDFLARE_API_TOKEN: token,
    },
    stdio: 'inherit',
  })

  process.stdout.write('\nPortal rollback summary\n')
  process.stdout.write(`${JSON.stringify({
    ok: true,
    clientId: client.id,
    clientSlug: client.slug,
    workerName: client.worker_name,
    portalDomain: client.portal_domain,
    versionId,
  }, null, 2)}\n`)
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
})
