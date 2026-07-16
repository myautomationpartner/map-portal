function replyMessageText(message) {
  const content = typeof message?.content === 'string' ? message.content.trim() : ''
  return content || '[Customer sent an attachment]'
}

function replyMessageIsOutgoing(message) {
  return message?.message_type === 1 || message?.message_type === 'outgoing'
}

function replyMessageTimestamp(message) {
  const value = message?.created_at ?? message?.createdAt ?? message?.timestamp
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value < 10_000_000_000 ? value * 1000 : value
  }
  if (typeof value === 'string' && value.trim()) {
    const numeric = Number(value)
    if (Number.isFinite(numeric)) return numeric < 10_000_000_000 ? numeric * 1000 : numeric
    const parsed = Date.parse(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return 0
}

export function prepareReplyAssistMessages(messages, limit = 8) {
  const chronological = (Array.isArray(messages) ? messages : [])
    .map((message, sourceIndex) => ({
      message,
      sourceIndex,
      timestamp: replyMessageTimestamp(message),
    }))
    .sort((left, right) => {
      if (left.timestamp && right.timestamp && left.timestamp !== right.timestamp) {
        return left.timestamp - right.timestamp
      }
      if (left.timestamp !== right.timestamp) return left.timestamp ? 1 : -1
      return left.sourceIndex - right.sourceIndex
    })
    .map(({ message }) => message)

  const latestInbound = [...chronological].reverse().find((message) => !replyMessageIsOutgoing(message))
  const recent = chronological.slice(-Math.max(1, limit))
  const contextKey = recent.map((message) => [
    message?.id || '',
    replyMessageTimestamp(message),
    replyMessageIsOutgoing(message) ? 'business' : 'customer',
    replyMessageText(message),
  ].join(':')).join('|')

  return {
    chronological,
    latestInboundMessage: latestInbound ? replyMessageText(latestInbound) : '',
    recentContextLines: recent.map((message) => (
      `${replyMessageIsOutgoing(message) ? 'Business' : 'Customer'}: ${replyMessageText(message)}`
    )),
    contextKey,
  }
}

export { replyMessageIsOutgoing as isOutgoingMessage, replyMessageText as messageContent }
