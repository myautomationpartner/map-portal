import { plannerClientAliases, plannerContract } from './socialPlannerPolicy'
import {
  normalizePlannerBusinessType,
  plannerBusinessTypeLabels,
  plannerIndustryTemplates,
} from './plannerIndustryCatalog'

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const PRIORITY_SCORES = { high: 30, medium: 20, conditional: 10, low: 0 }

function normalizeSlug(value) {
  return (value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function getDateParts(value, timeZone) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const parts = Object.fromEntries(formatter.formatToParts(value).map((part) => [part.type, part.value]))
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: parts.weekday.toLowerCase(),
    time: `${parts.hour}:${parts.minute}`,
  }
}

function addDays(date, days) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function hashString(value) {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash) + value.charCodeAt(index)
    hash |= 0
  }
  return Math.abs(hash)
}

function normalizePlannerProfile(profile) {
  const embedded = profile?.clients?.client_planner_profiles
  if (Array.isArray(embedded)) return embedded[0] || null
  return embedded || null
}

function chooseVariation(options, seed, fallback = []) {
  if (!Array.isArray(options) || options.length === 0) return fallback
  return options[seed % options.length] || fallback
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value))
}

function getWeekKey(dateString) {
  const date = new Date(`${dateString}T12:00:00`)
  const day = date.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const monday = addDays(date, diff)
  return monday.toISOString().slice(0, 10)
}

function getOffsetForDate(dateString, timeZone) {
  const sample = new Date(`${dateString}T12:00:00Z`)
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'shortOffset',
    hour: '2-digit',
  })
  const part = formatter
    .formatToParts(sample)
    .find((entry) => entry.type === 'timeZoneName')
    ?.value
    ?.replace('GMT', '')
    || '+00'

  const normalized = /^[-+]\d{2}:\d{2}$/.test(part)
    ? part
    : (() => {
        const match = part.match(/^([+-])(\d{1,2})$/)
        if (!match) return '+00:00'
        const [, sign, hours] = match
        return `${sign}${hours.padStart(2, '0')}:00`
      })()

  return normalized
}

function toScheduledForIso(dateString, timeString, timeZone) {
  const offset = getOffsetForDate(dateString, timeZone)
  const scheduled = new Date(`${dateString}T${timeString}:00${offset}`)
  if (Number.isNaN(scheduled.getTime())) {
    throw new Error(`Invalid scheduled slot time: ${dateString} ${timeString} (${timeZone})`)
  }
  return scheduled.toISOString()
}

function resolvePolicyKey(clientSlug, businessName) {
  const normalizedSlug = normalizeSlug(clientSlug)
  const exact = plannerContract.clients[normalizedSlug]
  if (exact) return normalizedSlug

  const aliased = plannerClientAliases[normalizedSlug]
  if (aliased && plannerContract.clients[aliased]) return aliased

  const byPrefix = Object.keys(plannerContract.clients).find((key) => normalizedSlug.startsWith(key))
  if (byPrefix) return byPrefix

  const normalizedName = normalizeSlug(businessName)
  return Object.keys(plannerContract.clients).find((key) => normalizedName.includes(key)) || null
}

function materializeIndustryPolicy(profile, plannerProfile) {
  const dbClientSlug = profile?.clients?.slug || ''
  const businessType = normalizePlannerBusinessType(
    plannerProfile?.business_type || profile?.clients?.business_type,
  )
  const template = plannerIndustryTemplates[businessType]
  if (!template) return null

  const plannerSeed = Number.isInteger(plannerProfile?.variation_seed)
    ? Math.abs(plannerProfile.variation_seed)
    : hashString(`${dbClientSlug}:${profile?.clients?.business_name || businessType}`)

  const plannerProfileJson =
    plannerProfile?.profile_json && typeof plannerProfile.profile_json === 'object'
      ? plannerProfile.profile_json
      : {}

  const preferredDays = Array.isArray(plannerProfileJson.preferred_days) && plannerProfileJson.preferred_days.length
    ? plannerProfileJson.preferred_days
    : chooseVariation(template.preferredDaySets, plannerSeed, template.cadence.preferred_days || [])

  const preferredTimeWindows = Array.isArray(plannerProfileJson.preferred_time_windows) && plannerProfileJson.preferred_time_windows.length
    ? plannerProfileJson.preferred_time_windows
    : chooseVariation(template.preferredTimeWindowSets, plannerSeed, [])

  return {
    plannerClientKey: plannerProfile?.policy_template_key || `${businessType}_core`,
    dbClientSlug,
    policyVersion: plannerProfile?.policy_version || template.policyVersion,
    timezone: profile?.clients?.timezone || template.timezone || plannerContract.global_defaults.timezone,
    planningHorizonDays: template.planningHorizonDays || plannerContract.global_defaults.planning_horizon_days,
    cadence: {
      ...cloneJson(template.cadence),
      preferred_days: preferredDays,
      preferred_time_windows: cloneJson(preferredTimeWindows),
    },
    contentMixTargets: cloneJson(template.contentMixTargets),
    seasonalModifiers: cloneJson(template.seasonalModifiers || []),
    allowedPostTypes: cloneJson(template.allowedPostTypes),
    businessType,
    industryLabel: plannerBusinessTypeLabels[businessType] || template.label,
    plannerProfile,
  }
}

export function resolvePlannerPolicy(profile) {
  const dbClientSlug = profile?.clients?.slug || ''
  const plannerProfile = normalizePlannerProfile(profile)
  const industryPolicy = materializeIndustryPolicy(profile, plannerProfile)

  if (industryPolicy) {
    return industryPolicy
  }

  const policyKey = resolvePolicyKey(dbClientSlug, profile?.clients?.business_name)

  if (!policyKey) {
    throw new Error(`No planner policy found for client slug "${dbClientSlug || 'unknown'}".`)
  }

  const clientPolicy = plannerContract.clients[policyKey]
  const globalDefaults = plannerContract.global_defaults

  return {
    plannerClientKey: policyKey,
    dbClientSlug,
    policyVersion: clientPolicy.policy_version,
    timezone: clientPolicy.timezone || globalDefaults.timezone,
    planningHorizonDays: clientPolicy.planning_horizon_days || globalDefaults.planning_horizon_days,
    cadence: clientPolicy.cadence,
    contentMixTargets: clientPolicy.content_mix_targets,
    seasonalModifiers: clientPolicy.seasonal_modifiers || [],
    allowedPostTypes: clientPolicy.allowed_post_types,
    businessType: normalizePlannerBusinessType(profile?.clients?.business_type || policyKey),
    industryLabel: plannerBusinessTypeLabels[normalizePlannerBusinessType(profile?.clients?.business_type || policyKey)] || 'Small Business',
    plannerProfile: plannerProfile || null,
  }
}

function getActiveModifiers(policy, slotDate) {
  const month = new Date(`${slotDate}T12:00:00`).getMonth() + 1
  return policy.seasonalModifiers.filter((modifier) => modifier.active_months.includes(month))
}

function getEffectiveCadenceForWeek(policy, weekSlots) {
  const baseTarget = policy.cadence.target_posts_per_week
  const baseMin = policy.cadence.min_posts_per_week
  const baseMax = policy.cadence.max_posts_per_week

  const activeModifiers = weekSlots.flatMap((slot) => getActiveModifiers(policy, slot.slot_date_local))
  if (activeModifiers.length === 0) {
    return {
      target: baseTarget,
      min: baseMin,
      max: baseMax,
      boostedTypes: [],
      modifierSlugs: [],
    }
  }

  const targetCandidates = activeModifiers.map((modifier) => baseTarget + (modifier.cadence_adjustment.target_posts_per_week_delta || 0))
  const minCandidates = activeModifiers
    .map((modifier) => modifier.cadence_adjustment.min_posts_per_week_override)
    .filter(Boolean)
  const maxCandidates = activeModifiers
    .map((modifier) => modifier.cadence_adjustment.max_posts_per_week_override)
    .filter(Boolean)

  return {
    target: Math.min(baseTarget, ...targetCandidates),
    min: minCandidates.length ? Math.min(baseMin, ...minCandidates) : baseMin,
    max: maxCandidates.length ? Math.min(baseMax, ...maxCandidates) : baseMax,
    boostedTypes: [...new Set(activeModifiers.flatMap((modifier) => modifier.post_type_priority_boost || []))],
    modifierSlugs: [...new Set(activeModifiers.map((modifier) => modifier.modifier_slug))],
  }
}

function selectPostType(policy, weekCounts, lastPostType, boostedTypes, recommendationCount, slot) {
  const candidates = Object.entries(policy.allowedPostTypes)
    .filter(([, config]) => config.enabled)
    .filter(([type, config]) => (weekCounts[type] || 0) < config.max_per_week)
    .map(([type, config]) => {
      const currentCount = weekCounts[type] || 0
      const mixTarget = policy.contentMixTargets[type] || 0
      const currentShare = recommendationCount > 0 ? (currentCount / recommendationCount) : 0
      const mixDeficit = mixTarget - currentShare
      const noveltyBonus = currentCount === 0 ? 8 : 0
      const seedJitter = (hashString(`${slot.weekKey}:${slot.slot_label}:${type}`) % 5) - 2
      const score =
        (PRIORITY_SCORES[config.priority] || 0) +
        (boostedTypes.includes(type) ? 8 : 0) +
        (mixTarget * 18) +
        (mixDeficit * 32) +
        noveltyBonus -
        (currentCount * 7) -
        (lastPostType === type ? 10 : 0) +
        seedJitter

      return { type, score }
    })
    .sort((left, right) => right.score - left.score)

  return candidates[0]?.type || null
}

function windowContainsTime(windowConfig, timeString) {
  return timeString >= windowConfig.start_local && timeString <= windowConfig.end_local
}

function buildOccupiedSlotMap(policy, scheduledPosts, drafts) {
  const occupied = new Map()

  for (const draft of drafts) {
    const key = `${draft.slot_date_local}::${draft.slot_label}`
    occupied.set(key, {
      state: 'occupied_draft',
      reason: `occupied by existing draft (${draft.review_state.replace(/_/g, ' ')})`,
      postType: draft.post_type,
      source: draft,
    })
  }

  for (const post of scheduledPosts) {
    if (!post.scheduled_for) continue
    const parts = getDateParts(new Date(post.scheduled_for), policy.timezone)
    const matchedWindow = policy.cadence.preferred_time_windows.find((windowConfig) =>
      windowContainsTime(windowConfig, parts.time),
    )

    if (!matchedWindow) continue

    const key = `${parts.date}::${matchedWindow.label}`
    if (!occupied.has(key)) {
      occupied.set(key, {
        state: 'occupied_planned',
        reason: 'occupied by planned content',
        source: post,
      })
    }
  }

  return occupied
}

export function buildCalendarModel(profile, scheduledPosts, drafts) {
  const policy = resolvePlannerPolicy(profile)
  const today = new Date()
  const slots = []
  const occupied = buildOccupiedSlotMap(policy, scheduledPosts, drafts)
  const weekCounts = {}
  let lastSelectedType = null

  for (let dayOffset = 0; dayOffset < policy.planningHorizonDays; dayOffset += 1) {
    const date = addDays(today, dayOffset)
    const parts = getDateParts(date, policy.timezone)

    if (!policy.cadence.preferred_days.includes(parts.weekday)) continue

    for (const windowConfig of policy.cadence.preferred_time_windows) {
      const weekKey = getWeekKey(parts.date)
      if (!weekCounts[weekKey]) {
        weekCounts[weekKey] = { total: 0, types: {}, recommendations: [] }
      }

      const slot = {
        slot_date_local: parts.date,
        slot_weekday: parts.weekday,
        slot_label: windowConfig.label,
        slot_start_local: windowConfig.start_local,
        slot_end_local: windowConfig.end_local,
        timezone: policy.timezone,
        weekKey,
      }
      const slotKey = `${slot.slot_date_local}::${slot.slot_label}`
      const existing = occupied.get(slotKey)

      if (existing) {
        if (existing.postType) {
          weekCounts[weekKey].types[existing.postType] = (weekCounts[weekKey].types[existing.postType] || 0) + 1
        }
        weekCounts[weekKey].total += 1
        slots.push({ ...slot, state: existing.state, explanation: existing.reason, post_type: existing.postType || null })
        continue
      }

      const weekSlots = slots.filter((entry) => entry.weekKey === weekKey).concat(slot)
      const effectiveCadence = getEffectiveCadenceForWeek(policy, weekSlots)
      const weekState = weekCounts[weekKey]

      if (weekState.total >= effectiveCadence.max) {
        slots.push({ ...slot, state: 'unavailable_constraint_blocked', explanation: 'excluded by weekly capacity already reached', post_type: null })
        continue
      }

      const postType = selectPostType(
        policy,
        weekState.types,
        lastSelectedType,
        effectiveCadence.boostedTypes,
        weekState.recommendations.length,
        slot,
      )

      weekState.total += 1
      if (postType) {
        weekState.types[postType] = (weekState.types[postType] || 0) + 1
        weekState.recommendations.push(postType)
        lastSelectedType = postType
      }

      slots.push({
        ...slot,
        state: 'recommended_fill',
        explanation: 'recommended due to preferred day and available weekly capacity',
        post_type: postType,
        seasonal_modifier_slugs: effectiveCadence.modifierSlugs,
      })
    }
  }

  return {
    policy,
    slots,
    summary: {
      recommendedCount: slots.filter((slot) => slot.state === 'recommended_fill').length,
      occupiedDraftCount: slots.filter((slot) => slot.state === 'occupied_draft').length,
      occupiedPlannedCount: slots.filter((slot) => slot.state === 'occupied_planned').length,
    },
  }
}

export function buildDraftPayload(profile, policy, slot) {
  return {
    client_id: profile.client_id,
    planner_client_slug: policy.plannerClientKey,
    planner_policy_version: policy.policyVersion,
    source_workflow: 'portal_calendar',
    slot_date_local: slot.slot_date_local,
    slot_label: slot.slot_label,
    slot_start_local: slot.slot_start_local,
    slot_end_local: slot.slot_end_local,
    timezone: slot.timezone,
    scheduled_for: toScheduledForIso(slot.slot_date_local, slot.slot_start_local, slot.timezone),
    post_type: slot.post_type,
    draft_title: `${slot.post_type?.replace(/_/g, ' ') || 'draft'} for ${slot.slot_weekday}`,
    review_state: 'recommended',
    asset_requirements_json: [],
    seasonal_modifier_context_json: slot.seasonal_modifier_slugs || [],
  }
}
