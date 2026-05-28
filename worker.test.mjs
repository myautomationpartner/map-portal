import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  buildDashboardSocialPlatformSummary,
  buildZernioOutboundReplyRequest,
  buildZernioScopedSearchParams,
  buildVapidJwt,
  buildContentPartnerCommandReply,
  buildRemoteCalendarPostDeletePayload,
  classifyContentPartnerCommand,
  canDeleteCalendarPost,
  selectContentPartnerReviewDraft,
  getUserPermissions,
  isVisibleContentDraft,
  normalizeZernioPostAnalytics,
  normalizeZernioAdAccounts,
  normalizeBoostAdAccountId,
  normalizeBoostTargeting,
  normalizeZernioAccountEventDetails,
  normalizeZernioInboxComment,
  normalizeZernioMessage,
  pickBoostAdAccountId,
  sanitizePortalCustomerError,
  shouldRemoveLocalCalendarPostAfterRemoteDeleteError,
  validateBoostAdAccountId,
  validateBoostTargeting,
} from './worker.js'

test('builds VAPID JWTs scoped to the push endpoint origin', async () => {
  const pair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  )
  const publicJwk = await crypto.subtle.exportKey('jwk', pair.publicKey)
  const privateJwk = await crypto.subtle.exportKey('jwk', pair.privateKey)
  const publicBytes = new Uint8Array([
    4,
    ...Buffer.from(publicJwk.x, 'base64url'),
    ...Buffer.from(publicJwk.y, 'base64url'),
  ])
  const publicKey = Buffer.from(publicBytes).toString('base64url')

  const jwt = await buildVapidJwt('https://updates.push.services.mozilla.com/wpush/v2/example', {
    publicKey,
    privateKey: privateJwk.d,
    subject: 'mailto:info@myautomationpartner.com',
  }, new Date('2026-05-25T12:00:00Z'))
  const [, payload] = jwt.split('.')
  const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))

  assert.equal(parsed.aud, 'https://updates.push.services.mozilla.com')
  assert.equal(parsed.sub, 'mailto:info@myautomationpartner.com')
  assert.equal(parsed.exp, 1779753600)
})

test('treats legacy admin users without explicit portal permissions as full admins', () => {
  assert.deepEqual(getUserPermissions({ role: 'admin', portal_permissions: null }), ['full_admin'])
  assert.deepEqual(getUserPermissions({ role: 'admin', portal_permissions: [] }), ['full_admin'])
})

test('preserves explicit portal permissions for non-legacy users', () => {
  assert.deepEqual(getUserPermissions({ role: 'viewer', portal_permissions: ['read_only'] }), ['read_only'])
  assert.deepEqual(getUserPermissions({ role: 'admin', portal_permissions: ['publish_posts'] }), ['publish_posts'])
})

test('allows Meta ad account IDs with or without the act_ prefix for boosted posts', () => {
  assert.equal(validateBoostAdAccountId('facebook', 'bad-id'), 'Meta boosts need a numeric ad account ID from Ads setup.')
  assert.equal(validateBoostAdAccountId('facebook', '123456789'), '')
  assert.equal(validateBoostAdAccountId('instagram', 'act_123456789'), '')
})

test('canonicalizes Meta ad account IDs for Zernio boost launch', () => {
  assert.equal(normalizeBoostAdAccountId('facebook', '123456789'), 'act_123456789')
  assert.equal(normalizeBoostAdAccountId('instagram', 'act_987654321'), 'act_987654321')
  assert.equal(normalizeBoostAdAccountId('metaads', '10203329703662118'), 'act_10203329703662118')
  assert.equal(normalizeBoostAdAccountId('tiktok', 'tt-ad-account-123'), 'tt-ad-account-123')
})

test('allows non-Meta ad account IDs to be provider-specific for boosted posts', () => {
  assert.equal(validateBoostAdAccountId('tiktok', 'tt-ad-account-123'), '')
  assert.equal(validateBoostAdAccountId('twitter', 'x-ad-account-123'), '')
})

test('requires an audience location or custom audience before Meta boost launch', () => {
  assert.equal(validateBoostTargeting('facebook', {}), 'Meta boosts need an audience location or a custom audience before launch.')
  assert.equal(validateBoostTargeting('facebook', { countries: ['US'] }), '')
  assert.equal(validateBoostTargeting('instagram', { zips: [{ key: 'US:13901' }] }), '')
  assert.equal(validateBoostTargeting('facebook', { custom_audiences: [{ id: 'audience-123' }] }), '')
  assert.equal(validateBoostTargeting('tiktok', {}), '')
})

test('normalizes boost targeting before sending it to Zernio', () => {
  assert.deepEqual(
    normalizeBoostTargeting({
      countries: ['US', '', 'CA'],
      zips: [{ key: 'US:13901', name: '13901' }, {}, null],
      custom_audiences: ['audience-123'],
      empty: '',
    }),
    {
      countries: ['US', 'CA'],
      zips: [{ key: 'US:13901', name: '13901' }],
      custom_audiences: ['audience-123'],
    },
  )
})

test('sanitizes duplicate draft storage errors before showing them to customers', () => {
  const raw = '{"code":"23505","details":"Key (client_id, slot_date_local, slot_label) already exists.","message":"duplicate key value violates unique constraint \\"social_drafts_slot_unique\\""}'

  assert.equal(
    sanitizePortalCustomerError(raw),
    'That draft already exists. Open Publisher to review the existing draft or send a different request.',
  )
})

test('hides closed Content Partner drafts from the customer calendar', () => {
  assert.equal(isVisibleContentDraft({ review_state: 'draft' }), true)
  assert.equal(isVisibleContentDraft({ review_state: 'needs_review' }), true)
  assert.equal(isVisibleContentDraft({ review_state: 'published' }), false)
  assert.equal(isVisibleContentDraft({ review_state: 'published_manually' }), false)
  assert.equal(isVisibleContentDraft({ review_state: 'archived' }), false)
  assert.equal(isVisibleContentDraft({ review_state: 'superseded' }), false)
})

test('allows calendar delete for scheduled and posted rows only', () => {
  assert.equal(canDeleteCalendarPost({ status: 'scheduled' }), true)
  assert.equal(canDeleteCalendarPost({ status: 'published' }), true)
  assert.equal(canDeleteCalendarPost({ status: 'draft' }), false)
  assert.equal(canDeleteCalendarPost({ status: 'failed' }), false)
})

test('builds provider delete payload for scheduled and posted calendar posts', () => {
  assert.deepEqual(
    buildRemoteCalendarPostDeletePayload({
      id: 'post-row-123',
      zernio_post_id: 'zernio-post-123',
      status: 'published',
      zernio_profile_id: 'profile-row-123',
    }, {
      clientId: 'client-123',
      zernioProfileId: 'profile-env-123',
    }),
    {
      action: 'delete',
      postId: 'post-row-123',
      clientId: 'client-123',
      zernioPostId: 'zernio-post-123',
      zernioProfileId: 'profile-row-123',
    },
  )

  assert.deepEqual(
    buildRemoteCalendarPostDeletePayload({
      id: 'post-row-456',
      n8n_execution_id: 'legacy-zernio-post-456',
      status: 'scheduled',
    }, {
      clientId: 'client-456',
      zernioProfileId: 'profile-env-456',
    }),
    {
      action: 'delete',
      postId: 'post-row-456',
      clientId: 'client-456',
      zernioPostId: 'legacy-zernio-post-456',
      zernioProfileId: 'profile-env-456',
    },
  )
})

test('calendar delete does not clean up local rows after unconfirmed remote delete errors', () => {
  assert.equal(shouldRemoveLocalCalendarPostAfterRemoteDeleteError({ status: 'published' }), false)
  assert.equal(shouldRemoveLocalCalendarPostAfterRemoteDeleteError({ status: 'scheduled' }), false)
  assert.equal(shouldRemoveLocalCalendarPostAfterRemoteDeleteError({ status: 'draft' }), false)
})

test('routes Content Partner menu commands without creating a draft', () => {
  assert.equal(classifyContentPartnerCommand('Menu'), 'menu')
  assert.equal(classifyContentPartnerCommand('/help'), 'menu')
  assert.equal(classifyContentPartnerCommand('show drafts'), 'drafts')
  assert.equal(classifyContentPartnerCommand('what is scheduled'), 'scheduled')

  assert.match(
    buildContentPartnerCommandReply('menu', { basePath: '/portal/my-automation-partner' }),
    /^What do you want to work on\?/,
  )
})

test('Content Partner review draft selector avoids old scheduled drafts', () => {
  const now = new Date('2026-05-25T16:00:00Z')
  const selected = selectContentPartnerReviewDraft([
    {
      id: 'old-open',
      scheduled_for: '2026-05-08T19:00:00Z',
      review_state: 'draft',
      updated_at: '2026-05-08T12:00:00Z',
    },
    {
      id: 'next-upcoming',
      scheduled_for: '2026-05-26T18:00:00Z',
      review_state: 'draft',
      updated_at: '2026-05-20T12:00:00Z',
    },
  ], { now })

  assert.equal(selected?.id, 'next-upcoming')
  assert.match(
    buildContentPartnerCommandReply('drafts', { basePath: '/portal/my-automation-partner', draftId: selected.id }),
    /\/portal\/my-automation-partner\/post\?draftId=next-upcoming/,
  )
})

test('reuses a previous tenant-scoped ad account when launching another boost', () => {
  assert.equal(
    pickBoostAdAccountId('', [
      { ad_account_id: '' },
      { ad_account_id: 'act_123456789' },
    ]),
    'act_123456789',
  )
  assert.equal(
    pickBoostAdAccountId('act_987654321', [{ ad_account_id: 'act_123456789' }]),
    'act_987654321',
  )
})

test('normalizes Zernio ads accounts without exposing raw provider payloads', () => {
  assert.deepEqual(
    normalizeZernioAdAccounts([
      {
        _id: 'zernio_ads_1',
        platform: 'metaads',
        displayName: 'MAP Ad Account',
        metadata: { subscribedAdAccountIds: ['123456789'] },
      },
      {
        _id: 'zernio_ads_missing_platform_id',
        platform: 'metaads',
        displayName: 'Incomplete account',
      },
    ]),
    [{
      id: 'zernio_ads_1',
      zernioAccountId: 'zernio_ads_1',
      adAccountId: 'act_123456789',
      platform: 'metaads',
      label: 'MAP Ad Account',
      rawStatus: '',
    }],
  )
})

test('looks up Meta ads accounts when boosting Facebook or Instagram posts', async () => {
  const workerSource = await readFile(new URL('./worker.js', import.meta.url), 'utf8')
  const helperIndex = workerSource.indexOf('function zernioAdsAccountLookupPlatforms')
  const metaIndex = workerSource.indexOf("['metaads', normalized]", helperIndex)
  const lookupIndex = workerSource.indexOf('zernioAdsAccountLookupPlatforms(platform)', helperIndex)

  assert.notEqual(helperIndex, -1)
  assert.ok(metaIndex > helperIndex)
  assert.ok(lookupIndex > helperIndex)
})

test('exposes boost targeting search and scheduled active-status notifications', async () => {
  const workerSource = await readFile(new URL('./worker.js', import.meta.url), 'utf8')

  assert.match(workerSource, /async function handleBoostTargetingSearch/)
  assert.match(workerSource, /\/api\/boost-targeting-search/)
  assert.match(workerSource, /\/ads\/targeting\/search\?/)
  assert.match(workerSource, /async function syncPostBoostStatuses/)
  assert.match(workerSource, /notifyPortalPushSubscribers\(env, \{ \.\.\.envConfig, clientId: boost\.client_id \}\)/)
  assert.match(workerSource, /ctx\.waitUntil\(syncPostBoostStatuses\(env\)\)/)
})

test('blocks tenant-unsafe Zernio account-list sync from the customer portal', async () => {
  const workerSource = await readFile(new URL('./worker.js', import.meta.url), 'utf8')
  const routeIndex = workerSource.indexOf("url.pathname === '/api/n8n/zernio-sync-accounts'")
  const disabledIndex = workerSource.indexOf('account list is not tenant scoped', routeIndex)
  const proxyIndex = workerSource.indexOf("proxyN8nWebhook(request, env, 'zernio-sync-accounts')", routeIndex)

  assert.notEqual(routeIndex, -1)
  assert.ok(disabledIndex > routeIndex)
  assert.equal(proxyIndex, -1)
})

test('normalizes Zernio post analytics for tenant-scoped metric storage', () => {
  const metric = normalizeZernioPostAnalytics({
    postId: 'post_123',
    latePostId: 'late_123',
    analytics: {
      impressions: 1500,
      reach: 900,
      likes: 40,
      comments: 5,
      shares: 3,
      saves: 2,
      clicks: 10,
      views: 1200,
      engagementRate: 4.1,
      lastUpdated: '2026-05-14T13:30:00.000Z',
    },
    platformAnalytics: [{
      platform: 'facebook',
      status: 'published',
      platformPostId: 'fb_123',
      platformPostUrl: 'https://facebook.com/p/fb_123',
      analytics: {
        impressions: 1500,
        reach: 900,
        likes: 40,
        comments: 5,
        shares: 3,
        saves: 2,
        clicks: 10,
        views: 1200,
        engagementRate: 4.1,
        lastUpdated: '2026-05-14T13:30:00.000Z',
      },
    }],
  }, {
    platform: 'facebook',
    post: { id: 'post-row-123', client_id: 'client-123', n8n_execution_id: 'late_123' },
    connection: { id: 'connection-123' },
    zernioProfileId: 'profile-123',
  })
  assert.match(metric.last_synced_at, /^\d{4}-\d{2}-\d{2}T/)
  delete metric.last_synced_at

  assert.deepEqual(
    metric,
    {
      client_id: 'client-123',
      post_id: 'post-row-123',
      social_connection_id: 'connection-123',
      zernio_profile_id: 'profile-123',
      platform: 'facebook',
      metric_date: '2026-05-14',
      zernio_post_id: 'late_123',
      platform_post_id: 'fb_123',
      platform_post_url: 'https://facebook.com/p/fb_123',
      source: 'zernio',
      sync_status: 'synced',
      views: 1200,
      impressions: 1500,
      reach: 900,
      likes: 40,
      comments: 5,
      shares: 3,
      saves: 2,
      clicks: 10,
      engagements: 60,
      engagement_rate: 4.1,
      raw_json: {
        zernio: {
          postId: 'post_123',
          latePostId: 'late_123',
          analytics: {
            impressions: 1500,
            reach: 900,
            likes: 40,
            comments: 5,
            shares: 3,
            saves: 2,
            clicks: 10,
            views: 1200,
            engagementRate: 4.1,
            lastUpdated: '2026-05-14T13:30:00.000Z',
          },
          platformAnalytics: [{
            platform: 'facebook',
            status: 'published',
            platformPostId: 'fb_123',
            platformPostUrl: 'https://facebook.com/p/fb_123',
            analytics: {
              impressions: 1500,
              reach: 900,
              likes: 40,
              comments: 5,
              shares: 3,
              saves: 2,
              clicks: 10,
              views: 1200,
              engagementRate: 4.1,
              lastUpdated: '2026-05-14T13:30:00.000Z',
            },
          }],
        },
        platformAnalytics: {
          platform: 'facebook',
          status: 'published',
          platformPostId: 'fb_123',
          platformPostUrl: 'https://facebook.com/p/fb_123',
          analytics: {
            impressions: 1500,
            reach: 900,
            likes: 40,
            comments: 5,
            shares: 3,
            saves: 2,
            clicks: 10,
            views: 1200,
            engagementRate: 4.1,
            lastUpdated: '2026-05-14T13:30:00.000Z',
          },
        },
      },
    },
  )
})

test('dashboard social summary prefers current follower snapshots', () => {
  const summary = buildDashboardSocialPlatformSummary({
    platform: { id: 'facebook', metricField: 'followers', metricLabel: 'Followers' },
    connection: {
      platform: 'facebook',
      zernio_account_id: 'acct_fb',
      zernio_profile_id: 'profile_map',
      username: 'My Automation Partner',
    },
    dailyMetric: {
      followers: 723,
      reach: 15,
      metric_date: '2026-05-15',
      created_at: '2026-05-15T04:00:00.000Z',
    },
    postAggregate: {
      engagements: 7,
      reach: 100,
      views: 0,
      latestSyncedAt: '2026-05-15T14:46:44.000Z',
    },
  })

  assert.equal(summary.connected, true)
  assert.equal(summary.metricLabel, 'Followers')
  assert.equal(summary.metricValue, 723)
  assert.equal(summary.metricSource, 'daily_metrics')
  assert.equal(summary.statusLabel, 'Metrics current')
  assert.equal(summary.username, 'My Automation Partner')
})

test('dashboard social summary falls back to post activity when follower snapshots are missing', () => {
  const summary = buildDashboardSocialPlatformSummary({
    platform: { id: 'facebook', metricField: 'followers', metricLabel: 'Followers' },
    connection: {
      platform: 'facebook',
      zernio_account_id: 'acct_fb',
      zernio_profile_id: 'profile_map',
      username: 'My Automation Partner',
    },
    postAggregate: {
      engagements: 7,
      reach: 0,
      views: 0,
      latestSyncedAt: '2026-05-15T14:46:44.000Z',
    },
  })

  assert.equal(summary.connected, true)
  assert.equal(summary.metricLabel, 'Engagement')
  assert.equal(summary.metricValue, 7)
  assert.equal(summary.metricSource, 'post_daily_metrics')
  assert.equal(summary.statusLabel, 'Metrics current')
})

test('normalizes Zernio comment webhooks into inbox messages', () => {
  assert.deepEqual(
    normalizeZernioMessage({
      id: 'event_123',
      event: 'comment.received',
      timestamp: '2026-05-14T14:45:00.000Z',
      account: {
        id: '69da4fb97dea335c2bd86f8c',
        platform: 'facebook',
      },
      post: {
        id: 'fb_post_123',
        url: 'https://facebook.com/myautomationpartner/posts/fb_post_123',
      },
      comment: {
        id: 'fb_comment_456',
        text: 'This is a real Facebook post comment.',
        createdAt: '2026-05-14T14:44:00.000Z',
        author: {
          id: 'fb_user_789',
          name: 'Facebook User',
          profilePictureUrl: 'https://example.com/avatar.jpg',
        },
      },
    }),
    {
      id: 'fb_comment_456',
      conversationId: 'fb_post_123',
      senderId: 'fb_user_789',
      senderName: 'Facebook User',
      senderEmail: '',
      senderPhone: '',
      senderAvatar: 'https://example.com/avatar.jpg',
      content: 'This is a real Facebook post comment.',
      attachments: [],
      timestamp: '2026-05-14T14:44:00.000Z',
    },
  )
})

test('normalizes Zernio inbox comment authors from the documented from object', () => {
  assert.deepEqual(
    normalizeZernioInboxComment({
      id: 'comment_123',
      message: 'Love this!',
      createdTime: '2026-05-14T14:27:29.000Z',
      from: {
        id: 'user_456',
        name: 'Jane Customer',
        username: 'janecustomer',
        picture: 'https://example.com/jane.jpg',
      },
      likeCount: 2,
      replyCount: 0,
      isHidden: false,
      canReply: true,
    }, 'post_123'),
    {
      id: 'comment_123',
      postId: 'post_123',
      platform: null,
      authorId: 'user_456',
      authorName: 'Jane Customer',
      authorAvatar: 'https://example.com/jane.jpg',
      text: 'Love this!',
      createdTime: '2026-05-14T14:27:29.000Z',
      likeCount: 2,
      replyCount: 0,
      hidden: false,
      canReply: true,
      replies: [],
      raw: {
        id: 'comment_123',
        message: 'Love this!',
        createdTime: '2026-05-14T14:27:29.000Z',
        from: {
          id: 'user_456',
          name: 'Jane Customer',
          username: 'janecustomer',
          picture: 'https://example.com/jane.jpg',
        },
        likeCount: 2,
        replyCount: 0,
        isHidden: false,
        canReply: true,
      },
    },
  )
})

test('normalizes Zernio inbox comments with platform context', () => {
  assert.equal(
    normalizeZernioInboxComment({ id: 'comment_123' }, 'post_123', { platform: 'facebook' }).platform,
    'facebook',
  )
})

test('comments inbox requests only posts with comments', async () => {
  const inboxSource = await readFile(new URL('./src/pages/Inbox.jsx', import.meta.url), 'utf8')
  assert.match(inboxSource, /minComments:\s*'1'/)
})

test('sidebar does not show a hard-coded inbox badge', async () => {
  const sidebarSource = await readFile(new URL('./src/components/Sidebar.jsx', import.meta.url), 'utf8')
  assert.doesNotMatch(sidebarSource, />\s*3\s*<\/span>/)
})

test('worker exposes a tenant-scoped Zernio comment reply route', async () => {
  const workerSource = await readFile(new URL('./worker.js', import.meta.url), 'utf8')
  assert.match(workerSource, /handleZernioCommentReply/)
  assert.match(workerSource, /\/inbox\/comments\/\$\{encodeURIComponent\(postId\)\}/)
  assert.match(workerSource, /commentId/)
})

test('worker syncs Zernio comments into assigned Chatwoot conversations for mobile visibility', async () => {
  const workerSource = await readFile(new URL('./worker.js', import.meta.url), 'utf8')
  assert.match(workerSource, /syncZernioCommentsToChatwoot/)
  assert.match(workerSource, /zernio_sync_source:\s*'zernio_comments_poll'/)
  assert.match(workerSource, /assignChatwootZernioConversation/)
  assert.match(workerSource, /getChatwootConversationId\(conversation\)/)
})

test('routes Chatwoot mobile replies for comments through the Zernio comment endpoint', () => {
  assert.deepEqual(
    buildZernioOutboundReplyRequest({
      custom_attributes: {
        zernio_account_id: 'account_123',
        zernio_conversation_id: '1105329889321239_122123043188817328',
      },
    }, [{
      content_attributes: {
        zernio_event: 'comment.received',
        zernio_message_id: '122123043188817328_1779254253480385',
      },
    }], 'Thanks for the comment!'),
    {
      path: '/inbox/comments/122123043188817328',
      body: {
        accountId: 'account_123',
        commentId: '122123043188817328_1779254253480385',
        message: 'Thanks for the comment!',
      },
      kind: 'comment',
    },
  )
})

test('keeps pending platform post metrics separate from another platform analytics', () => {
  const metric = normalizeZernioPostAnalytics({
    postId: 'post_456',
    analytics: {
      views: 300,
      impressions: 500,
      reach: 250,
      lastUpdated: '2026-05-14T13:30:00.000Z',
      platformPostUrl: 'https://www.instagram.com/p/post_456/',
    },
    platformAnalytics: [
      {
        platform: 'facebook',
        status: 'published',
        syncStatus: 'pending',
        platformPostId: 'fb_456',
        platformPostUrl: null,
        analytics: null,
      },
      {
        platform: 'instagram',
        status: 'published',
        syncStatus: 'synced',
        platformPostId: 'ig_456',
        platformPostUrl: 'https://www.instagram.com/p/post_456/',
        analytics: {
          views: 300,
          impressions: 500,
          reach: 250,
          lastUpdated: '2026-05-14T13:30:00.000Z',
        },
      },
    ],
  }, {
    platform: 'facebook',
    post: { id: 'post-row-456', client_id: 'client-456', n8n_execution_id: 'post_456' },
    connection: { id: 'connection-456', zernio_profile_id: 'profile-456' },
  })

  assert.equal(metric.sync_status, 'pending')
  assert.equal(metric.zernio_profile_id, 'profile-456')
  assert.equal(metric.platform_post_id, 'fb_456')
  assert.equal(metric.platform_post_url, '')
  assert.equal(metric.views, 0)
  assert.equal(metric.impressions, 0)
  assert.equal(metric.reach, 0)
})

test('post metrics include durable platform variant media for analytics thumbnails', async () => {
  const workerSource = await readFile(new URL('./worker.js', import.meta.url), 'utf8')
  assert.match(workerSource, /loadPublishedPostsForMetrics/)
  assert.match(workerSource, /platform_variants_json/)
  assert.match(workerSource, /buildPostMetricsResponse\(posts, metrics, sync\)/)
})

test('normalizes Zernio account event ids, platforms, usernames, and state tokens', () => {
  assert.deepEqual(
    normalizeZernioAccountEventDetails({
      event: 'account.connected',
      data: {
        account: {
          _id: 'acct_123',
          profileId: 'profile_123',
          platform: 'x',
          displayName: 'MAP',
          metadata: { connectState: 'state-from-metadata' },
        },
      },
    }),
    {
      id: 'acct_123',
      profileId: 'profile_123',
      platform: 'twitter',
      username: 'MAP',
      state: 'state-from-metadata',
    },
  )
})

test('adds Zernio profile scope to API query parameters without leaking blanks', () => {
  assert.equal(
    buildZernioScopedSearchParams({ postId: 'post_123', platform: 'facebook' }, 'profile_123').toString(),
    'postId=post_123&platform=facebook&profileId=profile_123',
  )
  assert.equal(
    buildZernioScopedSearchParams({ accountId: 'acct_123' }, '').toString(),
    'accountId=acct_123',
  )
})

test('portal authorization loads the client Zernio profile for connect scoping', async () => {
  const workerSource = await readFile(new URL('./worker.js', import.meta.url), 'utf8')
  const authStart = workerSource.indexOf('async function authorizePortalUser')
  const authEnd = workerSource.indexOf('async function supabaseAuthAdmin', authStart)
  const authSource = workerSource.slice(authStart, authEnd)

  assert.notEqual(authStart, -1)
  assert.notEqual(authEnd, -1)
  assert.ok(authSource.includes('clients(slug,business_name,zernio_profile_id,zernio_profile_status)'))
  assert.ok(authSource.includes('zernioProfileId'))
  assert.ok(authSource.includes('zernioProfileStatus'))
})

test('social connection attempts persist the Zernio profile at top level', async () => {
  const workerSource = await readFile(new URL('./worker.js', import.meta.url), 'utf8')
  const createStart = workerSource.indexOf('async function createSocialConnectionAttempt')
  const createEnd = workerSource.indexOf('function getSupabaseConfig', createStart)
  const createSource = workerSource.slice(createStart, createEnd)

  assert.notEqual(createStart, -1)
  assert.notEqual(createEnd, -1)
  assert.ok(createSource.includes('zernio_profile_id: profileId || null'))
})

test('connect URL proxy calls Zernio directly with the customer profile scope', async () => {
  const workerSource = await readFile(new URL('./worker.js', import.meta.url), 'utf8')
  const proxyStart = workerSource.indexOf('async function proxyN8nWebhook')
  const proxyEnd = workerSource.indexOf('function normalizePlatform', proxyStart)
  const proxySource = workerSource.slice(proxyStart, proxyEnd)

  assert.notEqual(proxyStart, -1)
  assert.notEqual(proxyEnd, -1)
  assert.ok(proxySource.includes("if (webhookPath === 'zernio-connect-url')"))
  assert.ok(proxySource.includes('profileId: zernioProfileId'))
  assert.ok(proxySource.includes('redirect_url: redirectUrl'))
  assert.ok(proxySource.includes('zernioFetch(env, `/connect/${encodeURIComponent(platform)}?${params.toString()}`)'))
})

test('profile refresh sync only trusts Zernio accounts in the customer profile', async () => {
  const workerSource = await readFile(new URL('./worker.js', import.meta.url), 'utf8')
  const syncStart = workerSource.indexOf('async function syncZernioProfileAccountsForClient')
  const syncEnd = workerSource.indexOf('async function markAmbiguousSocialConnectionAttempts', syncStart)
  const syncSource = workerSource.slice(syncStart, syncEnd)
  const routeIndex = workerSource.indexOf("url.pathname === '/api/social-connections/refresh'")

  assert.notEqual(syncStart, -1)
  assert.notEqual(syncEnd, -1)
  assert.notEqual(routeIndex, -1)
  assert.ok(syncSource.includes('listZernioAccounts(env, { profileId: zernioProfileId, limit: 100 })'))
  assert.ok(syncSource.includes('account.profileId === zernioProfileId'))
  assert.ok(syncSource.includes('replaceSocialConnection(envConfig'))
  assert.ok(syncSource.includes('completePendingSocialConnectionAttemptsByProfilePlatform(envConfig'))
})

test('account webhooks do not fall back to tenant path attribution', async () => {
  const workerSource = await readFile(new URL('./worker.js', import.meta.url), 'utf8')
  const handlerStart = workerSource.indexOf('async function handleZernioAccountWebhook')
  const handlerEnd = workerSource.indexOf('function normalizePath', handlerStart)
  const handlerSource = workerSource.slice(handlerStart, handlerEnd)

  assert.notEqual(handlerStart, -1)
  assert.notEqual(handlerEnd, -1)
  assert.equal(handlerSource.includes('x-map-tenant-slug'), false)
  assert.equal(handlerSource.includes('resolveClientIdFromTenantSlug'), false)
  assert.ok(handlerSource.includes('resolveSocialConnectionTarget'))
  assert.ok(handlerSource.includes('findSocialConnectionByAccountId'))
  assert.ok(handlerSource.includes('profileId: account.profileId'))
})

test('inbox webhooks resolve the tenant from the Zernio account before Chatwoot writes', async () => {
  const workerSource = await readFile(new URL('./worker.js', import.meta.url), 'utf8')
  const handlerStart = workerSource.indexOf('async function handleZernioInboxWebhook')
  const handlerEnd = workerSource.indexOf('async function sendZernioConversationReply', handlerStart)
  const handlerSource = workerSource.slice(handlerStart, handlerEnd)

  assert.notEqual(handlerStart, -1)
  assert.notEqual(handlerEnd, -1)
  assert.equal(handlerSource.includes('ensureZernioAccountIsConnected(envConfig, account)'), false)
  assert.ok(handlerSource.includes('findSocialConnectionByAccountId(envConfig, account.id, account.profileId)'))
  assert.ok(handlerSource.includes('const tenantEnvConfig = { ...envConfig, clientId: connection.client_id }'))
  assert.ok(handlerSource.includes('getChatwootConfigForClient(env, tenantEnvConfig)'))
  assert.ok(handlerSource.includes('resolveChatwootSocialInbox(chatwootConfig)'))
})
