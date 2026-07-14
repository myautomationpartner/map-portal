const VALID_FILTERS = new Set(['open', 'all', 'comments', 'dms', 'partner'])

export function commentThreadIdFromPostKey(postKey) {
  const [accountId, postId] = String(postKey || '').split(':')
  if (!accountId || !postId) return ''
  return `comments:${postId}:${accountId}`
}

export function mobileInboxRouteState(search = '') {
  const params = new URLSearchParams(search || '')
  const section = params.get('section')
  const conversationId = params.get('conversation')
  const postKey = params.get('post')
  const wantsPartner = params.get('partner') === '1'

  if (section === 'comments') {
    const selectedThreadId = commentThreadIdFromPostKey(postKey)
    return {
      activeFilter: 'comments',
      selectedThreadId,
      mobileThreadOpen: Boolean(selectedThreadId),
    }
  }

  if (section === 'messages' && wantsPartner) {
    return {
      activeFilter: 'partner',
      selectedThreadId: '',
      mobileThreadOpen: false,
    }
  }

  if (section === 'messages' || conversationId) {
    const selectedThreadId = conversationId ? `dm:${conversationId}` : ''
    return {
      activeFilter: 'dms',
      selectedThreadId,
      mobileThreadOpen: Boolean(selectedThreadId),
    }
  }

  const requestedFilter = params.get('filter')
  return {
    activeFilter: VALID_FILTERS.has(requestedFilter) ? requestedFilter : 'open',
    selectedThreadId: '',
    mobileThreadOpen: false,
  }
}
