import test from 'node:test'
import assert from 'node:assert/strict'

import { splitMessageLinks } from './messageLinks.js'

test('splits message text into text and URL parts', () => {
  assert.deepEqual(
    splitMessageLinks('Review your post:\nhttps://myautomationpartner.com/portal/my-automation-partner/r/abc123'),
    [
      { type: 'text', value: 'Review your post:\n' },
      { type: 'link', value: 'https://myautomationpartner.com/portal/my-automation-partner/r/abc123' },
    ],
  )
})

test('keeps trailing punctuation outside URL links', () => {
  assert.deepEqual(
    splitMessageLinks('Open https://example.com/review).'),
    [
      { type: 'text', value: 'Open ' },
      { type: 'link', value: 'https://example.com/review' },
      { type: 'text', value: ').' },
    ],
  )
})
