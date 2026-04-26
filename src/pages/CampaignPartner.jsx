import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useOutletContext } from 'react-router-dom'
import {
  Archive,
  CalendarDays,
  Copy,
  Edit3,
  FolderOpen,
  Link as LinkIcon,
  Loader2,
  Megaphone,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
  Target,
  Trash2,
  Upload,
  Wand2,
} from 'lucide-react'
import {
  archiveCampaignProject,
  createCampaignProject,
  deleteCampaignProject,
  fetchCampaignProjects,
  generateCampaignPlan,
  upsertSocialDraft,
  updateCampaignProject,
} from '../lib/portalApi'

const CAMPAIGN_TYPES = [
  { value: 'event', label: 'Event', description: 'Recitals, classes, open houses, community appearances.' },
  { value: 'product_launch', label: 'Product / service launch', description: 'New class, package, location, offer, or program.' },
  { value: 'promotion', label: 'Promotion', description: 'Sale, discount, trial class, limited-time registration.' },
  { value: 'seasonal_push', label: 'Seasonal push', description: 'Summer planning, holidays, competitions, local moments.' },
  { value: 'announcement', label: 'Announcement', description: 'New hours, new team member, milestone, or important update.' },
  { value: 'new_location', label: 'New location', description: 'A move, expansion, or new service area announcement.' },
  { value: 'custom', label: 'Custom', description: 'A flexible campaign MAP can shape around your goal.' },
]

const CAMPAIGN_MODES = [
  {
    value: 'standard',
    label: 'Standard',
    credits: 1,
    heading: 'Create my campaign',
    description: 'Partner uses your details to create the strategy, schedule, captions, platforms, and ad suggestion.',
  },
  {
    value: 'advanced',
    label: 'Advanced',
    credits: 3,
    heading: 'Research and build it',
    description: 'Partner researches timing, local opportunities, competitors, and growth actions beyond social posts.',
  },
]

const TYPE_LABELS = Object.fromEntries(CAMPAIGN_TYPES.map((type) => [type.value, type.label]))
const MODE_LABELS = Object.fromEntries(CAMPAIGN_MODES.map((mode) => [mode.value, mode.label]))
const STATUS_LABELS = {
  active: 'Active',
  draft: 'Draft',
  completed: 'Completed',
  archived: 'Archived',
}

const DEFAULT_FORM = {
  campaignMode: 'advanced',
  campaignType: 'event',
  title: '',
  goal: '',
  audience: '',
  offer: '',
  startDate: '',
  endDate: '',
  durationDays: '30',
  budgetRange: 'Start organic, then boost winning posts with a small test budget.',
  campaignLinks: '',
  assetNotes: '',
  tone: 'Friendly, clear, and helpful.',
  avoidTopics: '',
  keyDetails: '',
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

function splitLines(value) {
  return String(value || '')
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function getCredits(mode) {
  return CAMPAIGN_MODES.find((item) => item.value === mode)?.credits || 1
}

function normalizeGeneratedPlan(plan, form, clientName) {
  const start = form.startDate ? new Date(`${form.startDate}T12:00:00`) : new Date()
  start.setHours(12, 0, 0, 0)
  const rawPosts = normalizeList(plan?.posts)
  const fallbackPosts = rawPosts.length ? rawPosts : [
    {
      title: `Announce ${form.title || 'the campaign'}`,
      caption: `${form.title || 'Our campaign'} is coming up. ${clientName || 'We'} will share a clear next step soon, with details customers can act on.`,
      imageIdea: 'Use the clearest campaign visual or a clean behind-the-scenes photo.',
      platforms: ['facebook', 'instagram'],
      offset: 0,
      time: '10:00',
    },
    {
      title: 'Show the problem',
      caption: 'This campaign gives people a simple reason to act now. We will connect the offer to the customer outcome and keep the next step easy.',
      imageIdea: 'Use a simple visual showing the before-and-after benefit.',
      platforms: ['facebook', 'instagram'],
      offset: 3,
      time: '18:30',
    },
    {
      title: 'Offer reminder',
      caption: 'A quick reminder: this campaign is still active. Reach out and we will help you choose the best next step.',
      imageIdea: 'Use a friendly reminder image with the product, service, or person behind it.',
      platforms: ['facebook'],
      offset: 7,
      time: '11:00',
    },
  ]

  return {
    summary: plan?.summary || `${fallbackPosts.length}-post ${TYPE_LABELS[form.campaignType]?.toLowerCase() || 'campaign'} plan`,
    coreMessage: plan?.coreMessage || form.goal,
    audience: plan?.audience || form.audience,
    strategy: normalizeList(plan?.strategy).length ? plan.strategy : [
      `Lead with the customer outcome: ${form.goal || 'make the next step clear'}`,
      'Use a clear call to action on every post.',
      'Start organic and promote the strongest proof post if early engagement is good.',
    ],
    researchSummary: normalizeList(plan?.researchSummary),
    adGuidance: plan?.adGuidance || 'Start organic, then boost the strongest post once the message is proven.',
    growthActions: normalizeList(plan?.growthActions).length ? plan.growthActions : [
      'Add the campaign message to the website or booking page.',
      'Send a short email or message to warm contacts.',
      'Ask current customers to share or refer someone who fits the offer.',
    ],
    generatedAt: new Date().toISOString(),
    mode: form.campaignMode,
    credits: getCredits(form.campaignMode),
    posts: fallbackPosts.map((post, index) => {
      const date = post.date || toDateString(addDays(start, Number(post.offset ?? index * 3)))
      return {
        id: post.id || `post-${index + 1}`,
        title: post.title || `Campaign post ${index + 1}`,
        caption: post.caption || '',
        whyNow: post.whyNow || post.why_now || '',
        imageIdea: post.imageIdea || post.image_idea || 'Use an approved campaign image.',
        platforms: normalizeList(post.platforms).length ? post.platforms : ['facebook', 'instagram'],
        date,
        time: post.time || '10:00',
        status: post.status || 'planned',
        adIdea: Boolean(post.adIdea || post.ad_idea),
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
    planner_policy_version: 'campaign-partner-v2',
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
      post.whyNow ? `Why now: ${post.whyNow}` : '',
      `Image idea: ${post.imageIdea || ''}`,
    ].filter(Boolean).join('\n\n'),
    draft_caption: post.caption,
    review_state: 'draft_created',
    review_notes: JSON.stringify({
      source: 'campaign_partner',
      campaignProjectId: project.id,
      campaignPostId: post.id,
      campaignMode: project.prompt_json?.campaignMode || 'standard',
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
  const [assetFiles, setAssetFiles] = useState([])
  const [form, setForm] = useState(DEFAULT_FORM)

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
    .filter((project) => `${project.title} ${project.goal} ${project.campaign_type} ${project.prompt_json?.campaignMode || ''}`.toLowerCase().includes(query.toLowerCase()))
  , [filter, projects, query])

  const previewPlan = useMemo(() => normalizeGeneratedPlan(null, form, profile?.clients?.business_name), [form, profile])

  const saveProject = useMutation({
    mutationFn: async ({ reusableFrom } = {}) => {
      if (!requireWriteAccess('create Campaign Partner projects')) return null
      const brief = {
        ...form,
        campaignLinks: splitLines(form.campaignLinks),
        assetFiles,
        clientName: profile?.clients?.business_name || '',
      }
      const generated = await generateCampaignPlan({
        client_id: clientId,
        campaign_mode: form.campaignMode,
        campaign_type: form.campaignType,
        brief,
      })
      const plan = normalizeGeneratedPlan(generated?.plan, form, profile?.clients?.business_name)
      return createCampaignProject({
        client_id: clientId,
        title: form.title,
        campaign_type: form.campaignType,
        goal: form.goal,
        date_window: form.startDate || form.endDate ? `${form.startDate || 'Start soon'} to ${form.endDate || `${form.durationDays} days`}` : `${form.durationDays} days`,
        status: 'draft',
        is_reusable: Boolean(reusableFrom),
        source_project_id: reusableFrom || null,
        prompt_json: {
          ...brief,
          campaignMode: form.campaignMode,
          creditCost: getCredits(form.campaignMode),
          createdFrom: reusableFrom ? 'reuse' : 'guided_campaign',
          generatedBy: generated?.model ? 'ai' : 'local',
          model: generated?.model || null,
          usage: generated?.usage || null,
          evidence: generated?.evidence || [],
        },
        plan_json: plan,
      })
    },
    onSuccess: async (project) => {
      if (!project) return
      await queryClient.invalidateQueries({ queryKey: ['campaign-projects', clientId] })
      setSelectedId(project.id)
      setMode('library')
      setNotice(`${MODE_LABELS[form.campaignMode]} campaign created and saved.`)
      setError('')
    },
    onError: (err) => {
      setNotice('')
      setError(err.message || 'Could not create this campaign.')
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
    const prompt = project.prompt_json || {}
    setForm({
      ...DEFAULT_FORM,
      campaignMode: prompt.campaignMode || 'standard',
      campaignType: project.campaign_type || 'event',
      title: `${project.title} refresh`,
      goal: project.goal || '',
      audience: prompt.audience || DEFAULT_FORM.audience,
      offer: prompt.offer || '',
      startDate: '',
      endDate: '',
      durationDays: prompt.durationDays || '14',
      budgetRange: prompt.budgetRange || DEFAULT_FORM.budgetRange,
      campaignLinks: normalizeList(prompt.campaignLinks).join('\n'),
      assetNotes: prompt.assetNotes || '',
      tone: prompt.tone || DEFAULT_FORM.tone,
      avoidTopics: prompt.avoidTopics || '',
      keyDetails: prompt.keyDetails || '',
    })
    setAssetFiles(normalizeList(prompt.assetFiles))
    setMode('create')
    setNotice('Loaded campaign as a reusable starting point.')
  }

  function renderCreateView() {
    const selectedMode = CAMPAIGN_MODES.find((item) => item.value === form.campaignMode) || CAMPAIGN_MODES[0]

    return (
      <section className="campaign-partner-shell">
        <header className="campaign-partner-topbar">
          <div>
            <p>Campaign Partner</p>
            <h1>Build a campaign with Partner</h1>
          </div>
          <div className="campaign-partner-actions">
            <button type="button" className="portal-button-secondary" onClick={() => setMode('library')}>Back to campaigns</button>
            <button type="button" className="portal-button-primary" onClick={() => saveProject.mutate({})} disabled={saveProject.isPending}>
              {saveProject.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
              Generate campaign
            </button>
          </div>
        </header>

        <div className="campaign-create-layout campaign-create-layout-guided">
          <aside className="campaign-wizard">
            <p className="campaign-eyebrow">Choose power level</p>
            <div className="campaign-mode-grid">
              {CAMPAIGN_MODES.map((campaignMode) => (
                <button
                  key={campaignMode.value}
                  type="button"
                  className="campaign-mode-card"
                  data-active={form.campaignMode === campaignMode.value}
                  onClick={() => setForm((current) => ({ ...current, campaignMode: campaignMode.value }))}
                >
                  <span>{campaignMode.label}</span>
                  <strong>{campaignMode.credits} credit{campaignMode.credits > 1 ? 's' : ''}</strong>
                  <small>{campaignMode.description}</small>
                </button>
              ))}
            </div>

            <p className="campaign-eyebrow">Campaign type</p>
            <div className="campaign-type-grid">
              {CAMPAIGN_TYPES.map((type) => (
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
          </aside>

          <section className="campaign-brief-pane">
            <div className="campaign-brief-head">
              <span className="campaign-badge">{selectedMode.label} campaign · {selectedMode.credits} credit{selectedMode.credits > 1 ? 's' : ''}</span>
              <h2>{selectedMode.heading}</h2>
              <p>{selectedMode.description}</p>
            </div>

            <div className="campaign-brief-grid">
              <label>Campaign name<input value={form.title} placeholder="Example: Recital week trial class push" onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} /></label>
              <label>Primary goal<input value={form.goal} placeholder="Example: Get parents to book a trial class" onChange={(event) => setForm((current) => ({ ...current, goal: event.target.value }))} /></label>
              <label>Who should this reach?<textarea value={form.audience} placeholder="Example: Parents of kids ages 3-12 near our studio" onChange={(event) => setForm((current) => ({ ...current, audience: event.target.value }))} /></label>
              <label>Offer or call to action<textarea value={form.offer} placeholder="Example: Message us to claim a trial class spot" onChange={(event) => setForm((current) => ({ ...current, offer: event.target.value }))} /></label>
              <label>Start date<input type="date" value={form.startDate} onChange={(event) => setForm((current) => ({ ...current, startDate: event.target.value }))} /></label>
              <label>End date<input type="date" value={form.endDate} onChange={(event) => setForm((current) => ({ ...current, endDate: event.target.value }))} /></label>
              <label>Duration<input value={form.durationDays} onChange={(event) => setForm((current) => ({ ...current, durationDays: event.target.value }))} /></label>
              <label>Budget / ad comfort<input value={form.budgetRange} onChange={(event) => setForm((current) => ({ ...current, budgetRange: event.target.value }))} /></label>
              <label className="campaign-brief-wide">Links to use
                <textarea value={form.campaignLinks} placeholder="Event page, product page, calendar link, signup page, competitor example..." onChange={(event) => setForm((current) => ({ ...current, campaignLinks: event.target.value }))} />
              </label>
              <label className="campaign-brief-wide">Photos, files, or visual notes
                <textarea value={form.assetNotes} placeholder="Describe product photos, flyers, screenshots, logo files, or videos Partner should consider." onChange={(event) => setForm((current) => ({ ...current, assetNotes: event.target.value }))} />
              </label>
              <label className="campaign-upload-box">
                <Upload className="h-5 w-5" />
                <span>Add photo/file context</span>
                <small>{assetFiles.length ? assetFiles.map((file) => file.name).join(', ') : 'Optional. Files are used as campaign context for this brief.'}</small>
                <input type="file" multiple accept="image/*,.pdf,.doc,.docx,.txt" onChange={(event) => setAssetFiles(Array.from(event.target.files || []).map((file) => ({ name: file.name, type: file.type, size: file.size })))} />
              </label>
              <label>Tone<input value={form.tone} onChange={(event) => setForm((current) => ({ ...current, tone: event.target.value }))} /></label>
              <label>Avoid / downplay<input value={form.avoidTopics} placeholder="Example: Do not sound pushy or overpromise results" onChange={(event) => setForm((current) => ({ ...current, avoidTopics: event.target.value }))} /></label>
              <label className="campaign-brief-wide">Anything else Partner should know?
                <textarea value={form.keyDetails} placeholder="Add deadlines, important details, customer objections, local context, or campaign ideas." onChange={(event) => setForm((current) => ({ ...current, keyDetails: event.target.value }))} />
              </label>
            </div>
          </section>

          <section className="campaign-result campaign-plan-preview">
            <div className="campaign-result-hero">
              <div>
                <span className="campaign-badge"><Sparkles className="h-3.5 w-3.5" /> Preview</span>
                <h2>{previewPlan.summary}</h2>
                <p>{form.campaignMode === 'advanced' ? 'Advanced will research timing, sources, competition, and growth actions before building the plan.' : 'Standard will turn your brief into a focused campaign schedule.'}</p>
              </div>
              <button type="button" className="portal-button-primary" onClick={() => saveProject.mutate({})} disabled={saveProject.isPending}>
                {saveProject.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                Generate
              </button>
            </div>

            <div className="campaign-preview-sections">
              <div>
                <Target className="h-4 w-4" />
                <strong>Strategy</strong>
                <p>Core message, audience angle, CTA, and campaign timing.</p>
              </div>
              <div>
                <LinkIcon className="h-4 w-4" />
                <strong>{form.campaignMode === 'advanced' ? 'Research' : 'Context'}</strong>
                <p>{form.campaignMode === 'advanced' ? 'Local, competitor, and source-backed signals.' : 'Your links, assets, and Partner Profile.'}</p>
              </div>
              <div>
                <CalendarDays className="h-4 w-4" />
                <strong>Publisher drafts</strong>
                <p>Post-ready captions, dates, platforms, and image ideas.</p>
              </div>
            </div>

            <div className="campaign-board campaign-board-compact">
              {previewPlan.posts.slice(0, 3).map((post) => (
                <div key={post.id} className="campaign-post-card">
                  <strong>{post.title}</strong>
                  <p>{post.caption}</p>
                  <div>{formatDate(post.date)} · {post.platforms.join(' + ')}</div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </section>
    )
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

      {mode === 'create' ? renderCreateView() : (
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
                        <small>{MODE_LABELS[project.prompt_json?.campaignMode] || 'Standard'} · {TYPE_LABELS[project.campaign_type] || 'Campaign'} · {normalizeList(project.plan_json?.posts).length} posts</small>
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
                  <span className="campaign-badge">{MODE_LABELS[selectedProject.prompt_json?.campaignMode] || 'Standard'} · {selectedProject.prompt_json?.creditCost || 1} credit{Number(selectedProject.prompt_json?.creditCost || 1) > 1 ? 's' : ''}</span>
                  <h2>{selectedProject.title}</h2>
                  <p>{selectedProject.plan_json?.coreMessage || selectedProject.goal || 'A saved campaign project MAP can edit, reuse, and send into Publisher as draft posts.'}</p>
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

                  <div className="campaign-detail-section">
                    <p className="campaign-eyebrow">Strategy</p>
                    <ul>
                      {normalizeList(selectedProject.plan_json?.strategy).map((item) => <li key={item}>{item}</li>)}
                    </ul>
                  </div>

                  {normalizeList(selectedProject.plan_json?.growthActions).length ? (
                    <div className="campaign-detail-section">
                      <p className="campaign-eyebrow">Growth actions</p>
                      <ul>
                        {normalizeList(selectedProject.plan_json?.growthActions).map((item) => <li key={item}>{item}</li>)}
                      </ul>
                    </div>
                  ) : null}

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
