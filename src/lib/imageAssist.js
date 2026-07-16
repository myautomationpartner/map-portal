const DEFAULT_MAX_DIMENSION = 960
const DEFAULT_QUALITY = 0.74

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('This photo could not be prepared for Partner Assist.'))
    image.src = url
  })
}

export async function createVisionImageDataUrl(file, options = {}) {
  if (!file || !String(file.type || '').toLowerCase().startsWith('image/')) return ''

  const maxDimension = Math.max(320, Number(options.maxDimension || DEFAULT_MAX_DIMENSION))
  const quality = Math.min(0.9, Math.max(0.55, Number(options.quality || DEFAULT_QUALITY)))
  const objectUrl = URL.createObjectURL(file)

  try {
    const image = await loadImage(objectUrl)
    const sourceWidth = image.naturalWidth || image.width
    const sourceHeight = image.naturalHeight || image.height
    if (!sourceWidth || !sourceHeight) return ''

    const scale = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(sourceWidth * scale))
    canvas.height = Math.max(1, Math.round(sourceHeight * scale))

    const context = canvas.getContext('2d', { alpha: false })
    if (!context) return ''
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', quality)
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

export async function createVisionImageDataUrls(files, limit = 10) {
  const images = Array.from(files || [])
    .filter((file) => String(file?.type || '').toLowerCase().startsWith('image/'))
    .slice(0, Math.max(1, limit))

  const prepared = await Promise.all(images.map((file) => createVisionImageDataUrl(file).catch(() => '')))
  return prepared.filter(Boolean)
}

export function isBrandLogoRequest(request) {
  return /\b(?:map\s+logo|my\s+automation\s+partner\s+logo|business\s+logo|company\s+logo|our\s+logo|my\s+logo|brand\s+(?:logo|mark)|logo|watermark)\b/i.test(String(request || ''))
}

export function resolveCreativeEditTargets({
  request,
  intent,
  hasImage = false,
  hasImageAttachments = false,
}) {
  const normalizedRequest = String(request || '').trim()
  const modelChangesCaption = ['caption_edit', 'caption_and_image'].includes(intent)
  const modelChangesImage = ['image_edit', 'caption_and_image'].includes(intent)

  // The model remains the primary natural-language planner. These cues are a
  // deterministic safety net for direct visual requests so an obvious edit is
  // not dropped just because the planner returned a conversational response.
  const explicitVisualRequest = hasImage && /\b(?:photo|image|picture|graphic|visual|logo|watermark|background|foreground|lighting|shadow|crop|composition|filter|brightness|contrast|saturation|blur|sharpen|retouch|reframe|recolor|colour|color|rotate|flip|resize|remove\s+(?:the\s+)?background|replace\s+(?:the\s+)?background|brighten|darken|enhance|stylize|stylise|modernize|modernise)\b/i.test(normalizedRequest)
  const explicitCaptionRequest = /\b(?:caption|copy|wording|sentence|hashtags?|call\s+to\s+action|cta|spelling|grammar|punctuation)\b/i.test(normalizedRequest)

  return {
    changesCaption: modelChangesCaption || explicitCaptionRequest,
    changesImage: hasImageAttachments || modelChangesImage || explicitVisualRequest,
  }
}

export function isLogoOverlayOnlyRequest(request, useBrandLogo) {
  if (!useBrandLogo || !isBrandLogoRequest(request)) return false
  return !/\b(brighten|darken|crop|resize|remove|replace|background|lighting|blur|sharpen|enhance|retouch|rotate|flip|reframe|recolor|colour|stylize|modernize|modernise|filter|cleanup|clean up)\b/i.test(String(request || ''))
}

export async function stampBrandLogo({
  imageBase64,
  imageMimeType = 'image/png',
  logoBase64,
  logoMimeType = 'image/png',
}) {
  if (!imageBase64 || !logoBase64) {
    throw new Error('The verified business logo was not returned with this image edit.')
  }

  const [image, logo] = await Promise.all([
    loadImage(`data:${imageMimeType};base64,${imageBase64}`),
    loadImage(`data:${logoMimeType};base64,${logoBase64}`),
  ])
  const width = image.naturalWidth || image.width
  const height = image.naturalHeight || image.height
  const logoWidth = logo.naturalWidth || logo.width
  const logoHeight = logo.naturalHeight || logo.height
  if (!width || !height || !logoWidth || !logoHeight) {
    throw new Error('The edited image or business logo could not be measured.')
  }

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { alpha: false })
  if (!context) throw new Error('The business logo could not be applied to this image.')

  context.drawImage(image, 0, 0, width, height)
  // The postcard displays images with a 16:9 cover crop. Keep the logo inside
  // that visible center crop so square image-model outputs cannot hide it.
  const postcardAspect = 16 / 9
  const imageAspect = width / height
  const visibleWidth = imageAspect > postcardAspect ? height * postcardAspect : width
  const visibleHeight = imageAspect > postcardAspect ? height : width / postcardAspect
  const visibleLeft = (width - visibleWidth) / 2
  const visibleTop = (height - visibleHeight) / 2

  // A logo that is technically present but unreadable on a phone is still a
  // failed edit. Reserve roughly one quarter of the visible postcard crop so
  // the verified mark remains obvious in the compact mobile preview.
  const scale = Math.min((visibleWidth * 0.27) / logoWidth, (visibleHeight * 0.3) / logoHeight)
  const renderedWidth = Math.max(1, Math.round(logoWidth * scale))
  const renderedHeight = Math.max(1, Math.round(logoHeight * scale))
  const margin = Math.max(18, Math.round(Math.min(visibleWidth, visibleHeight) * 0.04))
  const x = Math.round(visibleLeft + visibleWidth - renderedWidth - margin)
  const y = Math.round(visibleTop + visibleHeight - renderedHeight - margin)
  const platePadding = Math.max(8, Math.round(Math.min(visibleWidth, visibleHeight) * 0.018))
  const plateX = x - platePadding
  const plateY = y - platePadding
  const plateWidth = renderedWidth + (platePadding * 2)
  const plateHeight = renderedHeight + (platePadding * 2)
  const plateRadius = Math.max(10, Math.round(plateHeight * 0.12))

  context.save()
  context.shadowColor = 'rgba(0, 0, 0, 0.28)'
  context.shadowBlur = Math.max(6, Math.round(width * 0.008))
  context.shadowOffsetY = Math.max(3, Math.round(height * 0.004))
  context.beginPath()
  context.moveTo(plateX + plateRadius, plateY)
  context.arcTo(plateX + plateWidth, plateY, plateX + plateWidth, plateY + plateHeight, plateRadius)
  context.arcTo(plateX + plateWidth, plateY + plateHeight, plateX, plateY + plateHeight, plateRadius)
  context.arcTo(plateX, plateY + plateHeight, plateX, plateY, plateRadius)
  context.arcTo(plateX, plateY, plateX + plateWidth, plateY, plateRadius)
  context.closePath()
  context.fillStyle = 'rgba(5, 18, 28, 0.94)'
  context.fill()
  context.shadowColor = 'transparent'
  context.lineWidth = Math.max(2, Math.round(Math.min(width, height) * 0.004))
  context.strokeStyle = 'rgba(190, 238, 54, 0.92)'
  context.stroke()
  context.drawImage(logo, x, y, renderedWidth, renderedHeight)
  context.restore()

  const dataUrl = canvas.toDataURL('image/png')
  return {
    imageBase64: dataUrl.slice(dataUrl.indexOf(',') + 1),
    mimeType: 'image/png',
    placement: 'bottom-right',
    visibleWidthCoverage: renderedWidth / visibleWidth,
  }
}
