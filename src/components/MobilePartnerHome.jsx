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
  summary,
  calendarPosts,
  onComplete,
  savePending = false,
  readOnly = false,
}) {
  const navigate = useNavigate()
  const [selectedPlatforms, setSelectedPlatforms] = useState(['facebook', 'instagram', 'twitter'])
  const activeItems = useMemo(() => queue.filter((item) => !item.completed && !item.snoozed), [queue])
  const contentItem = activeItems.find((item) => CONTENT_SOURCES.has(item.source)) || null
  const inboxItem = activeItems.find((item) => item.source === 'Inbox' || item.source === 'Reviews') || null
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
      <MobilePartnerTopBar activeMode="post" notificationCount={summary?.needsHuman || 0} />

      <MobilePartnerChat
        contextPath="/"
        placeholder="Ask My Partner anything"
        note="Voice and photos work here. Nothing posts without review."
        onPhotos={handlePhotos}
        platforms={selectedPlatforms}
        readOnly={readOnly}
      >
        <PartnerMessage>
          <p>{contentItem ? 'I found the strongest post to lead with.' : 'Tell me what you want to promote, or choose a recent photo.'}</p>
          <strong>
            {contentItem
              ? `It is ready for ${businessName}. You can review it before anything goes live.`
              : `I will turn it into a ready-to-review post for ${businessName}.`}
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
        ) : (
          <button
            type="button"
            className="mobile-partner-empty-post"
            onClick={() => navigate('/post', { state: { preselectedPlatforms: selectedPlatforms } })}
          >
            <span>Create a post</span>
            <small>Start with a thought, voice note, or recent photo.</small>
          </button>
        )}

        <PartnerMessage compact>
          <p>{contentItem ? 'Say the word and I will build the rest of your week.' : 'You stay in control. Nothing posts without your approval.'}</p>
        </PartnerMessage>

        {inboxItem ? (
          <button type="button" className="mobile-partner-inbox-nudge" onClick={() => navigate(inboxItem.targetHref || '/inbox')}>
            <span><i aria-hidden="true" />New customer message</span>
            <strong>{inboxItem.title}</strong>
            <small>Open Inbox for a suggested reply</small>
          </button>
        ) : null}
      </MobilePartnerChat>
    </div>
  )
}
