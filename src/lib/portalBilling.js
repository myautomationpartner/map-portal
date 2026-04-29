const READ_ONLY_STATUSES = new Set(['payment_method_needed', 'past_due'])
const BLOCKED_STATUSES = new Set(['suspended'])
const WARNING_STATUSES = new Set(['trial_expiring'])

function normalizeValue(value) {
  return String(value || '').trim().toLowerCase()
}

function buildFallbackActionUrl(tenant) {
  const supportEmail = tenant?.supportEmail || 'info@myautomationpartner.com'
  const subject = encodeURIComponent(`Billing help for ${tenant?.displayName || 'MAP portal access'}`)
  const body = encodeURIComponent('My trial ended and I need to unlock portal access.')
  return `mailto:${supportEmail}?subject=${subject}&body=${body}`
}

export function resolveBillingAccess(tenant = {}) {
  const billingStatus = normalizeValue(tenant.billingStatus)
  const actionUrl = tenant.billingPortalUrl || tenant.billingCheckoutUrl || buildFallbackActionUrl(tenant)

  if (WARNING_STATUSES.has(billingStatus)) {
    return {
      billingStatus,
      mode: 'warning',
      readOnly: false,
      showBanner: true,
      title: 'Trial ends in 5 days',
      message: 'Your 30-day trial is in its final 5 days. Add payment now to keep full access active when the trial ends.',
      ctaLabel: tenant.billingCheckoutUrl ? 'Add payment now' : tenant.billingPortalUrl ? 'Manage billing' : 'Contact MAP',
      actionUrl,
    }
  }

  if (BLOCKED_STATUSES.has(billingStatus)) {
    return {
      billingStatus,
      mode: 'blocked',
      readOnly: true,
      showBanner: true,
      title: 'Workspace suspended',
      message: 'This workspace is suspended until billing is resolved. Complete payment or contact MAP support to restore access.',
      ctaLabel: tenant.billingPortalUrl ? 'Resolve billing' : 'Contact MAP',
      actionUrl,
    }
  }

  if (READ_ONLY_STATUSES.has(billingStatus)) {
    return {
      billingStatus,
      mode: 'read_only',
      readOnly: true,
      showBanner: true,
      title: 'Payment required to unlock changes',
      message: 'Your trial has ended. This portal is now read-only until payment is completed. You can still review your workspace and unlock full access below.',
      ctaLabel: tenant.billingCheckoutUrl ? 'Pay now' : tenant.billingPortalUrl ? 'Manage billing' : 'Contact MAP',
      actionUrl,
    }
  }

  return {
    billingStatus,
    mode: 'active',
    readOnly: false,
    showBanner: false,
    title: '',
    message: '',
    ctaLabel: tenant.billingPortalUrl ? 'Manage billing' : '',
    actionUrl,
  }
}

export function buildReadOnlyMessage(actionLabel = 'make changes') {
  return `Payment is required to ${actionLabel}. Complete billing to unlock full portal access.`
}
