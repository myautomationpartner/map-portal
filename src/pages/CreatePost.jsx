import { useState, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useOutletContext, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { openDropboxChooser } from '../lib/dropboxApi'
import {
  Send, X, Clock, Calendar, CheckCircle2,
  AlertCircle, Loader2, Globe, Music2, Eye,
  UploadCloud, History, ChevronRight, Share2, Camera,
  ArrowUpRight, Paperclip,
} from 'lucide-react'

const N8N_BASE = import.meta.env.VITE_N8N_BASE_URL || 'https://n8n.myautomationpartner.com'

const PLATFORMS = [
  {
    id: 'facebook',
    label: 'Facebook',
    Icon: Share2,
    accent: '#4267B2',
    soft: 'rgba(66, 103, 178, 0.10)',
  },
  {
    id: 'instagram',
    label: 'Instagram',
    Icon: Camera,
    accent: '#C13584',
    soft: 'rgba(193, 53, 132, 0.10)',
  },
  {
    id: 'google',
    label: 'Google Business',
    Icon: Globe,
    accent: '#34A853',
    soft: 'rgba(52, 168, 83, 0.10)',
  },
  {
    id: 'tiktok',
    label: 'TikTok',
    Icon: Music2,
    accent: '#111111',
    soft: 'rgba(17, 17, 17, 0.08)',
  },
]

async function fetchProfile() {
  const { data, error } = await supabase.from('users').select('*, clients(*)').single()
  if (error) throw error
  return data
}

/** Human-readable file size (e.g. "2.4 MB") */
function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

export default function CreatePost() {
  useOutletContext()
  const fileInputRef = useRef(null)

  const [content, setContent] = useState('')
  const [imageFile, setImageFile] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)

  // Dropbox link-based attachments — never uploaded to the server
  const [dropboxAttachments, setDropboxAttachments] = useState([])
  const [dropboxLoading, setDropboxLoading] = useState(false)

  const [selectedPlatforms, setSelectedPlatforms] = useState({
    facebook: true,
    instagram: true,
    google: false,
    tiktok: false,
  })
  const [mode, setMode] = useState('now')
  const [scheduledFor, setScheduledFor] = useState('')
  const [submitState, setSubmitState] = useState('idle') // idle | uploading | posting | success | error
  const [errorMsg, setErrorMsg] = useState('')

  const { data: profile } = useQuery({
    queryKey: ['profile'],
    queryFn: fetchProfile,
  })
  const clientId = profile?.client_id

  const activePlatforms = Object.entries(selectedPlatforms)
    .filter(([, v]) => v)
    .map(([k]) => k)

  const charLimit = selectedPlatforms.google ? 1500 : 2200
  const charOver = content.length > charLimit
  const charWarning = content.length > charLimit * 0.9
  const charPercent = Math.min((content.length / charLimit) * 100, 100)

  // ─── Local file handlers ─────────────────────────────────────────────────

  function handleFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setErrorMsg('Only image files are supported.'); alert('Only image files are supported.')
      return
    }
    setImageFile(file)
    const reader = new FileReader()
    reader.onload = ev => setImagePreview(ev.target.result)
    reader.readAsDataURL(file)
    setErrorMsg('')
  }

  function removeImage() {
    setImageFile(null)
    setImagePreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // ─── Dropbox Chooser handlers ─────────────────────────────────────────────

  async function handleDropboxAttach() {
    setDropboxLoading(true)
    setErrorMsg('')
    try {
      const files = await openDropboxChooser({ multiselect: true, linkType: 'preview' })
      if (files.length > 0) {
        setDropboxAttachments(prev => {
          const existingLinks = new Set(prev.map(f => f.link))
          const incoming = files.filter(f => !existingLinks.has(f.link))
          return [...prev, ...incoming]
        })
      }
    } catch (err) {
      console.error('[Dropbox]', err)
      setErrorMsg(err.message || 'Could not open Dropbox. Please try again.')
    } finally {
      setDropboxLoading(false)
    }
  }

  function removeDropboxAttachment(link) {
    setDropboxAttachments(prev => prev.filter(f => f.link !== link))
  }

  // ─── Platform toggle ──────────────────────────────────────────────────────

  function togglePlatform(id) {
    setSelectedPlatforms(prev => ({ ...prev, [id]: !prev[id] }))
  }

  // ─── Upload local file to R2 ──────────────────────────────────────────────

  async function uploadToR2(file) {
    const ext = file.name.split('.').pop()
    const filename = `${clientId}/${Date.now()}.${ext}`
    const formData = new FormData()
    formData.append('file', file, filename)
    formData.append('filename', filename)
    formData.append('clientId', clientId)
    const res = await fetch(`${N8N_BASE}/webhook/r2-upload`, {
      method: 'POST',
      body: formData,
    })
    if (!res.ok) throw new Error('Image upload failed.')
    const { publicUrl } = await res.json()
    return publicUrl
  }

  // ─── Publish ──────────────────────────────────────────────────────────────

  async function handleSubmit() {
    setErrorMsg('')

    if (!content.trim()) {
      setErrorMsg('Please write some content for your post.'); alert('Please write some content for your post.')
      return
    }
    if (activePlatforms.length === 0) {
      setErrorMsg('Please select at least one platform.'); alert('Please select at least one platform.')
      return
    }
    if (mode === 'schedule' && !scheduledFor) {
      setErrorMsg('Please select a date and time to schedule.'); alert('Please select a date and time to schedule.')
      return
    }
    if (charOver) {
      setErrorMsg(`Your post exceeds the ${charLimit}-character limit.`); alert(`Your post exceeds the ${charLimit}-character limit.`)
      return
    }
    if (!clientId) {
      setErrorMsg('Unable to identify your client profile. Please refresh.'); alert('Unable to identify your client profile. Please refresh.')
      return
    }

    let savedPostId = null

    try {
      let r2MediaUrl = null
      if (imageFile) {
        setSubmitState('uploading')
        r2MediaUrl = await uploadToR2(imageFile)
      }

      setSubmitState('posting')

      const effectiveMediaUrl =
        r2MediaUrl ||
        (dropboxAttachments.length > 0 ? dropboxAttachments[0].link : null)

      const { data: post, error: insertErr } = await supabase
        .from('posts')
        .insert({
          client_id: clientId,
          content: content.trim(),
          media_url: effectiveMediaUrl,
          platforms: activePlatforms,
          status: 'draft',
          scheduled_for: mode === 'schedule' ? scheduledFor : null,
        })
        .select()
        .single()

      if (insertErr) throw insertErr
      savedPostId = post.id

      const n8nRes = await fetch(`${N8N_BASE}/webhook/social-publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          postId: post.id,
          clientId,
          content: content.trim(),
          mediaUrl: r2MediaUrl,
          dropboxLinks: dropboxAttachments.map(({ name, link, size }) => ({ name, link, size })),
          platforms: activePlatforms,
          scheduledFor: mode === 'schedule' ? scheduledFor : null,
        }),
      })

      const n8nData = await n8nRes.json().catch(() => ({}))
      const n8nSuccess = n8nRes.ok && n8nData?.success !== false
      const newStatus = n8nSuccess
        ? mode === 'schedule' ? 'scheduled' : 'published'
        : 'failed'

      await supabase
        .from('posts')
        .update({
          status: newStatus,
          n8n_execution_id: n8nData?.zernioPostId ?? null,
          published_at: newStatus === 'published' ? new Date().toISOString() : null,
        })
        .eq('id', post.id)

      if (!n8nSuccess) {
        const errMsg = typeof n8nData?.message === 'string'
          ? n8nData.message
          : 'Publishing failed — please try again.'
        throw new Error(errMsg)
      }

      setSubmitState('success')
      setTimeout(() => {
        setContent('')
        setImageFile(null)
        setImagePreview(null)
        setDropboxAttachments([])
        setMode('now')
        setScheduledFor('')
        setSubmitState('idle')
        if (fileInputRef.current) fileInputRef.current.value = ''
      }, 3000)
    } catch (err) {
      console.error('[CreatePost]', err)
      if (savedPostId) {
        supabase.from('posts').update({ status: 'failed' }).eq('id', savedPostId).then(() => {})
      }
      setErrorMsg(err.message || 'Something went wrong. Please try again.')
      alert(err.message || 'Something went wrong. Please try again.')
      setSubmitState('error')
      setTimeout(() => setSubmitState('idle'), 4000)
    }
  }

  const isSubmitting = submitState === 'uploading' || submitState === 'posting'

  // ── Shared input style ────────────────────────────────────────────────────
  const subtleCardStyle = { background: 'rgba(255,255,255,0.88)', border: '1px solid var(--portal-border)' }

  return (
    <div className="portal-page mx-auto max-w-[1520px] space-y-6 md:p-6 xl:p-8">

      <section className="portal-surface rounded-[36px] p-5 md:p-7">
        <div className="portal-page-header">
          <div className="max-w-3xl">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="portal-chip rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em]">
                Publisher
              </span>
            </div>
            <h1 className="portal-page-title font-display">Publisher</h1>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
          {/* Dropbox button */}
          <button
            onClick={handleDropboxAttach}
            disabled={isSubmitting || dropboxLoading}
            className="flex items-center gap-3 rounded-[24px] px-5 py-4 text-left transition-all hover:-translate-y-px disabled:opacity-50 disabled:cursor-not-allowed"
            style={subtleCardStyle}>
            <div className="flex h-10 w-10 items-center justify-center rounded-[14px]"
              style={{ background: 'rgba(201, 168, 76, 0.12)', border: '1px solid rgba(201, 168, 76, 0.2)' }}>
              {dropboxLoading
                ? <Loader2 className="h-4 w-4 animate-spin" style={{ color: 'var(--portal-primary)' }} />
                : <Paperclip className="h-4 w-4" style={{ color: 'var(--portal-primary)' }} />
              }
            </div>
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.22em]" style={{ color: 'var(--portal-text-soft)' }}>Creative Assets</p>
              <p className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: 'var(--portal-text)' }}>
                {dropboxLoading ? 'Opening…' : 'Attach from Dropbox'}
                {dropboxAttachments.length > 0 && !dropboxLoading && (
                  <span style={{ color: 'var(--portal-primary)' }}>({dropboxAttachments.length})</span>
                )}
              </p>
            </div>
          </button>

          <Link
            to="/post/history"
            className="flex items-center gap-3 rounded-[24px] px-5 py-4 text-left transition-all hover:-translate-y-px"
            style={subtleCardStyle}>
            <div className="flex h-10 w-10 items-center justify-center rounded-[14px]"
              style={{ background: 'rgba(26, 24, 20, 0.06)', border: '1px solid var(--portal-border)' }}>
              <History className="h-4 w-4" style={{ color: 'var(--portal-text-muted)' }} />
            </div>
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.22em]" style={{ color: 'var(--portal-text-soft)' }}>Archive</p>
              <p className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: 'var(--portal-text)' }}>
                Post History
                <ChevronRight className="h-3 w-3" style={{ color: 'var(--portal-text-muted)' }} />
              </p>
            </div>
          </Link>
        </div>
        </div>
      </section>

      <div className="grid lg:grid-cols-5 gap-6">

        {/* Left column: form */}
        <div className="lg:col-span-3 space-y-4">

          {/* Status banners */}
          {submitState === 'success' && (
            <div className="flex items-center gap-3 rounded-2xl px-5 py-4 portal-status-success">
              <CheckCircle2 className="w-5 h-5 shrink-0" />
              <div>
                <p className="text-sm font-semibold" style={{ color: 'var(--portal-text)' }}>
                  {mode === 'schedule' ? 'Post scheduled!' : 'Post published!'}
                </p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--portal-text-muted)' }}>Your post has been sent to all selected platforms.</p>
              </div>
            </div>
          )}
          {errorMsg && (
            <div className="portal-status-danger flex items-start gap-3 rounded-2xl px-5 py-4">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <p className="text-sm">{errorMsg}</p>
            </div>
          )}

          {/* Content */}
          <div className="portal-panel rounded-[32px] p-5 md:p-6">
            <label className="block text-xs font-medium uppercase tracking-wider mb-3" style={{ color: 'var(--portal-text-soft)' }}>
              Content
            </label>
            <textarea
              value={content}
              onChange={e => { setContent(e.target.value); setErrorMsg('') }}
              placeholder="What would you like to share with your audience?"
              rows={7}
              disabled={isSubmitting}
              className="w-full bg-transparent text-sm leading-relaxed resize-none focus:outline-none"
              style={{ color: 'var(--portal-text)' }}
            />
            <div className="mt-3 flex items-center gap-3 border-t pt-3" style={{ borderColor: 'var(--portal-border)' }}>
              <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: 'rgba(26,24,20,0.08)' }}>
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${charPercent}%`,
                    background: charOver ? 'var(--portal-danger)' : 'var(--portal-primary)',
                  }}
                />
              </div>
              <span className="text-xs tabular-nums font-medium shrink-0"
                style={{ color: charOver ? 'var(--portal-danger)' : charWarning ? 'var(--portal-primary)' : 'var(--portal-text-soft)' }}>
                {content.length} / {charLimit}
              </span>
            </div>
            {selectedPlatforms.google && (
              <p className="text-[10px] mt-1.5" style={{ color: 'var(--portal-text-soft)' }}>
                Google Business posts are limited to 1,500 characters.
              </p>
            )}
          </div>

          {/* Media card */}
          <div className="portal-panel rounded-[32px] p-5 md:p-6">
            <label className="block text-xs font-medium uppercase tracking-wider mb-3" style={{ color: 'var(--portal-text-soft)' }}>
              Media
            </label>

            {imagePreview ? (
              <div className="relative rounded-xl overflow-hidden">
                <img src={imagePreview} alt="Upload preview" className="w-full max-h-64 object-cover" />
                <button
                  onClick={removeImage}
                  disabled={isSubmitting}
                  className="absolute top-2 right-2 w-8 h-8 rounded-full flex items-center justify-center text-white transition-colors"
                  style={{ background: 'rgba(0,0,0,0.6)' }}>
                  <X className="w-4 h-4" />
                </button>
                <div className="absolute bottom-2 left-2 text-[10px] px-2 py-1 rounded-lg truncate max-w-[80%]"
                  style={{ background: 'rgba(0,0,0,0.6)', color: '#c8b898' }}>
                  {imageFile?.name}
                </div>
              </div>
            ) : (
              <>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isSubmitting}
                  className="w-full flex flex-col items-center gap-4 border-2 border-dashed rounded-3xl py-12 transition-all duration-200 group"
                  style={{ borderColor: 'rgba(201, 168, 76, 0.24)', background: 'linear-gradient(145deg, rgba(201, 168, 76, 0.06), rgba(232, 213, 160, 0.05))' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(201,168,76,0.42)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(201, 168, 76, 0.24)' }}>
                  <div className="w-16 h-16 rounded-2xl flex items-center justify-center transition-transform group-hover:scale-110"
                    style={{ background: '#fff', border: '1px solid var(--portal-border)' }}>
                    <UploadCloud className="w-6 h-6" style={{ color: 'var(--portal-primary)' }} />
                  </div>
                  <div className="text-center">
                    <p className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--portal-text-muted)' }}>
                      Attach Creative Media
                    </p>
                    <p className="text-[10px] mt-1" style={{ color: 'var(--portal-text-soft)' }}>JPG, PNG, MP4 up to 50MB</p>
                  </div>
                </button>

                <div className="flex items-center gap-3 my-4">
                  <div className="flex-1 h-px" style={{ background: 'var(--portal-border)' }} />
                  <span className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--portal-text-soft)' }}>or</span>
                  <div className="flex-1 h-px" style={{ background: 'var(--portal-border)' }} />
                </div>

                <button
                  onClick={handleDropboxAttach}
                  disabled={isSubmitting || dropboxLoading}
                  className="w-full flex items-center justify-center gap-2.5 rounded-2xl py-4 transition-all duration-200 group disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ border: '1px solid var(--portal-border)', background: 'rgba(255,255,255,0.75)' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(201,168,76,0.35)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--portal-border)' }}>
                  {dropboxLoading
                    ? <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--portal-primary)' }} />
                    : <Paperclip className="w-4 h-4" style={{ color: 'var(--portal-primary)' }} />
                  }
                  <span className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--portal-text-muted)' }}>
                    {dropboxLoading ? 'Opening Dropbox…' : 'Attach from Dropbox'}
                  </span>
                </button>
              </>
            )}

            {imagePreview && dropboxAttachments.length === 0 && (
              <button
                onClick={handleDropboxAttach}
                disabled={isSubmitting || dropboxLoading}
                className="mt-3 w-full flex items-center justify-center gap-2 rounded-xl py-3 transition-all duration-200 group disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ border: '1px dashed var(--portal-border)' }}>
                {dropboxLoading
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: 'var(--portal-primary)' }} />
                  : <Paperclip className="w-3.5 h-3.5" style={{ color: 'var(--portal-text-soft)' }} />
                }
                <span className="text-[11px] font-medium uppercase tracking-wider" style={{ color: 'var(--portal-text-soft)' }}>
                  {dropboxLoading ? 'Opening Dropbox…' : 'Also Attach from Dropbox'}
                </span>
              </button>
            )}

            {/* Dropbox attachments list */}
            {dropboxAttachments.length > 0 && (
              <div className={imagePreview ? 'mt-4' : 'mt-3'}>
                <div className="flex items-center justify-between mb-2.5">
                  <p className="text-[10px] uppercase tracking-widest font-medium" style={{ color: 'var(--portal-text-soft)' }}>
                    Dropbox Links · {dropboxAttachments.length}
                  </p>
                  <button
                    onClick={handleDropboxAttach}
                    disabled={isSubmitting || dropboxLoading}
                    className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-widest transition-colors disabled:opacity-40"
                    style={{ color: 'var(--portal-primary)' }}>
                    {dropboxLoading
                      ? <><Loader2 className="w-2.5 h-2.5 animate-spin" /> Opening…</>
                      : <><Paperclip className="w-2.5 h-2.5" /> Add More</>
                    }
                  </button>
                </div>
                <div className="space-y-2">
                  {dropboxAttachments.map(file => (
                    <div key={file.link} className="flex items-center gap-3 rounded-xl px-3 py-2.5"
                      style={{ background: 'rgba(255,255,255,0.86)', border: '1px solid var(--portal-border)' }}>
                      {file.thumbnail ? (
                        <img src={file.thumbnail} alt={file.name} className="w-8 h-8 rounded-lg object-cover shrink-0" style={{ background: '#3d3420' }} />
                      ) : (
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                          style={{ background: 'rgba(201, 168, 76, 0.1)', border: '1px solid rgba(201, 168, 76, 0.18)' }}>
                          <Paperclip className="w-3.5 h-3.5" style={{ color: 'var(--portal-primary)' }} />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate" style={{ color: 'var(--portal-text)' }}>{file.name}</p>
                        {file.size > 0 && (
                          <p className="text-[10px] mt-0.5" style={{ color: 'var(--portal-text-soft)' }}>{formatFileSize(file.size)}</p>
                        )}
                      </div>
                      <a href={file.link} target="_blank" rel="noopener noreferrer"
                        className="shrink-0 p-1 transition-colors"
                        style={{ color: 'var(--portal-text-soft)' }} title="Open in Dropbox">
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      </a>
                      <button onClick={() => removeDropboxAttachment(file.link)} disabled={isSubmitting}
                        className="shrink-0 p-1 transition-colors hover:text-rose-400"
                        style={{ color: 'var(--portal-text-soft)' }} title="Remove attachment">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>

          {/* Platform toggles */}
          <div className="portal-panel rounded-[32px] p-5 md:p-6">
            <label className="block text-xs font-medium uppercase tracking-wider mb-3" style={{ color: 'var(--portal-text-soft)' }}>
              Publish to
            </label>
            <div className="grid grid-cols-2 gap-3">
              {PLATFORMS.map(({ id, label, Icon, accent, soft }) => {
                const active = selectedPlatforms[id]
                return (
                  <button
                    key={id}
                    onClick={() => togglePlatform(id)}
                    disabled={isSubmitting}
                    className="flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all duration-200"
                    style={active
                      ? { background: soft, border: `1px solid ${accent}40`, color: accent }
                      : { background: 'rgba(255,255,255,0.82)', border: '1px solid var(--portal-border)', color: 'var(--portal-text-muted)' }}>
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg shrink-0 transition-opacity"
                      style={{ background: accent, opacity: active ? 1 : 0.35 }}>
                      <Icon className="w-3.5 h-3.5 text-white" strokeWidth={2} />
                    </div>
                    <span className="text-sm font-medium flex-1">{label}</span>
                    <div className="flex h-4 w-4 items-center justify-center rounded-full border-2 shrink-0 transition-all"
                      style={active ? { borderColor: accent, background: accent } : { borderColor: 'var(--portal-border-strong)' }}>
                      {active && <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#fff' }} />}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* When to post */}
          <div className="portal-panel rounded-[32px] p-5 md:p-6">
            <label className="block text-xs font-medium uppercase tracking-wider mb-3" style={{ color: 'var(--portal-text-soft)' }}>
              When to post
            </label>
            <div className="flex gap-3 mb-4">
              {[
                { value: 'now', Icon: Send, label: 'Post Now' },
                { value: 'schedule', Icon: Calendar, label: 'Schedule' },
              ].map(({ value, Icon, label }) => (
                <button
                  key={value}
                  onClick={() => setMode(value)}
                  disabled={isSubmitting}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-medium transition-all duration-200"
                  style={mode === value
                    ? { background: 'rgba(201,168,76,0.12)', border: '1px solid rgba(201,168,76,0.28)', color: 'var(--portal-primary)' }
                    : { background: 'rgba(255,255,255,0.82)', border: '1px solid var(--portal-border)', color: 'var(--portal-text-muted)' }
                  }>
                  <Icon className="w-4 h-4" />
                  {label}
                </button>
              ))}
            </div>
            {mode === 'schedule' && (
              <input
                type="datetime-local"
                value={scheduledFor}
                onChange={e => setScheduledFor(e.target.value)}
                min={new Date(Date.now() + 5 * 60_000).toISOString().slice(0, 16)}
                disabled={isSubmitting}
                className="portal-input w-full rounded-xl px-4 py-2.5 text-sm focus:outline-none transition-all"
                style={{ colorScheme: 'light' }}
              />
            )}
          </div>

          {/* Submit button */}
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || charOver || submitState === 'success'}
            className="w-full flex items-center justify-center gap-3 py-4 rounded-2xl text-sm font-semibold transition-all duration-200 hover:-translate-y-px active:translate-y-0 disabled:opacity-30 disabled:cursor-not-allowed disabled:translate-y-0"
            style={{ background: 'linear-gradient(135deg, var(--portal-primary), #ddc275)', color: 'var(--portal-dark)' }}>
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {submitState === 'uploading' ? 'Uploading image…' : 'Publishing…'}
              </>
            ) : submitState === 'success' ? (
              <>
                <CheckCircle2 className="w-4 h-4" />
                {mode === 'schedule' ? 'Scheduled!' : 'Published!'}
              </>
            ) : (
              <>
                {mode === 'schedule' ? <Calendar className="w-4 h-4" /> : <Send className="w-4 h-4" />}
                {mode === 'schedule' ? 'Schedule Post' : 'Post Now'}
              </>
            )}
          </button>

          {/* Mobile history link */}
          <Link
            to="/post/history"
            className="sm:hidden flex items-center justify-center gap-2 text-sm py-2 transition-colors hover:text-brand-gold"
            style={{ color: '#8a7858' }}>
            <History className="w-4 h-4" />
            View Post History
          </Link>
        </div>

        {/* Right column: preview */}
        <div className="lg:col-span-2">
          <div className="sticky top-6">
            <div className="flex items-center gap-2 mb-3">
              <Eye className="w-3.5 h-3.5" style={{ color: 'var(--portal-text-muted)' }} />
              <span className="text-xs font-medium uppercase tracking-widest" style={{ color: 'var(--portal-text-muted)' }}>Preview</span>
            </div>

            <div className="portal-panel overflow-hidden rounded-[32px]">
              {/* Mock post header */}
              <div className="flex items-center gap-3 px-4 py-4" style={{ borderBottom: '1px solid var(--portal-border)' }}>
                <div className="w-10 h-10 rounded-full overflow-hidden shrink-0 border"
                  style={{ borderColor: 'var(--portal-border)' }}>
                  <img
                    src="https://pub-ba8be99ab92a493c8f41012c737905d5.r2.dev/dancescapes%20logo.jpg"
                    alt="Logo"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium leading-tight truncate" style={{ color: 'var(--portal-text)' }}>
                    {profile?.clients?.business_name || 'Your Business'}
                  </p>
                  <p className="text-[10px]" style={{ color: 'var(--portal-text-soft)' }}>Just now</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {activePlatforms.map(id => {
                    const p = PLATFORMS.find(p => p.id === id)
                    if (!p) return null
                    return (
                      <div key={id} className="flex h-5 w-5 items-center justify-center rounded-md" style={{ background: p.accent }}>
                        <p.Icon className="w-2.5 h-2.5 text-white" strokeWidth={2.5} />
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Post content */}
              <div className="px-4 py-3 min-h-[60px]">
                {content ? (
                  <p className="text-sm leading-relaxed whitespace-pre-wrap break-words" style={{ color: 'var(--portal-text)' }}>
                    {content.length > 300 ? content.slice(0, 300) + '…' : content}
                  </p>
                ) : (
                  <p className="text-sm italic" style={{ color: 'var(--portal-text-soft)' }}>Your post content will appear here…</p>
                )}
              </div>

              {/* Local image preview */}
              {imagePreview && (
                <img src={imagePreview} alt="Post media" className="w-full object-cover max-h-52" />
              )}

              {/* Dropbox attachments preview */}
              {dropboxAttachments.length > 0 && (
                <div className="px-4 py-3" style={{ borderTop: '1px solid var(--portal-border)' }}>
                  <p className="text-[10px] font-medium uppercase tracking-widest mb-2" style={{ color: 'var(--portal-text-soft)' }}>
                    Dropbox · {dropboxAttachments.length} file{dropboxAttachments.length !== 1 ? 's' : ''}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {dropboxAttachments.slice(0, 3).map(file => (
                      <div key={file.link} className="flex items-center gap-1.5 rounded-lg px-2 py-1 max-w-[140px]"
                        style={{ background: 'rgba(255,255,255,0.86)', border: '1px solid var(--portal-border)' }}>
                        {file.thumbnail
                          ? <img src={file.thumbnail} alt="" className="w-4 h-4 rounded object-cover shrink-0" />
                          : <Paperclip className="w-3 h-3 shrink-0" style={{ color: 'var(--portal-primary)' }} />
                        }
                        <span className="text-[10px] truncate" style={{ color: 'var(--portal-text)' }}>{file.name}</span>
                      </div>
                    ))}
                    {dropboxAttachments.length > 3 && (
                      <div className="flex items-center px-2 py-1 rounded-lg"
                        style={{ background: 'rgba(255,255,255,0.86)', border: '1px solid var(--portal-border)' }}>
                        <span className="text-[10px]" style={{ color: 'var(--portal-text-soft)' }}>+{dropboxAttachments.length - 3} more</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Footer */}
              <div className="px-4 py-3" style={{ borderTop: '1px solid var(--portal-border)' }}>
                {activePlatforms.length === 0 ? (
                  <span className="text-xs" style={{ color: 'var(--portal-text-soft)' }}>No platforms selected</span>
                ) : (
                  <span className="text-xs" style={{ color: 'var(--portal-text-muted)' }}>
                    Publishing to{' '}
                    <span className="font-medium" style={{ color: 'var(--portal-text)' }}>
                      {activePlatforms
                        .map(id => PLATFORMS.find(p => p.id === id)?.label)
                        .join(', ')}
                    </span>
                  </span>
                )}
                {mode === 'schedule' && scheduledFor && (
                  <div className="flex items-center gap-1 mt-1.5 text-xs" style={{ color: '#d4a83a' }}>
                    <Clock className="w-3 h-3" />
                    {new Date(scheduledFor).toLocaleDateString('en-US', {
                      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
