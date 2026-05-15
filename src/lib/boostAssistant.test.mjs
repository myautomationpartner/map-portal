import test from 'node:test'
import assert from 'node:assert/strict'
import { recommendBoostSetup } from './boostAssistant.js'

test('recommends traffic for posts with a clear link CTA', () => {
  const recommendation = recommendBoostSetup({
    item: {
      caption: 'Book your free consult today at https://example.com/book',
      platforms: ['facebook', 'instagram'],
      thumbnailUrl: '',
    },
    defaultPlatform: 'instagram',
  })

  assert.equal(recommendation.platform, 'instagram')
  assert.equal(recommendation.goal, 'traffic')
  assert.equal(recommendation.budgetAmount, '12')
  assert.equal(recommendation.durationDays, 5)
  assert.match(recommendation.reason, /website/i)
})

test('recommends video views for video posts', () => {
  const recommendation = recommendBoostSetup({
    item: {
      caption: 'Watch this quick behind-the-scenes look.',
      platforms: ['facebook'],
      mediaType: 'video',
      thumbnailUrl: 'https://example.com/video.mp4',
    },
  })

  assert.equal(recommendation.goal, 'video_views')
  assert.equal(recommendation.durationDays, 3)
})

test('recommends local awareness for local announcement posts', () => {
  const recommendation = recommendBoostSetup({
    item: {
      caption: 'We will be in Binghamton next week helping local businesses.',
      platforms: ['facebook'],
      whyNow: 'Local visit campaign',
    },
  })

  assert.equal(recommendation.goal, 'awareness')
  assert.equal(recommendation.budgetAmount, '10')
  assert.match(recommendation.reason, /local/i)
})
