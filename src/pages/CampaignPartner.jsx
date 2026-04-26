import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useOutletContext } from 'react-router-dom'
import {
  Archive,
  CalendarDays,
  Copy,
  Edit3,
  FolderOpen,
  Loader2,
  Megaphone,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
  Trash2,
} from 'lucide-react'
import {
  archiveCampaignProject,
  createCampaignProject,
  deleteCampaignProject,
  fetchCampaignProjects,
  upsertSocialDraft,
  updateCampaignProject,
} from '../lib/portalApi'

const CAMPAIGN_TYPES = [
  { value: 'event', label: 'Event', description: 'Recitals, classes, open houses, community appearances.' },
  { value: 'product_launch', label: 'Product / service launch', description: 'New class, package, location, offer, or program.' },
  { value: 'promotion', label: 'Promotion', description: 'Sale, discount, trial class, limited-time registration.' },
  { value: 'seasonal_push', label: 'Seasonal push', description: 'Summer planning, holidays, back-to-school, competitions.' },
  { value: 'new_location', label: 'New location', description: 'A move, expansion, or new service area announcement.' },
  { value: 'custom', label: 'Custom', description: 'A flexible campaign MAP can shape around your goal.' },
]

const TYPE_LABELS = Object.fromEntries(CAMPAIGN_TYPES.map((type) => [type.value, type.label]))
const STATUS_LABELS = {
  active: 'Active',
  draft: 'Draft',
  completed: 'Completed',
  archived: 'Archived',
}

function addDays(date, days) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function toDateString(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function toIsoAt(dateString, time = '10:00') {
  const [hour = '10', minute = '00'] = time.split(':')
  return new Date(`${dateString}T${hour.padStart(2, '0')}:${minute.padStart(2, '0')}:00`).toISOString()
}

function formatDate(value) {
  if (!value) return ''
  const date = new Date(String(value).includes('T') ? value : `${value}T12:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date)
}

function normalizeList(value) {
  return Array.isArray(value) ? value : []
}

function buildCampaignPlan({ form, clientName }) {
  const start = new Date()
  start.setHours(12, 0, 0, 0)
  const goal = form.goal || `Promote ${form.title}`
  const subject = form.title || 'campaign'
  const business = clientName || 'the business'
  const platforms = form.campaignType === 'promotion' ? ['facebook', 'instagram'] : ['facebook', 'instagram']
  const basePosts = [
    {
      offset: 0,
      time: '10:00',
      title: `Announce ${subject}`,
      stage: 'draft',
      caption: `${subject} is coming up. ${business} is sharing the details now so customers can plan ahead. Message us for details or to save your spot.`,
      imageIdea: `A clear, bright image that introduces ${subject} and feels current to the season.`,
      platforms,
    },
    {
      offset: 2,
      time: '18:30',
      title: `Why this matters now`,
      stage: 'draft',
      caption: `${goal}. Here is why this is a good fit right now: it gives people a simple next step without waiting until the last minute.`,
      imageIdea: `A customer-focused image showing the benefit or outcome of ${subject}.`,
      platforms: ['instagram'],
    },
    {
      offset: 4,
      time: '11:00',
      title: 'Behind-the-scenes / proof post',
      stage: 'media',
      caption: `A quick look behind the scenes: we are getting ready for ${subject}. If this has been on your list, now is a great time to reach out.`,
      imageIdea: 'Use a real behind-the-scenes photo, short reel clip, or simple branded visual.',
      platforms,
    },
    {
      offset: 6,
      time: '19:00',
      title: 'Reminder before the deadline',
      stage: 'schedule',
      caption: `Quick reminder: ${subject} is still available. Send us a message today and we will help you choose the right next step.`,
      imageIdea: 'Use a friendly reminder visual with real people, product, class, or service context.',
      platforms: ['facebook', 'instagram'],
    },
    {
      offset: 8,
      time: '09:30',
      title: 'Optional ad test',
      stage: 'schedule',
      caption: `${subject} is a strong fit for people nearby who are ready to take action. This could be tested as a small boosted post after approval.`,
      imageIdea: 'Use the clearest approved campaign image and keep the message simple.',
      platforms: ['facebook'],
      adIdea: true,
    },
  ]

  return {
    summary: `${basePosts.length}-post ${TYPE_LABELS[form.campaignType]?.toLowerCase() || 'campaign'} plan`,
    generatedAt: new Date().toISOString(),
    posts: basePosts.map((post, index) => {
      const date = toDateString(addDays(start, post.offset))
      return {
        id: `post-${index + 1}`,
        ...post,
        date,
        status: 'planned',
      }
    }),
  }
}

function buildDraftRow({ project, post, profile }) {
  const client = profile?.clients || {}
  const time = post.time || '10:00'
  const [hour = '10', minute = '00'] = time.split(':')
  const endHour = String(Math.min(Number(hour) + 1, 23)).padStart(2, '0')

  return {
    client_id: profile.client_id,
    planner_client_slug: client.slug || 'campaign-partner',
    planner_policy_version: 'campaign-partner-v1',
    source_workflow: 'campaign_partner',
    slot_date_local: post.date,
    slot_label: `campaign_${project.id.slice(0, 8)}_${post.id}`,
    slot_start_local: `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`,
    slot_end_local: `${endHour}:${minute.padStart(2, '0')}`,
    timezone: client.timezone || 'America/New_York',
    scheduled_for: toIsoAt(post.date, time),
    post_type: project.campaign_type,
    draft_title: post.title,
    draft_body: [
      `Campaign: ${project.title}`,
      `Goal: ${project.goal || 'Campaign promotion'}`,
      `Image idea: ${post.imageIdea || ''}`,
    ].filter(Boolean).join('\n\n'),
    draft_caption: post.caption,
    review_state: 'draft_created',
    review_notes: JSON.stringify({
      source: 'campaign_partner',
      campaignProjectId: project.id,
      campaignPostId: post.id,
      platforms: post.platforms || [],
      imageIdea: post.imageIdea || '',
      generatedAt: new Date().toISOString(),
    }),
    asset_requirements_json: [
      { type: 'media_concept', suggestion: post.imageIdea || 'Use an approved campaign image.' },
      { type: 'media_action', options: ['generate_image', 'upload_photo'] },
    ],
    seasonal_modifier_context_json: [
      { source: 'campaign_partner', campaignTitle: project.title, campaignType: project.campaign_type },
    ],
  }
}

function getProjectCounts(projects) {
  return {
    active: projects.filter((project) => project.status === 'active').length,
    drafts: projects.reduce((count, project) => count + normalizeList(project.plan_json?.posts).filter((post) => post.status !== 'added_to_calendar').length, 0),
    scheduled: projects.reduce((count, project) => count + normalizeList(project.plan_json?.posts).filter((post) => post.status === 'added_to_calendar').length, 0),
    reusable: projects.filter((project) => project.is_reusable).length,
  }
}

export default function CampaignPartner() {
  const { profile, requireWriteAccess } = useOutletContext()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const clientId = profile?.client_id
  const [mode, setMode] = useState('library')
  const [selectedId, setSelectedId] = useState('')
  const [filter, setFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [openMenuId, setOpenMenuId] = useState('')
  const [form, setForm] = useState({
    campaignType: 'event',
    title: 'Summer camp registration push',
    goal: 'Fill summer camp spots before early registration closes',
    dateWindow: 'Promote over the next 10 days',
    notes: 'Beginner-friendly. Parents are planning summer activities now. Mention limited spaces and ask people to message for details.',
  })

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['campaign-projects', clientId],
    queryFn: () => fetchCampaignProjects(clientId),
    enabled: !!clientId,
  })

  const selectedProject = useMemo(() => (
    projects.find((project) => project.id === selectedId) || projects[0] || null
  ), [projects, selectedId])

  const counts = useMemo(() => getProjectCounts(projects), [projects])
  const filteredProjects = useMemo(() => projects
    .filter((project) => {
      if (filter === 'all') return true
      if (filter === 'reusable') return project.is_reusable
      return project.status === filter
    })
    .filter((project) => `${project.title} ${project.goal} ${project.campaign_type}`.toLowerCase().includes(query.toLowerCase()))
  , [filter, projects, query])

  const saveProject = useMutation({
    mutationFn: async ({ reusableFrom } = {}) => {
      if (!requireWriteAccess('create Campaign Partner projects')) return null
      const plan = buildCampaignPlan({ form, clientName: profile?.clients?.business_name })
      return createCampaignProject({
        client_id: clientId,
        title: form.title,
        campaign_type: form.campaignType,
        goal: form.goal,
        date_window: form.dateWindow,
        status: 'draft',
        is_reusable: Boolean(reusableFrom),
        source_project_id: reusableFrom || null,
        prompt_json: {
          notes: form.notes,
          createdFrom: reusableFrom ? 'reuse' : 'new_campaign',
        },
        plan_json: plan,
      })
    },
    onSuccess: async (project) => {
      if (!project) return
      await queryClient.invalidateQueries({ queryKey: ['campaign-projects', clientId] })
      setSelectedId(project.id)
      setMode('library')
      setNotice('Campaign project saved.')
      setError('')
    },
    onError: (err) => {
      setNotice('')
      setError(err.message || 'Could not save this campaign.')
    },
  })

  async function handleUpdateProject(project, changes, successMessage) {
    if (!requireWriteAccess('update Campaign Partner projects')) return
    try {
      setError('')
      setNotice('')
      await updateCampaignProject(project.id, changes)
      await queryClient.invalidateQueries({ queryKey: ['campaign-projects', clientId] })
      setNotice(successMessage)
    } catch (err) {
      setError(err.message || 'Could not update this campaign.')
    }
  }

  async function handleArchive(project) {
    if (!requireWriteAccess('archive Campaign Partner projects')) return
    try {
      await archiveCampaignProject(project.id)
      await queryClient.invalidateQueries({ queryKey: ['campaign-projects', clientId] })
      setNotice('Campaign archived.')
    } catch (err) {
      setError(err.message || 'Could not archive this campaign.')
    }
  }

  async function handleDelete(project) {
    if (!requireWriteAccess('delete Campaign Partner projects')) return
    if (!window.confirm(`Delete ${project.title}? This removes the saved campaign project, not posts already added to Publisher.`)) return
    try {
      await deleteCampaignProject(project.id)
      await queryClient.invalidateQueries({ queryKey: ['campaign-projects', clientId] })
      setNotice('Campaign deleted.')
    } catch (err) {
      setError(err.message || 'Could not delete this campaign.')
    }
  }

  async function handleAddDrafts(project) {
    if (!requireWriteAccess('add Campaign Partner drafts to Publisher')) return
    const posts = normalizeList(project?.plan_json?.posts)
    if (!posts.length) return

    try {
      setError('')
      setNotice('')
      const rows = posts.map((post) => buildDraftRow({ project, post, profile }))
      const savedDrafts = []
      for (const row of rows) {
        savedDrafts.push(await upsertSocialDraft(row))
      }
      const nextPosts = posts.map((post) => ({ ...post, status: 'added_to_calendar' }))
      await updateCampaignProject(project.id, {
        status: 'active',
        plan_json: { ...project.plan_json, posts: nextPosts, lastAddedToCalendarAt: new Date().toISOString() },
      })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['campaign-projects', clientId] }),
        queryClient.invalidateQueries({ queryKey: ['social-drafts', clientId] }),
      ])
      setNotice(`${savedDrafts.length} campaign drafts added to Publisher.`)
    } catch (err) {
      setError(err.message || 'Could not add campaign drafts.')
    }
  }

  function handleReuse(project) {
    setForm({
      campaignType: project.campaign_type || 'event',
      title: `${project.title} refresh`,
      goal: project.goal || '',
      dateWindow: 'Update for the next campaign window',
      notes: project.prompt_json?.notes || '',
    })
    setMode('create')
    setNotice('Loaded campaign as a reusable starting point.')
  }

  return (
    <div className="portal-page campaign-partner-page mx-auto max-w-[1500px] space-y-3 md:p-4 xl:p-5">
      <section className="campaign-partner-tabs">
        <button type="button" data-active={mode === 'library'} onClick={() => setMode('library')}>Campaign library</button>
        <button type="button" data-active={mode === 'create'} onClick={() => setMode('create')}>Create campaign</button>
      </section>

      {(notice || error) ? (
        <div className="campaign-partner-notice" data-tone={error ? 'error' : 'success'}>{error || notice}</div>
      ) : null}

      {mode === 'create' ? (
        <section className="campaign-partner-shell">
          <header className="campaign-partner-topbar">
            <div>
              <p>Campaign Partner</p>
              <h1>Create new campaign</h1>
            </div>
            <div className="campaign-partner-actions">
              <button type="button" className="portal-button-secondary" onClick={() => setMode('library')}>Back to campaigns</button>
              <button type="button" className="portal-button-primary" onClick={() => saveProject.mutate({})} disabled={saveProject.isPending}>
                {saveProject.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Save campaign project
              </button>
            </div>
          </header>

          <div className="campaign-create-layout">
            <aside className="campaign-wizard">
              <p className="campaign-eyebrow">Step 1</p>
              <h2>What kind of campaign?</h2>
              <div className="campaign-type-grid">
                {CAMPAIGN_TYPES.slice(0, 4).map((type) => (
                  <button
                    key={type.value}
                    type="button"
                    className="campaign-type-card"
                    data-active={form.campaignType === type.value}
                    onClick={() => setForm((current) => ({ ...current, campaignType: type.value }))}
                  >
                    <strong>{type.label}</strong>
                    <span>{type.description}</span>
                  </button>
                ))}
              </div>
              <label>Campaign name<input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} /></label>
              <label>Goal<input value={form.goal} onChange={(event) => setForm((current) => ({ ...current, goal: event.target.value }))} /></label>
              <label>Date or deadline<input value={form.dateWindow} onChange={(event) => setForm((current) => ({ ...current, dateWindow: event.target.value }))} /></label>
              <label>What should MAP know?<textarea value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} /></label>
            </aside>

            <section className="campaign-result">
              <div className="campaign-result-hero">
                <div>
                  <span className="campaign-badge">AI draft project</span>
                  <h2>{buildCampaignPlan({ form, clientName: profile?.clients?.business_name }).summary}</h2>
                  <p>MAP will save a reusable project with recommended dates, platforms, captions, image ideas, and one optional ad angle. Nothing posts until approved.</p>
                </div>
                <button type="button" className="portal-button-primary" onClick={() => saveProject.mutate({})}>
                  <Plus className="h-4 w-4" />
                  Save this plan
                </button>
              </div>
              <div className="campaign-board">
                {['draft', 'media', 'schedule'].map((stage) => (
                  <div key={stage} className="campaign-board-column">
                    <h3>{stage === 'draft' ? 'Draft posts' : stage === 'media' ? 'Needs media' : 'Schedule'}</h3>
                    {buildCampaignPlan({ form, clientName: profile?.clients?.business_name }).posts
                      .filter((post) => post.stage === stage)
                      .map((post) => (
                        <div key={post.id} className="campaign-post-card">
                          <strong>{post.title}</strong>
                          <p>{post.caption}</p>
                          <div>{formatDate(post.date)} · {post.platforms.join(' + ')}</div>
                        </div>
                      ))}
                  </div>
                ))}
              </div>
            </section>
          </div>
        </section>
      ) : (
        <section className="campaign-partner-shell">
          <header className="campaign-partner-topbar">
            <div>
              <p>Campaign Partner</p>
              <h1>Campaigns</h1>
            </div>
            <div className="campaign-partner-actions">
              <button type="button" className="portal-button-secondary" onClick={() => navigate('/opportunities')}>Import idea</button>
              <button type="button" className="portal-button-primary" onClick={() => setMode('create')}>
                <Plus className="h-4 w-4" />
                Create campaign
              </button>
            </div>
          </header>

          <div className="campaign-stat-grid">
            <div><strong>{counts.active}</strong><span>Active campaigns</span></div>
            <div><strong>{counts.drafts}</strong><span>Draft posts waiting</span></div>
            <div><strong>{counts.scheduled}</strong><span>Added to calendar</span></div>
            <div><strong>{counts.reusable}</strong><span>Reusable campaigns</span></div>
          </div>

          <div className="campaign-library-layout">
            <aside className="campaign-folder-pane">
              {[
                ['all', 'All campaigns', projects.length],
                ['active', 'Active', counts.active],
                ['draft', 'Draft', projects.filter((project) => project.status === 'draft').length],
                ['completed', 'Completed', projects.filter((project) => project.status === 'completed').length],
                ['reusable', 'Reusable', counts.reusable],
              ].map(([value, label, count]) => (
                <button key={value} type="button" data-active={filter === value} onClick={() => setFilter(value)}>
                  <span>{label}</span>
                  <small>{count}</small>
                </button>
              ))}
            </aside>

            <section className="campaign-list-pane">
              <div className="campaign-list-head">
                <div>
                  <p className="campaign-eyebrow">Library</p>
                  <h2>Campaign projects</h2>
                </div>
                <label className="campaign-search">
                  <Search className="h-4 w-4" />
                  <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search campaigns" />
                </label>
              </div>
              {isLoading ? (
                <div className="campaign-empty"><Loader2 className="h-5 w-5 animate-spin" /> Loading campaigns...</div>
              ) : filteredProjects.length ? (
                <div className="campaign-row-list">
                  {filteredProjects.map((project) => (
                    <button
                      key={project.id}
                      type="button"
                      className="campaign-row"
                      data-active={selectedProject?.id === project.id}
                      onClick={() => setSelectedId(project.id)}
                    >
                      <span className="campaign-row-icon">{project.title.split(/\s+/).slice(0, 2).map((word) => word[0]).join('').toUpperCase()}</span>
                      <span className="campaign-row-copy">
                        <strong>{project.title}</strong>
                        <small>{TYPE_LABELS[project.campaign_type] || 'Campaign'} · {project.date_window || 'No date window'} · {normalizeList(project.plan_json?.posts).length} posts</small>
                      </span>
                      <span className="campaign-status" data-status={project.status}>{STATUS_LABELS[project.status] || project.status}</span>
                      <span className="campaign-menu-wrap">
                        <span type="button" className="campaign-kebab" onClick={(event) => { event.stopPropagation(); setOpenMenuId(openMenuId === project.id ? '' : project.id) }}>
                          <MoreHorizontal className="h-4 w-4" />
                        </span>
                        {openMenuId === project.id ? (
                          <span className="campaign-row-menu">
                            <span onClick={(event) => { event.stopPropagation(); handleReuse(project); setOpenMenuId('') }}><RotateCcw className="h-4 w-4" /> Reuse with changes</span>
                            <span onClick={(event) => { event.stopPropagation(); handleUpdateProject(project, { is_reusable: !project.is_reusable }, project.is_reusable ? 'Reusable flag removed.' : 'Marked reusable.'); setOpenMenuId('') }}><Copy className="h-4 w-4" /> {project.is_reusable ? 'Remove reusable' : 'Mark reusable'}</span>
                            <span onClick={(event) => { event.stopPropagation(); handleArchive(project); setOpenMenuId('') }}><Archive className="h-4 w-4" /> Archive</span>
                            <span data-danger onClick={(event) => { event.stopPropagation(); handleDelete(project); setOpenMenuId('') }}><Trash2 className="h-4 w-4" /> Delete</span>
                          </span>
                        ) : null}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="campaign-empty">
                  <Megaphone className="h-6 w-6" />
                  No campaigns match this view.
                </div>
              )}
            </section>

            <section className="campaign-detail-pane">
              {selectedProject ? (
                <>
                  <span className="campaign-badge">{STATUS_LABELS[selectedProject.status] || selectedProject.status} campaign</span>
                  <h2>{selectedProject.title}</h2>
                  <p>{selectedProject.goal || 'A saved campaign project MAP can edit, reuse, and send into Publisher as draft posts.'}</p>
                  <div className="campaign-detail-actions">
                    <button type="button" className="portal-button-primary" onClick={() => handleAddDrafts(selectedProject)}>
                      <CalendarDays className="h-4 w-4" />
                      Add drafts to calendar
                    </button>
                    <button type="button" className="portal-button-secondary" onClick={() => handleReuse(selectedProject)}>
                      <Edit3 className="h-4 w-4" />
                      Edit campaign
                    </button>
                    <button type="button" className="portal-button-secondary" onClick={() => handleReuse(selectedProject)}>
                      <RotateCcw className="h-4 w-4" />
                      Reuse with changes
                    </button>
                  </div>
                  <p className="campaign-eyebrow">Suggested schedule</p>
                  <div className="campaign-timeline">
                    {normalizeList(selectedProject.plan_json?.posts).map((post) => (
                      <div key={post.id} className="campaign-timeline-row">
                        <b>{formatDate(post.date)}</b>
                        <div>
                          <strong>{post.title}</strong>
                          <small>{post.platforms?.join(' + ') || 'Review platforms'} · {post.status === 'added_to_calendar' ? 'added to Publisher' : 'draft ready'}</small>
                        </div>
                        <button type="button" onClick={() => navigate('/calendar')}>{post.status === 'added_to_calendar' ? 'View' : 'Edit'}</button>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="campaign-empty">
                  <FolderOpen className="h-6 w-6" />
                  Create your first campaign project.
                </div>
              )}
            </section>
          </div>
        </section>
      )}
    </div>
  )
}
