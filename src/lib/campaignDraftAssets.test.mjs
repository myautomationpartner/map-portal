import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildCampaignDraftMediaAssets,
  getDraftDocumentMediaRefs,
  getDraftMediaRefs,
  inferCampaignMediaType,
} from './campaignDraftAssets.js'

test('infers campaign image and video assets from MIME type or filename', () => {
  assert.equal(inferCampaignMediaType({ type: 'image/png' }), 'image')
  assert.equal(inferCampaignMediaType({ mime_type: 'video/mp4' }), 'video')
  assert.equal(inferCampaignMediaType({ name: 'launch-reel.mov' }), 'video')
  assert.equal(inferCampaignMediaType({ name: 'brief.pdf' }), '')
})

test('builds document-backed source media for campaign draft handoff', () => {
  const mediaAssets = buildCampaignDraftMediaAssets({
    post: {
      assetId: 'asset-1',
      assetName: 'launch-video.mp4',
      assetUse: 'Use as the teaser reel.',
    },
    campaignAssets: [
      {
        id: 'asset-1',
        name: 'launch-video.mp4',
        type: 'video/mp4',
        size: 1234,
        folderPath: 'Campaign/videos',
      },
    ],
  })

  assert.equal(mediaAssets.length, 1)
  assert.equal(mediaAssets[0].type, 'source_media')
  assert.equal(mediaAssets[0].document_id, 'asset-1')
  assert.equal(mediaAssets[0].mediaType, 'video')
  assert.equal(mediaAssets[0].suggestion, 'Use as the teaser reel.')
})

test('extracts document media refs from review notes and asset requirements without duplicates', () => {
  const refs = getDraftDocumentMediaRefs({
    review_notes: JSON.stringify({
      recommendedAsset: { id: 'asset-1', name: 'photo.png', use: 'Main visual' },
      mediaAssets: [
        { documentId: 'asset-1', name: 'photo.png', mediaType: 'image' },
        { documentId: 'asset-2', name: 'clip.webm', mediaType: 'video' },
      ],
    }),
    asset_requirements_json: [
      { type: 'campaign_asset', document_id: 'asset-1', name: 'photo.png' },
      { type: 'source_media', document_id: 'asset-3', name: 'fallback.jpg' },
    ],
  })

  assert.deepEqual(refs.map((ref) => ref.documentId), ['asset-1', 'asset-2', 'asset-3'])
})

test('extracts direct source media urls for calendar previews', () => {
  const refs = getDraftMediaRefs({
    review_notes: JSON.stringify({
      mediaAssets: [
        {
          type: 'source_media',
          url: 'https://cdn.example.com/generated.png',
          thumbnail: 'https://cdn.example.com/generated-thumb.png',
          contentType: 'image/png',
          source: 'content_partner_image_generation',
        },
      ],
    }),
    asset_requirements_json: [
      {
        type: 'source_media',
        url: 'https://cdn.example.com/generated.png',
        contentType: 'image/png',
      },
    ],
  })

  assert.equal(refs.length, 1)
  assert.equal(refs[0].url, 'https://cdn.example.com/generated.png')
  assert.equal(refs[0].thumbnail, 'https://cdn.example.com/generated-thumb.png')
  assert.equal(refs[0].mediaType, 'image')
})

test('ignores null media metadata from older drafts', () => {
  const refs = getDraftMediaRefs({
    review_notes: JSON.stringify({
      recommendedAsset: null,
      mediaAssets: [null],
    }),
    asset_requirements_json: [
      null,
      { type: 'media_concept', suggestion: 'Use a branded graphic.' },
    ],
  })

  assert.deepEqual(refs, [])
})
