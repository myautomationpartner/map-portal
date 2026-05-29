import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  FileText,
  Inbox,
  Megaphone,
  MessageSquare,
  PenLine,
  Sparkles,
  Star,
} from 'lucide-react'
import {
  applyTodayQueueState,
  buildTodayPriorityQueue,
  buildTodayPriorityQueueFromPortalData,
  filterTodayPriorityQueue,
  normalizeTodayQueueState,
  summarizeTodayPriorityQueue,
  updateTodayQueueState,
} from '../lib/todayPriorityQueue'
import {
  fetchCalendarPosts,
  fetchInboxCommentBundles,
  fetchInboxCommentPosts,
  fetchInboxConversations,
  fetchOpportunityRadar,
  fetchProfile,
  fetchSecureVaultDocuments,
  fetchSocialDrafts,
  fetchWorkspacePreferences,
  saveTodayQueueState,
} from '../lib/portalApi'

const sourceLinks = {
  Inbox: '/inbox',
  Posts: '/calendar',
  Campaign: '/campaigns',
  Files: '/documents',
  Idea: '/post',
  Partner: '/calendar',
  Reviews: '/inbox',
  System: '/settings',
  Automation: '/settings',
}

const iconMap = {
  mary: MessageSquare,
  approve: FileText,
  campaign: Megaphone,
  failed: AlertTriangle,
  file: FileText,
  alex: Inbox,
  review: Star,
  ideas: PenLine,
  weekly: Sparkles,
  done: CheckCircle2,
}

const sourceIconMap = {
  Inbox: MessageSquare,
  Posts: FileText,
  Campaign: Megaphone,
  Files: FileText,
  Idea: PenLine,
  Partner: Sparkles,
  Reviews: Star,
  System: AlertTriangle,
  Automation: CheckCircle2,
}

function formatTodayLabel() {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  }).format(new Date())
}

function Metric({ value, label, delta }) {
  return (
    <div className="today-metric">
      <strong>{value}</strong>
      <span>{label}</span>
      <small>{delta || ''}</small>
    </div>
  )
}

function PriorityBadge({ priority, tone }) {
  return (
    <span className={`today-priority today-priority-${tone || 'neutral'}`}>
      {priority}
    </span>
  )
}

function QueueRow({ item, active, snoozed, onSelect }) {
  const Icon = iconMap[item.id] || sourceIconMap[item.source] || FileText
  return (
    <button
      type="button"
      className={`today-row ${active ? 'is-active' : ''} ${item.completed ? 'is-complete' : ''} ${snoozed ? 'is-snoozed' : ''}`}
      onClick={() => onSelect(item.id)}
    >
      <span className="today-row-priority">
        <PriorityBadge priority={item.priority} tone={item.tone} />
      </span>
      <span className="today-row-work">
        <strong>{item.title}</strong>
        <small>{item.description}</small>
        <span className="today-row-meta">
          <Icon className="today-row-icon" aria-hidden="true" />
          {item.sourceDetail} · {item.minutes}
        </span>
      </span>
      <span className="today-row-source">
        <strong>{item.source}</strong>
        <small>{item.sourceDetail}</small>
      </span>
      <span className="today-row-due">{snoozed ? 'Later' : item.due}</span>
      <span className="today-row-action">{item.completed ? 'Done' : item.actionLabel}</span>
    </button>
  )
}

function SuggestedMovePanel({ item, busy, snoozed, onDoIt, onComplete, onSnooze }) {
  if (!item) {
    return (
      <aside className="today-suggested today-suggested-empty portal-panel">
        <div>
          <CheckCircle2 aria-hidden="true" />
          <h2 className="font-display">No work needs you today</h2>
          <p>New customer replies, same-day publishing work, and urgent fixes will appear here when they need attention.</p>
          <div className="today-action-grid">
            <a className="portal-button-secondary today-secondary-action" href="/inbox">Open Inbox</a>
            <a className="portal-button-secondary today-secondary-action" href="/calendar">Open Content Plan</a>
          </div>
        </div>
      </aside>
    )
  }

  const sourceHref = item.targetHref || sourceLinks[item.source] || '/'
  return (
    <aside className="today-suggested portal-panel">
      <div className="today-suggested-header">
        <h2 className="font-display">{item.title}</h2>
        <PriorityBadge priority={item.priority} tone={item.tone} />
      </div>

      <section className="today-detail-block today-detail-compact">
        <div className="today-compact-note">
          <strong>Why</strong>
          <span>{item.why}</span>
        </div>
        <div className="today-compact-note is-action">
          <strong>Move</strong>
          <span>{item.suggestedAction}</span>
        </div>
        <div className="today-move-stats">
          <div><strong>{item.confidence}</strong><span>confidence</span></div>
          <div><strong>{item.steps}</strong><span>safe steps</span></div>
          <div><strong>{item.risk}</strong><span>risk</span></div>
        </div>
        <div className="today-action-grid">
          <button
            type="button"
            className="portal-button-primary today-do-button"
            onClick={() => onDoIt(item)}
            disabled={item.completed}
          >
            Do it
          </button>
          <button
            type="button"
            className={`portal-button-secondary today-secondary-action ${item.completed ? 'is-complete' : ''}`}
            onClick={() => onComplete(item.id)}
            disabled={item.completed || busy}
          >
            {item.completed ? 'Done' : 'Mark done'}
          </button>
          <a className="portal-button-secondary today-secondary-action" href={sourceHref}>
            Open source
          </a>
          <button
            type="button"
            className="portal-button-secondary today-secondary-action"
            onClick={() => onSnooze(item.id)}
            disabled={item.completed || snoozed || busy}
          >
            {snoozed ? 'Snoozed' : 'Snooze'}
          </button>
        </div>
        <p className="today-action-note">
          Phase 1 updates this Today view and links to the source portal surface.
        </p>
      </section>

      <section className="today-detail-block">
        <span className="today-label">Trace</span>
        <div className="today-trace">
          {(item.completed ? item.trace : ['Waiting for owner action']).map((line, index) => (
            <div className="today-trace-item" key={`${line}-${index}`}>
              <span aria-hidden="true" />
              <div>
                <strong>{line}</strong>
                <small>{item.completed ? `Today 9:${42 + index} AM` : 'No action executed yet'}</small>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="today-detail-block">
        <div className="today-chip-list">
          {item.chips.map((chip) => <span className="portal-chip today-chip" key={chip}>{chip}</span>)}
        </div>
      </section>
    </aside>
  )
}

export default function Today() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [selectedId, setSelectedId] = useState('mary')
  const [activeFilter, setActiveFilter] = useState('priority')
  const [draftTodayState, setDraftTodayState] = useState(null)
  const [toast, setToast] = useState('')
  const todayLabel = useMemo(() => formatTodayLabel(), [])
  const fallbackQueue = useMemo(() => buildTodayPriorityQueue(), [])

  const { data: profile } = useQuery({ queryKey: ['profile'], queryFn: fetchProfile })
  const clientId = profile?.client_id
  const userId = profile?.id
  const { data: workspacePreference } = useQuery({
    queryKey: ['workspace-preferences', clientId, userId],
    queryFn: () => fetchWorkspacePreferences(clientId, userId),
    enabled: Boolean(clientId && userId),
  })
  const { data: conversations = [] } = useQuery({
    queryKey: ['today-inbox-conversations', clientId],
    queryFn: () => fetchInboxConversations({ status: 'open', limit: 8 }),
    enabled: Boolean(clientId),
    retry: 1,
    refetchInterval: 20_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  })
  const { data: commentPostsPayload } = useQuery({
    queryKey: ['today-comment-posts', clientId],
    queryFn: () => fetchInboxCommentPosts({ limit: 30 }),
    enabled: Boolean(clientId),
    retry: 1,
    refetchInterval: 20_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  })
  const commentPosts = useMemo(
    () => commentPostsPayload?.posts || [],
    [commentPostsPayload],
  )
  const commentBundleKey = useMemo(() => (
    commentPosts.map((post) => `${post.accountId}:${post.id}:${post.commentCount}`).join('|')
  ), [commentPosts])
  const { data: commentBundles = [] } = useQuery({
    queryKey: ['today-comment-bundles', clientId, commentBundleKey],
    queryFn: () => fetchInboxCommentBundles(commentPosts, { limit: 12 }),
    enabled: Boolean(clientId && commentPosts.length),
    retry: 1,
    refetchInterval: 20_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  })
  const { data: socialDrafts = [] } = useQuery({
    queryKey: ['social-drafts', clientId],
    queryFn: () => fetchSocialDrafts(clientId),
    enabled: Boolean(clientId),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  })
  const { data: calendarPosts = [] } = useQuery({
    queryKey: ['calendar-posts', clientId],
    queryFn: () => fetchCalendarPosts(clientId),
    enabled: Boolean(clientId),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  })
  const { data: opportunities = [] } = useQuery({
    queryKey: ['opportunity-radar', clientId],
    queryFn: () => fetchOpportunityRadar(clientId),
    enabled: Boolean(clientId),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  })
  const { data: documents = [] } = useQuery({
    queryKey: ['today-secure-documents', clientId],
    queryFn: fetchSecureVaultDocuments,
    enabled: Boolean(clientId),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  })
  const persistedTodayState = useMemo(
    () => normalizeTodayQueueState(draftTodayState || workspacePreference?.today_queue_state_json),
    [draftTodayState, workspacePreference?.today_queue_state_json],
  )
  const liveQueue = useMemo(
    () => buildTodayPriorityQueueFromPortalData({
      conversations,
      commentBundles,
      socialDrafts,
      calendarPosts,
      opportunities,
      documents,
      fallbackQueue,
    }),
    [calendarPosts, commentBundles, conversations, documents, fallbackQueue, opportunities, socialDrafts],
  )
  const queue = useMemo(
    () => applyTodayQueueState(liveQueue, persistedTodayState),
    [liveQueue, persistedTodayState],
  )
  const filteredQueue = useMemo(
    () => filterTodayPriorityQueue(queue, activeFilter),
    [activeFilter, queue],
  )
  const summary = useMemo(() => summarizeTodayPriorityQueue(queue), [queue])
  const selectedItem = filteredQueue.find((item) => item.id === selectedId) || filteredQueue[0] || null
  const selectedSnoozed = Boolean(selectedItem?.snoozed)
  const saveStateMutation = useMutation({
    mutationFn: (nextState) => saveTodayQueueState({ clientId, userId, todayQueueState: nextState }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['workspace-preferences', clientId, userId] })
    },
    onError: (error) => {
      setToast(error?.message || 'Could not save Today state.')
      window.setTimeout(() => setToast(''), 2600)
    },
  })

  function persistTodayState(nextState) {
    setDraftTodayState(nextState)
    if (!clientId || !userId) return
    saveStateMutation.mutate(nextState)
  }

  function handleDoIt(item) {
    if (!item?.targetHref) return
    navigate(item.targetHref)
  }

  function handleComplete(itemId) {
    const item = queue.find((entry) => entry.id === itemId)
    if (!item || item.completed) return

    const nextState = updateTodayQueueState(persistedTodayState, itemId, 'done')
    persistTodayState(nextState)
    setToast(`${item.title}: move completed`)
    window.setTimeout(() => setToast(''), 2200)
  }

  function handleSnooze(itemId) {
    const item = queue.find((entry) => entry.id === itemId)
    if (!item || item.completed || item.snoozed) return

    const nextState = updateTodayQueueState(persistedTodayState, itemId, 'snoozed')
    persistTodayState(nextState)
    setToast(`${item.title}: snoozed`)
    window.setTimeout(() => setToast(''), 2200)
  }

  return (
    <div className="today-page portal-page">
      <section className="today-context-strip portal-surface">
        <div className="today-context-title">
          <h1 className="font-display">Today</h1>
          <span><CalendarDays aria-hidden="true" /> {todayLabel}</span>
          <span className="today-live-dot">Sort: Priority</span>
        </div>
        <section className="today-metrics" aria-label="Today metrics">
          <Metric value={summary.needsHuman} label="Needs human" delta={summary.needsHuman === '05' ? 'Down 1' : ''} />
          <Metric value={summary.readyToApprove} label="Ready to approve" />
          <Metric value={summary.openContent} label="Open content" />
          <Metric value={summary.publishRisks} label="Publish risks" />
          <Metric value={summary.clearTime} label="Est. clear time" delta={summary.clearTime === '14m' ? 'Down 4m' : ''} />
        </section>
      </section>

      <div className="today-layout">
        <section className="today-queue portal-panel">
          <div className="today-queue-header">
            <h2 className="font-display">Priority queue</h2>
            <div className="today-filter-row" aria-label="Priority filters">
              <button
                type="button"
                data-active={activeFilter === 'priority'}
                aria-pressed={activeFilter === 'priority'}
                onClick={() => setActiveFilter('priority')}
              >
                Priority
              </button>
              <button
                type="button"
                data-active={activeFilter === 'needs'}
                aria-pressed={activeFilter === 'needs'}
                onClick={() => setActiveFilter('needs')}
              >
                Needs Me
              </button>
              <button
                type="button"
                data-active={activeFilter === 'ready'}
                aria-pressed={activeFilter === 'ready'}
                onClick={() => setActiveFilter('ready')}
              >
                Ready
              </button>
              <button
                type="button"
                data-active={activeFilter === 'risks'}
                aria-pressed={activeFilter === 'risks'}
                onClick={() => setActiveFilter('risks')}
              >
                Risks
              </button>
            </div>
          </div>
          <div className="today-table-head" aria-hidden="true">
            <span>Priority</span>
            <span>Work</span>
            <span>Source</span>
            <span>Due</span>
            <span>Next action</span>
          </div>
          <div className="today-row-list">
            {filteredQueue.map((item) => (
              <QueueRow
                key={item.id}
                item={item}
                active={item.id === selectedItem?.id}
                snoozed={Boolean(item.snoozed)}
                onSelect={setSelectedId}
              />
            ))}
            {!filteredQueue.length ? (
              <div className="today-empty-filter">
                <strong>No work in this view.</strong>
                <span>Switch back to Priority to see the full queue.</span>
              </div>
            ) : null}
          </div>
          <footer className="today-queue-footer">
            <span>Showing {filteredQueue.length} of {queue.length}</span>
            <span className="today-live-dot">Updated just now</span>
          </footer>
        </section>

        <SuggestedMovePanel
          item={selectedItem}
          busy={saveStateMutation.isPending}
          snoozed={selectedSnoozed}
          onDoIt={handleDoIt}
          onComplete={handleComplete}
          onSnooze={handleSnooze}
        />
      </div>

      {toast ? <div className="today-toast">{toast}</div> : null}
    </div>
  )
}
