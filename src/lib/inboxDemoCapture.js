const DEMO_NOW_SECONDS = 1_779_970_200

export function isInboxDemoCaptureEnabled(search) {
  const params = new URLSearchParams(String(search || '').replace(/^\?/, ''))
  const captureMode = params.get('capture')
  const demoInbox = params.get('demoInbox')
  return captureMode === 'launch-assets' && ['1', 'true', 'messages'].includes(String(demoInbox || '').toLowerCase())
}

export function buildInboxDemoCaptureState(nowSeconds = DEMO_NOW_SECONDS) {
  const inboxes = [
    { id: 9101, name: 'Website Chat', channel_type: 'Channel::WebWidget' },
    { id: 9102, name: 'Instagram DMs', channel_type: 'Channel::Api' },
  ]

  const messagesByConversationId = {
    8801: [
      {
        id: 'demo-msg-1',
        content: 'Hi. Can you help us promote the June 1 open house? We have photos from last week and want something ready for Instagram.',
        created_at: nowSeconds - 42 * 60,
        message_type: 'incoming',
        sender: { name: 'Sarah Lee' },
      },
      {
        id: 'demo-msg-2',
        content: 'Absolutely. I can turn the photos into a short open-house post, then place it into your campaign plan for review.',
        created_at: nowSeconds - 38 * 60,
        message_type: 'outgoing',
        sender: { name: 'My Automation Partner' },
      },
      {
        id: 'demo-msg-3',
        content: 'Private note: use the lobby photo, keep the caption parent-friendly, and schedule before Thursday morning.',
        created_at: nowSeconds - 32 * 60,
        message_type: 'outgoing',
        private: true,
        sender: { name: 'MAP Partner' },
      },
      {
        id: 'demo-msg-4',
        content: 'That sounds great. Please make it clear that new families can stop in without registering first.',
        created_at: nowSeconds - 18 * 60,
        message_type: 'incoming',
        sender: { name: 'Sarah Lee' },
      },
    ],
    8802: [
      {
        id: 'demo-msg-5',
        content: 'Do you have Saturday class availability for a 6 year old beginner?',
        created_at: nowSeconds - 2 * 60 * 60,
        message_type: 'incoming',
        sender: { name: 'New Parent' },
      },
      {
        id: 'demo-msg-6',
        content: 'Yes. I can send the class link and also flag this as a follow-up for next week.',
        created_at: nowSeconds - 90 * 60,
        message_type: 'outgoing',
        sender: { name: 'My Automation Partner' },
      },
    ],
  }

  const conversations = [
    {
      id: 8801,
      inbox_id: 9101,
      status: 'open',
      unread_count: 1,
      updated_at: nowSeconds - 18 * 60,
      last_activity_at: nowSeconds - 18 * 60,
      channel: 'Website Chat',
      meta: {
        sender: {
          name: 'Sarah Lee',
          email: 'sarah@example.com',
        },
      },
      messages: messagesByConversationId[8801],
    },
    {
      id: 8802,
      inbox_id: 9102,
      status: 'pending',
      unread_count: 0,
      updated_at: nowSeconds - 90 * 60,
      last_activity_at: nowSeconds - 90 * 60,
      channel: 'Instagram DMs',
      meta: {
        sender: {
          name: 'New Parent',
          identifier: '@newparent',
        },
      },
      messages: messagesByConversationId[8802],
    },
  ]

  return {
    inboxes,
    conversations,
    messagesByConversationId,
    selectedConversationId: 8801,
    replySuggestions: [
      {
        label: 'Friendly and direct',
        caption: 'Absolutely — new families are welcome to stop in without registering first. I can also send the open-house details and class options if that would help.',
        why: 'Answers the question clearly and offers the next useful step.',
      },
      {
        label: 'Short option',
        caption: 'Yes — new families can stop in without registering first. We would love to see you at the open house!',
        why: 'Keeps the response fast and welcoming.',
      },
    ],
    websiteChat: {
      settings: {
        chatwoot_account_id: 91,
        chatwoot_website_token: 'demo-widget-token',
        install_status: 'detected',
      },
      installSnippet: '<script>/* MAP demo website chat widget */</script>',
    },
    user: {
      email: 'owner@myautomationpartner.com',
    },
  }
}
