function normalizeList(value) {
  return Array.isArray(value) ? value : []
}

function parseJsonObject(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value
  if (typeof value !== 'string' || !value.trim()) return {}
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function firstString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

export function inferCampaignMediaType(asset = {}) {
  const explicit = firstString(asset.mediaType, asset.media_type, asset.kind).toLowerCase()
  if (explicit === 'image' || explicit === 'video') return explicit

  const mimeType = firstString(asset.mimeType, asset.mime_type, asset.contentType, asset.content_type, asset.type).toLowerCase()
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType.startsWith('video/')) return 'video'

  const name = firstString(asset.name, asset.assetName, asset.file_name, asset.relativePath, asset.relative_path)
  if (/\.(mp4|m4v|mov|webm)(?:$|[?#])/i.test(name)) return 'video'
  if (/\.(png|jpe?g|webp|gif|bmp|tiff?|avif|heic|heif|svg)(?:$|[?#])/i.test(name)) return 'image'
  return ''
}

function normalizeDocumentMediaAsset(asset = {}, use = '') {
  const documentId = firstString(asset.document_id, asset.documentId, asset.id)
  const name = firstString(asset.name, asset.assetName, asset.file_name)
  const mediaType = inferCampaignMediaType(asset)
  if (!documentId || !name || !mediaType) return null

  const mimeType = firstString(asset.mimeType, asset.mime_type, asset.contentType, asset.content_type, asset.type)
  return {
    type: 'source_media',
    source: 'campaign_partner',
    document_id: documentId,
    documentId,
    name,
    assetName: name,
    mediaType,
    contentType: mimeType,
    mimeType,
    size: Number(asset.size || asset.size_bytes || 0),
    folderId: firstString(asset.folderId, asset.folder_id),
    folderPath: firstString(asset.folderPath, asset.folder_path),
    relativePath: firstString(asset.relativePath, asset.relative_path, name),
    suggestion: firstString(use, asset.assetUse, asset.asset_use, asset.suggestion, asset.description),
    assetUse: firstString(use, asset.assetUse, asset.asset_use, asset.suggestion),
  }
}

export function findCampaignAssetForPost(post = {}, campaignAssets = []) {
  const assetId = firstString(post.assetId, post.asset_id)
  const assetName = firstString(post.assetName, post.asset_name)
  const assets = normalizeList(campaignAssets)

  if (assetId) {
    const match = assets.find((asset) => firstString(asset.id, asset.document_id, asset.documentId) === assetId)
    if (match) return match
  }

  if (assetName) {
    const normalizedName = assetName.toLowerCase()
    const match = assets.find((asset) => firstString(asset.name, asset.file_name).toLowerCase() === normalizedName)
    if (match) return match
  }

  return null
}

export function buildCampaignDraftMediaAssets({ post = {}, campaignAssets = [] } = {}) {
  const matchedAsset = findCampaignAssetForPost(post, campaignAssets)
  const fallbackAsset = {
    id: firstString(post.assetId, post.asset_id),
    name: firstString(post.assetName, post.asset_name),
  }
  const normalized = normalizeDocumentMediaAsset(matchedAsset || fallbackAsset, firstString(post.assetUse, post.asset_use, post.imageIdea, post.image_idea))
  return normalized ? [normalized] : []
}

function collectDocumentMediaRef(input = {}, refs, seen) {
  if (!input || typeof input !== 'object') return
  const documentId = firstString(input.document_id, input.documentId, input.id)
  if (!documentId || seen.has(documentId)) return
  const mediaType = inferCampaignMediaType(input)
  const entryType = firstString(input.type)
  if (!mediaType && entryType !== 'campaign_asset' && entryType !== 'source_media') return

  seen.add(documentId)
  refs.push({
    documentId,
    name: firstString(input.name, input.assetName, input.file_name),
    use: firstString(input.suggestion, input.assetUse, input.asset_use, input.use),
    mediaType,
    contentType: firstString(input.contentType, input.content_type, input.mimeType, input.mime_type),
    source: firstString(input.source, 'campaign_partner'),
  })
}

function collectUrlMediaRef(input = {}, refs, seen) {
  if (!input || typeof input !== 'object') return
  const url = firstString(input.url, input.link, input.thumbnail, input.previewUrl, input.preview_url, input.signed_url)
  if (!url || seen.has(url)) return

  const mediaType = inferCampaignMediaType({
    ...input,
    name: firstString(input.name, input.assetName, input.file_name, url),
  })
  const entryType = firstString(input.type)
  if (!mediaType && entryType !== 'source_media') return

  seen.add(url)
  refs.push({
    url,
    thumbnail: firstString(input.thumbnail, input.previewUrl, input.preview_url, url),
    name: firstString(input.name, input.assetName, input.file_name),
    use: firstString(input.suggestion, input.assetUse, input.asset_use, input.use),
    mediaType,
    contentType: firstString(input.contentType, input.content_type, input.mimeType, input.mime_type),
    source: firstString(input.source, 'source_media'),
  })
}

function collectAnyMediaRef(input = {}, refs, seen) {
  if (!input || typeof input !== 'object') return
  collectUrlMediaRef(input, refs, seen)
  collectDocumentMediaRef(input, refs, seen)
}

export function getDraftMediaRefs(draft = {}) {
  const refs = []
  const seen = new Set()
  const meta = parseJsonObject(draft.review_notes)

  collectAnyMediaRef(meta.recommendedAsset, refs, seen)
  normalizeList(meta.mediaAssets).forEach((asset) => collectAnyMediaRef(asset, refs, seen))
  normalizeList(draft.asset_requirements_json)
    .filter((item) => item?.type === 'campaign_asset' || item?.type === 'source_media')
    .forEach((item) => collectAnyMediaRef(item, refs, seen))

  return refs
}

export function getDraftDocumentMediaRefs(draft = {}) {
  return getDraftMediaRefs(draft).filter((ref) => ref.documentId)
}
