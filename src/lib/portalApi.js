import { supabase, supabaseUrl } from './supabase'

const FUNCTION_BASE = `${supabaseUrl}/functions/v1`

export const UPLOAD_MIME_OPTIONS = [
  'application/pdf',
  'text/csv',
  'application/csv',
  'text/tab-separated-values',
  'text/plain',
  'text/markdown',
  'application/json',
  'application/rtf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/bmp',
  'image/tiff',
  'image/avif',
  'image/heic',
  'image/heif',
  'image/svg+xml',
  'application/msword',
  'application/vnd.ms-excel',
  'application/vnd.ms-powerpoint',
  'application/vnd.ms-word.document.macroEnabled.12',
  'application/vnd.ms-excel.sheet.macroEnabled.12',
  'application/vnd.ms-excel.template.macroEnabled.12',
  'application/vnd.ms-powerpoint.presentation.macroEnabled.12',
  'application/vnd.ms-powerpoint.slideshow.macroEnabled.12',
  'application/vnd.ms-powerpoint.template.macroEnabled.12',
  'application/vnd.google-apps.document',
  'application/vnd.google-apps.spreadsheet',
  'application/vnd.google-apps.presentation',
  'application/vnd.google-apps.drawing',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.oasis.opendocument.spreadsheet',
  'application/vnd.oasis.opendocument.presentation',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.template',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.template',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.presentationml.slideshow',
  'application/vnd.openxmlformats-officedocument.presentationml.template',
]

const MIME_BY_EXTENSION = {
  csv: 'text/csv',
  tsv: 'text/tab-separated-values',
  txt: 'text/plain',
  md: 'text/markdown',
  json: 'application/json',
  rtf: 'application/rtf',
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  bmp: 'image/bmp',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  avif: 'image/avif',
  heic: 'image/heic',
  heif: 'image/heif',
  svg: 'image/svg+xml',
  doc: 'application/msword',
  docm: 'application/vnd.ms-word.document.macroEnabled.12',
  xls: 'application/vnd.ms-excel',
  xlsm: 'application/vnd.ms-excel.sheet.macroEnabled.12',
  xltm: 'application/vnd.ms-excel.template.macroEnabled.12',
  ppt: 'application/vnd.ms-powerpoint',
  pptm: 'application/vnd.ms-powerpoint.presentation.macroEnabled.12',
  ppsm: 'application/vnd.ms-powerpoint.slideshow.macroEnabled.12',
  potm: 'application/vnd.ms-powerpoint.template.macroEnabled.12',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  dotx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.template',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xltx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.template',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ppsx: 'application/vnd.openxmlformats-officedocument.presentationml.slideshow',
  potx: 'application/vnd.openxmlformats-officedocument.presentationml.template',
  gdoc: 'application/vnd.google-apps.document',
  gsheet: 'application/vnd.google-apps.spreadsheet',
  gslides: 'application/vnd.google-apps.presentation',
  odt: 'application/vnd.oasis.opendocument.text',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
  odp: 'application/vnd.oasis.opendocument.presentation',
}

export const MAX_DOCUMENT_BYTES = 50 * 1024 * 1024

export function resolveUploadMimeType(file) {
  if (UPLOAD_MIME_OPTIONS.includes(file.type)) return file.type

  const extension = file.name.split('.').pop()?.toLowerCase()
  const inferredMime = extension ? MIME_BY_EXTENSION[extension] : null

  return inferredMime && UPLOAD_MIME_OPTIONS.includes(inferredMime) ? inferredMime : ''
}

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

export async function fetchScheduledPosts(clientId) {
  if (!clientId) return []

  const { data, error } = await supabase
    .from('posts')
    .select('id, client_id, content, media_url, platforms, status, scheduled_for, published_at, created_at, n8n_execution_id')
    .eq('client_id', clientId)
    .not('scheduled_for', 'is', null)
    .in('status', ['draft', 'scheduled', 'published'])
    .order('scheduled_for', { ascending: true })

  if (error) throw error
  return data ?? []
}

export async function fetchSocialDrafts(clientId) {
  if (!clientId) return []

  const { data, error } = await supabase
    .from('social_drafts')
    .select('id, client_id, planner_client_slug, planner_policy_version, slot_date_local, slot_label, slot_start_local, slot_end_local, timezone, scheduled_for, post_type, draft_title, draft_body, draft_caption, review_state, review_notes, asset_requirements_json, seasonal_modifier_context_json, published_reference, created_at, updated_at')
    .eq('client_id', clientId)
    .order('scheduled_for', { ascending: true })

  if (error) throw error
  return data ?? []
}

export async function createSocialDrafts(rows) {
  const { data, error } = await supabase
    .from('social_drafts')
    .insert(rows)
    .select('id, slot_date_local, slot_label, post_type, draft_title, draft_body, draft_caption, review_state, review_notes, asset_requirements_json, created_at, updated_at')

  if (error) throw error
  return data ?? []
}

export async function upsertSocialDraft(row) {
  const { data, error } = await supabase
    .from('social_drafts')
    .upsert(row, {
      onConflict: 'client_id,slot_date_local,slot_label',
    })
    .select('id, client_id, planner_client_slug, planner_policy_version, slot_date_local, slot_label, slot_start_local, slot_end_local, timezone, scheduled_for, post_type, draft_title, draft_body, draft_caption, review_state, review_notes, asset_requirements_json, seasonal_modifier_context_json, published_reference, created_at, updated_at')
    .single()

  if (error) throw error
  return data
}

export async function updateSocialDraft(draftId, changes) {
  const { data, error } = await supabase
    .from('social_drafts')
    .update(changes)
    .eq('id', draftId)
    .select('id, client_id, planner_client_slug, planner_policy_version, slot_date_local, slot_label, slot_start_local, slot_end_local, timezone, scheduled_for, post_type, draft_title, draft_body, draft_caption, review_state, review_notes, asset_requirements_json, seasonal_modifier_context_json, published_reference, created_at, updated_at')
    .single()

  if (error) throw error
  return data
}

export async function deleteSocialDraft(draftId) {
  const { error } = await supabase
    .from('social_drafts')
    .delete()
    .eq('id', draftId)

  if (error) throw error
}

export async function deletePost(postId) {
  const { error } = await supabase
    .from('posts')
    .delete()
    .eq('id', postId)

  if (error) throw error
}

export async function fetchDocuments() {
  const { data, error } = await supabase
    .from('documents')
    .select('id, file_name, mime_type, category, description, size_bytes, storage_path, created_at, updated_at')
    .order('created_at', { ascending: false })

  if (error) throw error
  return data ?? []
}

export async function updateDocumentMetadata(documentId, changes) {
  const payload = {}

  if (Object.prototype.hasOwnProperty.call(changes, 'file_name')) {
    payload.file_name = changes.file_name ? changes.file_name.trim() : null
  }

  if (Object.prototype.hasOwnProperty.call(changes, 'category')) {
    payload.category = changes.category ? changes.category.trim() : null
  }

  if (Object.prototype.hasOwnProperty.call(changes, 'description')) {
    payload.description = changes.description ? changes.description.trim() : null
  }

  const { data, error } = await supabase
    .from('documents')
    .update(payload)
    .eq('id', documentId)
    .select('id, file_name, mime_type, category, description, size_bytes, storage_path, created_at, updated_at')
    .single()

  if (error) throw error
  return data
}

export async function deleteDocument(documentId, storagePath) {
  if (!documentId) {
    throw new Error('Missing document id.')
  }

  if (storagePath) {
    const { error: storageError } = await supabase.storage
      .from('documents')
      .remove([storagePath])

    if (storageError) throw storageError
  }

  const { error } = await supabase
    .from('documents')
    .delete()
    .eq('id', documentId)

  if (error) throw error
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

export async function uploadFileToSignedUrl(uploadUrl, file, mimeType) {
  const response = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': mimeType || file.type || 'application/octet-stream',
      'x-upsert': 'false',
    },
    body: file,
  })

  if (!response.ok) {
    throw new Error(`Upload failed with status ${response.status}`)
  }
}

export async function createShareLink({ documentId, clientId, expiresAt, maxUses }) {
  const { data, error } = await supabase
    .from('share_links')
    .insert({
      document_id: documentId,
      client_id: clientId,
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
