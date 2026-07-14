import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  CalendarBlank,
  FacebookLogo,
  InstagramLogo,
  PencilSimple,
  Trash,
  XLogo,
} from '@phosphor-icons/react'
import MobilePartnerTopBar from './MobilePartnerTopBar'
import MobileVoiceComposer from './MobileVoiceComposer'

function formatSchedule(value) {
  if (!value) return 'Schedule time unavailable'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Schedule time unavailable'
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

function postMedia(post) {
  return post?.media_url || post?.image_url || post?.thumbnail_url || ''
}

function PlatformIcons({ platforms = [] }) {
  const values = new Set(platforms.map((platform) => String(platform || '').toLowerCase()))
  return (
    <span className="mobile-scheduled-platforms" aria-label="Scheduled platforms">
      {values.has('facebook') ? <FacebookLogo size={16} weight="fill" /> : null}
      {values.has('instagram') ? <InstagramLogo size={16} weight="fill" /> : null}
      {values.has('twitter') || values.has('x') ? <XLogo size={16} weight="fill" /> : null}
    </span>
  )
}

export default function MobileScheduledPartner({
  posts = [],
  loading = false,
  deletingId = '',
  onDelete,
  error = '',
}) {
  const navigate = useNavigate()
  const [composer, setComposer] = useState('')

  function openPartner(message = '') {
    window.dispatchEvent(new CustomEvent('map:open-portal-partner', {
      detail: { message: String(message || '').trim() },
    }))
    setComposer('')
  }

  return (
    <div className="mobile-scheduled-partner">
      <MobilePartnerTopBar activeMode="scheduled" />

      <main className="mobile-scheduled-conversation">
        <div className="mobile-partner-message">
          <span className="mobile-partner-message-avatar">
            <img src="/assets/map-option-b-mark.png" alt="" />
            <i aria-hidden="true" />
          </span>
          <div className="mobile-partner-message-bubble">
            {loading ? (
              <><p>I am checking your schedule now.</p><strong>Your upcoming posts will appear here.</strong></>
            ) : posts.length ? (
              <><p>You have {posts.length} {posts.length === 1 ? 'post' : 'posts'} scheduled.</p><strong>Here is what is coming up next.</strong></>
            ) : (
              <><p>Your schedule is clear.</p><strong>Ask me to plan the next post or build the week.</strong></>
            )}
          </div>
        </div>

        {error ? <div className="mobile-scheduled-error">{error}</div> : null}

        {loading ? (
          <div className="mobile-scheduled-loading" aria-label="Loading scheduled posts">
            <span />
            <span />
          </div>
        ) : posts.length ? (
          <div className="mobile-scheduled-list">
            {posts.map((post) => {
              const media = postMedia(post)
              return (
                <article key={post.id} className="mobile-scheduled-attachment">
                  {media ? <img src={media} alt="Media for scheduled social post" /> : null}
                  <div className="mobile-scheduled-content">
                    <div className="mobile-scheduled-meta">
                      <span><i aria-hidden="true" />Scheduled</span>
                      <PlatformIcons platforms={post.platforms} />
                    </div>
                    <h2>{formatSchedule(post.scheduled_for)}</h2>
                    <p>{post.content || 'Open this post to review its caption.'}</p>
                    <div className="mobile-scheduled-actions">
                      <Link to={`/post?editPost=${post.id}${post.localDate ? `&date=${post.localDate}` : ''}`}>
                        <PencilSimple size={17} />Edit post
                      </Link>
                      <button type="button" disabled={deletingId === post.id} onClick={() => onDelete?.(post)}>
                        <Trash size={17} />{deletingId === post.id ? 'Deleting' : 'Delete'}
                      </button>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        ) : (
          <button type="button" className="mobile-scheduled-empty" onClick={() => navigate('/')}>
            <CalendarBlank size={22} weight="duotone" />
            <span>Plan a post</span>
            <small>Start in Post and My Partner will help build it.</small>
          </button>
        )}

        {!loading ? (
          <div className="mobile-partner-message is-compact">
            <span className="mobile-partner-message-avatar">
              <img src="/assets/map-option-b-mark.png" alt="" />
              <i aria-hidden="true" />
            </span>
            <div className="mobile-partner-message-bubble">
              <p>{posts.length ? 'Tell me what you want to move, edit, or add.' : 'Tell me what you want to promote this week.'}</p>
            </div>
          </div>
        ) : null}
      </main>

      <div className="mobile-partner-composer-dock">
        <MobileVoiceComposer
          value={composer}
          onChange={setComposer}
          onSubmit={openPartner}
          placeholder="Ask about your schedule"
        />
        <p>Changes still require your review.</p>
      </div>
    </div>
  )
}
