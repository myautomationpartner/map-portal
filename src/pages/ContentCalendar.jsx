import { useMemo, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarDays, CheckCircle2, Clock3, Loader2, Plus, RefreshCw, Sparkles } from 'lucide-react'
import {
  createSocialDrafts,
  fetchProfile,
  fetchScheduledPosts,
  fetchSocialDrafts,
} from '../lib/portalApi'
import { buildCalendarModel, buildDraftPayload } from '../lib/socialPlanner'

const STATE_STYLES = {
  occupied_planned: {
    label: 'Planned',
    background: 'rgba(55, 181, 140, 0.12)',
    color: '#2d876a',
    border: 'rgba(55, 181, 140, 0.2)',
  },
  occupied_draft: {
    label: 'Draft Saved',
    background: 'rgba(201, 168, 76, 0.14)',
    color: '#8c6d1c',
    border: 'rgba(201, 168, 76, 0.22)',
  },
  recommended_fill: {
    label: 'Recommended',
    background: 'rgba(93, 120, 255, 0.12)',
    color: '#4058c9',
    border: 'rgba(93, 120, 255, 0.2)',
  },
  unavailable_constraint_blocked: {
    label: 'Blocked',
    background: 'rgba(26, 24, 20, 0.08)',
    color: '#5e554d',
    border: 'rgba(26, 24, 20, 0.14)',
  },
}

function SummaryCard({ title, value, hint }) {
  return (
    <div
      className="rounded-[28px] p-5"
      style={{
        background: 'rgba(255,255,255,0.9)',
        border: '1px solid var(--portal-border)',
        boxShadow: 'var(--portal-shadow-soft)',
      }}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em]" style={{ color: 'var(--portal-text-soft)' }}>
        {title}
      </p>
      <p className="mt-3 font-display text-3xl font-semibold" style={{ color: 'var(--portal-text)' }}>
        {value}
      </p>
      <p className="mt-2 text-sm" style={{ color: 'var(--portal-text-muted)' }}>
        {hint}
      </p>
    </div>
  )
}

function SlotCard({ slot, onSave, isSaving }) {
  const stateStyle = STATE_STYLES[slot.state]
  const canSave = slot.state === 'recommended_fill' && slot.post_type

  return (
    <article
      className="rounded-[28px] p-5"
      style={{
        background: 'rgba(255,255,255,0.92)',
        border: '1px solid var(--portal-border)',
        boxShadow: 'var(--portal-shadow-soft)',
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: 'var(--portal-text-soft)' }}>
            {slot.slot_label.replace(/_/g, ' ')}
          </p>
          <h3 className="mt-2 font-display text-xl font-semibold" style={{ color: 'var(--portal-text)' }}>
            {slot.slot_start_local} - {slot.slot_end_local}
          </h3>
        </div>
        <span
          className="inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]"
          style={{
            background: stateStyle.background,
            color: stateStyle.color,
            borderColor: stateStyle.border,
          }}
        >
          {stateStyle.label}
        </span>
      </div>

      <p className="mt-4 text-sm font-medium" style={{ color: 'var(--portal-text)' }}>
        {slot.post_type ? slot.post_type.replace(/_/g, ' ') : 'No post type selected'}
      </p>
      <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--portal-text-muted)' }}>
        {slot.explanation}
      </p>

      {canSave && (
        <button
          type="button"
          onClick={() => onSave(slot)}
          disabled={isSaving}
          className="mt-5 inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-60"
          style={{
            background: 'linear-gradient(135deg, var(--portal-primary), #e8d5a0)',
            color: 'var(--portal-dark)',
          }}
        >
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Save Draft Slot
        </button>
      )}
    </article>
  )
}

function SavedDraftRow({ draft }) {
  return (
    <div
      className="flex flex-col gap-3 rounded-[24px] p-4 md:flex-row md:items-center md:justify-between"
      style={{ background: 'rgba(255,255,255,0.88)', border: '1px solid var(--portal-border)' }}
    >
      <div>
        <p className="text-sm font-semibold" style={{ color: 'var(--portal-text)' }}>
          {draft.draft_title || draft.post_type.replace(/_/g, ' ')}
        </p>
        <p className="mt-1 text-xs uppercase tracking-[0.18em]" style={{ color: 'var(--portal-text-soft)' }}>
          {draft.slot_date_local} · {draft.slot_label.replace(/_/g, ' ')} · {draft.review_state.replace(/_/g, ' ')}
        </p>
      </div>
      <span
        className="inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]"
        style={{
          background: 'rgba(201, 168, 76, 0.12)',
          color: '#8c6d1c',
          borderColor: 'rgba(201, 168, 76, 0.18)',
        }}
      >
        {draft.post_type.replace(/_/g, ' ')}
      </span>
    </div>
  )
}

export default function ContentCalendar() {
  useOutletContext()

  const queryClient = useQueryClient()
  const [actionError, setActionError] = useState('')

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ['profile'],
    queryFn: fetchProfile,
  })

  const clientId = profile?.client_id

  const { data: scheduledPosts = [], isLoading: postsLoading, refetch: refetchPosts, isRefetching: isRefetchingPosts } = useQuery({
    queryKey: ['calendar-posts', clientId],
    queryFn: () => fetchScheduledPosts(clientId),
    enabled: !!clientId,
  })

  const { data: drafts = [], isLoading: draftsLoading, refetch: refetchDrafts, isRefetching: isRefetchingDrafts } = useQuery({
    queryKey: ['social-drafts', clientId],
    queryFn: () => fetchSocialDrafts(clientId),
    enabled: !!clientId,
  })

  const calendar = useMemo(() => {
    if (!profile) return null
    try {
      return buildCalendarModel(profile, scheduledPosts, drafts)
    } catch (error) {
      return { error }
    }
  }, [profile, scheduledPosts, drafts])

  const saveDrafts = useMutation({
    mutationFn: async (slots) => {
      const rows = slots.map((slot) => buildDraftPayload(profile, calendar.policy, slot))
      return createSocialDrafts(rows)
    },
    onSuccess: async () => {
      setActionError('')
      await queryClient.invalidateQueries({ queryKey: ['social-drafts', clientId] })
    },
    onError: (error) => {
      setActionError(error.message || 'Could not save draft slots.')
    },
  })

  const groupedSlots = useMemo(() => {
    if (!calendar?.slots) return []
    const byDate = new Map()
    for (const slot of calendar.slots) {
      if (!byDate.has(slot.slot_date_local)) byDate.set(slot.slot_date_local, [])
      byDate.get(slot.slot_date_local).push(slot)
    }
    return [...byDate.entries()]
  }, [calendar])

  const recommendedSlots = calendar?.slots?.filter((slot) => slot.state === 'recommended_fill' && slot.post_type) || []

  if (profileLoading || postsLoading || draftsLoading) {
    return (
      <div className="portal-page flex min-h-[60vh] items-center justify-center">
        <div className="portal-surface rounded-[28px] p-6">
          <Loader2 className="h-8 w-8 animate-spin text-[var(--portal-primary)]" />
        </div>
      </div>
    )
  }

  if (calendar?.error) {
    return (
      <div className="portal-page mx-auto max-w-[1100px] md:p-6 xl:p-8">
        <div className="portal-surface rounded-[32px] p-6">
          <p className="text-sm font-semibold uppercase tracking-[0.2em]" style={{ color: 'var(--portal-text-soft)' }}>
            Calendar unavailable
          </p>
          <p className="mt-3 text-base" style={{ color: 'var(--portal-text)' }}>
            {calendar.error.message}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="portal-page mx-auto max-w-[1480px] space-y-6 md:p-6 xl:p-8">
      <section className="portal-surface rounded-[36px] p-5 md:p-7">
        <div className="portal-page-header">
          <div className="max-w-3xl">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="portal-chip rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em]">
                Draft-only calendar
              </span>
            </div>
            <h1 className="portal-page-title font-display">Content Calendar</h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed" style={{ color: 'var(--portal-text-muted)' }}>
              Planner-driven recommendations and saved draft slots for {calendar.policy.plannerClientKey}. This
              workflow stores draft records only and does not call the publish webhook.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => {
                refetchPosts()
                refetchDrafts()
              }}
              disabled={isRefetchingPosts || isRefetchingDrafts}
              className="portal-button-secondary inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${(isRefetchingPosts || isRefetchingDrafts) ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button
              type="button"
              onClick={() => saveDrafts.mutate(recommendedSlots)}
              disabled={recommendedSlots.length === 0 || saveDrafts.isPending}
              className="portal-button-primary inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saveDrafts.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Fill My Week
            </button>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <SummaryCard
          title="Recommended"
          value={calendar.summary.recommendedCount}
          hint="Open slots that currently meet planner rules and weekly capacity."
        />
        <SummaryCard
          title="Saved Draft Slots"
          value={calendar.summary.occupiedDraftCount}
          hint="Draft placeholders already stored in Supabase."
        />
        <SummaryCard
          title="Scheduled Posts"
          value={calendar.summary.occupiedPlannedCount}
          hint="Existing scheduled content that already occupies preferred windows."
        />
      </section>

      <section
        className="rounded-[32px] p-5 md:p-7"
        style={{ background: 'rgba(255,255,255,0.9)', border: '1px solid var(--portal-border)', boxShadow: 'var(--portal-shadow-soft)' }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: 'var(--portal-text-soft)' }}>
              Planning horizon
            </p>
            <h2 className="mt-2 font-display text-2xl font-semibold" style={{ color: 'var(--portal-text)' }}>
              Next {calendar.policy.planningHorizonDays} days
            </h2>
          </div>
          <Link to="/post" className="inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold"
            style={{ background: 'rgba(201, 168, 76, 0.1)', color: 'var(--portal-primary)' }}>
            <CheckCircle2 className="h-4 w-4" />
            Open Publisher
          </Link>
        </div>

        {actionError && (
          <div className="mt-5 rounded-2xl px-4 py-3 text-sm" style={{ background: 'rgba(196, 85, 110, 0.12)', color: '#b44660' }}>
            {actionError}
          </div>
        )}

        <div className="mt-6 space-y-7">
          {groupedSlots.map(([date, slots]) => (
            <div key={date}>
              <div className="mb-3 flex items-center gap-2">
                <CalendarDays className="h-4 w-4" style={{ color: 'var(--portal-primary)' }} />
                <h3 className="font-display text-xl font-semibold" style={{ color: 'var(--portal-text)' }}>
                  {new Date(`${date}T12:00:00`).toLocaleDateString('en-US', {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric',
                  })}
                </h3>
              </div>
              <div className="grid gap-4 xl:grid-cols-2">
                {slots.map((slot) => (
                  <SlotCard
                    key={`${slot.slot_date_local}-${slot.slot_label}`}
                    slot={slot}
                    onSave={(selected) => saveDrafts.mutate([selected])}
                    isSaving={saveDrafts.isPending}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section
        className="rounded-[32px] p-5 md:p-7"
        style={{ background: 'rgba(255,255,255,0.9)', border: '1px solid var(--portal-border)', boxShadow: 'var(--portal-shadow-soft)' }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: 'var(--portal-text-soft)' }}>
              Stored draft slots
            </p>
            <h2 className="mt-2 font-display text-2xl font-semibold" style={{ color: 'var(--portal-text)' }}>
              Reviewable queue
            </h2>
          </div>
          <div className="inline-flex items-center gap-2 text-sm" style={{ color: 'var(--portal-text-muted)' }}>
            <Clock3 className="h-4 w-4" />
            Publish remains manual
          </div>
        </div>

        <div className="mt-6 space-y-3">
          {drafts.length > 0 ? (
            drafts.map((draft) => <SavedDraftRow key={draft.id} draft={draft} />)
          ) : (
            <div className="rounded-[24px] p-5 text-sm" style={{ background: 'rgba(245,240,235,0.7)', color: 'var(--portal-text-muted)' }}>
              No draft slots saved yet. Use a recommended slot or the Fill My Week action to create reviewable draft records.
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
