import { supabase, supabaseUrl } from './supabase'

const FUNCTION_BASE = `${supabaseUrl}/functions/v1`

export const UPLOAD_MIME_OPTIONS = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]

export const MAX_DOCUMENT_BYTES = 50 * 1024 * 1024

export async function fetchProfile() {
  const { data, error } = await supabase
    .from('users')
    .select('id, client_id, role, name, email, clients(*)')
    .single()

  if (error) throw error
  return data
}

export async function fetchMetrics(clientId) {
  const { data, error } = await supabase
    .from('daily_metrics')
    .select('*')
    .eq('client_id', clientId)
    .order('metric_date', { ascending: false })
    .limit(90)

  if (error) throw error
  return data ?? []
}

export async function fetchDocuments() {
  const { data, error } = await supabase
    .from('documents')
    .select('id, file_name, mime_type, category, description, size_bytes, storage_path, created_at, updated_at, is_archived')
    .order('created_at', { ascending: false })

  if (error) throw error
  return data ?? []
}

export async function fetchShareLinks() {
  const { data, error } = await supabase
    .from('share_links')
    .select('id, document_id, token, expires_at, max_uses, use_count, revoked_at, created_at')
    .order('created_at', { ascending: false })

  if (error) throw error
  return data ?? []
}

export function getSessionClaims(session) {
  const accessToken = session?.access_token

  if (!accessToken) return {}

  try {
    const [, payload] = accessToken.split('.')
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
    return JSON.parse(window.atob(padded))
  } catch {
    return {}
  }
}

async function getAccessToken() {
  const { data, error } = await supabase.auth.getSession()
  if (error) throw error

  const accessToken = data.session?.access_token
  if (!accessToken) {
    throw new Error('You are not signed in.')
  }

  return accessToken
}

async function callEdgeFunction(path, body, options = {}) {
  const accessToken = options.public ? null : await getAccessToken()
  const response = await fetch(`${FUNCTION_BASE}/${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify(body ?? {}),
  })

  const payload = await response.json().catch(() => ({}))

  if (!response.ok) {
    const message = payload?.error || payload?.detail || `Request failed with status ${response.status}`
    const error = new Error(message)
    error.status = response.status
    error.payload = payload
    throw error
  }

  return payload
}

export async function getDocumentUrl(documentId) {
  return callEdgeFunction('get-document-url', { document_id: documentId })
}

export async function getUploadUrl(input) {
  return callEdgeFunction('get-upload-url', input)
}

export async function resolveShareLink(token) {
  return callEdgeFunction('resolve-share-link', { token }, { public: true })
}

export async function uploadFileToSignedUrl(uploadUrl, file) {
  const response = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': file.type || 'application/octet-stream',
      'x-upsert': 'false',
    },
    body: file,
  })

  if (!response.ok) {
    throw new Error(`Upload failed with status ${response.status}`)
  }
}

export async function createShareLink({ documentId, expiresAt, maxUses }) {
  const { data, error } = await supabase
    .from('share_links')
    .insert({
      document_id: documentId,
      token: crypto.randomUUID().replace(/-/g, ''),
      expires_at: expiresAt || null,
      max_uses: maxUses ?? null,
    })
    .select('id, document_id, token, expires_at, max_uses, use_count, revoked_at, created_at')
    .single()

  if (error) throw error
  return data
}

export async function revokeShareLink(shareLinkId) {
  const { data, error } = await supabase
    .from('share_links')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', shareLinkId)
    .is('revoked_at', null)
    .select('id')
    .single()

  if (error) throw error
  return data
}
