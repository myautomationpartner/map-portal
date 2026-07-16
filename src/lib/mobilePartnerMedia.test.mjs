import assert from 'node:assert/strict'
import test from 'node:test'

import {
  getPlatformImageLimit,
  getPlatformMediaNotice,
  MAX_POST_MEDIA,
  resolveAttachmentMediaAction,
  shouldTransformAttachment,
} from './mobilePartnerMedia.js'

test('mobile post media supports ten photos and explains smaller platform limits', () => {
  assert.equal(MAX_POST_MEDIA, 10)
  assert.equal(getPlatformImageLimit('facebook'), 10)
  assert.equal(getPlatformImageLimit('instagram'), 10)
  assert.equal(getPlatformImageLimit('twitter'), 4)
  assert.equal(getPlatformMediaNotice(4, ['facebook', 'instagram', 'twitter']), '')
  assert.match(getPlatformMediaNotice(10, ['facebook', 'instagram', 'twitter']), /X will use the first 4/)
  assert.match(getPlatformMediaNotice(10, ['facebook', 'instagram', 'twitter']), /keep all 10/)
})

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
