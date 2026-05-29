import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const todaySource = new URL('./Today.jsx', import.meta.url)
const cssSource = new URL('../App.css', import.meta.url)

test('today page removes the top selected-work action bar', async () => {
  const [today, css] = await Promise.all([
    readFile(todaySource, 'utf8'),
    readFile(cssSource, 'utf8'),
  ])

  assert.equal(today.includes('function TodayActionBar'), false)
  assert.equal(today.includes('today-action-bar'), false)
  assert.equal(today.includes('today-action-summary'), false)
  assert.equal(today.includes('<form className="today-command portal-panel">'), false)
  assert.equal(today.includes('today-command-prompt'), false)
  assert.equal(css.includes('.today-command-hero'), false)
  assert.equal(css.includes('.today-action-bar'), false)
  assert.ok(css.includes('.today-context-strip'))
})

test('today queue filters are wired to queue state', async () => {
  const today = await readFile(todaySource, 'utf8')

  assert.ok(today.includes("const [activeFilter, setActiveFilter] = useState('priority')"))
  assert.ok(today.includes('filterTodayPriorityQueue(queue, activeFilter)'))
  assert.ok(today.includes("data-active={activeFilter === 'needs'}"))
  assert.ok(today.includes("onClick={() => setActiveFilter('risks')}"))
  assert.ok(today.includes('filteredQueue.map((item) => ('))
})

test('today page keeps source actions in the detail panel only', async () => {
  const [today, css] = await Promise.all([
    readFile(todaySource, 'utf8'),
    readFile(cssSource, 'utf8'),
  ])

  assert.ok(today.includes('Do it'))
  assert.ok(today.includes('Mark done'))
  assert.ok(today.includes('Open source'))
  assert.ok(today.includes('Snooze'))
  assert.equal(today.includes('Ask Partner about this'), false)
  assert.equal(today.includes('<textarea'), false)
  assert.equal(today.includes('Reply to a customer, schedule a post, find a file...'), false)
  assert.equal(today.includes('today-prompt-chip'), false)
  assert.equal(today.includes('today-command-key'), false)
  assert.ok(css.includes('.today-suggested'))
  assert.ok(css.includes('.today-action-grid'))
})

test('today dark surface uses the borderless black portal treatment', async () => {
  const css = await readFile(cssSource, 'utf8')

  assert.ok(css.includes('html[data-portal-theme="map-dark"] .today-page .portal-panel'))
  assert.ok(css.includes('html[data-portal-theme="map-dark"] .today-page .portal-surface'))
  assert.ok(css.includes('background: transparent !important;'))
  assert.ok(css.includes('border: 0 !important;'))
  assert.ok(css.includes('box-shadow: none !important;'))
  assert.ok(css.includes('.today-row-meta'))
  assert.equal(css.includes('grid-template-columns: 5.3rem'), false)
})

test('today page uses live portal data and persisted queue state', async () => {
  const today = await readFile(todaySource, 'utf8')

  assert.ok(today.includes('fetchInboxConversations'))
  assert.ok(today.includes('fetchSocialDrafts'))
  assert.ok(today.includes('fetchOpportunityRadar'))
  assert.ok(today.includes('fetchSecureVaultDocuments'))
  assert.ok(today.includes('fetchWorkspacePreferences'))
  assert.ok(today.includes('saveTodayQueueState'))
  assert.ok(today.includes('buildTodayPriorityQueueFromPortalData'))
  assert.ok(today.includes('applyTodayQueueState'))
})

test('today suggested move panel handles an empty same-day queue', async () => {
  const today = await readFile(todaySource, 'utf8')

  assert.ok(today.includes('if (!item)'))
  assert.ok(today.includes('No work needs you today'))
  assert.ok(today.includes('today-suggested-empty'))
})

test('today live sources poll while the page is open', async () => {
  const today = await readFile(todaySource, 'utf8')

  assert.ok(today.includes("refetchInterval: 20_000"))
  assert.ok(today.includes("refetchInterval: 60_000"))
  assert.ok(today.includes('refetchOnWindowFocus: true'))
  assert.ok(today.includes('refetchOnReconnect: true'))
})

test('today detail panel does not fall back to hidden completed rows', async () => {
  const today = await readFile(todaySource, 'utf8')

  assert.ok(today.includes('filteredQueue[0] || null'))
  assert.equal(today.includes('filteredQueue[0] || queue[0]'), false)
})
