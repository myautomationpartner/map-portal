export const PARTNER_TRAINING_STEPS = [
  { id: 'audience', label: 'Audience', field: 'audienceSummary', required: true },
  { id: 'area', label: 'Area', field: 'serviceArea' },
  { id: 'promote', label: 'Promote', field: 'offerFocusText', required: true, mode: 'multi' },
  { id: 'avoid', label: 'Avoid', field: 'blockedTopicsText', mode: 'multi' },
  { id: 'sources', label: 'Sources', type: 'sources' },
]

function cleanText(value) {
  return String(value || '').trim()
}

function previewList(value) {
  return cleanText(value)
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function humanizeValue(value) {
  return cleanText(value)
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase())
}

export function resolveTrainingStepComplete(step, form = {}, sources = []) {
  if (!step) return false

  if (step.type === 'sources') {
    return sources.some((source) => source?.is_active)
  }

  if (step.mode === 'multi') {
    return previewList(form[step.field]).length > 0
  }

  return Boolean(cleanText(form[step.field]))
}

export function resolveTrainingProgress(form = {}, sources = []) {
  const complete = PARTNER_TRAINING_STEPS.filter((step) => resolveTrainingStepComplete(step, form, sources)).length
  const total = PARTNER_TRAINING_STEPS.length

  return {
    complete,
    total,
    label: `${complete}/${total} set`,
  }
}

export function buildPartnerBriefItems({ client = {}, form = {}, sources = [] } = {}) {
  const activeSourceCount = sources.filter((source) => source?.is_active).length
  const businessType = humanizeValue(form.businessSubtype || form.businessCategory)
  const offers = previewList(form.offerFocusText)
  const blocked = previewList(form.blockedTopicsText)

  return [
    {
      label: 'Business',
      value: [client.business_name || 'Your business', businessType].filter(Boolean).join(', ') || 'Your business',
    },
    {
      label: 'Audience',
      value: cleanText(form.audienceSummary) || 'Choose an audience',
    },
    {
      label: 'Area',
      value: cleanText(form.serviceArea) || 'Choose a service area',
    },
    {
      label: 'Promote',
      value: offers.length ? offers.join(', ') : 'Choose what to promote',
    },
    {
      label: 'Avoid',
      value: blocked.length ? blocked.join(', ') : 'No guardrails selected',
    },
    {
      label: 'Sources',
      value: activeSourceCount === 1 ? '1 active source' : `${activeSourceCount} active sources`,
    },
  ]
}
