import assert from 'node:assert/strict'
import test from 'node:test'

import {
  isExplicitNewPostRequest,
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
