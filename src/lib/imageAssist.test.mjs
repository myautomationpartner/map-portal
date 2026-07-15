import assert from 'node:assert/strict'
import test from 'node:test'

import { isBrandLogoRequest, resolveCreativeEditTargets } from './imageAssist.js'

test('brand logo requests recognize natural business-logo wording', () => {
  assert.equal(isBrandLogoRequest('add the MAP logo to the image'), true)
  assert.equal(isBrandLogoRequest('put our brand mark in the corner'), true)
  assert.equal(isBrandLogoRequest('make the caption shorter'), false)
})

test('creative edit routing keeps the model plan and catches explicit visual requests', () => {
  assert.deepEqual(resolveCreativeEditTargets({
    request: 'make the image brighter',
    intent: 'conversation',
    hasImage: true,
  }), { changesCaption: false, changesImage: true })

  assert.deepEqual(resolveCreativeEditTargets({
    request: 'make the caption shorter',
    intent: 'conversation',
    hasImage: true,
  }), { changesCaption: true, changesImage: false })

  assert.deepEqual(resolveCreativeEditTargets({
    request: 'make this feel more welcoming',
    intent: 'caption_and_image',
    hasImage: true,
  }), { changesCaption: true, changesImage: true })
})

test('new image attachments always enter the visual edit flow', () => {
  assert.equal(resolveCreativeEditTargets({
    request: 'use this instead',
    intent: 'conversation',
    hasImage: true,
    hasImageAttachments: true,
  }).changesImage, true)
})
