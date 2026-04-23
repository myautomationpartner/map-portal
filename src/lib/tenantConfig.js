const DEFAULT_DISPLAY_NAME = 'My Automation Partner'
const DEFAULT_PORTAL_LABEL = 'Client Portal'
const DEFAULT_SUPPORT_EMAIL = 'info@myautomationpartner.com'
const DEFAULT_DOMAIN_PATTERN = '<client-slug>.portal.myautomationpartner.com'

function titleCaseFromSlug(value) {
  const normalized = String(value || '')
    .trim()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')

  if (!normalized) return ''

  return normalized
    .split(' ')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function initialsFromName(value) {
  const parts = String(value || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)

  if (!parts.length) return 'MP'

  return parts.map((part) => part.charAt(0).toUpperCase()).join('')
}

function pickTheme(primary) {
  if (!primary || typeof primary !== 'object') return null
  return {
    primary: primary.primary || primary.portal_primary || null,
    accent: primary.accent || primary.portal_accent || null,
    background: primary.background || primary.portal_background || null,
  }
}

export function buildTenantConfig(input = {}) {
  const client = input.client || null
  const claims = input.claims || {}
  const sharePayload = input.sharePayload || {}

  const clientSlug =
    client?.slug ||
    claims.client_slug ||
    sharePayload.client_slug ||
    sharePayload.clientSlug ||
    ''

  const businessName =
    client?.business_name ||
    sharePayload.client_business_name ||
    sharePayload.business_name ||
    ''

  const displayName =
    businessName ||
    import.meta.env.VITE_PORTAL_DISPLAY_NAME ||
    titleCaseFromSlug(clientSlug) ||
    DEFAULT_DISPLAY_NAME

  const portalLabel =
    import.meta.env.VITE_PORTAL_LABEL ||
    DEFAULT_PORTAL_LABEL

  const supportEmail =
    import.meta.env.VITE_PORTAL_SUPPORT_EMAIL ||
    client?.support_email ||
    sharePayload.support_email ||
    DEFAULT_SUPPORT_EMAIL

  const logoUrl =
    import.meta.env.VITE_PORTAL_LOGO_URL ||
    client?.logo_url ||
    sharePayload.logo_url ||
    null

  const canonicalHost =
    import.meta.env.VITE_PORTAL_CANONICAL_HOST ||
    sharePayload.portal_domain ||
    client?.portal_domain ||
    ''

  const workerName =
    import.meta.env.VITE_PORTAL_WORKER_NAME ||
    sharePayload.worker_name ||
    ''

  const billingStatus =
    import.meta.env.VITE_PORTAL_BILLING_STATUS ||
    client?.billing_status ||
    claims.billing_status ||
    sharePayload.billing_status ||
    ''

  const billingPortalUrl =
    import.meta.env.VITE_PORTAL_BILLING_PORTAL_URL ||
    client?.billing_portal_url ||
    sharePayload.billing_portal_url ||
    null

  const billingCheckoutUrl =
    import.meta.env.VITE_PORTAL_BILLING_CHECKOUT_URL ||
    client?.billing_checkout_url ||
    sharePayload.billing_checkout_url ||
    null

  const selectedPlan =
    client?.selected_plan ||
    sharePayload.selected_plan ||
    ''

  const theme = pickTheme(client?.brand_colors || sharePayload.brand_colors)

  return {
    clientSlug,
    displayName,
    portalLabel,
    supportEmail,
    logoUrl,
    logoInitials: initialsFromName(displayName),
    canonicalHost,
    workerName,
    domainPattern: DEFAULT_DOMAIN_PATTERN,
    theme,
    billingStatus,
    billingPortalUrl,
    billingCheckoutUrl,
    selectedPlan,
  }
}
