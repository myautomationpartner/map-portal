import test from 'node:test'
import assert from 'node:assert/strict'
import { buildTenantConfig } from './tenantConfig.js'

test('live client billing status overrides stale deployed billing status', () => {
  const tenant = buildTenantConfig({
    client: {
      slug: 'dancescapes-performing-arts',
      portal_path: '/clients/dancescapes-performing-arts',
      billing_status: 'trial_active',
      billing_checkout_url: 'https://checkout.stripe.test/live',
      billing_portal_url: 'https://billing.stripe.test/live',
    },
    env: {
      VITE_PORTAL_BILLING_STATUS: 'payment_method_needed',
      VITE_PORTAL_BILLING_CHECKOUT_URL: 'https://checkout.stripe.test/stale',
      VITE_PORTAL_BILLING_PORTAL_URL: 'https://billing.stripe.test/stale',
    },
  })

  assert.equal(tenant.billingStatus, 'trial_active')
  assert.equal(tenant.billingCheckoutUrl, 'https://checkout.stripe.test/live')
  assert.equal(tenant.billingPortalUrl, 'https://billing.stripe.test/live')
})

test('deployed billing status remains a fallback when live client data is unavailable', () => {
  const tenant = buildTenantConfig({
    env: {
      VITE_PORTAL_BILLING_STATUS: 'payment_method_needed',
      VITE_PORTAL_BILLING_CHECKOUT_URL: 'https://checkout.stripe.test/fallback',
    },
  })

  assert.equal(tenant.billingStatus, 'payment_method_needed')
  assert.equal(tenant.billingCheckoutUrl, 'https://checkout.stripe.test/fallback')
})

test('portal chrome always uses the MAP logo instead of customer logos', () => {
  const tenant = buildTenantConfig({
    client: {
      slug: 'dancescapes-performing-arts-llc',
      business_name: 'Dancescapes Performing Arts, LLC',
      logo_url: 'https://www.dancescapes.com/assets/images/logo.jpg',
    },
    sharePayload: {
      portal_path: '/portal/dancescapes-performing-arts-llc',
      logo_url: 'https://example.com/customer-share-logo.png',
    },
    env: {
      VITE_PORTAL_LOGO_URL: 'https://example.com/deployed-customer-logo.png',
    },
  })

  assert.equal(tenant.logoUrl, '/assets/map-option-b-mark.png')
  assert.equal(tenant.fallbackLogoUrl, '/assets/map-option-b-mark.png')
})
