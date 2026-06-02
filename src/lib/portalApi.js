import { supabase, supabaseUrl } from './supabase'
import { portalPath } from './portalPath'
import {
  buildSecureVaultRoomUrl,
  buildSecureVaultShareUrl,
  generateRoomToken,
  normalizeRoomExpiry,
  sha256Hex,
} from './secureVault'
import {
  selectPrivateMessageConversations,
  summarizeInboxNotifications,
} from './inboxClassification'

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
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'video/x-m4v',
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
  mp4: 'video/mp4',
  m4v: 'video/x-m4v',
  mov: 'video/quicktime',
  webm: 'video/webm',
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
  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError) throw userError

  const userId = userData?.user?.id
  if (!userId) throw new Error('You are not signed in.')

  const { data, error } = await supabase
    .from('users')
    .select('id, client_id, role, name, email, portal_permissions, disabled_at, clients(*, client_planner_profiles(*))')
    .eq('id', userId)
    .single()

  if (error) throw error
  return data
}

export async function fetchWorkspacePreferences(clientId, userId) {
  if (!clientId || !userId) return null

  const { data, error } = await supabase
    .from('portal_workspace_preferences')
    .select('id, client_id, user_id, workspace_tools_json, today_queue_state_json, updated_at')
    .eq('client_id', clientId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw error
  return data ?? null
}

const WORKSPACE_PREFERENCE_SELECT = 'id, client_id, user_id, workspace_tools_json, today_queue_state_json, updated_at'

export async function fetchSocialConnections(clientId) {
  if (!clientId) return []

  const { data, error } = await supabase
    .from('social_connections')
    .select('platform, zernio_account_id, zernio_profile_id, username, connected_at')
    .eq('client_id', clientId)

  if (error) throw error
  return data || []
}

export async function startSocialConnection({ clientId, platform, redirectUrl }) {
  return callPortalWorker('/api/n8n/zernio-connect-url', {
    method: 'POST',
    body: JSON.stringify({
      clientId,
      platform,
      redirectUrl,
    }),
  })
}

export async function refreshSocialConnections(platform) {
  return callPortalWorker('/api/social-connections/refresh', {
    method: 'POST',
    body: JSON.stringify({ platform }),
  })
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
    .select('id, client_id, service_area, audience_summary, offer_focus_json, preferred_platforms, blocked_topics_json, research_notes, cadence, is_active, partner_training_verified_at, partner_training_verified_by, created_at, updated_at')
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
  partnerTrainingVerifiedAt,
  partnerTrainingVerifiedBy,
}) {
  if (!clientId) throw new Error('Client profile is still loading.')

  const payload = {
    client_id: clientId,
    service_area: serviceArea?.trim() || null,
    audience_summary: audienceSummary?.trim() || null,
    offer_focus_json: Array.isArray(offerFocus) ? offerFocus : [],
    blocked_topics_json: Array.isArray(blockedTopics) ? blockedTopics : [],
    research_notes: researchNotes?.trim() || null,
    cadence,
    is_active: true,
  }

  if (partnerTrainingVerifiedAt) {
    payload.partner_training_verified_at = partnerTrainingVerifiedAt
    payload.partner_training_verified_by = partnerTrainingVerifiedBy || null
  }

  const { data, error } = await supabase
    .from('client_research_profiles')
    .upsert(payload, {
      onConflict: 'client_id',
    })
    .select('id, client_id, service_area, audience_summary, offer_focus_json, preferred_platforms, blocked_topics_json, research_notes, cadence, is_active, partner_training_verified_at, partner_training_verified_by, created_at, updated_at')
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

function getCampaignDraftIds(project) {
  const posts = Array.isArray(project?.plan_json?.posts) ? project.plan_json.posts : []
  return [...new Set(posts.map((post) => post?.campaignDraftId).filter(Boolean))]
}

export function getLinkedCampaignPostIds(drafts = []) {
  return [...new Set(drafts.map((draft) => String(draft?.published_reference || '').trim()).filter(Boolean))]
}

export function isFutureCampaignCalendarPost(post) {
  if (!post) return false
  return post.status === 'scheduled'
}

export async function fetchCampaignLinkedPosts(clientId, postIds = []) {
  const ids = [...new Set(postIds.filter(Boolean))]
  if (!clientId || !ids.length) return []

  const { data, error } = await supabase
    .from('posts')
    .select('id, client_id, status, scheduled_for, published_at')
    .eq('client_id', clientId)
    .in('id', ids)

  if (error) throw error
  return data ?? []
}

export async function fetchCampaignProjectDrafts(project) {
  if (!project?.id || !project?.client_id) return []

  const rowsById = new Map()
  const draftIds = getCampaignDraftIds(project)
  const selectColumns = 'id, client_id, source_workflow, slot_label, review_state, review_notes, published_reference'

  if (draftIds.length) {
    const { data, error } = await supabase
      .from('social_drafts')
      .select(selectColumns)
      .eq('client_id', project.client_id)
      .in('id', draftIds)

    if (error) throw error
    ;(data ?? []).forEach((row) => rowsById.set(row.id, row))
  }

  const { data: slotRows, error: slotError } = await supabase
    .from('social_drafts')
    .select(selectColumns)
    .eq('client_id', project.client_id)
    .eq('source_workflow', 'campaign_partner')
    .like('slot_label', `campaign_${project.id.slice(0, 8)}_%`)

  if (slotError) throw slotError
  ;(slotRows ?? []).forEach((row) => rowsById.set(row.id, row))

  const { data: noteRows, error: noteError } = await supabase
    .from('social_drafts')
    .select(selectColumns)
    .eq('client_id', project.client_id)
    .eq('source_workflow', 'campaign_partner')
    .ilike('review_notes', `%${project.id}%`)

  if (noteError) throw noteError
  ;(noteRows ?? []).forEach((row) => rowsById.set(row.id, row))

  return [...rowsById.values()]
}

export async function deleteCampaignProjectWithDrafts(project) {
  if (!project?.id) throw new Error('Campaign project is required.')
  if (!project?.client_id) throw new Error('Campaign client is required.')

  const drafts = await fetchCampaignProjectDrafts(project)
  const draftIds = drafts.map((draft) => draft.id).filter(Boolean)
  const linkedPostIds = getLinkedCampaignPostIds(drafts)
  const linkedPosts = await fetchCampaignLinkedPosts(project.client_id, linkedPostIds)
  const futurePostIds = linkedPosts
    .filter(isFutureCampaignCalendarPost)
    .map((post) => post.id)

  for (const postId of futurePostIds) {
    await deletePost(postId)
  }

  if (draftIds.length) {
    const { error } = await supabase
      .from('social_drafts')
      .delete()
      .eq('client_id', project.client_id)
      .in('id', draftIds)

    if (error) throw error
  }

  await deleteCampaignProject(project.id)

  return {
    deletedDraftCount: draftIds.length,
    deletedDraftIds: draftIds,
    deletedPostCount: futurePostIds.length,
    deletedPostIds: futurePostIds,
    preservedPublishedPostCount: linkedPosts.filter((post) => post.status === 'published').length,
  }
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
    .select(WORKSPACE_PREFERENCE_SELECT)
    .single()

  if (error) throw error
  return data
}

export async function saveTodayQueueState({ clientId, userId, todayQueueState }) {
  if (!clientId || !userId) {
    throw new Error('Client and user are required to save Today state.')
  }

  const payload = todayQueueState && typeof todayQueueState === 'object' && !Array.isArray(todayQueueState)
    ? todayQueueState
    : {}

  const { data: updated, error: updateError } = await supabase
    .from('portal_workspace_preferences')
    .update({ today_queue_state_json: payload })
    .eq('client_id', clientId)
    .eq('user_id', userId)
    .select(WORKSPACE_PREFERENCE_SELECT)
    .maybeSingle()

  if (updateError) throw updateError
  if (updated) return updated

  const { data, error } = await supabase
    .from('portal_workspace_preferences')
    .insert({
      client_id: clientId,
      user_id: userId,
      workspace_tools_json: [],
      today_queue_state_json: payload,
    })
    .select(WORKSPACE_PREFERENCE_SELECT)
    .single()

  if (error) throw error
  return data
}

function normalizeConversationResponse(payload) {
  const data = payload?.data || payload || {}
  return {
    meta: data.meta || payload?.meta || {},
    conversations: Array.isArray(data.payload) ? data.payload : Array.isArray(payload?.payload) ? payload.payload : [],
  }
}

export async function fetchInboxConversations(options = {}) {
  const params = new URLSearchParams({
    status: options.status || 'open',
    assignee_type: 'all',
    page: '1',
  })
  if (options.inboxId) params.set('inbox_id', String(options.inboxId))
  if (options.query) params.set('q', String(options.query))

  const payload = await callPortalWorker(`/api/chatwoot/conversations?${params.toString()}`)
  return normalizeConversationResponse(payload).conversations.slice(0, options.limit || 12)
}

export async function fetchChatwootInboxes() {
  const payload = await callPortalWorker('/api/chatwoot/inboxes')
  return Array.isArray(payload?.payload) ? payload.payload : []
}

export async function fetchInboxCommentPosts(options = {}) {
  const params = new URLSearchParams({
    limit: String(options.limit || 30),
    minComments: '1',
  })
  if (options.platform) params.set('platform', options.platform)
  if (options.accountId) params.set('accountId', options.accountId)
  return callPortalWorker(`/api/zernio/comments?${params.toString()}`)
}

export function fetchInboxPostComments(post) {
  if (!post?.id || !post?.accountId) return Promise.resolve({ comments: [] })
  const params = new URLSearchParams({ accountId: post.accountId })
  if (post.isAd) params.set('isAd', '1')
  if (post.adId) params.set('adId', post.adId)
  if (post.placement) params.set('placement', post.placement)
  return callPortalWorker(`/api/zernio/comments/${encodeURIComponent(post.id)}?${params.toString()}`)
}

export async function fetchInboxCommentBundles(posts = [], options = {}) {
  const targets = posts.slice(0, options.limit || 12)
  const results = await Promise.allSettled(targets.map((post) => fetchInboxPostComments(post)))
  return targets.map((post, index) => ({
    post,
    comments: results[index]?.status === 'fulfilled' && Array.isArray(results[index].value?.comments)
      ? results[index].value.comments
      : [],
    error: results[index]?.status === 'rejected' ? results[index].reason?.message : '',
  }))
}

export async function fetchInboxNotificationCounts(options = {}) {
  const [inboxResult, conversationResult, postResult] = await Promise.allSettled([
    fetchChatwootInboxes(),
    fetchInboxConversations({ status: 'open', limit: 50 }),
    fetchInboxCommentPosts({ limit: 30 }),
  ])

  const inboxes = inboxResult.status === 'fulfilled' ? inboxResult.value : []
  const conversations = conversationResult.status === 'fulfilled' ? conversationResult.value : []
  const commentPosts = postResult.status === 'fulfilled' && Array.isArray(postResult.value?.posts)
    ? postResult.value.posts
    : []
  const commentBundles = commentPosts.length ? await fetchInboxCommentBundles(commentPosts, { limit: 12 }) : []
  const privateConversations = selectPrivateMessageConversations(conversations, inboxes, {
    businessNames: options.businessNames || [],
  })

  return summarizeInboxNotifications({ privateConversations, commentBundles })
}

export async function fetchMetrics(clientId) {
  const { data, error } = await supabase
    .from('daily_metrics')
    .select('*')
    .eq('client_id', clientId)
    .order('metric_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(365)

  if (error) throw error
  return data ?? []
}

export async function fetchDashboardSocialMetrics(options = {}) {
  const params = new URLSearchParams({
    sync: options.sync === false ? '0' : '1',
  })
  if (options.force) params.set('force', '1')

  return callPortalWorker(`/api/dashboard-social-metrics?${params.toString()}`)
}

export async function fetchScheduledPosts(clientId) {
  if (!clientId) return []

  const { data, error } = await supabase
    .from('posts')
    .select('id, client_id, content, media_url, platforms, status, scheduled_for, published_at, created_at, n8n_execution_id, platform_variants_json')
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
    .select('id, client_id, content, media_url, platforms, status, scheduled_for, published_at, created_at, n8n_execution_id, platform_variants_json')
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
    .select('id, client_id, content, media_url, platforms, status, scheduled_for, published_at, created_at, n8n_execution_id, platform_variants_json')
    .eq('id', postId)
    .maybeSingle()

  if (error) throw error
  return data ?? null
}

export async function fetchPostBoosts(clientId, options = {}) {
  if (!clientId) return []

  const { data, error } = await supabase
    .from('post_boosts')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })

  if (error) throw error

  const postId = options.postId || ''
  return postId ? (data ?? []).filter((boost) => boost.post_id === postId) : (data ?? [])
}

export async function fetchPostMetrics(platform, options = {}) {
  if (!platform) return { posts: [], sync: null }

  const params = new URLSearchParams({
    platform,
    sync: options.sync === false ? '0' : '1',
  })
  if (options.force) params.set('force', '1')

  return callPortalWorker(`/api/post-metrics?${params.toString()}`)
}

export async function fetchPostBoostReadiness(postId) {
  if (!postId) return null

  const accessToken = await getAccessToken()
  const params = new URLSearchParams({ postId })
  const response = await fetch(portalPath(`/api/post-boost-readiness?${params.toString()}`), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok || payload?.success === false) {
    const error = new Error(payload?.error || payload?.message || `Boost readiness check failed (${response.status}).`)
    error.status = response.status
    error.payload = payload
    throw error
  }

  return payload.readiness ?? null
}

export async function fetchBoostAdAccounts(platform) {
  const normalizedPlatform = String(platform || '').trim()
  if (!normalizedPlatform) return []

  const accessToken = await getAccessToken()
  const params = new URLSearchParams({ platform: normalizedPlatform })
  const response = await fetch(portalPath(`/api/boost-ad-accounts?${params.toString()}`), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok || payload?.success === false) {
    const error = new Error(payload?.error || payload?.message || `Boost ad account lookup failed (${response.status}).`)
    error.status = response.status
    error.payload = payload
    throw error
  }

  return payload.accounts ?? []
}

export async function searchBoostTargeting({ platform, geoType, query, countryCode = 'US' }) {
  const normalizedPlatform = String(platform || '').trim()
  const normalizedGeoType = String(geoType || '').trim()
  const normalizedQuery = String(query || '').trim()
  if (!normalizedPlatform || !normalizedGeoType || !normalizedQuery) return []

  const accessToken = await getAccessToken()
  const params = new URLSearchParams({
    platform: normalizedPlatform,
    geoType: normalizedGeoType,
    q: normalizedQuery,
    countryCode: String(countryCode || 'US').trim().toUpperCase().slice(0, 2) || 'US',
  })
  const response = await fetch(portalPath(`/api/boost-targeting-search?${params.toString()}`), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok || payload?.success === false) {
    const error = new Error(payload?.error || payload?.message || `Boost targeting lookup failed (${response.status}).`)
    error.status = response.status
    error.payload = payload
    throw error
  }

  return payload.results ?? []
}

export async function startBoostAdsConnection(input) {
  const accessToken = await getAccessToken()
  const response = await fetch(portalPath('/api/boost-ads-connect'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(input ?? {}),
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok || payload?.success === false) {
    const error = new Error(payload?.error || payload?.message || `Boost ads setup failed (${response.status}).`)
    error.status = response.status
    error.payload = payload
    throw error
  }

  return payload
}

export async function launchPostBoost(input) {
  const accessToken = await getAccessToken()
  const response = await fetch(portalPath('/api/post-boosts'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(input ?? {}),
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok || payload?.success === false) {
    const error = new Error(payload?.error || payload?.message || `Boost request failed (${response.status}).`)
    error.status = response.status
    error.payload = payload
    throw error
  }

  return payload
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
    .select('id, client_id, planner_client_slug, planner_policy_version, source_workflow, slot_date_local, slot_label, slot_start_local, slot_end_local, timezone, scheduled_for, post_type, draft_title, draft_body, draft_caption, review_state, review_notes, asset_requirements_json, seasonal_modifier_context_json, published_reference, created_at, updated_at')
    .eq('client_id', clientId)
    .order('scheduled_for', { ascending: true })

  if (error) throw error
  return data ?? []
}

export async function createSocialDrafts(rows) {
  const { data, error } = await supabase
    .from('social_drafts')
    .insert(rows)
    .select('id, source_workflow, slot_date_local, slot_label, post_type, draft_title, draft_body, draft_caption, review_state, review_notes, asset_requirements_json, created_at, updated_at')

  if (error) throw error
  return data ?? []
}

export async function upsertSocialDraft(row) {
  const { data, error } = await supabase
    .from('social_drafts')
    .upsert(row, {
      onConflict: 'client_id,slot_date_local,slot_label',
    })
    .select('id, client_id, planner_client_slug, planner_policy_version, source_workflow, slot_date_local, slot_label, slot_start_local, slot_end_local, timezone, scheduled_for, post_type, draft_title, draft_body, draft_caption, review_state, review_notes, asset_requirements_json, seasonal_modifier_context_json, published_reference, created_at, updated_at')
    .single()

  if (error) throw error
  return data
}

export async function updateSocialDraft(draftId, changes) {
  const { data, error } = await supabase
    .from('social_drafts')
    .update(changes)
    .eq('id', draftId)
    .select('id, client_id, planner_client_slug, planner_policy_version, source_workflow, slot_date_local, slot_label, slot_start_local, slot_end_local, timezone, scheduled_for, post_type, draft_title, draft_body, draft_caption, review_state, review_notes, asset_requirements_json, seasonal_modifier_context_json, published_reference, created_at, updated_at')
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
  const accessToken = await getAccessToken()
  const response = await fetch(portalPath(`/api/posts/${encodeURIComponent(postId)}/delete`), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok || payload?.success === false) {
    const error = new Error(payload?.error || payload?.message || `Delete request failed (${response.status}).`)
    error.status = response.status
    error.payload = payload
    throw error
  }

  return payload
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

async function callPortalWorker(path, options = {}) {
  const accessToken = await getAccessToken()
  const response = await fetch(portalPath(path), {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      ...(options.headers || {}),
    },
  })

  const payload = await response.json().catch(() => ({}))

  if (!response.ok || payload?.success === false) {
    const message = payload?.error || payload?.message || `Request failed with status ${response.status}`
    const error = new Error(message)
    error.status = response.status
    error.payload = payload
    throw error
  }

  return payload
}

export async function sendPortalPartnerMessage(input) {
  return callPortalWorker('/api/portal-partner/message', {
    method: 'POST',
    body: JSON.stringify(input ?? {}),
  })
}

export async function fetchWebsiteChatSettings() {
  return callPortalWorker('/api/website-chat/settings')
}

export async function fetchTeamAccessUsers() {
  return callPortalWorker('/api/team-access/users')
}

export async function inviteTeamAccessUser(input) {
  return callPortalWorker('/api/team-access/users', {
    method: 'POST',
    body: JSON.stringify(input ?? {}),
  })
}

export async function updateTeamAccessUser(userId, input) {
  return callPortalWorker(`/api/team-access/users/${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    body: JSON.stringify(input ?? {}),
  })
}

export async function checkWebsiteChatInstallation() {
  return callPortalWorker('/api/website-chat/check-installation', {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

export async function openContentPartnerConversation(input = {}) {
  return callPortalWorker('/api/content-partner/conversation', {
    method: 'POST',
    body: JSON.stringify(input),
  })
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

export async function improvePublisherImage(input) {
  return callEdgeFunction('portal-improve-image', input)
}

export async function generateCampaignPlan(input) {
  return callEdgeFunction('portal-generate-campaign', input)
}

export async function generatePublisherAssist(input) {
  return callEdgeFunction('portal-ai-assist', input)
}

export async function startOpportunityRadar(input) {
  return callEdgeFunction('opportunity-radar-run', input)
}

export async function resolveShareLink(token) {
  try {
    return await callEdgeFunction('secure-resolve-share-link', { token }, { public: true })
  } catch (error) {
    if (!['invalid_token', 'missing_token'].includes(error?.payload?.error || error?.message)) throw error
    return callEdgeFunction('resolve-share-link', { token }, { public: true })
  }
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

const SECURE_DOCUMENT_BUCKET = 'secure-documents'
const SECURE_DOCUMENT_SELECT = 'id, client_id, uploaded_by, storage_path, file_name, mime_type, size_bytes, category, folder_id, description, is_archived, archived_at, created_at, updated_at, secure_folders(id, name, parent_folder_id)'
const SECURE_FOLDER_SELECT = 'id, client_id, parent_folder_id, created_by, name, is_archived, archived_at, created_at, updated_at'
const SECURE_SHARE_LINK_SELECT = 'id, document_id, client_id, created_by, token_hash, expires_at, max_uses, use_count, revoked_at, created_at, updated_at'
const SECURE_ROOM_SELECT = 'id, client_id, created_by, name, expires_at, revoked_at, passcode_hash, access_mode, created_at, updated_at, secure_share_room_documents(document_id, secure_documents(id, file_name, mime_type, size_bytes, is_archived)), secure_share_room_folders(folder_id, secure_folders(id, name, parent_folder_id, is_archived)), secure_share_room_recipients(id, email, name, invited_at, last_opened_at)'

export async function fetchSecureVaultDocuments() {
  const { data, error } = await supabase
    .from('secure_documents')
    .select(SECURE_DOCUMENT_SELECT)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data ?? []
}

export async function fetchSecureVaultFolders() {
  const { data, error } = await supabase
    .from('secure_folders')
    .select(SECURE_FOLDER_SELECT)
    .eq('is_archived', false)
    .order('name', { ascending: true })

  if (error) throw error
  return data ?? []
}

export async function createSecureVaultFolder({ clientId, name, parentFolderId = null }) {
  if (!clientId) throw new Error('Client profile is still loading.')
  if (!name?.trim()) throw new Error('Folder name is required.')

  const session = await supabase.auth.getSession()
  const userId = session.data.session?.user?.id || null
  const { data, error } = await supabase
    .from('secure_folders')
    .insert({
      client_id: clientId,
      parent_folder_id: parentFolderId || null,
      created_by: userId,
      name: name.trim(),
    })
    .select(SECURE_FOLDER_SELECT)
    .single()

  if (error) throw error

  await supabase.from('secure_document_access_log').insert({
    client_id: clientId,
    accessed_by: userId,
    action: 'folder_created',
    metadata: { folder_id: data.id, name: data.name, parent_folder_id: data.parent_folder_id },
  })

  return data
}

export async function updateSecureVaultFolder(folderId, changes = {}) {
  if (!folderId) throw new Error('Folder is required.')

  const payload = {}
  if (Object.prototype.hasOwnProperty.call(changes, 'name')) {
    const nextName = String(changes.name || '').trim()
    if (!nextName) throw new Error('Folder name is required.')
    payload.name = nextName
  }
  if (Object.prototype.hasOwnProperty.call(changes, 'parent_folder_id')) {
    payload.parent_folder_id = changes.parent_folder_id || null
  }
  if (Object.prototype.hasOwnProperty.call(changes, 'is_archived')) {
    payload.is_archived = Boolean(changes.is_archived)
  }

  if (!Object.keys(payload).length) throw new Error('No folder changes were provided.')

  const { data, error } = await supabase
    .from('secure_folders')
    .update(payload)
    .eq('id', folderId)
    .select(SECURE_FOLDER_SELECT)
    .single()

  if (error) throw error
  return data
}

export async function archiveSecureVaultFolderTree(folderIds = []) {
  const ids = Array.from(new Set(folderIds.filter(Boolean)))
  if (!ids.length) throw new Error('Folder is required.')

  const { data: documents, error: documentsError } = await supabase
    .from('secure_documents')
    .update({ is_archived: true })
    .in('folder_id', ids)
    .eq('is_archived', false)
    .select('id')

  if (documentsError) throw documentsError

  const { data: folders, error: foldersError } = await supabase
    .from('secure_folders')
    .update({ is_archived: true })
    .in('id', ids)
    .select(SECURE_FOLDER_SELECT)

  if (foldersError) throw foldersError

  return {
    folders: folders ?? [],
    archivedDocumentCount: documents?.length || 0,
  }
}

async function deleteSecureVaultDocumentsByRows(documents = []) {
  const rows = documents.filter(Boolean)
  const storagePaths = Array.from(new Set(rows.map((document) => document.storage_path).filter(Boolean)))
  const documentIds = rows.map((document) => document.id).filter(Boolean)

  if (storagePaths.length) {
    const { error: storageError } = await supabase.storage
      .from(SECURE_DOCUMENT_BUCKET)
      .remove(storagePaths)

    if (storageError) throw storageError
  }

  if (documentIds.length) {
    const { error } = await supabase
      .from('secure_documents')
      .delete()
      .in('id', documentIds)

    if (error) throw error
  }

  return {
    deletedDocumentCount: documentIds.length,
    deletedStorageCount: storagePaths.length,
  }
}

export async function permanentlyDeleteSecureVaultDocument(documentId) {
  if (!documentId) throw new Error('Document is required.')

  const { data: document, error } = await supabase
    .from('secure_documents')
    .select('id, storage_path')
    .eq('id', documentId)
    .single()

  if (error) throw error
  return deleteSecureVaultDocumentsByRows([document])
}

export async function permanentlyDeleteSecureVaultFolderTree(folderIds = []) {
  const ids = Array.from(new Set(folderIds.filter(Boolean)))
  if (!ids.length) throw new Error('Folder is required.')

  const { data: documents, error: documentsError } = await supabase
    .from('secure_documents')
    .select('id, storage_path')
    .in('folder_id', ids)

  if (documentsError) throw documentsError

  const result = await deleteSecureVaultDocumentsByRows(documents ?? [])

  const { data: folders, error: foldersError } = await supabase
    .from('secure_folders')
    .delete()
    .in('id', ids)
    .select('id')

  if (foldersError) throw foldersError

  return {
    ...result,
    deletedFolderCount: folders?.length || 0,
  }
}

export async function emptySecureVaultArchive(clientId) {
  if (!clientId) throw new Error('Client profile is still loading.')

  const { data: documents, error: documentsError } = await supabase
    .from('secure_documents')
    .select('id, storage_path')
    .eq('client_id', clientId)
    .eq('is_archived', true)

  if (documentsError) throw documentsError

  const result = await deleteSecureVaultDocumentsByRows(documents ?? [])

  const { data: folders, error: foldersError } = await supabase
    .from('secure_folders')
    .delete()
    .eq('client_id', clientId)
    .eq('is_archived', true)
    .select('id')

  if (foldersError) throw foldersError

  return {
    ...result,
    deletedFolderCount: folders?.length || 0,
  }
}

export async function updateSecureVaultDocument(documentId, changes) {
  const payload = {}

  if (Object.prototype.hasOwnProperty.call(changes, 'file_name')) {
    payload.file_name = changes.file_name ? changes.file_name.trim() : null
  }

  if (Object.prototype.hasOwnProperty.call(changes, 'category')) {
    payload.category = changes.category ? changes.category.trim() : null
  }

  if (Object.prototype.hasOwnProperty.call(changes, 'folder_id')) {
    payload.folder_id = changes.folder_id || null
  }

  if (Object.prototype.hasOwnProperty.call(changes, 'description')) {
    payload.description = changes.description ? changes.description.trim() : null
  }

  if (Object.prototype.hasOwnProperty.call(changes, 'is_archived')) {
    payload.is_archived = Boolean(changes.is_archived)
  }

  const { data, error } = await supabase
    .from('secure_documents')
    .update(payload)
    .eq('id', documentId)
    .select(SECURE_DOCUMENT_SELECT)
    .single()

  if (error) throw error
  return data
}

export async function fetchSecureVaultAudit() {
  const { data, error } = await supabase
    .from('secure_document_access_log')
    .select('id, document_id, client_id, accessed_by, room_id, recipient_id, action, ip_address, user_agent, metadata, accessed_at, secure_documents(file_name), secure_share_rooms(name), secure_share_room_recipients(email)')
    .order('accessed_at', { ascending: false })
    .limit(200)

  if (error) throw error
  return data ?? []
}

export async function fetchSecureVaultRooms() {
  const { data, error } = await supabase
    .from('secure_share_rooms')
    .select(SECURE_ROOM_SELECT)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data ?? []
}

export async function fetchSecureVaultShareLinks() {
  const { data, error } = await supabase
    .from('secure_share_links')
    .select(SECURE_SHARE_LINK_SELECT)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data ?? []
}

export async function getSecureVaultUploadUrl(input) {
  return callEdgeFunction('secure-get-upload-url', input)
}

export async function uploadSecureVaultFileToSignedUrl(uploadUrl, file, mimeType) {
  return uploadFileToSignedUrl(uploadUrl, file, mimeType)
}

export async function getSecureVaultDocumentUrl(documentId, action = 'view') {
  return callEdgeFunction('secure-get-document-url', {
    document_id: documentId,
    action,
  })
}

export async function createSecureVaultRoom({
  clientId,
  name,
  documentIds,
  folderIds = [],
  recipientEmails,
  expiresAt,
  accessMode = 'view_and_download',
  passcode,
}) {
  if (!clientId) throw new Error('Client profile is still loading.')
  if (!name?.trim()) throw new Error('Room name is required.')
  if (!Array.isArray(documentIds) || documentIds.length === 0) throw new Error('Select at least one document.')
  if (!expiresAt) throw new Error('Expiry date is required.')
  if (!passcode?.trim()) throw new Error('Add a passcode for this secure room.')

  const normalizedRecipients = Array.from(new Set((recipientEmails ?? [])
    .map((email) => String(email || '').trim().toLowerCase())
    .filter(Boolean)))
  if (!normalizedRecipients.length) throw new Error('Add at least one recipient email.')

  const token = generateRoomToken()
  const tokenHash = await sha256Hex(token)
  const passcodeValue = passcode?.trim() || ''
  const passcodeHash = passcodeValue ? await sha256Hex(passcodeValue) : null
  const expiresAtIso = normalizeRoomExpiry(expiresAt)
  const session = await supabase.auth.getSession()
  const userId = session.data.session?.user?.id || null

  const { data: room, error: roomError } = await supabase
    .from('secure_share_rooms')
    .insert({
      client_id: clientId,
      created_by: userId,
      name: name.trim(),
      token_hash: tokenHash,
      expires_at: expiresAtIso,
      passcode_hash: passcodeHash,
      access_mode: accessMode === 'view_only' ? 'view_only' : 'view_and_download',
    })
    .select('id, client_id, created_by, name, expires_at, revoked_at, passcode_hash, access_mode, created_at, updated_at')
    .single()

  if (roomError) throw roomError

  const uniqueDocumentIds = Array.from(new Set(documentIds.filter(Boolean)))
  const uniqueFolderIds = Array.from(new Set((folderIds ?? []).filter(Boolean)))
  const documentRows = uniqueDocumentIds.map((documentId) => ({
    room_id: room.id,
    document_id: documentId,
    client_id: clientId,
    added_by: userId,
  }))
  const folderRows = uniqueFolderIds.map((folderId) => ({
    room_id: room.id,
    folder_id: folderId,
    client_id: clientId,
    added_by: userId,
  }))

  const recipientRows = normalizedRecipients.map((email) => ({
    room_id: room.id,
    client_id: clientId,
    email,
  }))

  const [{ error: docsError }, { error: foldersError }, { error: recipientsError }] = await Promise.all([
    supabase.from('secure_share_room_documents').insert(documentRows),
    folderRows.length
      ? supabase.from('secure_share_room_folders').insert(folderRows)
      : Promise.resolve({ error: null }),
    recipientRows.length
      ? supabase.from('secure_share_room_recipients').insert(recipientRows)
      : Promise.resolve({ error: null }),
  ])

  if (docsError || foldersError || recipientsError) {
    await supabase.from('secure_share_rooms').delete().eq('id', room.id)
    throw docsError || foldersError || recipientsError
  }

  const auditRows = [
    {
      client_id: clientId,
      room_id: room.id,
      accessed_by: userId,
      action: 'room_created',
      metadata: { name: room.name, document_count: uniqueDocumentIds.length, folder_count: uniqueFolderIds.length },
    },
    ...recipientRows.map((recipient) => ({
      client_id: clientId,
      room_id: room.id,
      accessed_by: userId,
      action: 'room_invite_created',
      metadata: { email: recipient.email },
    })),
  ]

  await supabase.from('secure_document_access_log').insert(auditRows)

  const roomWithSecrets = {
    ...room,
    token,
    passcode: passcodeValue,
    share_url: buildSecureVaultRoomUrl(token, window.location.origin, portalPath('/').replace(/\/$/, '')),
  }

  try {
    roomWithSecrets.invite_delivery = await sendSecureVaultRoomInvites({
      roomId: room.id,
      token,
      passcode: passcodeValue,
      shareUrl: roomWithSecrets.share_url,
      recipientEmails: normalizedRecipients,
    })
  } catch (error) {
    roomWithSecrets.invite_delivery = {
      sent_count: 0,
      failed_count: normalizedRecipients.length,
      error: error instanceof Error ? error.message : String(error),
    }
  }

  return roomWithSecrets
}

export async function createSecureVaultShareLink({ clientId, documentId, expiresAt, maxUses }) {
  if (!clientId) throw new Error('Client profile is still loading.')
  if (!documentId) throw new Error('Choose a document to share.')

  const token = generateRoomToken()
  const tokenHash = await sha256Hex(token)
  const session = await supabase.auth.getSession()
  const userId = session.data.session?.user?.id || null
  const maxUsesValue = Number(maxUses)

  const { data, error } = await supabase
    .from('secure_share_links')
    .insert({
      client_id: clientId,
      document_id: documentId,
      created_by: userId,
      token_hash: tokenHash,
      expires_at: expiresAt ? normalizeRoomExpiry(expiresAt) : null,
      max_uses: Number.isFinite(maxUsesValue) && maxUsesValue > 0 ? Math.floor(maxUsesValue) : null,
    })
    .select(SECURE_SHARE_LINK_SELECT)
    .single()

  if (error) throw error

  await supabase.from('secure_document_access_log').insert({
    client_id: clientId,
    document_id: documentId,
    accessed_by: userId,
    action: 'share_link_created',
    metadata: { share_link_id: data.id, expires_at: data.expires_at, max_uses: data.max_uses },
  })

  return {
    ...data,
    token,
    share_url: buildSecureVaultShareUrl(token, window.location.origin, portalPath('/').replace(/\/$/, '')),
  }
}

export async function revokeSecureVaultShareLink(shareLinkId) {
  const { data, error } = await supabase
    .from('secure_share_links')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', shareLinkId)
    .is('revoked_at', null)
    .select('id, client_id, document_id')
    .single()

  if (error) throw error

  await supabase.from('secure_document_access_log').insert({
    client_id: data.client_id,
    document_id: data.document_id,
    action: 'share_link_revoked',
    metadata: { share_link_id: data.id },
  })

  return data
}

export async function sendSecureVaultRoomInvites({
  roomId,
  token,
  passcode,
  shareUrl,
  recipientEmails,
}) {
  return callEdgeFunction('secure-send-room-invites', {
    room_id: roomId,
    token,
    passcode,
    share_url: shareUrl,
    recipient_emails: recipientEmails,
  })
}

export async function revokeSecureVaultRoom(roomId) {
  const { data: room, error } = await supabase
    .from('secure_share_rooms')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', roomId)
    .is('revoked_at', null)
    .select('id, client_id')
    .single()

  if (error) throw error

  await supabase.from('secure_document_access_log').insert({
    client_id: room.client_id,
    room_id: room.id,
    action: 'room_revoked',
  })

  return room
}

export async function resolveSecureVaultRoom(input) {
  return callEdgeFunction('secure-resolve-room', input, { public: true })
}
