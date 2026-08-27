import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildTopicDraftPrompt,
  formatTopicOptionsMessage,
  isExplicitNewPostRequest,
  isTopicSeekingRequest,
  matchTopicOption,
  pickFreshOpportunities,
  resolveGeneratedPostImageMode,
  wantsGeneratedPostImage,
} from './mobilePartnerIntent.js'

const LATEST_RUN = '8ebbc66b-d695-4ded-ac10-632d30da39df'
const OLD_RUN = '11111111-2222-3333-4444-555555555555'
const NOW = new Date('2026-08-27T16:00:00-04:00')

test('recognizes the failed phone prompt as a new post with a branded image', () => {
  const request = 'Create a post about the new mobile UI changes and create an image to include'
  assert.equal(isExplicitNewPostRequest(request), true)
  assert.equal(wantsGeneratedPostImage(request), true)
  assert.equal(resolveGeneratedPostImageMode(request), 'branded_post')
})

test('recognizes common draft-first post language', () => {
  assert.equal(isExplicitNewPostRequest('Draft a social post for our spring opening'), true)
  assert.equal(isExplicitNewPostRequest('Post about our new customer portal'), true)
  assert.equal(isExplicitNewPostRequest('Write a caption announcing the new service'), true)
})

test('does not turn navigation and status questions into post drafts', () => {
  assert.equal(isExplicitNewPostRequest('Open Publisher'), false)
  assert.equal(isExplicitNewPostRequest('What is scheduled this week?'), false)
  assert.equal(isExplicitNewPostRequest('Show my drafts'), false)
})

test('honors explicit image styles while defaulting to a branded graphic', () => {
  assert.equal(resolveGeneratedPostImageMode('Include a realistic lifestyle photo'), 'social_photo')
  assert.equal(resolveGeneratedPostImageMode('Create a tips infographic'), 'infographic')
  assert.equal(resolveGeneratedPostImageMode('Create an image to include'), 'branded_post')
})

test('what should I post today is a conversation, not an instant draft', () => {
  assert.equal(isTopicSeekingRequest('Hey, what should I post today?'), true)
  assert.equal(isTopicSeekingRequest('is there anything going on? Or anything in the area I should post about?'), true)
  assert.equal(isExplicitNewPostRequest('What should we post about today'), false)
  assert.equal(isExplicitNewPostRequest('Post about our new customer portal'), true)
})

test('speech-to-text what-should-be-post still seeks topics without capturing explicit posts', () => {
  assert.equal(isTopicSeekingRequest('What should be post about today to promote the studio'), true)
  assert.equal(isTopicSeekingRequest('What should we post about today to promote the business'), true)
  assert.equal(isTopicSeekingRequest('Post about our new customer portal'), false)
  assert.equal(isExplicitNewPostRequest('Post about our new customer portal'), true)
})

test('topic options pick by number or title and stay short', () => {
  const options = pickFreshOpportunities([
    { id: 'a', title: 'Last-call reminder for open registration', summary: 'Spots fill quickly.', review_state: 'new', client_opportunity_suggestions: [{ caption_starter: 'Registration is open.' }] },
    { id: 'b', title: 'Weekend dance reminder', summary: 'Fall routines.', review_state: 'new' },
    { id: 'c', title: 'Ask for a Google review', summary: 'Happy families.', review_state: 'new' },
    { id: 'd', title: 'Archived leftover', review_state: 'archived' },
  ])
  assert.equal(options.length, 3)
  assert.equal(matchTopicOption('2', options).id, 'b')
  assert.equal(matchTopicOption('the registration one', options).id, 'a')
  assert.match(formatTopicOptionsMessage(options), /Reply 1, 2, or 3/)
  assert.doesNotMatch(formatTopicOptionsMessage(options), /Pick one and I will draft it/)
  assert.match(buildTopicDraftPrompt(options[0]), /Last-call reminder/)
})

test('pickFreshOpportunities prefers the latest research run and drops leftover Google-review ideas', () => {
  const options = pickFreshOpportunities([
    {
      id: 'google',
      title: 'Ask for a Google review',
      summary: 'Happy families already left kind words.',
      review_state: 'new',
      opportunity_type: 'customer_prompt',
      research_run_id: OLD_RUN,
      created_at: '2026-08-19T14:00:00Z',
    },
    {
      id: 'nerves',
      title: 'First-class nerves reassurance post for new families',
      summary: 'New families worry about the first class. That makes a real difference when they are deciding.',
      review_state: 'new',
      opportunity_type: 'customer_prompt',
      research_run_id: LATEST_RUN,
      created_at: '2026-08-26T18:00:00Z',
    },
    {
      id: 'trial',
      title: 'Own the trial class message before someone else does',
      summary: 'A competitor is quieter this week.',
      review_state: 'new',
      opportunity_type: 'competitor_gap',
      research_run_id: LATEST_RUN,
      created_at: '2026-08-26T18:10:00Z',
    },
    {
      id: 'concert',
      title: 'Endicott summer concert weekend tie-in',
      summary: 'The outdoor concert is August 20 downtown.',
      review_state: 'new',
      opportunity_type: 'local_event',
      research_run_id: LATEST_RUN,
      created_at: '2026-08-26T18:20:00Z',
    },
    {
      id: 'summer',
      title: 'Last-week summer class push before the September season starts',
      summary: 'Summer classes wrap this week. That makes a last call feel timely for families still deciding.',
      review_state: 'new',
      opportunity_type: 'seasonal_moment',
      research_run_id: LATEST_RUN,
      created_at: '2026-08-26T18:30:00Z',
    },
  ], 3, NOW)

  assert.deepEqual(options.map((row) => row.id), ['summer', 'nerves'])
  assert.equal(options[0].opportunityType, 'seasonal_moment')
  assert.equal(options[0].researchRunId, LATEST_RUN)
  assert.equal(options.some((row) => row.id === 'google' || row.id === 'trial' || row.id === 'concert'), false)
})

test('pickFreshOpportunities skips competitor_gap ideas', () => {
  const options = pickFreshOpportunities([
    { id: 'gap', title: 'Own the trial class message', summary: 'Quiet competitor.', review_state: 'new', opportunity_type: 'competitor_gap' },
    { id: 'keep', title: 'First-class nerves reassurance', summary: 'New families worry.', review_state: 'new', opportunity_type: 'customer_prompt' },
  ], 3, NOW)
  assert.deepEqual(options.map((row) => row.id), ['keep'])
})

test('pickFreshOpportunities skips an August 20 concert when today is August 27', () => {
  const options = pickFreshOpportunities([
    {
      id: 'concert',
      title: 'Endicott summer concert weekend tie-in',
      summary: 'The outdoor concert is August 20 downtown.',
      review_state: 'new',
      opportunity_type: 'local_event',
    },
    {
      id: 'today',
      title: 'Studio open house August 27',
      summary: 'Doors open tonight.',
      review_state: 'new',
      opportunity_type: 'local_event',
    },
  ], 3, NOW)
  assert.deepEqual(options.map((row) => row.id), ['today'])
})

test('pickFreshOpportunities ranks seasonal_moment ahead of other live types', () => {
  const options = pickFreshOpportunities([
    { id: 'prompt', title: 'First-class nerves reassurance', summary: 'New families worry.', review_state: 'new', opportunity_type: 'customer_prompt', created_at: '2026-08-26T20:00:00Z' },
    { id: 'season', title: 'Last-week summer class push', summary: 'Summer classes wrap this week.', review_state: 'new', opportunity_type: 'seasonal_moment', created_at: '2026-08-26T10:00:00Z' },
    { id: 'event', title: 'Weekend recital reminder', summary: 'Families are already talking about it.', review_state: 'new', opportunity_type: 'local_event', created_at: '2026-08-26T19:00:00Z' },
  ], 3, NOW)
  assert.deepEqual(options.map((row) => row.id), ['season', 'event', 'prompt'])
})

test('formatTopicOptionsMessage uses complete sentences and a this-week closer', () => {
  const longSummary = 'New families worry about the first class. That makes a real difference when they are deciding whether to stay through September.'
  const message = formatTopicOptionsMessage([
    { title: 'Last-week summer class push before the September season starts', summary: 'Summer classes wrap this week. That makes a last call feel timely for families still deciding.' },
    { title: 'First-class nerves reassurance post for new families', summary: longSummary },
  ])
  assert.match(message, /I looked at this week/)
  assert.match(message, /Reply 1 or 2/)
  assert.match(message, /Summer classes wrap this week\./)
  assert.doesNotMatch(message, /Here is what I would post about right now/)
  assert.doesNotMatch(message, /That makes a$/)
  assert.doesNotMatch(message, /That makes a\n/)
  assert.equal(message.includes('That makes a real difference'), false)
  assert.match(formatTopicOptionsMessage([]), /I looked around this week and do not have a fresh local hook yet/)
})

test('matchTopicOption still works with numbers after the fresh picker', () => {
  const options = pickFreshOpportunities([
    { id: 'season', title: 'Last-week summer class push', summary: 'Summer classes wrap this week.', review_state: 'new', opportunity_type: 'seasonal_moment' },
    { id: 'nerves', title: 'First-class nerves reassurance', summary: 'New families worry about the first class.', review_state: 'new', opportunity_type: 'customer_prompt' },
  ], 3, NOW)
  assert.equal(matchTopicOption('1', options).id, 'season')
  assert.equal(matchTopicOption('2', options).id, 'nerves')
  assert.equal(matchTopicOption('one', options).id, 'season')
})
