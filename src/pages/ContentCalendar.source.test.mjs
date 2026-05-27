import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('./ContentCalendar.jsx', import.meta.url), 'utf8')
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

test('Content Partner chooses the next open Publisher day before saving request-driven drafts', () => {
  assert.match(contentPartnerFunctionSource, /async function resolveAvailableContentPartnerSchedule/)
  assert.match(contentPartnerFunctionSource, /fetchOccupiedPublisherDateKeys/)
  assert.match(contentPartnerFunctionSource, /occupiedDateKeys\.has\(dateKey\)/)
  assert.match(contentPartnerFunctionSource, /const scheduled = await resolveAvailableContentPartnerSchedule\(clientId, parseSchedule\(ai\.suggestedPublishAt\)\)/)
})
