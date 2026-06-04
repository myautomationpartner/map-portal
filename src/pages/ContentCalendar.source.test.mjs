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

test('Opportunity Radar uses business-type query packs for restaurant customers', () => {
  assert.match(radarFunctionSource, /function getRadarBusinessVertical\(/)
  assert.match(radarFunctionSource, /const businessVertical = getRadarBusinessVertical\(client\)/)
  assert.match(radarFunctionSource, /businessVertical === 'restaurant_cafe'/)
  assert.match(radarFunctionSource, /catering delivery takeout late night downtown events/)
  assert.match(radarFunctionSource, /restaurant catering delivery takeout social posts/)
  assert.match(radarFunctionSource, /businessVertical === 'dance_studio'/)
  assert.match(radarFunctionSource, /businessVertical === 'gym_fitness'/)
  assert.match(radarFunctionSource, /businessVertical === 'salon_spa'/)
  assert.match(radarFunctionSource, /businessVertical === 'medical_wellness'/)
  assert.match(radarFunctionSource, /businessVertical === 'home_services'/)
  assert.match(radarFunctionSource, /businessVertical === 'real_estate'/)
  assert.match(radarFunctionSource, /businessVertical === 'professional_services'/)
  assert.ok(
    radarFunctionSource.indexOf("businessVertical === 'dance_studio'") <
      radarFunctionSource.indexOf('${localPlace} ${businessType} summer enrollment recital registration parent questions'),
  )
  assert.ok(
    radarFunctionSource.indexOf("businessVertical === 'restaurant_cafe'") <
      radarFunctionSource.indexOf('${localPlace} ${businessType} catering delivery takeout late night downtown events'),
  )
})

test('Opportunity Radar seeds first research profiles from signup market data', () => {
  assert.match(radarFunctionSource, /function buildDefaultServiceArea\(client: ClientRow\)/)
  assert.match(radarFunctionSource, /function buildDefaultResearchNotes\(client: ClientRow\)/)
  assert.match(radarFunctionSource, /const serviceArea = trimText\(body\.service_area, 160\) \|\| buildDefaultServiceArea\(client\)/)
  assert.match(radarFunctionSource, /const researchNotes = trimText\(body\.research_notes, 2000\) \|\| buildDefaultResearchNotes\(client\)/)
  assert.match(radarFunctionSource, /client\.business_reach === 'local'/)
  assert.match(radarFunctionSource, /\[client\.county, client\.state_code, client\.postal_code\]/)
  assert.match(radarFunctionSource, /Signup market profile:/)
  assert.match(radarFunctionSource, /reach=\$\{client\.business_reach \|\| 'unknown'\}/)
  assert.match(radarFunctionSource, /state=\$\{client\.state_code \|\| 'unknown'\}/)
  assert.match(radarFunctionSource, /zip=\$\{client\.postal_code \|\| 'unknown'\}/)
  assert.match(radarFunctionSource, /county=\$\{client\.county \|\| 'unknown'\}/)
})

test('Opportunity Radar turns vertical findings into owner-ready post suggestions', () => {
  assert.match(radarFunctionSource, /type VerticalOutputDefaults = /)
  assert.match(radarFunctionSource, /function getVerticalOutputDefaults\(businessVertical: string\): VerticalOutputDefaults/)
  assert.match(radarFunctionSource, /restaurant_cafe:/)
  assert.match(radarFunctionSource, /Delivery \/ takeout/)
  assert.match(radarFunctionSource, /Late-night sales/)
  assert.match(radarFunctionSource, /Catering lead/)
  assert.match(radarFunctionSource, /Signature menu item/)
  assert.match(radarFunctionSource, /2 menu or signature-item posts/)
  assert.match(radarFunctionSource, /function normalizeSuggestionAdBrief\(/)
  assert.match(radarFunctionSource, /business_goal/)
  assert.match(radarFunctionSource, /value_label/)
  assert.match(radarFunctionSource, /boost_recommendation/)
  assert.match(radarFunctionSource, /suggested_image/)
  assert.match(radarFunctionSource, /approval_ready_summary/)
  assert.match(radarFunctionSource, /vertical_output_defaults: getVerticalOutputDefaults\(getRadarBusinessVertical\(client\)\)/)
  assert.match(radarFunctionSource, /ad_brief_json: normalizeSuggestionAdBrief\(suggestion, opportunity, getRadarBusinessVertical\(client\)\)/)
  assert.match(radarFunctionSource, /dance_studio:/)
  assert.match(radarFunctionSource, /gym_fitness:/)
  assert.match(radarFunctionSource, /salon_spa:/)
  assert.match(radarFunctionSource, /medical_wellness:/)
  assert.match(radarFunctionSource, /home_services:/)
  assert.match(radarFunctionSource, /real_estate:/)
  assert.match(radarFunctionSource, /professional_services:/)
})

test('Opportunity Radar supports internal prospect dry runs without customer persistence', () => {
  assert.match(radarFunctionSource, /type ProspectRadarProfile = /)
  assert.match(radarFunctionSource, /function buildProspectClient\(body: Record<string, unknown>\): ClientRow/)
  assert.match(radarFunctionSource, /function buildProspectResearchProfile\(client: ClientRow, body: Record<string, unknown>\): ResearchProfile/)
  assert.match(radarFunctionSource, /async function runProspectDryRun\(request: Request, body: Record<string, unknown>\)/)
  assert.match(radarFunctionSource, /if \(body\.prospect_dry_run === true\) \{\s*return runProspectDryRun\(request, body\)\s*\}/)
  assert.match(radarFunctionSource, /requireInternalAccess\(request\)/)
  assert.match(radarFunctionSource, /anchorSource: 'prospect_dry_run'/)
  assert.match(radarFunctionSource, /dryRun: true/)
  assert.match(radarFunctionSource, /opportunities: buildProspectPreviewOpportunities\(client, curatedOpportunities, evidence\)/)
  assert.match(radarFunctionSource, /function clampNumber\(value: unknown, fallback: number, min: number, max: number\)/)
  assert.match(radarFunctionSource, /const maxResults = clampNumber\(body\.max_results, config\.defaultMaxResults, 2, 10\)/)
  const dryRunSource = radarFunctionSource.slice(
    radarFunctionSource.indexOf('async function runProspectDryRun'),
    radarFunctionSource.indexOf('Deno.serve'),
  )
  assert.doesNotMatch(dryRunSource, /createResearchRun/)
  assert.doesNotMatch(dryRunSource, /persistOpportunities/)
})

test('Opportunity Radar carries tuned playbook defaults for fitness, salon, and home services', () => {
  assert.match(radarFunctionSource, /New member challenge/)
  assert.match(radarFunctionSource, /Class fill/)
  assert.match(radarFunctionSource, /Seasonal appointment/)
  assert.match(radarFunctionSource, /Appointment opening/)
  assert.match(radarFunctionSource, /Maintenance lead/)
  assert.match(radarFunctionSource, /Weather-triggered urgency/)
  assert.match(radarFunctionSource, /new member intro offer challenge/)
  assert.match(radarFunctionSource, /last-minute appointment openings seasonal transformations/)
  assert.match(radarFunctionSource, /storm prep tune-up before after review request/)
})

test('Opportunity Radar carries deeper playbook defaults for medical, real estate, professional, and dance verticals', () => {
  assert.match(radarFunctionSource, /New patient inquiry/)
  assert.match(radarFunctionSource, /Compliance-safe education/)
  assert.match(radarFunctionSource, /Insurance or benefit reminder/)
  assert.match(radarFunctionSource, /Neighborhood proof/)
  assert.match(radarFunctionSource, /Home valuation lead/)
  assert.match(radarFunctionSource, /Local market snapshot/)
  assert.match(radarFunctionSource, /Discovery call lead/)
  assert.match(radarFunctionSource, /Case study proof/)
  assert.match(radarFunctionSource, /Decision deadline/)
  assert.match(radarFunctionSource, /Trial class lead/)
  assert.match(radarFunctionSource, /Seasonal enrollment/)
  assert.match(radarFunctionSource, /summer enrollment recital registration parent questions/)
  assert.match(radarFunctionSource, /new patient appointment insurance benefits awareness/)
  assert.match(radarFunctionSource, /home valuation neighborhood market snapshot open house seller lead/)
  assert.match(radarFunctionSource, /consultation lead deadline checklist case study referral/)
})

test('Opportunity Radar records retrieval before OpenAI synthesis and retries transient OpenAI failures', () => {
  assert.match(radarFunctionSource, /const retryableStatuses = new Set\(\[408, 409, 429, 500, 502, 503, 504\]\)/)
  assert.match(radarFunctionSource, /for \(let attempt = 1; attempt <= 3; attempt \+= 1\)/)
  assert.match(radarFunctionSource, /await recordTavilyUsage\(client\.id, runId, tavilySearchUsage\)\.then/)
  assert.match(radarFunctionSource, /failure_stage: telemetry\.stage/)
  assert.match(radarFunctionSource, /provider_error: telemetry\.detail/)
  const customerTelemetryIndex = radarFunctionSource.indexOf('await recordTavilyUsage(client.id, runId, tavilySearchUsage).then')
  const customerSynthesisIndex = radarFunctionSource.indexOf('const synthesis = await synthesizeOpportunities(client, profile', customerTelemetryIndex)
  assert.ok(
    customerTelemetryIndex !== -1 && customerSynthesisIndex > customerTelemetryIndex,
  )
})

test('Content Partner chooses the next open Publisher day before saving request-driven drafts', () => {
  assert.match(contentPartnerFunctionSource, /async function resolveAvailableContentPartnerSchedule/)
  assert.match(contentPartnerFunctionSource, /fetchOccupiedPublisherDateKeys/)
  assert.match(contentPartnerFunctionSource, /occupiedDateKeys\.has\(dateKey\)/)
  assert.match(contentPartnerFunctionSource, /const scheduled = await resolveAvailableContentPartnerSchedule\(clientId, parseSchedule\(ai\.suggestedPublishAt\)\)/)
})
