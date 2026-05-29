import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const inboxSource = await readFile(new URL('./Inbox.jsx', import.meta.url), 'utf8')
const attentionSource = await readFile(new URL('./Attention.jsx', import.meta.url), 'utf8')
const appSource = await readFile(new URL('../App.jsx', import.meta.url), 'utf8')
const appStyles = await readFile(new URL('../App.css', import.meta.url), 'utf8')

test('desktop My Partner hub is scoped to Messages only', () => {
  assert.match(
    inboxSource,
    /const showPartnerHub = activeSection === 'messages' && partnerHubOpen/,
  )
  assert.doesNotMatch(inboxSource, /privateConversations\.length === 0[\s\S]{0,300}showPartnerHub/)
  assert.match(inboxSource, /activeSection === 'comments' \? \(\s*<CommentsInbox/s)
})

test('desktop Messages click can leave the My Partner hub', () => {
  assert.match(inboxSource, /function handleSectionChange\(section\) \{/)
  assert.match(inboxSource, /setPartnerHubOpen\(false\)/)
  assert.match(
    inboxSource,
    /return params\.get\('partner'\) === '1'\s*\|\| \(!params\.has\('section'\) && !params\.has\('conversation'\) && !params\.has\('inbox_id'\)\)/,
  )
})

test('mobile Inbox filter changes clear previously selected Partner threads', () => {
  assert.match(attentionSource, /function handleFilterChange\(filter\) \{/)
  assert.match(attentionSource, /setSelectedThreadId\(''\)/)
  assert.match(attentionSource, /setMobileThreadOpen\(false\)/)
  assert.match(
    attentionSource,
    /const selectedThread = filteredThreads\.find\(\(thread\) => thread\.id === selectedThreadId\) \|\| filteredThreads\[0\] \|\| null/,
  )
})

test('mobile Inbox honors Today deep links for comments and DMs', () => {
  assert.match(attentionSource, /useLocation/)
  assert.match(attentionSource, /mobileInboxRouteState/)
  assert.match(attentionSource, /const routeState = useMemo\(\(\) => mobileInboxRouteState\(location\.search\), \[location\.search\]\)/)
  assert.match(attentionSource, /useState\(routeState\.activeFilter\)/)
  assert.match(attentionSource, /useState\(routeState\.selectedThreadId\)/)
  assert.match(attentionSource, /useState\(routeState\.mobileThreadOpen\)/)
  assert.match(appSource, /<Attention key=\{location\.search\} \/>/)
})

test('desktop dark Inbox uses the same restrained surface system as Documents', () => {
  assert.match(appStyles, /body:has\(\.inbox-page\) aside nav a\.active-nav/)
  assert.match(appStyles, /\.inbox-partner-nav\[data-active="true"\][\s\S]{0,220}rgba\(231, 233, 234, 0\.075\)/)
  assert.match(appStyles, /\.inbox-section-nav-item\[data-active="true"\][\s\S]{0,220}rgba\(231, 233, 234, 0\.075\)/)
  assert.match(appStyles, /\.partner-task-hub > div > \.partner-task-panel:first-child[\s\S]{0,260}background: transparent/)
  assert.match(inboxSource, /className="partner-task-icon/)
  assert.match(inboxSource, /className="partner-task-card-icon/)
})
