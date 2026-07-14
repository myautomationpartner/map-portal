const PROMO_REQUEST_PATTERN = /\b(promo|promotion|promotional|flyer|poster|special|sale|event graphic|offer graphic|price graphic|advertisement|ad graphic|deal graphic)\b/i
const PROMO_REVISION_PATTERN = /(?:\$\s?\d)|\b(price|offer|headline|subheadline|date|time|cta|call to action|color|colour|palette|layout|template|special|deal|event|change .* to|replace .* with)\b/i

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('The promotional graphic could not load its image assets.'))
    image.src = url
  })
}

function safeColor(value, fallback) {
  return /^#[0-9a-f]{6}$/i.test(String(value || '')) ? value : fallback
}

function roundedRect(context, x, y, width, height, radius) {
  const safeRadius = Math.min(radius, width / 2, height / 2)
  context.beginPath()
  context.moveTo(x + safeRadius, y)
  context.arcTo(x + width, y, x + width, y + height, safeRadius)
  context.arcTo(x + width, y + height, x, y + height, safeRadius)
  context.arcTo(x, y + height, x, y, safeRadius)
  context.arcTo(x, y, x + width, y, safeRadius)
  context.closePath()
}

function drawCover(context, image, x, y, width, height) {
  const sourceWidth = image.naturalWidth || image.width
  const sourceHeight = image.naturalHeight || image.height
  const scale = Math.max(width / sourceWidth, height / sourceHeight)
  const cropWidth = width / scale
  const cropHeight = height / scale
  const sourceX = Math.max(0, (sourceWidth - cropWidth) / 2)
  const sourceY = Math.max(0, (sourceHeight - cropHeight) / 2)
  context.drawImage(image, sourceX, sourceY, cropWidth, cropHeight, x, y, width, height)
}

function fitText(context, text, maxWidth, startingSize, minimumSize, weight = 900) {
  let size = startingSize
  while (size > minimumSize) {
    context.font = `${weight} ${size}px system-ui, -apple-system, BlinkMacSystemFont, "Arial Black", sans-serif`
    if (context.measureText(text).width <= maxWidth) break
    size -= 2
  }
  return size
}

function wrapText(context, text, maxWidth, maxLines = 3) {
  const words = String(text || '').split(/\s+/).filter(Boolean)
  const lines = []
  let current = ''
  words.forEach((word) => {
    const candidate = current ? `${current} ${word}` : word
    if (current && context.measureText(candidate).width > maxWidth) {
      lines.push(current)
      current = word
    } else {
      current = candidate
    }
  })
  if (current) lines.push(current)
  if (lines.length > maxLines) {
    const trimmed = lines.slice(0, maxLines)
    trimmed[maxLines - 1] = `${trimmed[maxLines - 1].replace(/[.,;:!?-]+$/, '')}…`
    return trimmed
  }
  return lines
}

function drawCenteredLines(context, lines, centerX, startY, lineHeight) {
  lines.forEach((line, index) => context.fillText(line, centerX, startY + (index * lineHeight)))
}

function normalizeOffers(offers) {
  return Array.isArray(offers)
    ? offers.slice(0, 3).map((offer) => ({
        label: String(offer?.label || '').trim().slice(0, 44),
        detail: String(offer?.detail || '').trim().slice(0, 54),
        price: String(offer?.price || '').trim().slice(0, 18),
      })).filter((offer) => offer.label || offer.detail || offer.price)
    : []
}

export function isPromotionalDesignRequest(request) {
  return PROMO_REQUEST_PATTERN.test(String(request || ''))
}

export function isPromotionalDesignRevision(request) {
  return PROMO_REVISION_PATTERN.test(String(request || ''))
}

export function readImageFileDataUrl(file) {
  if (!file || !String(file.type || '').toLowerCase().startsWith('image/')) return Promise.resolve('')
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('The attached photo could not be prepared for the promotional designer.'))
    reader.readAsDataURL(file)
  })
}

export async function renderPromotionalGraphic({
  sourceFile,
  sourceImageBase64,
  sourceImageMimeType = 'image/jpeg',
  logoBase64,
  logoMimeType = 'image/png',
  brief,
}) {
  const sourceUrl = sourceImageBase64
    ? `data:${sourceImageMimeType};base64,${sourceImageBase64}`
    : URL.createObjectURL(sourceFile)

  try {
    const [sourceImage, logo] = await Promise.all([
      loadImage(sourceUrl),
      logoBase64 ? loadImage(`data:${logoMimeType};base64,${logoBase64}`) : Promise.resolve(null),
    ])

    const canvas = document.createElement('canvas')
    canvas.width = 1080
    canvas.height = 1350
    const context = canvas.getContext('2d', { alpha: false })
    if (!context) throw new Error('The promotional graphic could not be rendered on this device.')

    const palette = brief?.palette || {}
    const background = safeColor(palette.background, '#071824')
    const primary = safeColor(palette.primary, '#08b8c2')
    const accent = safeColor(palette.accent, '#c6ee38')
    const light = safeColor(palette.light, '#f8fbff')
    const offers = normalizeOffers(brief?.offers)
    const businessName = String(brief?.businessName || 'Your Business').trim().slice(0, 70)
    const eyebrow = String(brief?.eyebrow || 'LIMITED-TIME OFFER').trim().slice(0, 70).toUpperCase()
    const headline = String(brief?.headline || 'SPECIAL EVENT').trim().slice(0, 90).toUpperCase()
    const subheadline = String(brief?.subheadline || '').trim().slice(0, 120)
    const dateTime = String(brief?.dateTime || '').trim().slice(0, 80).toUpperCase()
    const cta = String(brief?.cta || 'LEARN MORE').trim().slice(0, 80).toUpperCase()

    context.fillStyle = background
    context.fillRect(0, 0, canvas.width, canvas.height)
    drawCover(context, sourceImage, 0, 0, 1080, 760)

    const heroShade = context.createLinearGradient(0, 0, 0, 780)
    heroShade.addColorStop(0, 'rgba(3, 14, 24, 0.42)')
    heroShade.addColorStop(0.5, 'rgba(3, 14, 24, 0.7)')
    heroShade.addColorStop(1, background)
    context.fillStyle = heroShade
    context.fillRect(0, 0, 1080, 790)

    context.fillStyle = 'rgba(3, 14, 24, 0.86)'
    context.fillRect(0, 0, 1080, 126)
    if (logo) {
      const logoWidth = logo.naturalWidth || logo.width
      const logoHeight = logo.naturalHeight || logo.height
      const scale = Math.min(150 / logoWidth, 82 / logoHeight)
      context.drawImage(logo, 46, 22, logoWidth * scale, logoHeight * scale)
    }
    context.fillStyle = light
    context.font = '800 34px system-ui, -apple-system, BlinkMacSystemFont, sans-serif'
    context.textAlign = 'right'
    context.fillText(businessName, 1032, 74)

    context.textAlign = 'center'
    context.fillStyle = accent
    context.font = '900 28px system-ui, -apple-system, BlinkMacSystemFont, sans-serif'
    context.letterSpacing = '4px'
    context.fillText(eyebrow, 540, 215)
    context.letterSpacing = '0px'

    const headlineSize = fitText(context, headline, 930, 112, 60)
    context.font = `950 ${headlineSize}px system-ui, -apple-system, BlinkMacSystemFont, "Arial Black", sans-serif`
    context.fillStyle = light
    context.shadowColor = 'rgba(0, 0, 0, 0.42)'
    context.shadowBlur = 20
    const headlineLines = wrapText(context, headline, 930, 2)
    drawCenteredLines(context, headlineLines, 540, 330, headlineSize * 0.94)
    context.shadowBlur = 0

    if (subheadline) {
      context.font = '700 35px system-ui, -apple-system, BlinkMacSystemFont, sans-serif'
      context.fillStyle = light
      const subLines = wrapText(context, subheadline, 900, 2)
      drawCenteredLines(context, subLines, 540, 535, 45)
    }

    if (dateTime) {
      roundedRect(context, 210, 625, 660, 86, 43)
      context.fillStyle = primary
      context.fill()
      context.fillStyle = background
      const dateSize = fitText(context, dateTime, 590, 39, 27, 900)
      context.font = `900 ${dateSize}px system-ui, -apple-system, BlinkMacSystemFont, sans-serif`
      context.fillText(dateTime, 540, 682)
    }

    const gridY = 760
    const gridHeight = 395
    const gap = 18
    const cardCount = Math.max(1, offers.length)
    const cardWidth = (984 - (gap * (cardCount - 1))) / cardCount
    const cardColors = [accent, primary, light]
    const cardTextColors = [background, background, background]
    const renderedOffers = offers.length ? offers : [{ label: 'YOUR OFFER', detail: 'Add the exact details in chat', price: '' }]

    renderedOffers.forEach((offer, index) => {
      const x = 48 + (index * (cardWidth + gap))
      roundedRect(context, x, gridY, cardWidth, gridHeight, 28)
      context.fillStyle = cardColors[index % cardColors.length]
      context.fill()
      context.strokeStyle = 'rgba(255,255,255,0.18)'
      context.lineWidth = 3
      context.stroke()

      context.fillStyle = cardTextColors[index % cardTextColors.length]
      context.textAlign = 'center'
      context.font = '900 31px system-ui, -apple-system, BlinkMacSystemFont, sans-serif'
      const labelLines = wrapText(context, offer.label.toUpperCase(), cardWidth - 48, 2)
      drawCenteredLines(context, labelLines, x + (cardWidth / 2), gridY + 72, 38)

      context.font = '750 25px system-ui, -apple-system, BlinkMacSystemFont, sans-serif'
      const detailLines = wrapText(context, offer.detail, cardWidth - 48, 3)
      drawCenteredLines(context, detailLines, x + (cardWidth / 2), gridY + 180, 32)

      if (offer.price) {
        const priceSize = fitText(context, offer.price, cardWidth - 46, 72, 42, 950)
        context.font = `950 ${priceSize}px system-ui, -apple-system, BlinkMacSystemFont, "Arial Black", sans-serif`
        context.fillText(offer.price, x + (cardWidth / 2), gridY + 335)
      }
    })

    context.fillStyle = primary
    context.fillRect(0, 1200, 1080, 150)
    context.fillStyle = background
    context.textAlign = 'center'
    const ctaSize = fitText(context, cta, 930, 45, 28, 900)
    context.font = `900 ${ctaSize}px system-ui, -apple-system, BlinkMacSystemFont, sans-serif`
    context.fillText(cta, 540, 1287)

    const previewUrl = canvas.toDataURL('image/jpeg', 0.92)
    const response = await fetch(previewUrl)
    const blob = await response.blob()
    return {
      file: new globalThis.File([blob], 'map-promotional-graphic.jpg', { type: 'image/jpeg' }),
      previewUrl,
      width: 1080,
      height: 1350,
    }
  } finally {
    if (!sourceImageBase64 && sourceUrl) URL.revokeObjectURL(sourceUrl)
  }
}
