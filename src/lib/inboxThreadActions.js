export function canHideInboxThread(thread) {
  return Boolean(
    thread?.conversation?.id &&
    thread.kind !== 'comments',
  )
}
