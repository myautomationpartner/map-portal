import assert from 'node:assert/strict'
import test from 'node:test'

import {
  resolveAttachmentMediaAction,
  shouldTransformAttachment,
} from './mobilePartnerMedia.js'

test('attached images can be added or replaced with natural language', () => {
  assert.equal(resolveAttachmentMediaAction('Add this photo too', 1), 'add')
  assert.equal(resolveAttachmentMediaAction('Keep this image with the current one', 1), 'add')
  assert.equal(resolveAttachmentMediaAction('Replace the current picture with this one', 1), 'replace')
  assert.equal(resolveAttachmentMediaAction('Use this photo for the post', 1), 'replace')
  assert.equal(resolveAttachmentMediaAction('Here is the better shot', 1), 'replace')
  assert.equal(resolveAttachmentMediaAction('Add this photo', 0), 'none')
})

test('simple media placement stays exact while visual edits use Image Assist', () => {
  assert.equal(shouldTransformAttachment('Replace the current photo with this one'), false)
  assert.equal(shouldTransformAttachment('Add this photo too'), false)
  assert.equal(shouldTransformAttachment('Use this photo and brighten the background'), true)
  assert.equal(shouldTransformAttachment('Add our logo to this image'), true)
})
