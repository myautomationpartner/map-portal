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
  assert.match(formatTopicOptionsMessage(options), /Pick one and I will draft it/)
  assert.match(buildTopicDraftPrompt(options[0]), /Last-call reminder/)
})
