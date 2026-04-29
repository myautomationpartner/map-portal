export const plannerContract = {
  schema_version: '1.0.0',
  policy_type: 'social_planner',
  global_defaults: {
    timezone: 'America/New_York',
    planning_horizon_days: 14,
    min_gap_days_between_posts: 1,
    max_posts_per_day: 1,
    supported_post_types: [
      'promotional_offer',
      'signature_highlight',
      'class_spotlight',
      'community_story',
      'testimonial_social_proof',
      'event_or_performance',
      'seasonal_campaign',
      'student_spotlight',
      'teacher_tip',
      'expert_tip',
      'behind_the_scenes',
      'milestone_moment',
    ],
  },
  clients: {
    dancescapes: {
      client_slug: 'dancescapes',
      policy_version: '1.0.0',
      cadence: {
        target_posts_per_week: 3,
        min_posts_per_week: 2,
        max_posts_per_week: 4,
        preferred_days: ['monday', 'wednesday', 'friday'],
        preferred_time_windows: [
          { label: 'mid_morning', start_local: '09:00', end_local: '11:30' },
          { label: 'early_evening', start_local: '16:30', end_local: '19:00' },
        ],
        spacing_rules: {
          min_gap_days_between_posts: 1,
          max_posts_per_day: 1,
          max_same_post_type_per_week: 2,
        },
      },
      allowed_post_types: {
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
      content_mix_targets: {
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
      seasonal_modifiers: [
        {
          modifier_slug: 'back_to_school_registration',
          active_months: [8, 9],
          cadence_adjustment: { target_posts_per_week_delta: 1, max_posts_per_week_override: 4 },
          post_type_priority_boost: ['promotional_offer', 'class_spotlight', 'seasonal_campaign'],
        },
        {
          modifier_slug: 'recital_or_showcase_window',
          active_months: [5, 6, 12],
          cadence_adjustment: { target_posts_per_week_delta: 1, max_posts_per_week_override: 4 },
          post_type_priority_boost: ['event_or_performance', 'community_story', 'testimonial_social_proof', 'student_spotlight', 'milestone_moment'],
        },
        {
          modifier_slug: 'holiday_break_light_schedule',
          active_months: [11, 12],
          cadence_adjustment: { target_posts_per_week_delta: -1, min_posts_per_week_override: 1 },
          post_type_priority_boost: ['community_story', 'seasonal_campaign', 'behind_the_scenes'],
        },
      ],
    },
  },
}

export const plannerClientAliases = {
  'dancescapes-performing-arts': 'dancescapes',
}
