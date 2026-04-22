import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { AlertCircle, ArrowLeft, CalendarDays, Clock3, Loader2, PencilLine, Trash2 } from 'lucide-react'
import { deletePost, fetchProfile, fetchScheduledPosts, reconcileScheduledPosts } from '../lib/portalApi'

const N8N_BASE = import.meta.env.VITE_N8N_BASE_URL || 'https://n8n.myautomationpartner.com'

function isMissingRemoteDelete(payload, raw) {
  const message = [
    payload?.message,
    payload?.error,
    raw,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  return message.includes('404') && message.includes('post not found')
}

function getDatePartsForZone(value, timeZone) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const parts = Object.fromEntries(formatter.formatToParts(value).map((part) => [part.type, part.value]))
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  }
}

function formatDetailedDateTime(value) {
  if (!value) return 'No schedule time'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'No schedule time'

  try {
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(date)
  } catch {
    return value
  }
}

export default function ScheduledPosts() {
  const queryClient = useQueryClient()
  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ['profile'],
    queryFn: fetchProfile,
  })

  const clientId = profile?.client_id
  const timezone = profile?.clients?.timezone || 'America/New_York'
  const [deleteBusyId, setDeleteBusyId] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  const { data: scheduledPosts = [], isLoading: postsLoading } = useQuery({
    queryKey: ['calendar-posts', clientId],
    queryFn: async () => {
      await reconcileScheduledPosts(clientId)
      return fetchScheduledPosts(clientId)
    },
    enabled: !!clientId,
  })

  const upcomingScheduledPosts = useMemo(() => (
    scheduledPosts
      .filter((post) => post.status === 'scheduled')
      .flatMap((post) => {
        if (!post?.scheduled_for) return []
        try {
          const parts = getDatePartsForZone(new Date(post.scheduled_for), timezone)
          return [{
            ...post,
            localDate: parts.date,
            localTime: parts.time,
          }]
        } catch {
          return []
        }
      })
  ), [scheduledPosts, timezone])

  async function handleDeleteScheduledPost(post) {
    if (!post?.id) return
    if (!window.confirm('Delete this scheduled post? This will also try to cancel it in the publisher workflow.')) return

    try {
      setDeleteBusyId(post.id)
      setErrorMsg('')

      if (post.n8n_execution_id) {
        const response = await fetch(`${N8N_BASE}/webhook/social-publish`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'delete',
            postId: post.id,
            clientId,
            zernioPostId: post.n8n_execution_id,
          }),
        })
        const raw = await response.text()
        let payload = {}
        try {
          payload = raw ? JSON.parse(raw) : {}
        } catch {
          payload = {}
        }

        if (!response.ok || payload?.success === false) {
          if (!isMissingRemoteDelete(payload, raw)) {
            throw new Error(payload?.message || raw || 'Could not delete this scheduled post.')
          }
        }
      }

      await deletePost(post.id)
      await queryClient.invalidateQueries({ queryKey: ['calendar-posts', clientId] })
    } catch (error) {
      setErrorMsg(error.message || 'Could not delete this scheduled post.')
    } finally {
      setDeleteBusyId('')
    }
  }

  if (profileLoading || postsLoading) {
    return (
      <div className="portal-page flex min-h-[60vh] items-center justify-center">
        <div className="portal-surface rounded-[28px] p-6">
          <Loader2 className="h-8 w-8 animate-spin text-[var(--portal-primary)]" />
        </div>
      </div>
    )
  }

  return (
    <div className="portal-page mx-auto max-w-[1280px] space-y-6 md:p-6 xl:p-8">
      <div>
        <Link
          to="/post"
          className="inline-flex items-center gap-2 text-sm font-medium transition-colors"
          style={{ color: 'var(--portal-text-muted)' }}
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Publisher
        </Link>
      </div>

      <section className="portal-surface rounded-[36px] p-5 md:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em]" style={{ color: 'var(--portal-text-soft)' }}>
              Scheduled posts
            </p>
            <h1 className="mt-2 font-display text-2xl font-semibold" style={{ color: 'var(--portal-text)' }}>
              Upcoming scheduled posts
            </h1>
            <p className="mt-2 text-sm" style={{ color: 'var(--portal-text-muted)' }}>
              Open any scheduled post to edit its caption or scheduled time in the publisher.
            </p>
          </div>

          <div
            className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold"
            style={{ background: 'rgba(201,168,76,0.12)', color: 'var(--portal-primary)', border: '1px solid rgba(201,168,76,0.22)' }}
          >
            <CalendarDays className="h-4 w-4" />
            {upcomingScheduledPosts.length} scheduled
          </div>
        </div>
      </section>

      {errorMsg && (
        <div className="portal-status-danger flex items-start gap-3 rounded-2xl px-5 py-4">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <p className="text-sm">{errorMsg}</p>
        </div>
      )}

      {upcomingScheduledPosts.length > 0 ? (
        <div className="grid gap-4">
          {upcomingScheduledPosts.map((post) => (
            <section
              key={post.id}
              className="rounded-[28px] p-5 md:p-6"
              style={{ background: 'rgba(255,255,255,0.9)', border: '1px solid var(--portal-border)', boxShadow: 'var(--portal-shadow-soft)' }}
            >
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className="inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]"
                      style={{ background: 'rgba(55, 181, 140, 0.12)', color: '#2d876a', borderColor: 'rgba(55, 181, 140, 0.2)' }}
                    >
                      Scheduled
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium" style={{ color: 'var(--portal-text-muted)' }}>
                      <Clock3 className="h-3.5 w-3.5" />
                      {formatDetailedDateTime(post.scheduled_for)}
                    </span>
                  </div>

                  <p className="mt-3 text-sm font-semibold" style={{ color: 'var(--portal-text)' }}>
                    {(post.platforms || []).join(', ') || 'No platforms'}
                  </p>

                  <p className="mt-3 text-sm leading-relaxed" style={{ color: 'var(--portal-text-muted)' }}>
                    {post.content}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-3">
                  <Link
                    to={`/post?editPost=${post.id}&date=${post.localDate}`}
                    className="inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold"
                    style={{ background: 'linear-gradient(135deg, var(--portal-primary), #ddc275)', color: 'var(--portal-dark)' }}
                  >
                    <PencilLine className="h-4 w-4" />
                    Edit post
                  </Link>
                  <button
                    type="button"
                    onClick={() => handleDeleteScheduledPost(post)}
                    disabled={deleteBusyId === post.id}
                    className="inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold disabled:opacity-60"
                    style={{ background: 'rgba(196, 85, 110, 0.10)', color: '#b44660', border: '1px solid rgba(196, 85, 110, 0.18)' }}
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </button>
                </div>
              </div>
            </section>
          ))}
        </div>
      ) : (
        <section
          className="rounded-[28px] p-8 text-center"
          style={{ background: 'rgba(255,255,255,0.9)', border: '1px solid var(--portal-border)', boxShadow: 'var(--portal-shadow-soft)' }}
        >
          <p className="text-base font-semibold" style={{ color: 'var(--portal-text)' }}>
            No scheduled posts yet
          </p>
          <p className="mt-2 text-sm" style={{ color: 'var(--portal-text-muted)' }}>
            Scheduled posts will appear here once they are approved and queued.
          </p>
        </section>
      )}
    </div>
  )
}
