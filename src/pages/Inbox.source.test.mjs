import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const inboxSource = await readFile(new URL('./Inbox.jsx', import.meta.url), 'utf8')
const attentionSource = await readFile(new URL('./Attention.jsx', import.meta.url), 'utf8')

test('desktop My Partner hub is scoped to Messages only', () => {
  assert.match(
    inboxSource,
    /const showPartnerHub = activeSection === 'messages' && \(\s*partnerHubOpen/s,
  )
  assert.match(inboxSource, /activeSection === 'comments' \? \(\s*<CommentsInbox/s)
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
