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

test('desktop comments can be marked no reply needed and hidden from active inbox', () => {
  assert.match(inboxSource, /readNoReplyNeededCommentKeys/)
  assert.match(inboxSource, /readNoReplyNeededPostKeys/)
  assert.match(inboxSource, /writeNoReplyNeededCommentKeys/)
  assert.match(inboxSource, /writeNoReplyNeededPostKeys/)
  assert.match(inboxSource, /commentDismissalKey/)
  assert.match(inboxSource, /postDismissalKey/)
  assert.match(inboxSource, /applyCommentBundleDismissals\(commentBundles,\s*dismissedCommentKeys,\s*dismissedPostKeys\)/)
  assert.match(inboxSource, /const activeCommentPosts = useMemo/)
  assert.match(inboxSource, /onMarkNoReplyNeeded=\{handleMarkCommentNoReplyNeeded\}/)
  assert.match(inboxSource, /onMarkPostNoReplyNeeded=\{handleMarkPostNoReplyNeeded\}/)
  assert.match(inboxSource, />\s*No reply needed\s*</)
  assert.match(inboxSource, />\s*Clear thread\s*</)
})

test('desktop Inbox syncs local active counts into the global sidebar notification badge', () => {
  assert.match(inboxSource, /queryClient\.setQueryData\(\['inbox-notification-counts',\s*inboxBusinessNames\.join\('\|'\)\]/)
  assert.match(inboxSource, /const commentsReady = commentPostsQuery\.isFetched \|\| commentBundlesQuery\.isFetched/)
  assert.match(inboxSource, /const messagesReady = conversationsQuery\.isFetched/)
  assert.match(inboxSource, /total: messages \+ comments/)
})

test('Inbox setup points customers to MAP mobile portal instead of Chatwoot mobile apps', () => {
  assert.match(inboxSource, /MAP mobile setup/)
  assert.match(inboxSource, /Set up MAP on your phone/)
  assert.match(inboxSource, /Chatwoot powers website chat and support routing in the background/)
  assert.match(inboxSource, /Open MAP mobile portal/)
  assert.match(inboxSource, /const setupPath = portalPath\('\/inbox\?phoneSetup=1'\)/)
  assert.match(inboxSource, /return new URL\(setupPath, window\.location\.origin\)\.toString\(\)/)
  assert.doesNotMatch(inboxSource, /Official Chatwoot mobile app/)
  assert.doesNotMatch(inboxSource, /Send mobile setup email/)
  assert.doesNotMatch(inboxSource, /CHATWOOT_MOBILE_APPS_URL/)
  assert.doesNotMatch(inboxSource, /CHATWOOT_IOS_URL/)
  assert.doesNotMatch(inboxSource, /CHATWOOT_ANDROID_URL/)
  assert.doesNotMatch(inboxSource, /CHATWOOT_WORKSPACE_URL/)
})
