import test from 'node:test'
import assert from 'node:assert/strict'
import {
  PARTNER_TRAINING_STEPS,
  buildPartnerBriefItems,
  resolveTrainingProgress,
  resolveTrainingStepComplete,
} from './partnerTrainingFlow.js'

const form = {
  businessSubtype: 'Dance Studio',
  businessCategory: 'Arts',
  audienceSummary: 'Parents choosing classes for kids and teens',
  serviceArea: 'Endicott, NY and the Southern Tier',
  offerFocusText: 'spring trial classes\nsummer dance camps',
  blockedTopicsText: 'old offers\nsold-out programs',
}

test('tracks guided training progress from profile fields and active sources', () => {
  const progress = resolveTrainingProgress(form, [{ is_active: true }])

  assert.equal(PARTNER_TRAINING_STEPS.length, 5)
  assert.equal(progress.complete, 5)
  assert.equal(progress.total, 5)
  assert.equal(progress.label, '5/5 set')
})

test('marks source step incomplete when no active sources exist', () => {
  const sourceStep = PARTNER_TRAINING_STEPS.find((step) => step.id === 'sources')

  assert.equal(resolveTrainingStepComplete(sourceStep, form, [{ is_active: false }]), false)
})

test('builds concise brief rows from the current Partner profile', () => {
  const brief = buildPartnerBriefItems({
    client: { business_name: 'Dancescapes Performing Arts' },
    form,
    sources: [{ is_active: true }],
  })

  assert.deepEqual(brief.map((item) => item.label), ['Business', 'Audience', 'Area', 'Promote', 'Avoid', 'Sources'])
  assert.equal(brief[0].value, 'Dancescapes Performing Arts, Dance Studio')
  assert.equal(brief[3].value, 'spring trial classes, summer dance camps')
  assert.equal(brief[5].value, '1 active source')
})
