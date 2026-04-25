#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const PORTAL_ROOT = resolve(SCRIPT_DIR, '..')
const PROJECT_ROOT = resolve(PORTAL_ROOT, '..', '..')
const CREDENTIAL_PATH = resolve(PROJECT_ROOT, 'credential.txt')

const FALLBACK_SUPABASE_URL = 'https://zgkxrlednyovuytaejok.supabase.co'
const FALLBACK_SUPABASE_ANON_KEY = 'sb_publishable_xwASGbwUsZhX5CFNizTAmg_U50hkD7o'
const DEFAULT_N8N_BASE_URL = 'https://n8n.myautomationpartner.com'
const DEFAULT_PORTAL_LABEL = 'Client Portal'
const DEFAULT_SUPPORT_EMAIL = 'info@myautomationpartner.com'

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

function readKeychainValue(serviceNames) {
  const list = Array.isArray(serviceNames) ? serviceNames : [serviceNames]

  for (const serviceName of list) {
    if (!serviceName) continue
    const result = spawnSync('security', ['find-generic-password', '-w', '-s', serviceName], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })

    if (result.status === 0) {
      const value = String(result.stdout || '').trim()
      if (value) return value
    }
  }

  return ''
}

function envValue(keys, fallback = '') {
  const list = Array.isArray(keys) ? keys : [keys]

  for (const key of list) {
    if (process.env[key]) return String(process.env[key]).trim()
    if (credentialMap.has(key)) return String(credentialMap.get(key)).trim()
  }

  return fallback
}

function secretValue(keys, options = {}) {
  const list = Array.isArray(keys) ? keys : [keys]
  const keychainServices = options.keychainServices || []

  const plain = envValue(list)
  if (plain) return plain

  const keychainValue = readKeychainValue(keychainServices)
  if (keychainValue) return keychainValue

  return options.fallback || ''
}

function requiredValue(keys, label, fallback = '') {
  const value = envValue(keys, fallback)
  if (!value) {
    throw new Error(`Missing required value for ${label}.`)
  }
  return value
}

function jsonHeaders(extra = {}) {
  return {
    'content-type': 'application/json',
    ...extra,
  }
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
    throw new Error(`${response.status} ${response.statusText}: ${typeof payload === 'string' ? payload : JSON.stringify(payload)}`)
  }

  return payload
}

async function resolveCloudflareAccountId(token) {
  if (envValue(['CLOUDFLARE_ACCOUNT_ID'])) {
    return envValue(['CLOUDFLARE_ACCOUNT_ID'])
  }

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

async function fetchSupabaseObject(path) {
  const supabaseUrl = requiredValue(['SUPABASE_URL'], 'SUPABASE_URL', FALLBACK_SUPABASE_URL)
  const serviceRoleKey = requiredValue(['SUPABASE_SERVICE_ROLE_KEY'], 'SUPABASE_SERVICE_ROLE_KEY')

  return await fetchJson(`${supabaseUrl}${path}`, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      Accept: 'application/vnd.pgrst.object+json',
    },
  })
}

async function fetchSupabaseRows(path) {
  const supabaseUrl = requiredValue(['SUPABASE_URL'], 'SUPABASE_URL', FALLBACK_SUPABASE_URL)
  const serviceRoleKey = requiredValue(['SUPABASE_SERVICE_ROLE_KEY'], 'SUPABASE_SERVICE_ROLE_KEY')

  return await fetchJson(`${supabaseUrl}${path}`, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      Accept: 'application/json',
    },
  })
}

async function patchSupabase(path, body) {
  const supabaseUrl = requiredValue(['SUPABASE_URL'], 'SUPABASE_URL', FALLBACK_SUPABASE_URL)
  const serviceRoleKey = requiredValue(['SUPABASE_SERVICE_ROLE_KEY'], 'SUPABASE_SERVICE_ROLE_KEY')

  return await fetchJson(`${supabaseUrl}${path}`, {
    method: 'PATCH',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      Prefer: 'return=representation',
      ...jsonHeaders(),
    },
    body: JSON.stringify(body),
  })
}

async function callSupabaseRpc(name, body) {
  const supabaseUrl = requiredValue(['SUPABASE_URL'], 'SUPABASE_URL', FALLBACK_SUPABASE_URL)
  const serviceRoleKey = requiredValue(['SUPABASE_SERVICE_ROLE_KEY'], 'SUPABASE_SERVICE_ROLE_KEY')

  return await fetchJson(`${supabaseUrl}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      Prefer: 'return=representation',
      ...jsonHeaders(),
    },
    body: JSON.stringify(body),
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

function printSummary(label, payload) {
  process.stdout.write(`\n${label}\n`)
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`)
}

function toEnvFile(body) {
  return Object.entries(body)
    .filter(([, value]) => value !== undefined && value !== null && String(value).trim())
    .map(([key, value]) => `${key}=${String(value).replace(/\n/g, '\\n')}`)
    .join('\n')
}

async function loadClient(args) {
  if (args['client-id']) {
    return await fetchSupabaseObject(`/rest/v1/clients?select=*&id=eq.${encodeURIComponent(args['client-id'])}`)
  }

  if (args['client-slug']) {
    return await fetchSupabaseObject(`/rest/v1/clients?select=*&slug=eq.${encodeURIComponent(args['client-slug'])}`)
  }

  throw new Error('Provide --client-id or --client-slug.')
}

async function loadSignupForClient(clientId) {
  const rows = await fetchSupabaseRows(
    `/rest/v1/onboarding_signups?select=*&client_id=eq.${encodeURIComponent(clientId)}&order=created_at.desc&limit=1`,
  )
  return Array.isArray(rows) && rows.length ? rows[0] : null
}

async function loadRun(args, clientId) {
  if (args['run-id']) {
    return await fetchSupabaseObject(`/rest/v1/onboarding_provisioning_runs?select=*&id=eq.${encodeURIComponent(args['run-id'])}`)
  }

  const rows = await fetchSupabaseRows(
    `/rest/v1/onboarding_provisioning_runs?select=*&client_id=eq.${encodeURIComponent(clientId)}&order=created_at.desc&limit=1`,
  )
  return Array.isArray(rows) && rows.length ? rows[0] : null
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
  }
}

function buildSecretEnv(client) {
  return {
    SUPABASE_URL: requiredValue(['SUPABASE_URL'], 'SUPABASE_URL', FALLBACK_SUPABASE_URL),
    SUPABASE_SERVICE_ROLE_KEY: requiredValue(['SUPABASE_SERVICE_ROLE_KEY'], 'SUPABASE_SERVICE_ROLE_KEY'),
    PORTAL_CLIENT_ID: client.id,
    PORTAL_CANONICAL_HOST: client.portal_domain || '',
    N8N_BASE_URL: envValue(['N8N_BASE_URL'], DEFAULT_N8N_BASE_URL),
    ZERNIO_WEBHOOK_SECRET: requiredValue(
      ['ZERNIO_WEBHOOK_SECRET'],
      'ZERNIO_WEBHOOK_SECRET',
      secretValue(['ZERNIO_WEBHOOK_SECRET'], {
        keychainServices: ['MAP_ZERNIO_WEBHOOK_SECRET', 'ZERNIO_WEBHOOK_SECRET'],
      }),
    ),
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

async function configureZernioWebhook(client, secretEnv) {
  const webhookSecret = String(secretEnv.ZERNIO_WEBHOOK_SECRET || '').trim()

  const baseUrl = envValue(['PORTAL_WEBHOOK_BASE_URL'])
  const targetUrl = baseUrl
    ? `${baseUrl.replace(/\/$/, '')}/api/zernio/account-events`
    : `https://${client.portal_domain}/api/zernio/account-events`

  const requestBody = {
    url: targetUrl,
    secret: webhookSecret,
    name: `MAP Portal Account Events — ${client.slug || client.business_name || client.worker_name}`,
    events: ['account.connected', 'account.disconnected'],
  }

  const configured = await fetchJson(`${envValue(['N8N_BASE_URL'], DEFAULT_N8N_BASE_URL)}/webhook/zernio-configure-account-webhook`, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify(requestBody),
  })

  const webhookId = configured?.webhook?._id || configured?._id || configured?.webhookId || ''
  let tested = null

  if (webhookId) {
    tested = await fetchJson(`${envValue(['N8N_BASE_URL'], DEFAULT_N8N_BASE_URL)}/webhook/zernio-test-webhook-delivery`, {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({ webhookId }),
    })
  }

  return {
    configured: true,
    targetUrl,
    webhookId: webhookId || null,
    configureResult: configured,
    testResult: tested,
  }
}

async function syncDeploymentState({ client, signup, run, webhookResult, dryRun }) {
  if (dryRun || !run?.id || !signup?.id) {
    return {
      skipped: true,
      reason: dryRun ? 'Dry run.' : 'Missing onboarding signup or provisioning run.',
    }
  }

  const deploymentReady = webhookResult?.configured || webhookResult?.skipped
  const runStage = deploymentReady && webhookResult?.configured ? 'complete' : 'portal_deployed'
  const runStatus = deploymentReady && webhookResult?.configured ? 'completed' : 'attention_required'
  const manualAttentionRequired = !(deploymentReady && webhookResult?.configured)
  const now = new Date().toISOString()
  const stageNote = webhookResult?.configured
    ? 'Portal worker deployed, custom domain attached, and Zernio account webhook registered.'
    : 'Portal worker deployed and custom domain attached; Zernio webhook setup still needs follow-up.'

  const advanced = await callSupabaseRpc('advance_onboarding_provisioning_run', {
    p_run_id: run.id,
    p_current_stage: runStage,
    p_run_status: runStatus,
    p_domain_status: 'map_managed_domain_live',
    p_deployment_status: 'live',
    p_client_id: client.id,
    p_client_slug: client.slug,
    p_portal_subdomain: client.portal_subdomain,
    p_portal_domain: client.portal_domain,
    p_worker_name: client.worker_name,
    p_manual_attention_required: manualAttentionRequired,
    p_stage_note: stageNote,
  })

  const signupPatch = {
    client_slug: client.slug,
    portal_subdomain: client.portal_subdomain,
    portal_domain: client.portal_domain,
    worker_name: client.worker_name,
    branding_status: 'ready',
    provisioning_stage: runStage,
    manual_attention_required: manualAttentionRequired,
    last_error: null,
    completed_at: runStage === 'complete' ? now : null,
  }

  const mirrored = await patchSupabase(
    `/rest/v1/onboarding_signups?id=eq.${encodeURIComponent(signup.id)}`,
    signupPatch,
  )

  return {
    skipped: false,
    runStage,
    runStatus,
    manualAttentionRequired,
    advanced,
    mirrored,
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const dryRun = Boolean(args['dry-run'])
  const skipWebhookConfig = Boolean(args['skip-webhook-config'])
  const client = await loadClient(args)

  if (!client.portal_domain || !client.worker_name || !client.portal_subdomain) {
    throw new Error('Client is missing portal runtime fields. Run derive-tenant-bootstrap first.')
  }

  const signup = await loadSignupForClient(client.id)
  const run = await loadRun(args, client.id)
  const cloudflareToken = requiredValue(['CLOUDFLARE_API_TOKEN'], 'CLOUDFLARE_API_TOKEN')
  const accountId = await resolveCloudflareAccountId(cloudflareToken)
  const publicEnv = buildPublicEnv(client)
  const secretEnv = buildSecretEnv(client)
  const tempDir = mkdtempSync(join(tmpdir(), 'map-portal-provision-'))
  const distDir = join(tempDir, 'dist')

  shell(['npx', 'vite', 'build', '--outDir', distDir], {
    cwd: PORTAL_ROOT,
    env: publicEnv,
    stdio: 'inherit',
  })

  const configPath = join(tempDir, 'wrangler.auto.toml')
  const secretsPath = join(tempDir, 'worker-secrets.env')

  writeFileSync(configPath, buildWranglerConfig(client, distDir))
  writeFileSync(secretsPath, `${toEnvFile(secretEnv)}\n`)

  let webhookResult = {
    configured: false,
    skipped: true,
    reason: 'Webhook configuration was not attempted.',
  }

  try {
    shell([
      'npx',
      'wrangler',
      'deploy',
      '--config',
      configPath,
      '--keep-vars',
      '--secrets-file',
      secretsPath,
      ...(dryRun ? ['--dry-run'] : []),
    ], {
      cwd: PORTAL_ROOT,
      env: {
        CLOUDFLARE_API_TOKEN: cloudflareToken,
        CLOUDFLARE_ACCOUNT_ID: accountId,
      },
      stdio: 'inherit',
    })

    if (!dryRun && !skipWebhookConfig) {
      webhookResult = await configureZernioWebhook(client, secretEnv)
    } else if (skipWebhookConfig) {
      webhookResult = {
        configured: false,
        skipped: true,
        reason: 'Webhook configuration was skipped by flag.',
      }
    }

    const deploymentState = await syncDeploymentState({
      client,
      signup,
      run,
      webhookResult,
      dryRun,
    })
    printSummary('Portal deployment summary', {
      dryRun,
      clientId: client.id,
      clientSlug: client.slug,
      workerName: client.worker_name,
      portalDomain: client.portal_domain,
      cloudflareAccountId: accountId,
      webhookResult,
      deploymentState,
      readyEmail: {
        skipped: true,
        reason: 'Ready email now sends after the customer completes password setup.',
      },
    })
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
})
