import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('./ContentCalendar.jsx', import.meta.url), 'utf8')
const createPostSource = await readFile(new URL('./CreatePost.jsx', import.meta.url), 'utf8')
const campaignPartnerSource = await readFile(new URL('./CampaignPartner.jsx', import.meta.url), 'utf8')
const css = await readFile(new URL('../App.css', import.meta.url), 'utf8')
const radarFunctionSource = await readFile(new URL('../../../../supabase/functions/opportunity-radar-run/index.ts', import.meta.url), 'utf8')
const contentPartnerFunctionSource = await readFile(new URL('../../../../supabase/functions/portal-content-partner/index.ts', import.meta.url), 'utf8')

test('calendar hides all closed Content Partner draft states', () => {
  assert.match(source, /const CLOSED_DRAFT_STATES = new Set\(\['published', 'published_manually', 'archived', 'superseded'\]\)/)
  assert.doesNotMatch(source, /review_state !== 'published'/)
  assert.match(source, /filter\(isVisibleDraft\)/)
})

test('calendar delegates scheduled and posted deletes to the portal Worker', () => {
  assert.doesNotMatch(source, /VITE_N8N_BASE_URL/)
  assert.match(source, /async function handleDeleteCalendarPostItem/)
  assert.match(source, /const payload = await deletePost\(post\.id\)/)
  assert.match(source, /\['scheduled', 'published'\]\.includes\(item\.badgeType\)/)
  assert.match(source, /Delete', Icon: Trash2, destructive: true, onSelect: \(\) => handleDeleteCalendarPostItem\(item\)/)
})

test('calendar row menu opens above hover previews and closes the preview layer', () => {
  assert.match(source, /map-calendar-row-menu-open/)
  assert.match(source, /className="content-plan-row-menu fixed z-\[360\]/)
  assert.match(source, /zIndex: 360/)
  assert.match(css, /html\[data-portal-theme="map-dark"\] \.content-plan-row-menu \{\s*background: #060a10 !important;/)
  assert.match(css, /backdrop-filter: none !important;/)
})

test('calendar restores posted thumbnails from durable media before falling back to stored media_url', () => {
  assert.match(source, /function getPostVariantMediaPreview\(post = \{\}\)/)
  assert.match(source, /variantPreview = getPostVariantMediaPreview\(post\)/)
  assert.match(source, /draftMediaPreviews\[`post:\$\{post\.id\}`\]/)
  assert.match(source, /normalizePostMediaCandidate\(\{ url: post\.media_url \}\)/)
})

test('calendar image thumbnails degrade to a styled placeholder instead of a broken browser icon', () => {
  assert.match(source, /function CalendarMediaThumb\(/)
  assert.match(source, /onError=\{\(\) => setFailedSrc\(src\)\}/)
  assert.match(css, /\.content-plan-chip-media-empty/)
})

test('publisher surfaces current-week gap-fill ideas without inflating stale/future counts', () => {
  assert.match(source, /const WEEKLY_PARTNER_IDEA_LIMIT = 5/)
  assert.match(source, /const GAP_FILL_PULL_FORWARD_DAYS = 10/)
  assert.match(source, /function canUseOpportunityForGapFillDate\(opportunity, dateString\)/)
  assert.match(source, /function selectWeeklyPartnerIdeas\([\s\S]*occupiedDateStrings = \[\]/)
  assert.match(source, /const openWeekDates = getWeekDateStrings\(selectedWeekStart\)/)
  assert.match(source, /canUseOpportunityForGapFillDate\(candidate, dateString\)/)
  assert.match(source, /selected\.push\(\{ opportunity, dateString, isGapFill: true \}\)/)
  assert.match(source, /ideas: radarItems\.length/)
  assert.doesNotMatch(source, /ideas: opportunities\s*\n\s*\.filter/)
})

test('publisher converts gap-fill Radar ideas into drafts on the selected open date', () => {
  assert.match(source, /function buildRadarDraftRow\(\{ profile, opportunity, suggestion, dateString \}\)/)
  assert.match(source, /dateString\s*\?\s*new Date\(`\$\{dateString\}T10:00:00`\)/)
  assert.match(source, /dateSource: dateString \? 'publisher_current_week_gap_fill' : 'opportunity_radar_recommendation'/)
  assert.match(source, /dateString: item\.dateString/)
})

test('first-run Publisher setup can be deferred and resumed', () => {
  assert.match(source, /function WorkspaceSetupBanner/)
  assert.match(source, /Finish setting up this portal\./)
  assert.match(source, /Connect social accounts/)
  assert.match(source, /const connectedSocialCount = socialConnections\.filter\(\(connection\) => connection\?\.zernio_account_id\)\.length/)
  assert.doesNotMatch(source, /connection\?\.zernio_account_id \|\| connection\?\.zernio_profile_id/)
  assert.match(source, /Set up later/)
  assert.match(source, /map:publisher-setup-dismissed:/)
  assert.match(source, /fetchSocialConnections\(clientId\)/)
  assert.match(source, /Verify profile and build ideas/)
  assert.match(source, /initialParams\.get\('setup'\) !== 'partner'/)
  assert.match(source, /openWorkspaceSetup\(\)/)
  assert.match(source, /navigate\('\/settings#social-accounts'\)/)
  assert.doesNotMatch(source, /Set up Train your Partner/)
})

test('Publisher Boost requires audience targeting for Meta launches', () => {
  assert.match(source, /const BOOST_AUDIENCE_MODES = \[/)
  assert.match(source, /function buildBoostTargeting\(\{ mode, countryCodes, zipCodes, customAudienceIds, geoTargets \}\)/)
  assert.match(source, /searchBoostTargeting/)
  assert.match(source, /BuildGeoAudiencePicker/)
  assert.match(source, /const audienceReady = hasBoostAudienceTargeting\(platform, boostTargeting\)/)
  assert.match(source, /targeting: boostTargeting/)
  assert.match(source, /targeting: input\.targeting \|\| \{\}/)
  assert.doesNotMatch(source, /mode: 'local_default'/)
  assert.match(source, /Choose a country, ZIP code, or custom audience before launching a Meta boost\./)
})

test('Publisher calendar marks live boosts on rows and hover previews', () => {
  assert.match(source, /active: 'Boost live'/)
  assert.match(source, /isActive: status === 'active'/)
  assert.match(source, /content-plan-boost-marker--active/)
  assert.match(source, /content-plan-boost-live-dot/)
  assert.doesNotMatch(source, /Click to open post/)
  assert.match(css, /\.content-plan-boost-marker--active/)
  assert.match(css, /\.content-plan-boost-live-dot/)
})

test('published calendar rows open as posted views instead of empty composers', () => {
  assert.match(source, /const postParam = item\.badgeType === 'scheduled' \? 'editPost' : 'viewPost'/)
  assert.match(createPostSource, /const viewTargetPostId = searchParams\.get\('viewPost'\) \|\| ''/)
  assert.match(createPostSource, /function openReview\(\) \{\s*if \(isViewingPublishedPost\)/)
  assert.match(createPostSource, /loadPublishedPostForViewing\(post\)/)
  assert.match(createPostSource, /setContent\(post\.content \|\| ''\)/)
  assert.match(createPostSource, /Already posted/)
})

test('Publisher creative images open in a larger preview', () => {
  assert.match(createPostSource, /function MediaLightbox/)
  assert.match(createPostSource, /create-post-media-open-button/)
  assert.match(createPostSource, /setMediaLightbox\(\{/)
  assert.match(css, /\.create-post-media-lightbox/)
})

test('Publisher create flow keeps a bottom Next action after long scroll sections', () => {
  assert.match(createPostSource, /className="create-post-bottom-next"/)
  assert.match(createPostSource, /Next: Preview & Approve/)
  assert.match(createPostSource, /Next: Preview & Publish/)
  assert.match(css, /\.create-post-bottom-next/)
  assert.match(css, /\.create-post-bottom-next \{[\s\S]*min-width: 220px;[\s\S]*white-space: nowrap;/)
  assert.match(css, /@media \(max-width: 1180px\)[\s\S]*\.create-post-bottom-next \{\s*width: 100%;/)
})

test('Campaign Partner image assets open in a larger preview', () => {
  assert.match(campaignPartnerSource, /function isCampaignPreviewableImage/)
  assert.match(campaignPartnerSource, /function handleOpenCampaignAsset/)
  assert.match(campaignPartnerSource, /campaign-asset-preview-item/)
  assert.match(campaignPartnerSource, /getSecureVaultDocumentUrl\(documentId, 'view'\)/)
  assert.match(css, /\.campaign-asset-list > button/)
})

test('Opportunity Radar appends only after current-week gaps are filled', () => {
  assert.match(radarFunctionSource, /async function findCurrentWeekGapWindow/)
  assert.match(radarFunctionSource, /fetchCurrentWeekCoverageDateKeys/)
  assert.match(radarFunctionSource, /anchorSource: 'current_week_gap_fill'/)
  assert.match(radarFunctionSource, /const currentWeekGapWindow = await findCurrentWeekGapWindow\(clientId, tomorrow\)/)
  assert.match(radarFunctionSource, /const latestPlanned = await fetchLatestPlannedPublishAt\(clientId\)/)
  assert.ok(
    radarFunctionSource.indexOf('findCurrentWeekGapWindow(clientId, tomorrow)') <
      radarFunctionSource.indexOf('fetchLatestPlannedPublishAt(clientId)'),
  )
})

test('Opportunity Radar records retrieval before OpenAI synthesis and retries transient OpenAI failures', () => {
  assert.match(radarFunctionSource, /const retryableStatuses = new Set\(\[408, 409, 429, 500, 502, 503, 504\]\)/)
  assert.match(radarFunctionSource, /for \(let attempt = 1; attempt <= 3; attempt \+= 1\)/)
  assert.match(radarFunctionSource, /await recordTavilyUsage\(client\.id, runId, tavilySearchUsage\)\.then/)
  assert.match(radarFunctionSource, /failure_stage: telemetry\.stage/)
  assert.match(radarFunctionSource, /provider_error: telemetry\.detail/)
  assert.ok(
    radarFunctionSource.indexOf('await recordTavilyUsage(client.id, runId, tavilySearchUsage).then') <
      radarFunctionSource.indexOf('const synthesis = await synthesizeOpportunities'),
  )
})

test('Content Partner chooses the next open Publisher day before saving request-driven drafts', () => {
  assert.match(contentPartnerFunctionSource, /async function resolveAvailableContentPartnerSchedule/)
  assert.match(contentPartnerFunctionSource, /fetchOccupiedPublisherDateKeys/)
  assert.match(contentPartnerFunctionSource, /occupiedDateKeys\.has\(dateKey\)/)
  assert.match(contentPartnerFunctionSource, /const scheduled = await resolveAvailableContentPartnerSchedule\(clientId, parseSchedule\(ai\.suggestedPublishAt\)\)/)
})
