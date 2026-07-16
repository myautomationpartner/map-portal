import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Check,
  CheckCircle,
  FacebookLogo,
  InstagramLogo,
  LinkSimple,
  PencilSimple,
  WarningCircle,
  XLogo,
} from '@phosphor-icons/react'
import MobilePartnerTopBar from './MobilePartnerTopBar'
import MobilePartnerChat from './MobilePartnerChat'

const CONTENT_SOURCES = new Set(['Posts', 'Campaign', 'Idea', 'Partner'])

function platformIcon(label) {
  const normalized = String(label || '').toLowerCase()
  if (normalized.includes('facebook')) return FacebookLogo
  if (normalized.includes('instagram')) return InstagramLogo
  if (normalized === 'x' || normalized.includes('twitter')) return XLogo
  return null
}

function PlatformChips({ item, selected, onToggle }) {
  const values = String(item?.sourceDetail || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
  const platforms = values.filter((value) => platformIcon(value))
  const shown = platforms.length ? platforms : ['Facebook', 'Instagram', 'X']

  return (
    <div className="mobile-partner-platforms" aria-label="Post platforms">
      {shown.map((platform) => {
        const Icon = platformIcon(platform)
        const normalized = platform.toLowerCase()
        const platformId = normalized === 'x' || normalized === 'twitter' ? 'twitter' : normalized
        return Icon ? (
          <button
            type="button"
            key={platform}
            data-selected={selected.includes(platformId) ? 'true' : undefined}
            onClick={() => onToggle(platformId)}
            aria-pressed={selected.includes(platformId)}
          >
            <Icon size={16} weight="fill" />
            <span>{platform === 'Twitter' ? 'X' : platform}</span>
          </button>
        ) : null
      })}
    </div>
  )
}

function PartnerMessage({ children, compact = false }) {
  return (
    <div className={`mobile-partner-message ${compact ? 'is-compact' : ''}`}>
      <span className="mobile-partner-message-avatar">
        <img src="/assets/map-option-b-mark.png" alt="" />
        <i aria-hidden="true" />
      </span>
      <div className="mobile-partner-message-bubble">{children}</div>
    </div>
  )
}

const POST_PLATFORMS = [
  { id: 'facebook', label: 'Facebook', Icon: FacebookLogo },
  { id: 'instagram', label: 'Instagram', Icon: InstagramLogo },
  { id: 'twitter', label: 'X', Icon: XLogo },
]

function normalizePlatformId(value) {
  const normalized = String(value || '').trim().toLowerCase()
  return normalized === 'x' ? 'twitter' : normalized
}

function SocialConnectionSummary({ connections, health, loading, connectingPlatform, onConnect }) {
  const connected = new Set(
    (connections || [])
      .filter((connection) => connection?.zernio_account_id)
      .map((connection) => normalizePlatformId(connection.platform)),
  )
  const missing = new Set(
    (Array.isArray(health?.missing) ? health.missing : [])
      .map((connection) => normalizePlatformId(connection.platform)),
  )

  return (
    <div className="mobile-partner-social-status" aria-label="Connected social accounts" data-loading={loading ? 'true' : undefined}>
      {POST_PLATFORMS.map(({ id, label, Icon }) => {
        const isConnected = connected.has(id)
        const needsReconnect = missing.has(id)
        const isConnecting = connectingPlatform === id
        return (
          <button
            type="button"
            key={id}
            data-state={isConnected ? 'connected' : needsReconnect ? 'attention' : 'available'}
            disabled={loading || isConnected || isConnecting}
            onClick={() => onConnect(id, label)}
            aria-label={isConnected ? `${label} connected` : `${needsReconnect ? 'Reconnect' : 'Connect'} ${label}`}
          >
            <Icon size={17} weight="fill" />
            <span>
              {label}
              <small>{loading ? 'Checking' : isConnected ? 'Connected' : needsReconnect ? 'Reconnect' : 'Connect'}</small>
            </span>
            {loading ? <i aria-hidden="true" /> : isConnected ? <Check size={15} weight="bold" /> : needsReconnect ? <WarningCircle size={16} weight="fill" /> : <LinkSimple size={15} />}
          </button>
        )
      })}
    </div>
  )
}

export default function MobilePartnerHome({
  tenant,
  queue,
  inboxUnreadCount = 0,
  socialConnections = [],
  socialConnectionHealth = { missing: [] },
  socialConnectionsLoading = false,
  calendarPosts,
  onConnectSocial,
  onComplete,
  savePending = false,
  readOnly = false,
}) {
  const navigate = useNavigate()
  const [selectedPlatforms, setSelectedPlatforms] = useState(['facebook', 'instagram', 'twitter'])
  const [connectingPlatform, setConnectingPlatform] = useState('')
  const [connectionError, setConnectionError] = useState('')
  const activeItems = useMemo(() => queue.filter((item) => !item.completed && !item.snoozed), [queue])
  const contentItem = activeItems.find((item) => CONTENT_SOURCES.has(item.source)) || null
  const previewPost = useMemo(() => {
    if (!contentItem?.id?.startsWith('post:')) return null
    const postId = contentItem.id.slice('post:'.length)
    return calendarPosts.find((post) => String(post.id) === postId) || null
  }, [calendarPosts, contentItem])
  const businessName = tenant?.displayName || 'your business'
  const connectedLabels = POST_PLATFORMS
    .filter(({ id }) => socialConnections.some((connection) => normalizePlatformId(connection?.platform) === id && connection?.zernio_account_id))
    .map(({ label }) => label)

  async function connectSocial(platform, label) {
    if (!onConnectSocial || connectingPlatform) return
    setConnectingPlatform(platform)
    setConnectionError('')
    try {
      await onConnectSocial(platform, label)
    } catch (error) {
      setConnectionError(error instanceof Error ? error.message : `Could not open ${label} connection.`)
      setConnectingPlatform('')
    }
  }

  function handlePhotos(files, options = {}) {
    navigate('/post?source=recent-photos', {
      state: {
        recentPhotos: files,
        preselectedPlatforms: options.platforms || selectedPlatforms,
        initialCaption: options.caption || '',
        partnerPrompt: options.prompt || '',
        imageCountAnalyzed: Number(options.imageCountAnalyzed || 0),
        partnerConversation: Array.isArray(options.conversation) ? options.conversation : [],
        promoDesign: options.promoDesign || null,
        promoSourceFile: options.promoSourceFile || null,
        promoSourceImageBase64: options.promoSourceImageBase64 || '',
        promoSourceImageMimeType: options.promoSourceImageMimeType || '',
        promoLogoBase64: options.promoLogoBase64 || '',
        promoLogoMimeType: options.promoLogoMimeType || '',
      },
    })
  }

  function togglePlatform(platform) {
    setSelectedPlatforms((current) => (
      current.includes(platform)
        ? current.filter((item) => item !== platform)
        : [...current, platform]
    ))
  }

  function openContentItem() {
    navigate(contentItem?.targetHref || '/post', {
      state: { preselectedPlatforms: selectedPlatforms },
    })
  }

  return (
    <div className="mobile-partner-home">
      <MobilePartnerTopBar activeMode="post" inboxUnreadCount={inboxUnreadCount} />

      <MobilePartnerChat
        contextPath="/"
        placeholder="Ask My Partner anything"
        note="Voice and photos work here. Nothing posts without review."
        onPhotos={handlePhotos}
        platforms={selectedPlatforms}
        businessName={businessName}
        readOnly={readOnly}
      >
        <PartnerMessage>
          <p>
            {contentItem
              ? 'I found a post ready for review.'
              : socialConnectionsLoading
                ? 'Checking your publishing accounts.'
                : connectedLabels.length
                  ? `${connectedLabels.join(', ')} ${connectedLabels.length === 1 ? 'is' : 'are'} connected and ready.`
                  : 'No publishing accounts are connected yet.'}
          </p>
          <strong>
            {contentItem
              ? 'Check the caption and platforms before it goes live.'
              : 'What would you like to create today? Describe it, speak it, or add photos.'}
          </strong>
        </PartnerMessage>

        {!contentItem ? (
          <SocialConnectionSummary
            connections={socialConnections}
            health={socialConnectionHealth}
            loading={socialConnectionsLoading}
            connectingPlatform={connectingPlatform}
            onConnect={connectSocial}
          />
        ) : null}

        {connectionError ? (
          <div className="mobile-partner-social-error" role="alert">
            <WarningCircle size={17} weight="fill" />
            <span>{connectionError}</span>
            <button type="button" onClick={() => setConnectionError('')}>Dismiss</button>
          </div>
        ) : null}

        {contentItem ? (
          <article className="mobile-partner-post-attachment">
            {previewPost?.media_url ? (
              <img className="mobile-partner-post-image" src={previewPost.media_url} alt="Media attached to this social post" />
            ) : null}
            <div className="mobile-partner-post-caption">
              <div className="mobile-partner-ready-label"><i aria-hidden="true" />Ready to review</div>
              <h2>{contentItem.title}</h2>
              <p>{contentItem.description}</p>
            </div>
            <PlatformChips item={contentItem} selected={selectedPlatforms} onToggle={togglePlatform} />
            <div className="mobile-partner-post-actions">
              <button
                type="button"
                className="mobile-partner-primary"
                disabled={!selectedPlatforms.length}
                onClick={openContentItem}
              >
                <CheckCircle size={20} weight="fill" />
                Review &amp; post
              </button>
              <button type="button" onClick={openContentItem}>
                <PencilSimple size={18} />
                Edit
              </button>
            </div>
            <div className="mobile-partner-post-secondary">
              <button type="button" onClick={() => navigate('/post?fresh=1')}>Try another idea</button>
              <button type="button" disabled={savePending} onClick={() => onComplete(contentItem.id)}>Done for now</button>
            </div>
          </article>
        ) : null}
      </MobilePartnerChat>
    </div>
  )
}
