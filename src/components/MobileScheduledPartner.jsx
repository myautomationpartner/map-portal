import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  CaretDown,
  CaretUp,
  CalendarBlank,
  FacebookLogo,
  InstagramLogo,
  NotePencil,
  PencilSimple,
  Trash,
  XLogo,
} from '@phosphor-icons/react'
import MobilePartnerTopBar from './MobilePartnerTopBar'
import MobilePartnerChat from './MobilePartnerChat'

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

function draftTitle(draft) {
  return draft?.draft_title || String(draft?.post_type || 'Saved draft').replaceAll('_', ' ')
}

function draftCaption(draft) {
  return draft?.draft_caption || draft?.draft_body || 'Open this draft to finish the caption and choose when to publish it.'
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
  drafts = [],
  loading = false,
  deletingId = '',
  onDelete,
  error = '',
  readOnly = false,
}) {
  const navigate = useNavigate()
  const [showAllDrafts, setShowAllDrafts] = useState(false)
  const visibleDrafts = showAllDrafts ? drafts : drafts.slice(0, 4)
  const hiddenDraftCount = Math.max(0, drafts.length - visibleDrafts.length)
  const hasScheduledPosts = posts.length > 0
  const hasDrafts = drafts.length > 0

  return (
    <div className="mobile-scheduled-partner">
      <MobilePartnerTopBar activeMode="scheduled" />

      <MobilePartnerChat
        contextPath="/post/scheduled"
        placeholder="Ask about your schedule"
        note="Changes still require your review."
        readOnly={readOnly}
        conversationClassName="mobile-scheduled-conversation"
      >
        <div className="mobile-partner-message">
          <span className="mobile-partner-message-avatar">
            <img src="/assets/map-option-b-mark.png" alt="" />
            <i aria-hidden="true" />
          </span>
          <div className="mobile-partner-message-bubble">
            {loading ? (
              <><p>I am checking your schedule now.</p><strong>Your upcoming posts will appear here.</strong></>
            ) : hasScheduledPosts && hasDrafts ? (
              <><p>You have {posts.length} {posts.length === 1 ? 'post' : 'posts'} scheduled and {drafts.length} {drafts.length === 1 ? 'draft' : 'drafts'} to review.</p><strong>Everything that needs your attention is together here.</strong></>
            ) : hasScheduledPosts ? (
              <><p>You have {posts.length} {posts.length === 1 ? 'post' : 'posts'} scheduled.</p><strong>Here is what is coming up next.</strong></>
            ) : hasDrafts ? (
              <><p>Nothing is queued to publish yet.</p><strong>You have {drafts.length} {drafts.length === 1 ? 'draft' : 'drafts'} ready for review.</strong></>
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
        ) : hasScheduledPosts || hasDrafts ? (
          <div className="mobile-scheduled-sections">
            <section className="mobile-scheduled-group" aria-labelledby="mobile-scheduled-publish-heading">
              <header className="mobile-scheduled-group-heading">
                <div>
                  <h2 id="mobile-scheduled-publish-heading">Scheduled to publish</h2>
                  <p>Approved and queued for the selected time.</p>
                </div>
                <span>{posts.length}</span>
              </header>

              {hasScheduledPosts ? (
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
                <div className="mobile-scheduled-section-empty">
                  <CalendarBlank size={22} weight="duotone" />
                  <div>
                    <strong>Nothing queued yet</strong>
                    <span>A draft appears here after you approve its publish time.</span>
                  </div>
                </div>
              )}
            </section>

            {hasDrafts ? (
              <section className="mobile-scheduled-group" aria-labelledby="mobile-scheduled-drafts-heading">
                <header className="mobile-scheduled-group-heading">
                  <div>
                    <h2 id="mobile-scheduled-drafts-heading">Drafts to review</h2>
                    <p>Planned content that is not scheduled yet.</p>
                  </div>
                  <span>{drafts.length}</span>
                </header>

                <div className="mobile-scheduled-draft-list">
                  {visibleDrafts.map((draft) => (
                    <article key={draft.id} className="mobile-scheduled-draft">
                      <span className="mobile-scheduled-draft-icon" aria-hidden="true">
                        <NotePencil size={20} weight="duotone" />
                      </span>
                      <div>
                        <div className="mobile-scheduled-draft-meta">
                          <span><i aria-hidden="true" />Needs review</span>
                          <small>Suggested {formatSchedule(draft.scheduled_for)}</small>
                        </div>
                        <h3>{draftTitle(draft)}</h3>
                        <p>{draftCaption(draft)}</p>
                        <Link to={`/post?draftId=${draft.id}${draft.slot_date_local ? `&date=${draft.slot_date_local}` : ''}`}>
                          Review draft
                        </Link>
                      </div>
                    </article>
                  ))}
                </div>

                {drafts.length > 4 ? (
                  <button type="button" className="mobile-scheduled-show-more" onClick={() => setShowAllDrafts((current) => !current)}>
                    {showAllDrafts ? <CaretUp size={16} /> : <CaretDown size={16} />}
                    {showAllDrafts ? 'Show fewer drafts' : `Show ${hiddenDraftCount} more ${hiddenDraftCount === 1 ? 'draft' : 'drafts'}`}
                  </button>
                ) : null}
              </section>
            ) : null}
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
              <p>{hasScheduledPosts || hasDrafts ? 'Tell me what you want to review, move, edit, or add.' : 'Tell me what you want to promote this week.'}</p>
            </div>
          </div>
        ) : null}
      </MobilePartnerChat>
    </div>
  )
}
