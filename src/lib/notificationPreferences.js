export const DEFAULT_NOTIFICATION_PREFERENCES = Object.freeze({
  messageAlerts: true,
  commentAlerts: true,
  postReadyReminders: true,
  publishFailureAlerts: true,
  boostAlerts: true,
  contentOpportunityAlerts: true,
  reminderTimes: ['09:00', '15:00'],
  quietHours: { enabled: true, start: '20:00', end: '08:00' },
  privacyLevel: 'sender_platform',
  timezone: 'America/New_York',
})

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/
const PRIVACY_LEVELS = new Set(['private', 'sender_platform', 'full_preview'])

function validTime(value, fallback) {
  const normalized = String(value || '').trim()
  return TIME_PATTERN.test(normalized) ? normalized : fallback
}

export function normalizeNotificationPreferences(value = {}, fallbackTimezone = '') {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const quietInput = input.quietHours && typeof input.quietHours === 'object' && !Array.isArray(input.quietHours)
    ? input.quietHours
    : {}
  const reminderTimes = Array.isArray(input.reminderTimes)
    ? [...new Set(input.reminderTimes.map((item) => validTime(item, '')).filter(Boolean))].slice(0, 4)
    : DEFAULT_NOTIFICATION_PREFERENCES.reminderTimes

  return {
    messageAlerts: input.messageAlerts !== false,
    commentAlerts: input.commentAlerts !== false,
    postReadyReminders: input.postReadyReminders !== false,
    publishFailureAlerts: input.publishFailureAlerts !== false,
    boostAlerts: input.boostAlerts !== false,
    contentOpportunityAlerts: input.contentOpportunityAlerts !== false,
    reminderTimes: reminderTimes.length ? reminderTimes : DEFAULT_NOTIFICATION_PREFERENCES.reminderTimes,
    quietHours: {
      enabled: quietInput.enabled !== false,
      start: validTime(quietInput.start, DEFAULT_NOTIFICATION_PREFERENCES.quietHours.start),
      end: validTime(quietInput.end, DEFAULT_NOTIFICATION_PREFERENCES.quietHours.end),
    },
    privacyLevel: PRIVACY_LEVELS.has(input.privacyLevel)
      ? input.privacyLevel
      : DEFAULT_NOTIFICATION_PREFERENCES.privacyLevel,
    timezone: String(input.timezone || fallbackTimezone || DEFAULT_NOTIFICATION_PREFERENCES.timezone).trim()
      || DEFAULT_NOTIFICATION_PREFERENCES.timezone,
  }
}
