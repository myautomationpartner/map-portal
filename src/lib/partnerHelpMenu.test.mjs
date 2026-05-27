import test from 'node:test'
import assert from 'node:assert/strict'
import { getPartnerHelpOptions, resolvePartnerHelpHref, selectNextReviewDraft } from './partnerHelpMenu.js'

test('partner help menu exposes customer task choices before opening chat', () => {
  assert.deepEqual(
    getPartnerHelpOptions().map((option) => option.id),
    ['create_post', 'review_drafts', 'scheduled_posts', 'ask_partner'],
  )
})

test('partner help draft option deep-links to the first available draft when present', () => {
  assert.equal(resolvePartnerHelpHref('review_drafts', { firstDraftId: 'draft-123' }), '/post?draftId=draft-123')
  assert.equal(resolvePartnerHelpHref('review_drafts'), '/calendar')
})

test('partner help review drafts ignores stale scheduled order and chooses the next useful draft', () => {
  const now = new Date('2026-05-25T16:00:00Z')
  const selected = selectNextReviewDraft([
    {
      id: 'old-open',
      scheduled_for: '2026-05-08T19:00:00Z',
      review_state: 'draft',
      updated_at: '2026-05-08T12:00:00Z',
    },
    {
      id: 'published',
      scheduled_for: '2026-05-26T19:00:00Z',
      review_state: 'published',
      updated_at: '2026-05-25T12:00:00Z',
    },
    {
      id: 'next-upcoming',
      scheduled_for: '2026-05-26T18:00:00Z',
      review_state: 'draft',
      updated_at: '2026-05-20T12:00:00Z',
    },
    {
      id: 'later-upcoming',
      scheduled_for: '2026-05-30T18:00:00Z',
      review_state: 'draft',
      updated_at: '2026-05-25T12:00:00Z',
    },
  ], { now })

  assert.equal(selected?.id, 'next-upcoming')
})

test('partner help review drafts falls back to the most recently touched stale draft', () => {
  const now = new Date('2026-05-25T16:00:00Z')
  const selected = selectNextReviewDraft([
    {
      id: 'oldest',
      scheduled_for: '2026-05-08T19:00:00Z',
      review_state: 'draft',
      updated_at: '2026-05-08T12:00:00Z',
    },
    {
      id: 'recent-stale',
      scheduled_for: '2026-05-09T19:00:00Z',
      review_state: 'draft',
      updated_at: '2026-05-24T12:00:00Z',
    },
  ], { now })

  assert.equal(selected?.id, 'recent-stale')
})
