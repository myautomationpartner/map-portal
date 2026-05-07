import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Bot,
  CheckCircle2,
  Copy,
  LifeBuoy,
  Loader2,
  MessageCircle,
  Minimize2,
  PenLine,
  RefreshCw,
  Send,
  Settings,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import {
  checkWebsiteChatInstallation,
  fetchResearchProfile,
  fetchWebsiteChatSettings,
  openContentPartnerConversation,
  sendPortalPartnerMessage,
  updateClientPartnerProfile,
  upsertResearchProfile,
} from '../lib/portalApi'

const FLOW_CARDS = [
  {
    id: 'support',
    label: 'Support',
    description: 'Report a portal issue',
    prompt: 'I need help with the portal.',
    Icon: LifeBuoy,
  },
  {
    id: 'training',
    label: 'Partner training',
    description: 'Update what MAP knows',
    prompt: 'Help me refresh my Partner training.',
    Icon: RefreshCw,
  },
  {
    id: 'create_post',
    label: 'Create a post',
    description: 'Use Publisher yourself',
    prompt: 'Help me create a post in Publisher.',
    Icon: PenLine,
  },
  {
    id: 'website_chat',
    label: 'Website chat',
    description: 'Install or check chat',
    prompt: 'Help me set up Website Chat.',
    Icon: MessageCircle,
  },
  {
    id: 'content',
    label: 'Content request',
    description: 'Ask MAP for a draft',
    prompt: 'I want MAP to make a social post.',
    Icon: Sparkles,
  },
]

const QUICK_PROMPTS = [
  {
    id: 'help',
    label: 'What can you help with?',
    prompt: 'What can you help me do in this portal?',
  },
  {
    id: 'page',
    label: 'Help on this page',
    buildPrompt: () => `I need help with this page: ${resolveCurrentRoute()}`,
  },
  {
    id: 'status',
    label: 'What should I check first?',
    prompt: 'What should I check first to make sure my portal is set up correctly?',
  },
]

const ACTION_LABELS = {
  open_inbox: 'Open Inbox',
  open_settings_chat: 'Website Chat settings',
  open_create_post: 'Open Publisher',
  check_website_chat: 'Check install',
  copy_website_chat_script: 'Copy script',
  open_partner_training: 'Refresh training',
  save_partner_training: 'Save training',
  open_content_partner: 'Open Content Partner',
  copy_content_request: 'Copy request',
}

function buildWelcomeMessage(readOnly = false) {
  return createMessage(
    'assistant',
    readOnly
      ? 'This portal is read-only right now, but I can still answer questions, explain setup steps, and help you find the right place.'
      : 'I can guide you through support, creating posts, Partner training, Website Chat setup, and draft-only content requests.',
    {
      actions: [
        { type: 'open_inbox' },
        { type: 'open_create_post' },
        ...(readOnly ? [] : [{ type: 'open_partner_training' }]),
        { type: 'open_settings_chat' },
        ...(readOnly ? [] : [{ type: 'open_content_partner' }]),
      ],
    },
  )
}

function createMessage(role, content, extras = {}) {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    role,
    content,
    ...extras,
  }
}

function listToText(value) {
  return Array.isArray(value) ? value.join(', ') : ''
}

function textToList(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 8)
}

function resolveCurrentRoute() {
  if (typeof window === 'undefined') return '/'
  return `${window.location.pathname}${window.location.search}`
}

function PartnerActionButton({ action, disabled, onClick }) {
  return (
    <button
      type="button"
      className="portal-partner-action"
      disabled={disabled}
      onClick={() => onClick(action)}
    >
      {ACTION_LABELS[action.type] || action.label || 'Continue'}
    </button>
  )
}

function TrainingEditor({ form, saving, onChange, onCancel, onSave }) {
  return (
    <div className="portal-partner-training">
      <label>
        Website
        <input value={form.websiteUrl} onChange={(event) => onChange('websiteUrl', event.target.value)} />
      </label>
      <label>
        ZIP / postal code
        <input value={form.postalCode} onChange={(event) => onChange('postalCode', event.target.value)} />
      </label>
      <label>
        Service area
        <input value={form.serviceArea} onChange={(event) => onChange('serviceArea', event.target.value)} />
      </label>
      <label>
        Main audience
        <input value={form.audienceSummary} onChange={(event) => onChange('audienceSummary', event.target.value)} />
      </label>
      <label>
        Offers to promote
        <textarea value={form.offerFocusText} onChange={(event) => onChange('offerFocusText', event.target.value)} rows={3} />
      </label>
      <label>
        Avoid or downplay
        <textarea value={form.blockedTopicsText} onChange={(event) => onChange('blockedTopicsText', event.target.value)} rows={3} />
      </label>
      <label>
        Notes for MAP
        <textarea value={form.researchNotes} onChange={(event) => onChange('researchNotes', event.target.value)} rows={4} />
      </label>
      <div className="portal-partner-editor-actions">
        <button type="button" className="portal-partner-action ghost" onClick={onCancel}>Cancel</button>
        <button type="button" className="portal-partner-action primary" disabled={saving} onClick={onSave}>
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
          Save and verify
        </button>
      </div>
    </div>
  )
}

export default function PortalPartner({ session, profile, tenant, billingAccess, requireWriteAccess }) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [minimized, setMinimized] = useState(false)
  const [input, setInput] = useState('')
  const [pending, setPending] = useState(false)
  const [actionPending, setActionPending] = useState('')
  const [trainingForm, setTrainingForm] = useState(null)
  const [trainingSaving, setTrainingSaving] = useState(false)
  const [messages, setMessages] = useState(() => [buildWelcomeMessage(false)])
  const panelRef = useRef(null)

  const client = profile?.clients || null
  const clientId = client?.id || ''
  const userId = profile?.id || ''
  const canWrite = !billingAccess?.readOnly

  const title = useMemo(() => {
    if (tenant?.businessName) return `${tenant.businessName} Partner`
    if (client?.business_name) return `${client.business_name} Partner`
    return 'MAP Partner'
  }, [client?.business_name, tenant?.businessName])

  function appendMessage(role, content, extras = {}) {
    setMessages((current) => [...current, createMessage(role, content, extras)])
  }

  function scrollToLatestMessage() {
    window.setTimeout(() => {
      panelRef.current?.querySelector('.portal-partner-log')?.scrollTo({ top: 999999, behavior: 'smooth' })
    }, 25)
  }

  function clearChatHistory() {
    if (pending || actionPending || trainingSaving) return
    const confirmed = window.confirm('Clear this Partner chat history? This only resets the conversation on this screen.')
    if (!confirmed) return

    setTrainingForm(null)
    setInput('')
    setMessages([buildWelcomeMessage(Boolean(billingAccess?.readOnly))])
  }

  function showHelpGuide() {
    appendMessage('assistant', 'Here are the safest ways I can help. I can open support, guide you to Publisher to create a post, refresh Partner training, check Website Chat, or hand a content idea to Content Partner for draft creation. I will ask before saving profile updates and I cannot publish posts for you.', {
      actions: [
        { type: 'open_inbox' },
        { type: 'open_create_post' },
        ...(canWrite ? [{ type: 'open_partner_training' }] : []),
        { type: 'open_settings_chat' },
        ...(canWrite ? [{ type: 'open_content_partner' }] : []),
      ],
    })
    scrollToLatestMessage()
  }

  async function sendMessage(text) {
    const cleanText = String(text || '').trim()
    if (!cleanText || pending) return

    appendMessage('user', cleanText)
    setInput('')
    setPending(true)

    try {
      const payload = await sendPortalPartnerMessage({
        message: cleanText,
        currentPath: resolveCurrentRoute(),
        readOnly: Boolean(billingAccess?.readOnly),
      })
      appendMessage('assistant', payload.reply || 'I can help route that safely.', {
        intent: payload.intent,
        actions: payload.actions || [],
      })
    } catch (error) {
      appendMessage('assistant', error instanceof Error ? error.message : 'MAP Partner could not respond right now.')
    } finally {
      setPending(false)
      scrollToLatestMessage()
    }
  }

  async function loadTrainingForm() {
    if (!clientId) {
      appendMessage('assistant', 'Your client profile is still loading.')
      return
    }

    setActionPending('open_partner_training')
    try {
      const researchProfile = await fetchResearchProfile(clientId)
      setTrainingForm({
        websiteUrl: client?.website_url || '',
        postalCode: client?.postal_code || '',
        serviceArea: researchProfile?.service_area || '',
        audienceSummary: researchProfile?.audience_summary || '',
        offerFocusText: listToText(researchProfile?.offer_focus_json),
        blockedTopicsText: listToText(researchProfile?.blocked_topics_json),
        researchNotes: researchProfile?.research_notes || '',
      })
      appendMessage('assistant', 'Review the training fields below. I will save only after you confirm.')
    } catch (error) {
      appendMessage('assistant', error instanceof Error ? error.message : 'Could not load Partner training.')
    } finally {
      setActionPending('')
    }
  }

  function updateTrainingForm(key, value) {
    setTrainingForm((current) => ({ ...(current || {}), [key]: value }))
  }

  async function saveTrainingForm() {
    if (!clientId || !trainingForm) return
    if (!requireWriteAccess('update Partner training')) return
    const confirmed = window.confirm('Save these Partner training updates and mark training verified?')
    if (!confirmed) return

    setTrainingSaving(true)
    try {
      const clientPatch = {
        website_url: trainingForm.websiteUrl,
        postal_code: trainingForm.postalCode,
      }
      await updateClientPartnerProfile(clientId, clientPatch)
      await upsertResearchProfile({
        clientId,
        serviceArea: trainingForm.serviceArea,
        audienceSummary: trainingForm.audienceSummary,
        offerFocus: textToList(trainingForm.offerFocusText),
        blockedTopics: textToList(trainingForm.blockedTopicsText),
        researchNotes: trainingForm.researchNotes,
        partnerTrainingVerifiedAt: new Date().toISOString(),
        partnerTrainingVerifiedBy: userId,
      })
      setTrainingForm(null)
      appendMessage('assistant', 'Partner training is saved and verified. MAP will use this for future recommendations.')
    } catch (error) {
      appendMessage('assistant', error instanceof Error ? error.message : 'Could not save Partner training.')
    } finally {
      setTrainingSaving(false)
    }
  }

  async function copyWebsiteChatScript() {
    setActionPending('copy_website_chat_script')
    try {
      const payload = await fetchWebsiteChatSettings()
      if (!payload?.installSnippet) {
        appendMessage('assistant', 'Website Chat is still being prepared for this portal.')
        return
      }
      await navigator.clipboard.writeText(payload.installSnippet)
      appendMessage('assistant', 'Website Chat script copied.')
    } catch (error) {
      appendMessage('assistant', error instanceof Error ? error.message : 'Could not copy the Website Chat script.')
    } finally {
      setActionPending('')
    }
  }

  async function checkWebsiteChat() {
    setActionPending('check_website_chat')
    try {
      const result = await checkWebsiteChatInstallation()
      appendMessage('assistant', result?.detected
        ? 'Website Chat is installed on the saved website.'
        : 'Website Chat was not found on the saved homepage yet.', {
        actions: [{ type: 'open_settings_chat' }, { type: 'copy_website_chat_script' }],
      })
    } catch (error) {
      appendMessage('assistant', error instanceof Error ? error.message : 'Could not check Website Chat installation.')
    } finally {
      setActionPending('')
    }
  }

  async function openContentPartner() {
    if (!requireWriteAccess('create content requests')) return
    setActionPending('open_content_partner')
    const latestUserMessage = [...messages].reverse().find((message) => message.role === 'user')?.content || input

    try {
      const payload = await openContentPartnerConversation()
      if (latestUserMessage) {
        await navigator.clipboard.writeText(latestUserMessage).catch(() => {})
      }
      appendMessage('assistant', payload?.conversationId
        ? 'Content Partner is ready in Inbox. I copied your request so you can paste it into that thread for draft creation.'
        : 'Content Partner is ready in Inbox.', {
        actions: [{ type: 'open_inbox' }],
      })
      navigate('/inbox')
    } catch (error) {
      appendMessage('assistant', error instanceof Error ? error.message : 'Could not open Content Partner.')
    } finally {
      setActionPending('')
    }
  }

  async function handleAction(action) {
    if (!action?.type) return

    if (action.type === 'open_inbox') {
      navigate('/inbox')
      return
    }

    if (action.type === 'open_settings_chat') {
      navigate('/settings')
      return
    }

    if (action.type === 'open_create_post') {
      appendMessage('assistant', 'I opened Publisher. Start with the post idea, choose the connected platforms, add media if needed, then preview before scheduling or publishing.')
      navigate('/post')
      return
    }

    if (action.type === 'open_partner_training') {
      await loadTrainingForm()
      return
    }

    if (action.type === 'check_website_chat') {
      if (!canWrite) {
        appendMessage('assistant', 'This portal is read-only right now, so I can explain setup but cannot run checks.')
        return
      }
      await checkWebsiteChat()
      return
    }

    if (action.type === 'copy_website_chat_script') {
      await copyWebsiteChatScript()
      return
    }

    if (action.type === 'open_content_partner') {
      await openContentPartner()
      return
    }

    if (action.type === 'copy_content_request') {
      const latestUserMessage = [...messages].reverse().find((message) => message.role === 'user')?.content || input
      if (latestUserMessage) await navigator.clipboard.writeText(latestUserMessage).catch(() => {})
      appendMessage('assistant', latestUserMessage ? 'Content request copied.' : 'Send me the content request first.')
    }
  }

  function handleSubmit(event) {
    event.preventDefault()
    void sendMessage(input)
  }

  function handleQuickPrompt(prompt) {
    if (prompt.id === 'help') {
      showHelpGuide()
      return
    }

    void sendMessage(prompt.buildPrompt ? prompt.buildPrompt() : prompt.prompt)
  }

  if (!session || !clientId) return null

  return (
    <div className={`portal-partner ${open ? 'is-open' : ''} ${minimized ? 'is-minimized' : ''}`} ref={panelRef}>
      {open && !minimized ? (
        <section className="portal-partner-panel" aria-label="MAP Partner">
          <header className="portal-partner-header">
            <div className="portal-partner-title">
              <span className="portal-partner-mark"><Bot className="h-4 w-4" /></span>
              <div>
                <h2>{title}</h2>
                <p>Guided help for this workspace</p>
              </div>
            </div>
            <div className="portal-partner-controls">
              <button type="button" aria-label="Clear MAP Partner chat history" onClick={clearChatHistory} disabled={pending || Boolean(actionPending) || trainingSaving}>
                <Trash2 className="h-4 w-4" />
              </button>
              <button type="button" aria-label="Minimize MAP Partner" onClick={() => setMinimized(true)}>
                <Minimize2 className="h-4 w-4" />
              </button>
              <button type="button" aria-label="Close MAP Partner" onClick={() => setOpen(false)}>
                <X className="h-4 w-4" />
              </button>
            </div>
          </header>

          <div className="portal-partner-help-strip">
            <strong>Choose a task or ask normally.</strong>
            <span>Actions stay guided: profile updates require confirmation, content stays draft-only, and read-only portals cannot make changes.</span>
          </div>

          <div className="portal-partner-flow-grid">
            {FLOW_CARDS.map(({ id, label, description, prompt, Icon }) => (
              <button key={id} type="button" onClick={() => sendMessage(prompt)} disabled={pending}>
                <Icon className="h-4 w-4" />
                <span>
                  <strong>{label}</strong>
                  <small>{description}</small>
                </span>
              </button>
            ))}
          </div>

          <div className="portal-partner-quick-prompts" aria-label="Suggested Partner prompts">
            {QUICK_PROMPTS.map((prompt) => (
              <button key={prompt.id} type="button" onClick={() => handleQuickPrompt(prompt)} disabled={pending}>
                {prompt.label}
              </button>
            ))}
          </div>

          <div className="portal-partner-log">
            {messages.map((message) => (
              <div key={message.id} className={`portal-partner-message ${message.role}`}>
                <p>{message.content}</p>
                {Array.isArray(message.actions) && message.actions.length ? (
                  <div className="portal-partner-actions">
                    {message.actions.map((action) => (
                      <PartnerActionButton
                        key={`${message.id}-${action.type}`}
                        action={action}
                        disabled={Boolean(actionPending)}
                        onClick={handleAction}
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
            {pending ? (
              <div className="portal-partner-message assistant compact">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Checking the safest handoff...</span>
              </div>
            ) : null}
            {trainingForm ? (
              <TrainingEditor
                form={trainingForm}
                saving={trainingSaving}
                onChange={updateTrainingForm}
                onCancel={() => setTrainingForm(null)}
                onSave={saveTrainingForm}
              />
            ) : null}
          </div>

          <form className="portal-partner-composer" onSubmit={handleSubmit}>
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Ask MAP for help..."
              rows={2}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  void sendMessage(input)
                }
              }}
            />
            <button type="submit" disabled={pending || !input.trim()} aria-label="Send message">
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </form>
        </section>
      ) : null}

      <button
        type="button"
        className="portal-partner-launcher"
        aria-label="Open MAP Partner"
        onClick={() => {
          setOpen(true)
          setMinimized(false)
        }}
      >
        <Bot className="h-5 w-5" />
        <span>Partner</span>
      </button>
    </div>
  )
}
