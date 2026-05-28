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

test('manual trial billing stays writable and exposes checkout conversion', () => {
  const access = resolveBillingAccess({
    billingStatus: 'trial_active',
    billingCustomerId: 'cus_live_manual_trial',
  })

  assert.equal(access.mode, 'trial')
  assert.equal(access.actionType, 'checkout')
  assert.equal(access.readOnly, false)
  assert.equal(access.showBanner, true)
  assert.match(access.title, /Manual trial active/)
  assert.match(access.message, /intentionally holding/)
  assert.equal(access.ctaLabel, 'Start paid subscription')
})

test('manual trial review exposes checkout without making access read-only', () => {
  const access = resolveBillingAccess({
    billingStatus: 'trial_expiring',
  })

  assert.equal(access.mode, 'warning')
  assert.equal(access.actionType, 'checkout')
  assert.equal(access.readOnly, false)
  assert.match(access.title, /Manual trial under review/)
  assert.equal(access.ctaLabel, 'Start paid subscription')
})
