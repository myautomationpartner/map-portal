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

export async function createVisionImageDataUrls(files, limit = 3) {
  const images = Array.from(files || [])
    .filter((file) => String(file?.type || '').toLowerCase().startsWith('image/'))
    .slice(0, Math.max(1, limit))

  const prepared = await Promise.all(images.map((file) => createVisionImageDataUrl(file).catch(() => '')))
  return prepared.filter(Boolean)
}
