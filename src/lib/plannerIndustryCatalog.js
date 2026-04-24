const DEFAULT_TIME_WINDOWS = [
  { label: 'mid_morning', start_local: '09:00', end_local: '11:30' },
  { label: 'early_evening', start_local: '16:30', end_local: '19:00' },
]

const ALTERNATE_TIME_WINDOWS = [
  { label: 'late_morning', start_local: '10:00', end_local: '12:30' },
  { label: 'after_work', start_local: '17:00', end_local: '19:30' },
]

const WEEKEND_FRIENDLY_WINDOWS = [
  { label: 'late_morning', start_local: '10:30', end_local: '12:30' },
  { label: 'mid_afternoon', start_local: '14:00', end_local: '16:30' },
]

const SHARED_ALLOWED_POST_TYPES = {
  promotional_offer: { enabled: true, priority: 'high', min_per_month: 2, max_per_week: 2 },
  signature_highlight: { enabled: true, priority: 'high', min_per_month: 2, max_per_week: 2 },
  community_story: { enabled: true, priority: 'medium', min_per_month: 2, max_per_week: 1 },
  testimonial_social_proof: { enabled: true, priority: 'medium', min_per_month: 1, max_per_week: 1 },
  expert_tip: { enabled: true, priority: 'medium', min_per_month: 2, max_per_week: 1 },
  behind_the_scenes: { enabled: true, priority: 'medium', min_per_month: 1, max_per_week: 1 },
  seasonal_campaign: { enabled: true, priority: 'conditional', min_per_month: 0, max_per_week: 2 },
  milestone_moment: { enabled: true, priority: 'medium', min_per_month: 1, max_per_week: 1 },
}

const SHARED_CONTENT_MIX = {
  promotional_offer: 0.18,
  signature_highlight: 0.18,
  community_story: 0.14,
  testimonial_social_proof: 0.12,
  expert_tip: 0.12,
  behind_the_scenes: 0.1,
  seasonal_campaign: 0.1,
  milestone_moment: 0.06,
}

function buildSharedTemplate({
  label,
  cadence,
  preferredDaySets,
  preferredTimeWindowSets,
  seasonalModifiers,
  contentPillars,
  voiceTraits,
}) {
  return {
    label,
    policyVersion: '2026-04-24',
    timezone: 'America/New_York',
    planningHorizonDays: 14,
    cadence,
    preferredDaySets,
    preferredTimeWindowSets,
    allowedPostTypes: SHARED_ALLOWED_POST_TYPES,
    contentMixTargets: SHARED_CONTENT_MIX,
    seasonalModifiers,
    contentPillars,
    voiceTraits,
  }
}

export const plannerBusinessTypeOptions = [
  { value: 'dance_studio', label: 'Dance Studio' },
  { value: 'gym_fitness', label: 'Gym / Fitness' },
  { value: 'salon_spa', label: 'Salon / Spa' },
  { value: 'restaurant_cafe', label: 'Restaurant / Cafe' },
  { value: 'professional_services', label: 'Professional Services' },
  { value: 'home_services', label: 'Home Services' },
  { value: 'real_estate', label: 'Real Estate' },
  { value: 'medical_wellness', label: 'Medical / Wellness' },
  { value: 'other_small_business', label: 'Other Small Business' },
]

export const plannerBusinessTypeLabels = Object.fromEntries(
  plannerBusinessTypeOptions.map((option) => [option.value, option.label]),
)

export const plannerIndustryTemplates = {
  dance_studio: {
    label: 'Dance Studio',
    policyVersion: '2026-04-24',
    timezone: 'America/New_York',
    planningHorizonDays: 14,
    cadence: {
      target_posts_per_week: 3,
      min_posts_per_week: 2,
      max_posts_per_week: 4,
      spacing_rules: {
        min_gap_days_between_posts: 1,
        max_posts_per_day: 1,
        max_same_post_type_per_week: 2,
      },
    },
    preferredDaySets: [
      ['monday', 'wednesday', 'friday'],
      ['tuesday', 'thursday', 'saturday'],
      ['monday', 'thursday', 'saturday'],
    ],
    preferredTimeWindowSets: [
      DEFAULT_TIME_WINDOWS,
      ALTERNATE_TIME_WINDOWS,
      WEEKEND_FRIENDLY_WINDOWS,
    ],
    allowedPostTypes: {
      promotional_offer: { enabled: true, priority: 'high', min_per_month: 2, max_per_week: 2 },
      class_spotlight: { enabled: true, priority: 'high', min_per_month: 2, max_per_week: 2 },
      community_story: { enabled: true, priority: 'medium', min_per_month: 2, max_per_week: 1 },
      testimonial_social_proof: { enabled: true, priority: 'medium', min_per_month: 1, max_per_week: 1 },
      event_or_performance: { enabled: true, priority: 'high', min_per_month: 1, max_per_week: 2 },
      seasonal_campaign: { enabled: true, priority: 'conditional', min_per_month: 0, max_per_week: 2 },
      student_spotlight: { enabled: true, priority: 'medium', min_per_month: 2, max_per_week: 1 },
      teacher_tip: { enabled: true, priority: 'medium', min_per_month: 1, max_per_week: 1 },
      behind_the_scenes: { enabled: true, priority: 'medium', min_per_month: 1, max_per_week: 1 },
      milestone_moment: { enabled: true, priority: 'medium', min_per_month: 1, max_per_week: 1 },
    },
    contentMixTargets: {
      promotional_offer: 0.15,
      class_spotlight: 0.15,
      community_story: 0.12,
      testimonial_social_proof: 0.1,
      event_or_performance: 0.1,
      seasonal_campaign: 0.08,
      student_spotlight: 0.1,
      teacher_tip: 0.08,
      behind_the_scenes: 0.07,
      milestone_moment: 0.05,
    },
    seasonalModifiers: [
      {
        modifier_slug: 'registration_push',
        active_months: [1, 8, 9],
        cadence_adjustment: { target_posts_per_week_delta: 1, max_posts_per_week_override: 4 },
        post_type_priority_boost: ['promotional_offer', 'class_spotlight', 'seasonal_campaign'],
      },
      {
        modifier_slug: 'recital_showcase_window',
        active_months: [5, 6, 12],
        cadence_adjustment: { target_posts_per_week_delta: 1, max_posts_per_week_override: 4 },
        post_type_priority_boost: ['event_or_performance', 'student_spotlight', 'community_story'],
      },
    ],
    contentPillars: ['classes', 'student growth', 'community', 'performances'],
    voiceTraits: ['encouraging', 'community-centered', 'uplifting'],
  },
  gym_fitness: buildSharedTemplate({
    label: 'Gym / Fitness',
    cadence: {
      target_posts_per_week: 4,
      min_posts_per_week: 3,
      max_posts_per_week: 5,
      spacing_rules: {
        min_gap_days_between_posts: 1,
        max_posts_per_day: 1,
        max_same_post_type_per_week: 2,
      },
    },
    preferredDaySets: [
      ['monday', 'wednesday', 'friday', 'saturday'],
      ['tuesday', 'thursday', 'friday', 'sunday'],
      ['monday', 'tuesday', 'thursday', 'saturday'],
    ],
    preferredTimeWindowSets: [DEFAULT_TIME_WINDOWS, ALTERNATE_TIME_WINDOWS, WEEKEND_FRIENDLY_WINDOWS],
    seasonalModifiers: [
      {
        modifier_slug: 'summer_body_goal_push',
        active_months: [4, 5, 6],
        cadence_adjustment: { target_posts_per_week_delta: 1, max_posts_per_week_override: 5 },
        post_type_priority_boost: ['promotional_offer', 'testimonial_social_proof', 'expert_tip'],
      },
    ],
    contentPillars: ['coaching', 'member wins', 'routines', 'offers'],
    voiceTraits: ['motivating', 'supportive', 'confident'],
  }),
  salon_spa: buildSharedTemplate({
    label: 'Salon / Spa',
    cadence: {
      target_posts_per_week: 3,
      min_posts_per_week: 2,
      max_posts_per_week: 4,
      spacing_rules: {
        min_gap_days_between_posts: 1,
        max_posts_per_day: 1,
        max_same_post_type_per_week: 2,
      },
    },
    preferredDaySets: [
      ['tuesday', 'thursday', 'friday'],
      ['wednesday', 'friday', 'saturday'],
      ['monday', 'thursday', 'saturday'],
    ],
    preferredTimeWindowSets: [DEFAULT_TIME_WINDOWS, ALTERNATE_TIME_WINDOWS],
    seasonalModifiers: [
      {
        modifier_slug: 'holiday_glam_push',
        active_months: [11, 12],
        cadence_adjustment: { target_posts_per_week_delta: 1, max_posts_per_week_override: 4 },
        post_type_priority_boost: ['promotional_offer', 'signature_highlight', 'seasonal_campaign'],
      },
    ],
    contentPillars: ['services', 'transformations', 'tips', 'seasonal promos'],
    voiceTraits: ['warm', 'polished', 'confidence-building'],
  }),
  restaurant_cafe: buildSharedTemplate({
    label: 'Restaurant / Cafe',
    cadence: {
      target_posts_per_week: 4,
      min_posts_per_week: 3,
      max_posts_per_week: 5,
      spacing_rules: {
        min_gap_days_between_posts: 1,
        max_posts_per_day: 1,
        max_same_post_type_per_week: 2,
      },
    },
    preferredDaySets: [
      ['tuesday', 'thursday', 'friday', 'saturday'],
      ['wednesday', 'friday', 'saturday', 'sunday'],
      ['monday', 'wednesday', 'friday', 'sunday'],
    ],
    preferredTimeWindowSets: [DEFAULT_TIME_WINDOWS, WEEKEND_FRIENDLY_WINDOWS],
    seasonalModifiers: [
      {
        modifier_slug: 'holiday_dining_push',
        active_months: [11, 12],
        cadence_adjustment: { target_posts_per_week_delta: 1, max_posts_per_week_override: 5 },
        post_type_priority_boost: ['promotional_offer', 'signature_highlight', 'seasonal_campaign'],
      },
    ],
    contentPillars: ['menu highlights', 'staff moments', 'events', 'local buzz'],
    voiceTraits: ['inviting', 'local', 'appetite-building'],
  }),
  professional_services: buildSharedTemplate({
    label: 'Professional Services',
    cadence: {
      target_posts_per_week: 3,
      min_posts_per_week: 2,
      max_posts_per_week: 4,
      spacing_rules: {
        min_gap_days_between_posts: 1,
        max_posts_per_day: 1,
        max_same_post_type_per_week: 2,
      },
    },
    preferredDaySets: [
      ['tuesday', 'thursday', 'friday'],
      ['monday', 'wednesday', 'friday'],
      ['tuesday', 'wednesday', 'thursday'],
    ],
    preferredTimeWindowSets: [DEFAULT_TIME_WINDOWS, ALTERNATE_TIME_WINDOWS],
    seasonalModifiers: [
      {
        modifier_slug: 'quarter_close_push',
        active_months: [3, 6, 9, 12],
        cadence_adjustment: { target_posts_per_week_delta: 1, max_posts_per_week_override: 4 },
        post_type_priority_boost: ['promotional_offer', 'testimonial_social_proof', 'expert_tip'],
      },
    ],
    contentPillars: ['expertise', 'results', 'process', 'offers'],
    voiceTraits: ['professional', 'approachable', 'results-focused'],
  }),
  home_services: buildSharedTemplate({
    label: 'Home Services',
    cadence: {
      target_posts_per_week: 3,
      min_posts_per_week: 2,
      max_posts_per_week: 4,
      spacing_rules: {
        min_gap_days_between_posts: 1,
        max_posts_per_day: 1,
        max_same_post_type_per_week: 2,
      },
    },
    preferredDaySets: [
      ['monday', 'wednesday', 'friday'],
      ['tuesday', 'thursday', 'saturday'],
      ['monday', 'thursday', 'saturday'],
    ],
    preferredTimeWindowSets: [DEFAULT_TIME_WINDOWS, ALTERNATE_TIME_WINDOWS],
    seasonalModifiers: [
      {
        modifier_slug: 'weather_service_window',
        active_months: [5, 6, 7, 8, 11, 12],
        cadence_adjustment: { target_posts_per_week_delta: 1, max_posts_per_week_override: 4 },
        post_type_priority_boost: ['promotional_offer', 'expert_tip', 'signature_highlight'],
      },
    ],
    contentPillars: ['before and after', 'tips', 'trust', 'seasonal reminders'],
    voiceTraits: ['helpful', 'reliable', 'practical'],
  }),
  real_estate: buildSharedTemplate({
    label: 'Real Estate',
    cadence: {
      target_posts_per_week: 4,
      min_posts_per_week: 3,
      max_posts_per_week: 5,
      spacing_rules: {
        min_gap_days_between_posts: 1,
        max_posts_per_day: 1,
        max_same_post_type_per_week: 2,
      },
    },
    preferredDaySets: [
      ['monday', 'wednesday', 'thursday', 'saturday'],
      ['tuesday', 'thursday', 'friday', 'sunday'],
      ['monday', 'tuesday', 'friday', 'saturday'],
    ],
    preferredTimeWindowSets: [DEFAULT_TIME_WINDOWS, ALTERNATE_TIME_WINDOWS, WEEKEND_FRIENDLY_WINDOWS],
    seasonalModifiers: [
      {
        modifier_slug: 'spring_listing_season',
        active_months: [3, 4, 5, 6],
        cadence_adjustment: { target_posts_per_week_delta: 1, max_posts_per_week_override: 5 },
        post_type_priority_boost: ['signature_highlight', 'testimonial_social_proof', 'promotional_offer'],
      },
    ],
    contentPillars: ['listings', 'market insight', 'client wins', 'local spotlight'],
    voiceTraits: ['trusted', 'clear', 'locally informed'],
  }),
  medical_wellness: buildSharedTemplate({
    label: 'Medical / Wellness',
    cadence: {
      target_posts_per_week: 3,
      min_posts_per_week: 2,
      max_posts_per_week: 4,
      spacing_rules: {
        min_gap_days_between_posts: 1,
        max_posts_per_day: 1,
        max_same_post_type_per_week: 2,
      },
    },
    preferredDaySets: [
      ['monday', 'wednesday', 'friday'],
      ['tuesday', 'thursday', 'friday'],
      ['monday', 'thursday', 'saturday'],
    ],
    preferredTimeWindowSets: [DEFAULT_TIME_WINDOWS, ALTERNATE_TIME_WINDOWS],
    seasonalModifiers: [
      {
        modifier_slug: 'new_year_wellness_push',
        active_months: [1, 2],
        cadence_adjustment: { target_posts_per_week_delta: 1, max_posts_per_week_override: 4 },
        post_type_priority_boost: ['expert_tip', 'promotional_offer', 'seasonal_campaign'],
      },
    ],
    contentPillars: ['education', 'care experience', 'team trust', 'seasonal wellness'],
    voiceTraits: ['calm', 'credible', 'supportive'],
  }),
  other_small_business: buildSharedTemplate({
    label: 'Other Small Business',
    cadence: {
      target_posts_per_week: 3,
      min_posts_per_week: 2,
      max_posts_per_week: 4,
      spacing_rules: {
        min_gap_days_between_posts: 1,
        max_posts_per_day: 1,
        max_same_post_type_per_week: 2,
      },
    },
    preferredDaySets: [
      ['monday', 'wednesday', 'friday'],
      ['tuesday', 'thursday', 'saturday'],
      ['monday', 'thursday', 'saturday'],
    ],
    preferredTimeWindowSets: [DEFAULT_TIME_WINDOWS, ALTERNATE_TIME_WINDOWS],
    seasonalModifiers: [],
    contentPillars: ['offers', 'community', 'expertise', 'milestones'],
    voiceTraits: ['helpful', 'approachable', 'clear'],
  }),
}

export const plannerSupportedPostTypes = [
  'promotional_offer',
  'signature_highlight',
  'community_story',
  'testimonial_social_proof',
  'expert_tip',
  'behind_the_scenes',
  'seasonal_campaign',
  'milestone_moment',
  'class_spotlight',
  'student_spotlight',
  'teacher_tip',
  'event_or_performance',
]

export function normalizePlannerBusinessType(value) {
  const normalized = String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  return plannerBusinessTypeLabels[normalized] ? normalized : 'other_small_business'
}
