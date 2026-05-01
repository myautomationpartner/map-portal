const RESERVED_ROOT_SEGMENTS = new Set([
  '',
  'api',
  'assets',
  'login',
  'share',
  'calendar',
  'campaigns',
  'documents',
  'opportunities',
  'inbox',
  'post',
  'stats',
  'settings',
  'connect-return',
])

function cleanSegment(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^\/+|\/+$/g, '')
}

export function getSharedPortalPrefix() {
  return cleanSegment(import.meta.env.VITE_PORTAL_SHARED_PATH_PREFIX || 'portal')
}

export function inferPathTenant(pathname = window.location.pathname) {
  const segments = String(pathname || '')
    .split('/')
    .map(cleanSegment)
    .filter(Boolean)

  const prefix = getSharedPortalPrefix()
  if (prefix && segments[0] === prefix && segments[1]) {
    return {
      clientSlug: segments[1],
      basename: `/${prefix}/${segments[1]}`,
      routeModel: 'prefixed-path',
    }
  }

  if (segments[0] && !RESERVED_ROOT_SEGMENTS.has(segments[0])) {
    return {
      clientSlug: segments[0],
      basename: `/${segments[0]}`,
      routeModel: 'root-path',
    }
  }

  return {
    clientSlug: '',
    basename: '',
    routeModel: 'host',
  }
}

export function buildSharedPortalPath(clientSlug, path = '/') {
  const slug = cleanSegment(clientSlug)
  if (!slug) return path || '/'

  const prefix = getSharedPortalPrefix()
  const normalizedPath = String(path || '/').startsWith('/') ? String(path || '/') : `/${path}`
  return `/${prefix}/${slug}${normalizedPath === '/' ? '' : normalizedPath}`
}

export function portalPath(path = '/') {
  const normalizedPath = String(path || '/').startsWith('/') ? String(path || '/') : `/${path}`
  const tenant = inferPathTenant()
  return tenant.basename ? `${tenant.basename}${normalizedPath}` : normalizedPath
}
