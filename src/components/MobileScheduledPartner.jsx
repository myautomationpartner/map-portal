import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  CaretDown,
  CaretUp,
  CalendarBlank,
  DotsThree,
  FacebookLogo,
  InstagramLogo,
  Trash,
  XLogo,
} from '@phosphor-icons/react'
import MobilePartnerTopBar from './MobilePartnerTopBar'
import MobilePartnerChat from './MobilePartnerChat'
import { getDraftMediaRefs } from '../lib/campaignDraftAssets'

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

function scheduleDate(value) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function formatScheduleDay(value) {
  const date = scheduleDate(value)
  if (!date) return 'Date unavailable'

  const today = new Date()
  const tomorrow = new Date(today)
  tomorrow.setDate(today.getDate() + 1)
  const dateKey = date.toDateString()

  if (dateKey === today.toDateString()) return 'Today'
  if (dateKey === tomorrow.toDateString()) return 'Tomorrow'
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  }).format(date)
}

function formatScheduleTime(value) {
  const date = scheduleDate(value)
  if (!date) return 'Time unavailable'
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

function postMedia(post) {
  return post?.media_url || post?.image_url || post?.thumbnail_url || ''
}

function draftPath(draft) {
  return `/post?draftId=${draft.id}${draft.slot_date_local ? `&date=${draft.slot_date_local}` : ''}`
}

function draftMediaState(draft, previews, previewsLoading) {
  const ref = getDraftMediaRefs(draft).find((candidate) => candidate.url || candidate.thumbnail || candidate.documentId)
  const preview = previews?.[draft.id]
  const url = preview?.url || ref?.thumbnail || ref?.url || ''

  if (url) return { url, status: 'ready', label: 'Needs review' }
  if (ref?.documentId && previewsLoading) return { url: '', status: 'loading', label: 'Loading image' }
  if (ref) return { url: '', status: 'unavailable', label: 'Image unavailable' }
  return { url: '', status: 'missing', label: 'Image not created yet' }
}

function editPostPath(post) {
  return `/post?editPost=${post.id}${post.localDate ? `&date=${post.localDate}` : ''}`
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

function MediaThumbnail({ src, alt, className = '', placeholderLabel = 'No image added yet' }) {
  if (src) return <img className={className} src={src} alt={alt} />

  return (
    <span className={`${className} mobile-scheduled-media-placeholder`} aria-label={placeholderLabel}>
      <img src="/assets/map-option-b-mark.png" alt="" />
      <small>{placeholderLabel}</small>
    </span>
  )
}

function PostOverflowMenu({ post, isOpen, deletingId, onToggle, onDelete }) {
  return (
    <div className="mobile-scheduled-overflow">
      <button
        type="button"
        className="mobile-scheduled-overflow-trigger"
        aria-label={`More options for post scheduled ${formatSchedule(post.scheduled_for)}`}
        aria-expanded={isOpen}
        onClick={onToggle}
      >
        <DotsThree size={22} weight="bold" />
      </button>
      {isOpen ? (
        <div className="mobile-scheduled-overflow-menu">
          <button type="button" disabled={deletingId === post.id} onClick={() => onDelete?.(post)}>
            <Trash size={17} />{deletingId === post.id ? 'Deleting' : 'Delete post'}
          </button>
        </div>
      ) : null}
    </div>
  )
}

export default function MobileScheduledPartner({
  posts = [],
  drafts = [],
  draftMediaPreviews = {},
  draftMediaPreviewsLoading = false,
  loading = false,
  deletingId = '',
  onDelete,
  error = '',
  readOnly = false,
  inboxUnreadCount = 0,
}) {
  const navigate = useNavigate()
  const [showAllDrafts, setShowAllDrafts] = useState(false)
  const [draftsExpanded, setDraftsExpanded] = useState(false)
  const [openMenuId, setOpenMenuId] = useState('')
  const visibleDrafts = showAllDrafts ? drafts : drafts.slice(0, 4)
  const hiddenDraftCount = Math.max(0, drafts.length - visibleDrafts.length)
  const hasScheduledPosts = posts.length > 0
  const hasDrafts = drafts.length > 0
  const orderedPosts = [...posts].sort((left, right) => (
    (scheduleDate(left?.scheduled_for)?.getTime() || 0) - (scheduleDate(right?.scheduled_for)?.getTime() || 0)
  ))
  const nextPost = orderedPosts[0] || null
  const laterPostGroups = orderedPosts.slice(1).reduce((groups, post) => {
    const label = formatScheduleDay(post.scheduled_for)
    const existing = groups.find((group) => group.label === label)
    if (existing) existing.posts.push(post)
    else groups.push({ label, posts: [post] })
    return groups
  }, [])
  const draftsAreVisible = !hasScheduledPosts || draftsExpanded

  return (
    <div className="mobile-scheduled-partner">
      <MobilePartnerTopBar activeMode="scheduled" inboxUnreadCount={inboxUnreadCount} />

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
                <div className="mobile-scheduled-timeline">
                  <article className="mobile-scheduled-next-card">
                    <Link to={editPostPath(nextPost)} className="mobile-scheduled-next-link" aria-label={`Open next post, scheduled ${formatSchedule(nextPost.scheduled_for)}`}>
                      <div className="mobile-scheduled-next-media">
                        <MediaThumbnail src={postMedia(nextPost)} alt="Media for the next scheduled social post" />
                        <span>Next to publish</span>
                      </div>
                      <div className="mobile-scheduled-next-content">
                        <div className="mobile-scheduled-next-time">
                          <strong>{formatScheduleDay(nextPost.scheduled_for)}</strong>
                          <span>{formatScheduleTime(nextPost.scheduled_for)}</span>
                        </div>
                        <PlatformIcons platforms={nextPost.platforms} />
                        <p>{nextPost.content || 'Open this post to review its caption.'}</p>
                        <span className="mobile-scheduled-open-label">Open post</span>
                      </div>
                    </Link>
                    <PostOverflowMenu
                      post={nextPost}
                      isOpen={openMenuId === nextPost.id}
                      deletingId={deletingId}
                      onToggle={() => setOpenMenuId((current) => current === nextPost.id ? '' : nextPost.id)}
                      onDelete={onDelete}
                    />
                  </article>

                  {laterPostGroups.map((group) => (
                    <section key={group.label} className="mobile-scheduled-day-group" aria-label={`${group.label} scheduled posts`}>
                      <div className="mobile-scheduled-day-heading">
                        <h3>{group.label}</h3>
                        <span>{group.posts.length} {group.posts.length === 1 ? 'post' : 'posts'}</span>
                      </div>
                      <div className="mobile-scheduled-compact-list">
                        {group.posts.map((post) => (
                          <article key={post.id} className="mobile-scheduled-compact-card">
                            <Link to={editPostPath(post)} className="mobile-scheduled-compact-link" aria-label={`Open post scheduled ${formatSchedule(post.scheduled_for)}`}>
                              <MediaThumbnail className="mobile-scheduled-compact-media" src={postMedia(post)} alt="Media for scheduled social post" />
                              <span className="mobile-scheduled-compact-content">
                                <span className="mobile-scheduled-compact-meta">
                                  <strong>{formatScheduleTime(post.scheduled_for)}</strong>
                                  <PlatformIcons platforms={post.platforms} />
                                </span>
                                <span className="mobile-scheduled-compact-caption">{post.content || 'Open this post to review its caption.'}</span>
                                <span className="mobile-scheduled-status"><i aria-hidden="true" />Ready</span>
                              </span>
                            </Link>
                            <PostOverflowMenu
                              post={post}
                              isOpen={openMenuId === post.id}
                              deletingId={deletingId}
                              onToggle={() => setOpenMenuId((current) => current === post.id ? '' : post.id)}
                              onDelete={onDelete}
                            />
                          </article>
                        ))}
                      </div>
                    </section>
                  ))}
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
              <section className="mobile-scheduled-group mobile-scheduled-drafts-group" aria-labelledby="mobile-scheduled-drafts-heading">
                <button
                  type="button"
                  className="mobile-scheduled-drafts-toggle"
                  disabled={!hasScheduledPosts}
                  aria-expanded={draftsAreVisible}
                  aria-controls="mobile-scheduled-drafts-list"
                  onClick={() => hasScheduledPosts && setDraftsExpanded((current) => !current)}
                >
                  <div>
                    <h2 id="mobile-scheduled-drafts-heading">Drafts to review</h2>
                    <p>{hasScheduledPosts ? 'Planned content waiting for you.' : 'Nothing is queued yet. Start with one of these.'}</p>
                  </div>
                  <span className="mobile-scheduled-drafts-count">{drafts.length}</span>
                  {hasScheduledPosts ? (draftsAreVisible ? <CaretUp size={18} /> : <CaretDown size={18} />) : null}
                </button>

                {draftsAreVisible ? (
                  <div id="mobile-scheduled-drafts-list">
                    <div className="mobile-scheduled-draft-list">
                      {visibleDrafts.map((draft) => {
                        const media = draftMediaState(draft, draftMediaPreviews, draftMediaPreviewsLoading)
                        return (
                          <article key={draft.id} className="mobile-scheduled-draft">
                            <MediaThumbnail
                              className="mobile-scheduled-draft-media"
                              src={media.url}
                              alt="Media selected for this social draft"
                              placeholderLabel={media.label}
                            />
                            <div>
                              <div className="mobile-scheduled-draft-meta">
                                <span data-media-status={media.status}><i aria-hidden="true" />{media.label}</span>
                                <small>{formatScheduleDay(draft.scheduled_for)}</small>
                              </div>
                              <h3>{draftTitle(draft)}</h3>
                              <p>{draftCaption(draft)}</p>
                              <Link to={draftPath(draft)}>
                                {media.status === 'missing' ? 'Add or create image' : 'Review draft'}
                              </Link>
                            </div>
                          </article>
                        )
                      })}
                    </div>

                    {drafts.length > 4 ? (
                      <button type="button" className="mobile-scheduled-show-more" onClick={() => setShowAllDrafts((current) => !current)}>
                        {showAllDrafts ? <CaretUp size={16} /> : <CaretDown size={16} />}
                        {showAllDrafts ? 'Show fewer drafts' : `Show ${hiddenDraftCount} more ${hiddenDraftCount === 1 ? 'draft' : 'drafts'}`}
                      </button>
                    ) : null}
                  </div>
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
