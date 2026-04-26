import { supabase, supabaseUrl } from './supabase'

const FUNCTION_BASE = `${supabaseUrl}/functions/v1`
const N8N_BASE = import.meta.env.VITE_N8N_BASE_URL || 'https://n8n.myautomationpartner.com'

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
    .select('id, client_id, role, name, email, clients(*, client_planner_profiles(*))')
    .single()

  if (error) throw error
  return data
}

export async function fetchWorkspacePreferences(clientId, userId) {
  if (!clientId || !userId) return null

  const { data, error } = await supabase
    .from('portal_workspace_preferences')
    .select('id, client_id, user_id, workspace_tools_json, updated_at')
    .eq('client_id', clientId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw error
  return data ?? null
}

export async function fetchSocialConnections(clientId) {
  if (!clientId) return []

  const { data, error } = await supabase
    .from('social_connections')
    .select('platform, zernio_account_id, username, connected_at')
    .eq('client_id', clientId)

  if (error) throw error
  return data || []
}

export async function fetchResearchSources(clientId) {
  if (!clientId) return []

  const { data, error } = await supabase
    .from('client_research_sources')
    .select('id, client_id, source_type, label, url, handle, platform, priority, is_active, last_checked_at, created_at, updated_at')
    .eq('client_id', clientId)
    .order('priority', { ascending: true })
    .order('created_at', { ascending: false })

  if (error) throw error
  return data || []
}

export async function fetchResearchProfile(clientId) {
  if (!clientId) return null

  const { data, error } = await supabase
    .from('client_research_profiles')
    .select('id, client_id, service_area, audience_summary, offer_focus_json, preferred_platforms, blocked_topics_json, research_notes, cadence, is_active, created_at, updated_at')
    .eq('client_id', clientId)
    .maybeSingle()

  if (error) throw error
  return data ?? null
}

export async function updateClientPartnerProfile(clientId, changes) {
  if (!clientId) throw new Error('Client profile is still loading.')

  const allowedFields = [
    'business_type',
    'business_subtype',
    'business_category',
    'business_reach',
    'country_code',
    'state_code',
    'postal_code',
    'county',
    'website_url',
  ]
  const payload = Object.fromEntries(
    Object.entries(changes || {})
      .filter(([key]) => allowedFields.includes(key))
      .map(([key, value]) => [key, typeof value === 'string' ? value.trim() || null : value]),
  )

  const { data, error } = await supabase
    .from('clients')
    .update(payload)
    .eq('id', clientId)
    .select('*')
    .single()

  if (error) throw error
  return data
}

export async function upsertResearchProfile({
  clientId,
  serviceArea,
  audienceSummary,
  offerFocus,
  blockedTopics,
  researchNotes,
  cadence = 'weekly',
}) {
  if (!clientId) throw new Error('Client profile is still loading.')

  const { data, error } = await supabase
    .from('client_research_profiles')
    .upsert({
      client_id: clientId,
      service_area: serviceArea?.trim() || null,
      audience_summary: audienceSummary?.trim() || null,
      offer_focus_json: Array.isArray(offerFocus) ? offerFocus : [],
      blocked_topics_json: Array.isArray(blockedTopics) ? blockedTopics : [],
      research_notes: researchNotes?.trim() || null,
      cadence,
      is_active: true,
    }, {
      onConflict: 'client_id',
    })
    .select('id, client_id, service_area, audience_summary, offer_focus_json, preferred_platforms, blocked_topics_json, research_notes, cadence, is_active, created_at, updated_at')
    .single()

  if (error) throw error
  return data
}

export async function createResearchSource({ clientId, sourceType = 'local_event_calendar', label, url, handle = null, platform = null, priority = 1 }) {
  if (!clientId) throw new Error('Client profile is still loading.')
  if (!label?.trim()) throw new Error('Give this source a short name.')
  if (!url?.trim() && !handle?.trim()) throw new Error('Add a calendar link, website URL, or handle.')

  const { data, error } = await supabase
    .from('client_research_sources')
    .insert({
      client_id: clientId,
      source_type: sourceType,
      label: label.trim(),
      url: url?.trim() || null,
      handle: handle?.trim() || null,
      platform: platform?.trim() || null,
      priority,
      is_active: true,
    })
    .select('id, client_id, source_type, label, url, handle, platform, priority, is_active, last_checked_at, created_at, updated_at')
    .single()

  if (error) throw error
  return data
}

export async function updateResearchSource(sourceId, changes) {
  if (!sourceId) throw new Error('Research source is required.')

  const { data, error } = await supabase
    .from('client_research_sources')
    .update(changes)
    .eq('id', sourceId)
    .select('id, client_id, source_type, label, url, handle, platform, priority, is_active, last_checked_at, created_at, updated_at')
    .single()

  if (error) throw error
  return data
}

export async function deleteResearchSource(sourceId) {
  if (!sourceId) throw new Error('Research source is required.')

  const { error } = await supabase
    .from('client_research_sources')
    .delete()
    .eq('id', sourceId)

  if (error) throw error
  return true
}

const CAMPAIGN_PROJECT_SELECT = 'id, client_id, title, campaign_type, goal, date_window, status, is_reusable, prompt_json, plan_json, source_project_id, created_by, created_at, updated_at'

export async function fetchCampaignProjects(clientId) {
  if (!clientId) return []

  const { data, error } = await supabase
    .from('client_campaign_projects')
    .select(CAMPAIGN_PROJECT_SELECT)
    .eq('client_id', clientId)
    .neq('status', 'archived')
    .order('updated_at', { ascending: false })

  if (error) throw error
  return data || []
}

export async function createCampaignProject(row) {
  if (!row?.client_id) throw new Error('Client profile is still loading.')
  if (!row?.title?.trim()) throw new Error('Campaign name is required.')

  const { data, error } = await supabase
    .from('client_campaign_projects')
    .insert({
      ...row,
      title: row.title.trim(),
      goal: row.goal?.trim() || null,
      date_window: row.date_window?.trim() || null,
    })
    .select(CAMPAIGN_PROJECT_SELECT)
    .single()

  if (error) throw error
  return data
}

export async function updateCampaignProject(projectId, changes) {
  if (!projectId) throw new Error('Campaign project is required.')

  const { data, error } = await supabase
    .from('client_campaign_projects')
    .update(changes)
    .eq('id', projectId)
    .select(CAMPAIGN_PROJECT_SELECT)
    .single()

  if (error) throw error
  return data
}

export async function archiveCampaignProject(projectId) {
  return updateCampaignProject(projectId, { status: 'archived' })
}

export async function deleteCampaignProject(projectId) {
  if (!projectId) throw new Error('Campaign project is required.')

  const { error } = await supabase
    .from('client_campaign_projects')
    .delete()
    .eq('id', projectId)

  if (error) throw error
  return true
}

export async function upsertWorkspacePreferences({ clientId, userId, workspaceTools }) {
  if (!clientId || !userId) {
    throw new Error('Client and user are required to save workspace preferences.')
  }

  const { data, error } = await supabase
    .from('portal_workspace_preferences')
    .upsert({
      client_id: clientId,
      user_id: userId,
      workspace_tools_json: workspaceTools,
    }, {
      onConflict: 'client_id,user_id',
    })
    .select('id, client_id, user_id, workspace_tools_json, updated_at')
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
    .eq('status', 'scheduled')
    .order('scheduled_for', { ascending: true })

  if (error) throw error
  return data ?? []
}

export async function fetchCalendarPosts(clientId) {
  if (!clientId) return []

  const { data, error } = await supabase
    .from('posts')
    .select('id, client_id, content, media_url, platforms, status, scheduled_for, published_at, created_at, n8n_execution_id')
    .eq('client_id', clientId)
    .in('status', ['scheduled', 'published'])
    .or('scheduled_for.not.is.null,published_at.not.is.null')
    .order('created_at', { ascending: false })
    .limit(120)

  if (error) throw error
  return data ?? []
}

export async function fetchPostById(postId) {
  if (!postId) return null

  const { data, error } = await supabase
    .from('posts')
    .select('id, client_id, content, media_url, platforms, status, scheduled_for, published_at, created_at, n8n_execution_id')
    .eq('id', postId)
    .maybeSingle()

  if (error) throw error
  return data ?? null
}

export async function reconcileScheduledPosts(clientId, options = {}) {
  if (!clientId) return { publishedCount: 0 }

  const graceMinutes = Number.isFinite(options.graceMinutes) ? options.graceMinutes : 10
  const cutoff = new Date(Date.now() - graceMinutes * 60 * 1000).toISOString()

  const { data, error } = await supabase
    .from('posts')
    .select('id, scheduled_for')
    .eq('client_id', clientId)
    .eq('status', 'scheduled')
    .not('scheduled_for', 'is', null)
    .lte('scheduled_for', cutoff)

  if (error) throw error

  const overduePosts = data ?? []
  if (overduePosts.length) {
    const updates = overduePosts.map((post) => (
      supabase
        .from('posts')
        .update({
          status: 'published',
          published_at: post.scheduled_for || new Date().toISOString(),
        })
        .eq('id', post.id)
    ))

    const results = await Promise.all(updates)
    const failed = results.find((result) => result.error)
    if (failed?.error) throw failed.error
  }

  const { data: scheduledRows, error: scheduledError } = await supabase
    .from('posts')
    .select('id, scheduled_for, n8n_execution_id')
    .eq('client_id', clientId)
    .eq('status', 'scheduled')
    .not('scheduled_for', 'is', null)
    .not('n8n_execution_id', 'is', null)

  if (scheduledError) throw scheduledError

  const syncCandidates = scheduledRows ?? []
  const syncResults = await Promise.allSettled(
    syncCandidates.map(async (post) => {
      const response = await fetch(`${N8N_BASE}/webhook/social-sync-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          postId: post.id,
          clientId,
          zernioPostId: post.n8n_execution_id,
          scheduledFor: post.scheduled_for,
        }),
      })

      const raw = await response.text()
      let payload = {}
      try {
        payload = raw ? JSON.parse(raw) : {}
      } catch {
        payload = {}
      }

      if (!response.ok) {
        throw new Error(payload?.message || raw || 'Scheduled post reconciliation failed.')
      }

      return payload
    }),
  )

  return {
    publishedCount: overduePosts.length,
    syncedCount: syncResults.filter((result) => result.status === 'fulfilled').length,
  }
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

export async function recordPlannerFeedbackEvent(event) {
  const payload = {
    client_id: event.clientId,
    draft_id: event.draftId || null,
    post_type: event.postType,
    event_type: event.eventType,
    angle_id: event.angleId || null,
    edit_severity: event.editSeverity || null,
    event_metadata: event.metadata && typeof event.metadata === 'object' ? event.metadata : {},
  }

  const { data, error } = await supabase
    .from('client_planner_feedback_events')
    .insert(payload)
    .select('id, client_id, draft_id, post_type, event_type, angle_id, edit_severity, event_metadata, created_at')
    .single()

  if (error) throw error
  return data
}

export async function fetchOpportunityRadar(clientId) {
  if (!clientId) return []

  const { data, error } = await supabase
    .from('client_local_opportunities')
    .select(`
      id,
      client_id,
      research_run_id,
      opportunity_type,
      title,
      summary,
      why_it_matters,
      local_context,
      suggested_timing,
      starts_at,
      ends_at,
      expires_at,
      confidence_score,
      urgency_score,
      ad_worthiness,
      review_state,
      source_urls,
      evidence_json,
      created_at,
      updated_at,
      client_opportunity_suggestions (
        id,
        client_id,
        opportunity_id,
        suggestion_type,
        title,
        caption_starter,
        creative_direction,
        recommended_platforms,
        recommended_publish_at,
        ad_brief_json,
        review_state,
        converted_draft_id,
        created_at,
        updated_at
      )
    `)
    .eq('client_id', clientId)
    .neq('review_state', 'archived')
    .order('created_at', { ascending: false })
    .limit(40)

  if (error) throw error
  return data ?? []
}

export async function updateOpportunityState(opportunityId, reviewState) {
  const { data, error } = await supabase
    .from('client_local_opportunities')
    .update({ review_state: reviewState })
    .eq('id', opportunityId)
    .select('id, client_id, review_state, updated_at')
    .single()

  if (error) throw error
  return data
}

export async function updateOpportunitySuggestionState(suggestionId, changes) {
  const { data, error } = await supabase
    .from('client_opportunity_suggestions')
    .update(changes)
    .eq('id', suggestionId)
    .select('id, client_id, opportunity_id, review_state, converted_draft_id, updated_at')
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

export async function createBillingCheckoutSession(input) {
  return callEdgeFunction('stripe-create-checkout-session', input)
}

export async function createBillingPortalSession(input) {
  return callEdgeFunction('stripe-create-portal-session', input)
}

export async function generatePublisherImage(input) {
  return callEdgeFunction('portal-generate-image', input)
}

export async function generateCampaignPlan(input) {
  return callEdgeFunction('portal-generate-campaign', input)
}

export async function generatePublisherAssist(input) {
  return callEdgeFunction('portal-ai-assist', input)
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
