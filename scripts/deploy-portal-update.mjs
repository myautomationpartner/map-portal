#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT_PATH = fileURLToPath(import.meta.url)
const SCRIPT_DIR = dirname(SCRIPT_PATH)
const PORTAL_ROOT = resolve(SCRIPT_DIR, '..')
const PROJECT_ROOT = resolve(PORTAL_ROOT, '..', '..')
const CREDENTIAL_PATH = resolve(PROJECT_ROOT, 'credential.txt')

const FALLBACK_SUPABASE_URL = 'https://zgkxrlednyovuytaejok.supabase.co'
const FALLBACK_SUPABASE_ANON_KEY = 'sb_publishable_xwASGbwUsZhX5CFNizTAmg_U50hkD7o'
const DEFAULT_N8N_BASE_URL = 'https://n8n.myautomationpartner.com'
const DEFAULT_CHATWOOT_APP_URL = 'https://chatwoot.myautomationpartner.com/app'
const DEFAULT_CHATWOOT_MOBILE_APPS_URL = 'https://www.chatwoot.com/mobile-apps'
const DEFAULT_CHATWOOT_IOS_URL = 'https://apps.apple.com/us/app/chatwoot/id1495796682'
const DEFAULT_CHATWOOT_ANDROID_URL = 'https://play.google.com/store/apps/details?id=com.chatwoot.app'
const DEFAULT_PORTAL_LABEL = 'Client Portal'
const DEFAULT_SUPPORT_EMAIL = 'info@myautomationpartner.com'
const DEFAULT_TEST_CLIENT_SLUG = 'dancescapes-performing-arts'
const INACTIVE_BILLING_STATUSES = new Set(['canceled', 'cancelled', 'deleted', 'inactive'])
const PROTECTED_MAIN_SITE_DOMAINS = new Set(['myautomationpartner.com', 'www.myautomationpartner.com'])

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

function readCredentialMap() {
  if (!existsSync(CREDENTIAL_PATH)) return new Map()
  const text = readFileSync(CREDENTIAL_PATH, 'utf8')
  const values = new Map()

  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (!match) continue
    values.set(match[1], match[2].trim())
  }

  return values
}

const credentialMap = readCredentialMap()

function envValue(keys, fallback = '') {
  const list = Array.isArray(keys) ? keys : [keys]

  for (const key of list) {
    if (process.env[key]) return String(process.env[key]).trim()
    if (credentialMap.has(key)) return String(credentialMap.get(key)).trim()
  }

  return fallback
}

function requiredValue(keys, label, fallback = '') {
  const value = envValue(keys, fallback)
  if (!value) throw new Error(`Missing required value for ${label}.`)
  return value
}

async function fetchJson(url, init = {}) {
  const response = await fetch(url, init)
  const text = await response.text()
  let payload = null

  try {
    payload = text ? JSON.parse(text) : null
  } catch {
    payload = text
  }

  if (!response.ok) {
    const body = typeof payload === 'string' ? payload : JSON.stringify(payload)
    throw new Error(`${init.method || 'GET'} ${url} failed with ${response.status} ${response.statusText}: ${body}`)
  }

  return payload
}

async function resolveCloudflareAccountId(token) {
  if (envValue(['CLOUDFLARE_ACCOUNT_ID'])) return envValue(['CLOUDFLARE_ACCOUNT_ID'])

  const payload = await fetchJson('https://api.cloudflare.com/client/v4/accounts', {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  const accounts = Array.isArray(payload?.result) ? payload.result : []
  if (accounts.length !== 1 || !accounts[0]?.id) {
    throw new Error('Could not uniquely resolve the Cloudflare account id.')
  }

  return accounts[0].id
}

async function fetchSupabaseRows(path) {
  const supabaseUrl = requiredValue(['SUPABASE_URL'], 'SUPABASE_URL', FALLBACK_SUPABASE_URL)
  const serviceRoleKey = requiredValue(['SUPABASE_SERVICE_ROLE_KEY'], 'SUPABASE_SERVICE_ROLE_KEY')

  return fetchJson(`${supabaseUrl}${path}`, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      Accept: 'application/json',
    },
  })
}

async function fetchSupabaseObject(path) {
  const supabaseUrl = requiredValue(['SUPABASE_URL'], 'SUPABASE_URL', FALLBACK_SUPABASE_URL)
  const serviceRoleKey = requiredValue(['SUPABASE_SERVICE_ROLE_KEY'], 'SUPABASE_SERVICE_ROLE_KEY')

  return fetchJson(`${supabaseUrl}${path}`, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      Accept: 'application/vnd.pgrst.object+json',
    },
  })
}

function shell(command, options = {}) {
  const result = spawnSync(command[0], command.slice(1), {
    cwd: options.cwd || PORTAL_ROOT,
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

function buildPublicEnv(client) {
  return {
    NEXT_PUBLIC_SUPABASE_URL: requiredValue(['NEXT_PUBLIC_SUPABASE_URL', 'VITE_SUPABASE_URL', 'SUPABASE_URL'], 'public Supabase URL', FALLBACK_SUPABASE_URL),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: envValue(
      ['NEXT_PUBLIC_SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY', 'SUPABASE_ANON_KEY'],
      FALLBACK_SUPABASE_ANON_KEY,
    ),
    VITE_PORTAL_DISPLAY_NAME: client.business_name || DEFAULT_PORTAL_LABEL,
    VITE_PORTAL_LABEL: DEFAULT_PORTAL_LABEL,
    VITE_PORTAL_SUPPORT_EMAIL: client.support_email || DEFAULT_SUPPORT_EMAIL,
    VITE_PORTAL_LOGO_URL: client.logo_url || '',
    VITE_PORTAL_CANONICAL_HOST: client.portal_domain || '',
    VITE_PORTAL_WORKER_NAME: client.worker_name || '',
    VITE_PORTAL_BILLING_STATUS: client.billing_status || '',
    VITE_N8N_BASE_URL: envValue(['VITE_N8N_BASE_URL', 'N8N_BASE_URL'], DEFAULT_N8N_BASE_URL),
    VITE_CHATWOOT_APP_URL: envValue(['VITE_CHATWOOT_APP_URL', 'CHATWOOT_APP_URL'], DEFAULT_CHATWOOT_APP_URL),
    VITE_CHATWOOT_MOBILE_APPS_URL: envValue(['VITE_CHATWOOT_MOBILE_APPS_URL'], DEFAULT_CHATWOOT_MOBILE_APPS_URL),
    VITE_CHATWOOT_IOS_URL: envValue(['VITE_CHATWOOT_IOS_URL'], DEFAULT_CHATWOOT_IOS_URL),
    VITE_CHATWOOT_ANDROID_URL: envValue(['VITE_CHATWOOT_ANDROID_URL'], DEFAULT_CHATWOOT_ANDROID_URL),
    VITE_GOOGLE_PICKER_API_KEY: envValue(['VITE_GOOGLE_PICKER_API_KEY', 'GOOGLE_PICKER_API_KEY']),
    VITE_GOOGLE_PICKER_CLIENT_ID: envValue(['VITE_GOOGLE_PICKER_CLIENT_ID', 'GOOGLE_PICKER_CLIENT_ID']),
    VITE_GOOGLE_PICKER_APP_ID: envValue(['VITE_GOOGLE_PICKER_APP_ID', 'GOOGLE_PICKER_APP_ID']),
  }
}

function buildWranglerConfig(client, assetsDirectory) {
  return [
    `name = "${client.worker_name}"`,
    `main = "${join(PORTAL_ROOT, 'worker.js')}"`,
    'compatibility_date = "2025-01-01"',
    'workers_dev = true',
    '',
    '[[routes]]',
    `pattern = "${client.portal_domain}"`,
    'custom_domain = true',
    '',
    '[assets]',
    `directory = "${assetsDirectory}"`,
    'binding = "ASSETS"',
    'not_found_handling = "single-page-application"',
    '',
  ].join('\n')
}

function validateDeployableClient(client) {
  const missing = ['id', 'slug', 'portal_domain', 'worker_name', 'portal_subdomain']
    .filter((key) => !String(client?.[key] || '').trim())

  if (missing.length) {
    throw new Error(`Client ${client?.slug || client?.id || 'unknown'} is missing deploy fields: ${missing.join(', ')}.`)
  }
}

function normalizeDomainHost(domain) {
  const value = String(domain || '').trim().toLowerCase()
  if (!value) return ''

  try {
    return new URL(value.includes('://') ? value : `https://${value}`).hostname.replace(/\.$/, '')
  } catch {
    return value.replace(/\.$/, '')
  }
}

export function isProtectedMainSiteDomain(domain) {
  return PROTECTED_MAIN_SITE_DOMAINS.has(normalizeDomainHost(domain))
}

function assertPortalDomainSafe(client, options = {}) {
  if (!isProtectedMainSiteDomain(client?.portal_domain)) return
  if (options.allowProtectedMainSiteDomain) return

  throw new Error(
    `Refusing to deploy ${client.slug || client.id || 'portal'} to protected main website domain ${client.portal_domain}. `
      + 'Use a portal subdomain or pass --allow-main-site-domain only for an intentional homepage-route migration.',
  )
}

export async function loadClient(args = {}) {
  if (args['client-id']) {
    return fetchSupabaseObject(`/rest/v1/clients?select=*&id=eq.${encodeURIComponent(args['client-id'])}`)
  }

  const slug = args['client-slug'] || DEFAULT_TEST_CLIENT_SLUG
  return fetchSupabaseObject(`/rest/v1/clients?select=*&slug=eq.${encodeURIComponent(slug)}`)
}

export async function loadDeployableClients() {
  const rows = await fetchSupabaseRows(
    '/rest/v1/clients?select=*&portal_domain=not.is.null&worker_name=not.is.null&portal_subdomain=not.is.null&order=created_at.asc',
  )

  return (Array.isArray(rows) ? rows : [])
    .filter((client) => !INACTIVE_BILLING_STATUSES.has(String(client.billing_status || '').toLowerCase()))
}

export async function deployPortalUpdate(client, options = {}) {
  validateDeployableClient(client)
  assertPortalDomainSafe(client, options)

  const dryRun = Boolean(options.dryRun)
  const cloudflareToken = requiredValue(['CLOUDFLARE_API_TOKEN'], 'CLOUDFLARE_API_TOKEN')
  const accountId = await resolveCloudflareAccountId(cloudflareToken)
  const tempDir = mkdtempSync(join(tmpdir(), 'map-portal-update-'))
  const distDir = join(tempDir, 'dist')
  const configPath = join(tempDir, 'wrangler.update.toml')

  try {
    process.stdout.write(`\nBuilding ${client.business_name || client.slug} (${client.slug})\n`)
    shell(['npx', 'vite', 'build', '--outDir', distDir, '--emptyOutDir'], {
      cwd: PORTAL_ROOT,
      env: buildPublicEnv(client),
      stdio: 'inherit',
    })

    writeFileSync(configPath, buildWranglerConfig(client, distDir))

    process.stdout.write(`\nDeploying ${client.worker_name} -> ${client.portal_domain}${dryRun ? ' (dry run)' : ''}\n`)
    shell([
      'npx',
      'wrangler',
      'deploy',
      '--config',
      configPath,
      '--keep-vars',
      ...(dryRun ? ['--dry-run'] : []),
    ], {
      cwd: PORTAL_ROOT,
      env: {
        CLOUDFLARE_API_TOKEN: cloudflareToken,
        CLOUDFLARE_ACCOUNT_ID: accountId,
      },
      stdio: 'inherit',
    })

    return {
      ok: true,
      dryRun,
      clientId: client.id,
      clientSlug: client.slug,
      workerName: client.worker_name,
      portalDomain: client.portal_domain,
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
}

export async function deploySinglePortalFromArgs(rawArgs = process.argv.slice(2)) {
  const args = parseArgs(rawArgs)
  const client = await loadClient(args)
  const result = await deployPortalUpdate(client, {
    dryRun: Boolean(args['dry-run']),
    allowProtectedMainSiteDomain: Boolean(args['allow-main-site-domain']),
  })

  process.stdout.write('\nPortal update summary\n')
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  return result
}

if (process.argv[1] === SCRIPT_PATH) {
  deploySinglePortalFromArgs().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exit(1)
  })
}
