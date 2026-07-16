import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  CheckCircle,
  FacebookLogo,
  InstagramLogo,
  PencilSimple,
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

export default function MobilePartnerHome({
  tenant,
  queue,
  inboxUnreadCount = 0,
  calendarPosts,
  onComplete,
  savePending = false,
  readOnly = false,
}) {
  const navigate = useNavigate()
  const [selectedPlatforms, setSelectedPlatforms] = useState(['facebook', 'instagram', 'twitter'])
  const activeItems = useMemo(() => queue.filter((item) => !item.completed && !item.snoozed), [queue])
  const contentItem = activeItems.find((item) => CONTENT_SOURCES.has(item.source)) || null
  const previewPost = useMemo(() => {
    if (!contentItem?.id?.startsWith('post:')) return null
    const postId = contentItem.id.slice('post:'.length)
    return calendarPosts.find((post) => String(post.id) === postId) || null
  }, [calendarPosts, contentItem])
  const businessName = tenant?.displayName || 'your business'

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
              : 'What would you like to post?'}
          </p>
          <strong>
            {contentItem
              ? 'Check the caption and platforms before it goes live.'
              : 'Describe it, speak it, or add photos.'}
          </strong>
        </PartnerMessage>

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
