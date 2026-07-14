const MOBILE_PARTNER_ROLLOUT_TENANTS = new Set([
  'dancescapes-performing-arts-llc',
  'my-automation-partner',
])

export function isMobilePartnerRolloutTenant(tenant) {
  return MOBILE_PARTNER_ROLLOUT_TENANTS.has(String(tenant?.clientSlug || '').trim().toLowerCase())
}

export function mobilePartnerRolloutTenants() {
  return [...MOBILE_PARTNER_ROLLOUT_TENANTS]
}
