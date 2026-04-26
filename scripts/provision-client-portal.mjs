#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomBytes } from 'node:crypto'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const PORTAL_ROOT = resolve(SCRIPT_DIR, '..')
const PROJECT_ROOT = resolve(PORTAL_ROOT, '..', '..')
const CREDENTIAL_PATH = resolve(PROJECT_ROOT, 'credential.txt')

const FALLBACK_SUPABASE_URL = 'https://zgkxrlednyovuytaejok.supabase.co'
const FALLBACK_SUPABASE_ANON_KEY = 'sb_publishable_xwASGbwUsZhX5CFNizTAmg_U50hkD7o'
const DEFAULT_N8N_BASE_URL = 'https://n8n.myautomationpartner.com'
const DEFAULT_CHATWOOT_APP_URL = 'https://chatwoot.myautomationpartner.com/app'
const DEFAULT_CHATWOOT_BASE_URL = 'https://chatwoot.myautomationpartner.com'
const DEFAULT_CHATWOOT_MOBILE_APPS_URL = 'https://www.chatwoot.com/mobile-apps'
const DEFAULT_CHATWOOT_IOS_URL = 'https://apps.apple.com/us/app/chatwoot/id1495796682'
const DEFAULT_CHATWOOT_ANDROID_URL = 'https://play.google.com/store/apps/details?id=com.chatwoot.app'
const DEFAULT_CHATWOOT_SOCIAL_INBOX_NAME = 'Social Inbox'
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

function parsePositiveInteger(value) {
  const parsed = Number.parseInt(String(value || ''), 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase()
}

function compactObject(body) {
  return Object.fromEntries(
    Object.entries(body).filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== ''),
  )
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
    throw new Error(`${init.method || 'GET'} ${url} failed with ${response.status} ${response.statusText}: ${typeof payload === 'string' ? payload : JSON.stringify(payload)}`)
  }

  return payload
}

function getChatwootProvisioningConfig() {
  const baseUrl = envValue(['CHATWOOT_BASE_URL'], DEFAULT_CHATWOOT_BASE_URL).replace(/\/$/, '')
  const platformToken = secretValue(['CHATWOOT_PLATFORM_API_ACCESS_TOKEN'], {
    keychainServices: ['MAP_CHATWOOT_PLATFORM_API_ACCESS_TOKEN', 'CHATWOOT_PLATFORM_API_ACCESS_TOKEN'],
  })
  const adminToken = secretValue(['CHATWOOT_API_ACCESS_TOKEN'], {
    keychainServices: ['MAP_CHATWOOT_API_ACCESS_TOKEN', 'CHATWOOT_API_ACCESS_TOKEN'],
  })

  return { baseUrl, platformToken, adminToken }
}

async function chatwootPlatformFetch(path, init = {}) {
  const config = getChatwootProvisioningConfig()
  if (!config.platformToken) {
    throw new Error('Missing CHATWOOT_PLATFORM_API_ACCESS_TOKEN for Chatwoot tenant provisioning.')
  }

  return fetchJson(`${config.baseUrl}${path}`, {
    ...init,
    headers: {
      api_access_token: config.platformToken,
      ...jsonHeaders(init.headers || {}),
    },
  })
}

async function chatwootAccountFetch(accountId, path, init = {}) {
  const config = getChatwootProvisioningConfig()
  if (!config.adminToken) {
    throw new Error('Missing CHATWOOT_API_ACCESS_TOKEN for Chatwoot inbox provisioning.')
  }

  return fetchJson(`${config.baseUrl}/api/v1/accounts/${accountId}${path}`, {
    ...init,
    headers: {
      api_access_token: config.adminToken,
      ...jsonHeaders(init.headers || {}),
    },
  })
}

function createTemporaryPassword() {
  return `${randomBytes(18).toString('base64url')}aA1!`
}

async function listChatwootAccounts() {
  const accounts = await chatwootPlatformFetch('/platform/api/v1/accounts')
  return Array.isArray(accounts) ? accounts : (Array.isArray(accounts?.payload) ? accounts.payload : [])
}

async function findChatwootAccountForClient(client) {
  const accountName = String(client.business_name || client.slug || client.id).trim().toLowerCase()
  const accounts = await listChatwootAccounts()

  return accounts.find((account) => {
    const attributes = account?.custom_attributes || {}
    const mapClientId = String(attributes.map_client_id || '').trim()
    const mapClientSlug = String(attributes.map_client_slug || '').trim().toLowerCase()
    const name = String(account?.name || '').trim().toLowerCase()

    return mapClientId === String(client.id) || mapClientSlug === String(client.slug || '').toLowerCase() || name === accountName
  }) || null
}

async function createOrUpdateChatwootAccount(client) {
  const accountName = String(client.business_name || client.slug || client.id).trim()
  const supportEmail = normalizeEmail(client.support_email) || DEFAULT_SUPPORT_EMAIL
  const existing = await findChatwootAccountForClient(client)

  if (existing?.id) {
    const updated = await chatwootPlatformFetch(`/platform/api/v1/accounts/${existing.id}`, {
      method: 'PATCH',
      body: JSON.stringify(compactObject({
        name: accountName,
        domain: client.portal_domain || undefined,
        support_email: supportEmail,
        custom_attributes: {
          map_client_id: client.id,
          map_client_slug: client.slug,
        },
      })),
    })
    return updated || existing
  }

  return chatwootPlatformFetch('/platform/api/v1/accounts', {
    method: 'POST',
    body: JSON.stringify(compactObject({
      name: accountName,
      locale: 'en',
      domain: client.portal_domain || undefined,
      support_email: supportEmail,
      custom_attributes: {
        map_client_id: client.id,
        map_client_slug: client.slug,
      },
    })),
  })
}

async function createOrUpdateChatwootUser(userProfile, client, accountId) {
  const email = normalizeEmail(userProfile?.email || client.support_email)
  if (!email) throw new Error('Client portal user email is required for Chatwoot provisioning.')

  const name = String(userProfile?.name || userProfile?.email?.split('@')[0] || client.business_name || email).trim()
  const created = await chatwootPlatformFetch('/platform/api/v1/users', {
    method: 'POST',
    body: JSON.stringify({
      email,
      name,
      display_name: name,
      password: createTemporaryPassword(),
      custom_attributes: {
        map_client_id: client.id,
        map_client_slug: client.slug,
      },
    }),
  }).catch(async (error) => {
    if (!String(error.message || '').includes('has already been taken')) throw error

    // Platform API does not provide email search. The common case is a portal user
    // already invited by earlier provisioning; resolve through account agents later.
    return null
  })

  if (created?.id) return created

  const agents = await chatwootAccountFetch(accountId, '/agents')
  const list = Array.isArray(agents) ? agents : (Array.isArray(agents?.payload) ? agents.payload : [])
  const existing = list.find((agent) => normalizeEmail(agent.email) === email)
  if (existing?.id) return existing

  throw new Error(`Chatwoot user ${email} already exists but could not be resolved in account ${accountId}.`)
}

async function createOrUpdateAccountUser(accountId, userId, role = 'administrator') {
  return chatwootPlatformFetch(`/platform/api/v1/accounts/${accountId}/account_users`, {
    method: 'POST',
    body: JSON.stringify({ user_id: userId, role }),
  }).catch((error) => {
    const message = String(error.message || '')
    if (message.includes('has already been taken') || message.includes('already exists')) {
      return { skipped: true, reason: 'User already belongs to account.', accountId, userId, role }
    }
    throw error
  })
}

async function findInboxByName(accountId, name) {
  const response = await chatwootAccountFetch(accountId, '/inboxes')
  const list = Array.isArray(response?.payload) ? response.payload : (Array.isArray(response) ? response : [])
  return list.find((inbox) => String(inbox.name || '').trim().toLowerCase() === String(name || '').trim().toLowerCase()) || null
}

async function createOrUpdateWebsiteInbox(accountId, client) {
  const existing = await findInboxByName(accountId, 'Website Chat')
  if (existing?.id) return existing

  return chatwootAccountFetch(accountId, '/inboxes', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Website Chat',
      greeting_enabled: true,
      greeting_message: `Hi! Send ${client.business_name || 'us'} a message and we will get back to you soon.`,
      enable_email_collect: true,
      enable_auto_assignment: true,
      channel: {
        type: 'web_widget',
        website_url: client.website_url || `https://${client.portal_domain}`,
        widget_color: '#C9A84C',
      },
    }),
  })
}

async function createOrUpdateSocialInbox(accountId, client, callbackSecret) {
  const existing = await findInboxByName(accountId, DEFAULT_CHATWOOT_SOCIAL_INBOX_NAME)
  if (existing?.id) return existing

  return chatwootAccountFetch(accountId, '/inboxes', {
    method: 'POST',
    body: JSON.stringify({
      name: DEFAULT_CHATWOOT_SOCIAL_INBOX_NAME,
      enable_auto_assignment: true,
      channel: {
        type: 'api',
        webhook_url: `https://${client.portal_domain}/api/chatwoot/webhooks/messages?token=${encodeURIComponent(callbackSecret)}`,
      },
    }),
  })
}

async function setInboxMembers(accountId, inboxId, userIds) {
  return chatwootAccountFetch(accountId, '/inbox_members', {
    method: 'POST',
    body: JSON.stringify({ inbox_id: inboxId, user_ids: userIds }),
  })
}

async function triggerChatwootPasswordReset(email) {
  const config = getChatwootProvisioningConfig()
  return fetchJson(`${config.baseUrl}/auth/password`, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({
      email,
      redirect_url: `${config.baseUrl}/app/login`,
    }),
  }).catch((error) => ({
    error: error.message,
  }))
}

async function loadPrimaryPortalUser(clientId) {
  const rows = await fetchSupabaseRows(
    `/rest/v1/users?select=id,email,name,role,client_id&client_id=eq.${encodeURIComponent(clientId)}&order=created_at.asc&limit=1`,
  )
  return Array.isArray(rows) && rows.length ? rows[0] : null
}

async function provisionChatwootTenant({ client, dryRun, skipChatwootProvisioning, skipChatwootPasswordReset }) {
  if (dryRun || skipChatwootProvisioning) {
    return {
      skipped: true,
      reason: dryRun ? 'Dry run.' : 'Chatwoot provisioning skipped by flag.',
    }
  }

  const portalUser = await loadPrimaryPortalUser(client.id)
  const customerEmail = normalizeEmail(portalUser?.email || client.support_email)
  if (!customerEmail) {
    throw new Error('No portal user/support email found for Chatwoot tenant provisioning.')
  }

  const callbackSecret = secretValue(['CHATWOOT_WEBHOOK_BRIDGE_SECRET'], {
    keychainServices: ['MAP_CHATWOOT_WEBHOOK_BRIDGE_SECRET', 'CHATWOOT_WEBHOOK_BRIDGE_SECRET'],
    fallback: randomBytes(24).toString('hex'),
  })
  const account = await createOrUpdateChatwootAccount(client)
  const operatorUserId = parsePositiveInteger(envValue(['CHATWOOT_OPERATOR_USER_ID'], '3'))
  if (operatorUserId) {
    await createOrUpdateAccountUser(account.id, operatorUserId, 'administrator')
  }

  const user = await createOrUpdateChatwootUser(portalUser, client, account.id)
  await createOrUpdateAccountUser(account.id, user.id, 'administrator')

  const websiteInbox = await createOrUpdateWebsiteInbox(account.id, client)
  const socialInbox = await createOrUpdateSocialInbox(account.id, client, callbackSecret)
  const inboxMemberIds = [...new Set([user.id, operatorUserId].filter(Boolean))]
  await setInboxMembers(account.id, websiteInbox.id, inboxMemberIds)
  await setInboxMembers(account.id, socialInbox.id, inboxMemberIds)
  const passwordReset = skipChatwootPasswordReset
    ? { skipped: true, reason: 'Chatwoot password reset skipped by flag.' }
    : await triggerChatwootPasswordReset(customerEmail)

  return {
    skipped: false,
    accountId: account.id,
    userId: user.id,
    userEmail: customerEmail,
    websiteInboxId: websiteInbox.id,
    socialInboxId: socialInbox.id,
    callbackSecret,
    passwordReset,
  }
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

async function countOpportunityRadarRuns(clientId) {
  const rows = await fetchSupabaseRows(
    `/rest/v1/client_research_runs?select=id&client_id=eq.${encodeURIComponent(clientId)}&limit=1`,
  )
  return Array.isArray(rows) ? rows.length : 0
}

async function triggerOpportunityRadar(client, mode, body = {}) {
  const supabaseUrl = requiredValue(['SUPABASE_URL'], 'SUPABASE_URL', FALLBACK_SUPABASE_URL)
  const serviceRoleKey = requiredValue(['SUPABASE_SERVICE_ROLE_KEY'], 'SUPABASE_SERVICE_ROLE_KEY')

  return await fetchJson(`${supabaseUrl}/functions/v1/opportunity-radar-run`, {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      ...jsonHeaders(),
    },
    body: JSON.stringify({
      client_id: client.id,
      client_slug: client.slug,
      mode,
      ...body,
    }),
  })
}

async function runInitialOpportunityRadar({ client, deploymentState, dryRun, skipInitialRadar }) {
  if (dryRun || skipInitialRadar) {
    return {
      skipped: true,
      reason: dryRun ? 'Dry run.' : 'Initial Opportunity Radar run skipped by flag.',
    }
  }

  if (deploymentState?.skipped) {
    return {
      skipped: true,
      reason: 'Only runs during real onboarding provisioning, not ad hoc tenant redeploys.',
    }
  }

  const existingRunCount = await countOpportunityRadarRuns(client.id)
  if (existingRunCount > 0) {
    return {
      skipped: true,
      reason: 'Client already has Opportunity Radar run history.',
      existingRunCount,
    }
  }

  const monthlyFoundation = await triggerOpportunityRadar(client, 'monthly_foundation')
  const weeklyDeep = await triggerOpportunityRadar(client, 'weekly_deep')

  return {
    skipped: false,
    monthlyFoundation,
    weeklyDeep,
  }
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
    VITE_CHATWOOT_APP_URL: envValue(['VITE_CHATWOOT_APP_URL', 'CHATWOOT_APP_URL'], DEFAULT_CHATWOOT_APP_URL),
    VITE_CHATWOOT_MOBILE_APPS_URL: envValue(['VITE_CHATWOOT_MOBILE_APPS_URL'], DEFAULT_CHATWOOT_MOBILE_APPS_URL),
    VITE_CHATWOOT_IOS_URL: envValue(['VITE_CHATWOOT_IOS_URL'], DEFAULT_CHATWOOT_IOS_URL),
    VITE_CHATWOOT_ANDROID_URL: envValue(['VITE_CHATWOOT_ANDROID_URL'], DEFAULT_CHATWOOT_ANDROID_URL),
  }
}

function deploymentSecret(keys, label, options = {}) {
  if (options.allowPlaceholders) {
    return envValue(keys, `dry-run-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`)
  }

  return requiredValue(keys, label)
}

function buildSecretEnv(client, chatwootProvisioning = {}, options = {}) {
  return {
    SUPABASE_URL: requiredValue(['SUPABASE_URL'], 'SUPABASE_URL', FALLBACK_SUPABASE_URL),
    SUPABASE_SERVICE_ROLE_KEY: requiredValue(['SUPABASE_SERVICE_ROLE_KEY'], 'SUPABASE_SERVICE_ROLE_KEY'),
    PORTAL_CLIENT_ID: client.id,
    PORTAL_CANONICAL_HOST: client.portal_domain || '',
    N8N_BASE_URL: envValue(['N8N_BASE_URL'], DEFAULT_N8N_BASE_URL),
    CHATWOOT_BASE_URL: envValue(['CHATWOOT_BASE_URL'], DEFAULT_CHATWOOT_BASE_URL),
    CHATWOOT_ACCOUNT_ID: chatwootProvisioning.accountId || envValue(['CHATWOOT_ACCOUNT_ID'], '1'),
    CHATWOOT_API_ACCESS_TOKEN: deploymentSecret(['CHATWOOT_API_ACCESS_TOKEN'], 'CHATWOOT_API_ACCESS_TOKEN', options),
    CHATWOOT_SOCIAL_INBOX_ID: chatwootProvisioning.socialInboxId || envValue(['CHATWOOT_SOCIAL_INBOX_ID'], ''),
    CHATWOOT_WEBHOOK_BRIDGE_SECRET: envValue(
      ['CHATWOOT_WEBHOOK_BRIDGE_SECRET'],
      chatwootProvisioning.callbackSecret || secretValue(['CHATWOOT_WEBHOOK_BRIDGE_SECRET'], {
        keychainServices: ['MAP_CHATWOOT_WEBHOOK_BRIDGE_SECRET', 'CHATWOOT_WEBHOOK_BRIDGE_SECRET'],
      }) || '',
    ),
    ZERNIO_API_BASE_URL: envValue(['ZERNIO_API_BASE_URL'], 'https://zernio.com/api/v1'),
    ZERNIO_API_KEY: envValue(
      ['ZERNIO_API_KEY'],
      secretValue(['ZERNIO_API_KEY'], {
        keychainServices: ['MAP_ZERNIO_API_KEY', 'ZERNIO_API_KEY'],
      }) || '',
    ),
    ZERNIO_INBOX_SEND_WEBHOOK_URL: envValue(['ZERNIO_INBOX_SEND_WEBHOOK_URL'], ''),
    ZERNIO_INBOX_SEND_SECRET: envValue(
      ['ZERNIO_INBOX_SEND_SECRET'],
      secretValue(['ZERNIO_INBOX_SEND_SECRET'], {
        keychainServices: ['MAP_ZERNIO_INBOX_SEND_SECRET', 'ZERNIO_INBOX_SEND_SECRET'],
      }) || '',
    ),
    ZERNIO_WEBHOOK_SECRET: options.allowPlaceholders ? envValue(['ZERNIO_WEBHOOK_SECRET'], 'dry-run-zernio-webhook-secret') : requiredValue(
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

function summarizeChatwootProvisioning(result) {
  if (!result) return null

  return {
    skipped: Boolean(result.skipped),
    reason: result.reason || undefined,
    accountId: result.accountId || undefined,
    userId: result.userId || undefined,
    userEmail: result.userEmail || undefined,
    websiteInboxId: result.websiteInboxId || undefined,
    socialInboxId: result.socialInboxId || undefined,
    callbackSecretConfigured: Boolean(result.callbackSecret),
    passwordReset: result.passwordReset?.skipped
      ? { sent: false, skipped: true, reason: result.passwordReset.reason }
      : result.passwordReset?.error
      ? { sent: false, error: result.passwordReset.error }
      : { sent: !result.skipped },
  }
}

async function syncDeploymentState({ client, signup, run, webhookResult, chatwootProvisioning, dryRun }) {
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
  const chatwootReady = chatwootProvisioning?.skipped
    ? 'Chatwoot tenant provisioning skipped.'
    : `Chatwoot account ${chatwootProvisioning?.accountId} and inboxes provisioned.`
  const stageNote = webhookResult?.configured
    ? `Portal worker deployed, custom domain attached, Zernio account webhook registered, and ${chatwootReady}`
    : `Portal worker deployed and custom domain attached; Zernio webhook setup still needs follow-up. ${chatwootReady}`

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
  const skipInitialRadar = Boolean(args['skip-initial-radar'])
  const skipChatwootProvisioning = Boolean(args['skip-chatwoot-provisioning'])
  const skipChatwootPasswordReset = Boolean(args['skip-chatwoot-password-reset'])
  const client = await loadClient(args)

  if (!client.portal_domain || !client.worker_name || !client.portal_subdomain) {
    throw new Error('Client is missing portal runtime fields. Run derive-tenant-bootstrap first.')
  }

  const signup = await loadSignupForClient(client.id)
  const run = await loadRun(args, client.id)
  const cloudflareToken = requiredValue(['CLOUDFLARE_API_TOKEN'], 'CLOUDFLARE_API_TOKEN')
  const accountId = await resolveCloudflareAccountId(cloudflareToken)
  const chatwootProvisioning = await provisionChatwootTenant({
    client,
    dryRun,
    skipChatwootProvisioning,
    skipChatwootPasswordReset,
  })
  const publicEnv = buildPublicEnv(client)
  const secretEnv = buildSecretEnv(client, chatwootProvisioning, { allowPlaceholders: dryRun })
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
      chatwootProvisioning,
      dryRun,
    })
    const initialOpportunityRadar = await runInitialOpportunityRadar({
      client,
      deploymentState,
      dryRun,
      skipInitialRadar,
    })
    printSummary('Portal deployment summary', {
      dryRun,
      clientId: client.id,
      clientSlug: client.slug,
      workerName: client.worker_name,
      portalDomain: client.portal_domain,
      cloudflareAccountId: accountId,
      chatwootProvisioning: summarizeChatwootProvisioning(chatwootProvisioning),
      webhookResult,
      deploymentState,
      initialOpportunityRadar,
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
