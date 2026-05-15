import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveBillingAccess } from './portalBilling.js'

test('canceled billing moves the portal into read-only checkout mode', () => {
  const access = resolveBillingAccess({
    billingStatus: 'canceled',
    billingCheckoutUrl: 'https://checkout.stripe.test/session',
  })

  assert.equal(access.mode, 'read_only')
  assert.equal(access.actionType, 'checkout')
  assert.equal(access.readOnly, true)
  assert.equal(access.ctaLabel, 'Pay now')
})

test('active paid billing remains fully writable for scheduled cancellation periods', () => {
  const access = resolveBillingAccess({
    billingStatus: 'active_paid',
    billingPortalUrl: 'https://billing.stripe.test/session',
  })

  assert.equal(access.mode, 'active')
  assert.equal(access.readOnly, false)
  assert.equal(access.actionType, 'portal')
})

test('comped active billing remains fully writable without Stripe revenue status', () => {
  const access = resolveBillingAccess({
    billingStatus: 'comped_active',
  })

  assert.equal(access.mode, 'active')
  assert.equal(access.readOnly, false)
})
