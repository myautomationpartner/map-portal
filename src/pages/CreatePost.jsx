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
    gradient: 'from-blue-600 to-blue-400',
    border: 'border-blue-500/40',
    bg: 'bg-blue-500/10',
    text: 'text-blue-400',
  },
  {
    id: 'instagram',
    label: 'Instagram',
    Icon: Camera,
    gradient: 'from-pink-600 to-purple-500',
    border: 'border-pink-500/40',
    bg: 'bg-pink-500/10',
    text: 'text-pink-400',
  },
  {
    id: 'google',
    label: 'Google Business',
    Icon: Globe,
    gradient: 'from-emerald-500 to-teal-400',
    border: 'border-emerald-500/40',
    bg: 'bg-emerald-500/10',
    text: 'text-emerald-400',
  },
  {
    id: 'tiktok',
    label: 'TikTok',
    Icon: Music2,
    gradient: 'from-red-500 to-pink-500',
    border: 'border-red-500/40',
    bg: 'bg-red-500/10',
    text: 'text-red-400',
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
  const cardStyle = { background: '#1e1910', border: '1px solid #3d3420' }

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto">

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 mb-10">
        <div>
          <p className="text-[10px] uppercase tracking-widest font-medium mb-2" style={{ color: '#8a7858' }}>
            Social Media
          </p>
          <h1 className="font-display text-3xl md:text-4xl font-semibold leading-tight" style={{ color: '#f8f2e4' }}>
            Social Publisher
          </h1>
          <p className="text-sm mt-2 max-w-lg" style={{ color: '#8a7858' }}>
            Draft, schedule, and distribute content to your studio's social channels.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Dropbox button */}
          <button
            onClick={handleDropboxAttach}
            disabled={isSubmitting || dropboxLoading}
            className="flex items-center gap-3 px-5 py-3 rounded-2xl transition-all hover:-translate-y-px disabled:opacity-50 disabled:cursor-not-allowed"
            style={cardStyle}>
            <div className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ background: 'rgba(0,97,254,0.10)', border: '1px solid rgba(0,97,254,0.20)' }}>
              {dropboxLoading
                ? <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin" />
                : <Paperclip className="w-3.5 h-3.5 text-blue-400" />
              }
            </div>
            <div>
              <p className="text-[9px] uppercase tracking-widest leading-none mb-1" style={{ color: '#4e4228' }}>Creative Assets</p>
              <p className="text-xs font-semibold flex items-center gap-1.5" style={{ color: '#c8b898' }}>
                {dropboxLoading ? 'Opening…' : 'Attach from Dropbox'}
                {dropboxAttachments.length > 0 && !dropboxLoading && (
                  <span className="text-blue-400">({dropboxAttachments.length})</span>
                )}
              </p>
            </div>
          </button>

          <Link
            to="/post/history"
            className="flex items-center gap-3 px-5 py-3 rounded-2xl transition-all hover:-translate-y-px"
            style={cardStyle}>
            <div className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ background: '#252015', border: '1px solid #3d3420' }}>
              <History className="w-3.5 h-3.5" style={{ color: '#8a7858' }} />
            </div>
            <div>
              <p className="text-[9px] uppercase tracking-widest leading-none mb-1" style={{ color: '#4e4228' }}>Archive</p>
              <p className="text-xs font-semibold flex items-center gap-1.5" style={{ color: '#c8b898' }}>
                Post History
                <ChevronRight className="w-3 h-3" style={{ color: '#8a7858' }} />
              </p>
            </div>
          </Link>
        </div>
      </div>

      <div className="grid lg:grid-cols-5 gap-6">

        {/* Left column: form */}
        <div className="lg:col-span-3 space-y-4">

          {/* Status banners */}
          {submitState === 'success' && (
            <div className="flex items-center gap-3 rounded-2xl px-5 py-4"
              style={{ background: 'rgba(107,193,142,0.08)', border: '1px solid rgba(107,193,142,0.2)' }}>
              <CheckCircle2 className="w-5 h-5 shrink-0" style={{ color: '#6bc18e' }} />
              <div>
                <p className="text-sm font-semibold" style={{ color: '#f8f2e4' }}>
                  {mode === 'schedule' ? 'Post scheduled!' : 'Post published!'}
                </p>
                <p className="text-xs mt-0.5" style={{ color: '#8a7858' }}>Your post has been sent to all selected platforms.</p>
              </div>
            </div>
          )}
          {errorMsg && (
            <div className="flex items-start gap-3 rounded-2xl px-5 py-4"
              style={{ background: 'rgba(196,85,110,0.08)', border: '1px solid rgba(196,85,110,0.2)' }}>
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: '#e8899a' }} />
              <p className="text-sm" style={{ color: '#e8899a' }}>{errorMsg}</p>
            </div>
          )}

          {/* Content */}
          <div className="rounded-2xl p-5" style={cardStyle}>
            <label className="block text-xs font-medium uppercase tracking-wider mb-3" style={{ color: '#8a7858' }}>
              Content
            </label>
            <textarea
              value={content}
              onChange={e => { setContent(e.target.value); setErrorMsg('') }}
              placeholder="What would you like to share with your audience?"
              rows={7}
              disabled={isSubmitting}
              className="w-full bg-transparent text-sm leading-relaxed resize-none focus:outline-none"
              style={{ color: '#f8f2e4' }}
            />
            <div className="flex items-center gap-3 mt-3 pt-3" style={{ borderTop: '1px solid #3d3420' }}>
              <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: '#252015' }}>
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${charPercent}%`,
                    background: charOver ? '#c4556e' : charWarning ? '#d4a83a' : '#d4a83a',
                  }}
                />
              </div>
              <span className="text-xs tabular-nums font-medium shrink-0"
                style={{ color: charOver ? '#e8899a' : charWarning ? '#d4a83a' : '#4e4228' }}>
                {content.length} / {charLimit}
              </span>
            </div>
            {selectedPlatforms.google && (
              <p className="text-[10px] mt-1.5" style={{ color: '#4e4228' }}>
                Google Business posts are limited to 1,500 characters.
              </p>
            )}
          </div>

          {/* Media card */}
          <div className="rounded-2xl p-5" style={cardStyle}>
            <label className="block text-xs font-medium uppercase tracking-wider mb-3" style={{ color: '#8a7858' }}>
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
                  style={{ borderColor: '#3d3420' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(212,168,58,0.35)'; e.currentTarget.style.background = 'rgba(212,168,58,0.04)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = '#3d3420'; e.currentTarget.style.background = 'transparent' }}>
                  <div className="w-16 h-16 rounded-2xl flex items-center justify-center transition-transform group-hover:scale-110"
                    style={{ background: '#252015' }}>
                    <UploadCloud className="w-6 h-6" style={{ color: '#8a7858' }} />
                  </div>
                  <div className="text-center">
                    <p className="text-xs font-medium uppercase tracking-wider" style={{ color: '#8a7858' }}>
                      Attach Creative Media
                    </p>
                    <p className="text-[10px] mt-1" style={{ color: '#4e4228' }}>JPG, PNG, MP4 up to 50MB</p>
                  </div>
                </button>

                <div className="flex items-center gap-3 my-4">
                  <div className="flex-1 h-px" style={{ background: '#3d3420' }} />
                  <span className="text-[10px] uppercase tracking-widest" style={{ color: '#4e4228' }}>or</span>
                  <div className="flex-1 h-px" style={{ background: '#3d3420' }} />
                </div>

                <button
                  onClick={handleDropboxAttach}
                  disabled={isSubmitting || dropboxLoading}
                  className="w-full flex items-center justify-center gap-2.5 rounded-2xl py-4 transition-all duration-200 group disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ border: '1px solid #3d3420' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(0,97,254,0.35)'; e.currentTarget.style.background = 'rgba(0,97,254,0.04)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = '#3d3420'; e.currentTarget.style.background = 'transparent' }}>
                  {dropboxLoading
                    ? <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
                    : <Paperclip className="w-4 h-4" style={{ color: '#8a7858' }} />
                  }
                  <span className="text-xs font-medium uppercase tracking-wider" style={{ color: '#8a7858' }}>
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
                style={{ border: '1px dashed #3d3420' }}>
                {dropboxLoading
                  ? <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin" />
                  : <Paperclip className="w-3.5 h-3.5" style={{ color: '#4e4228' }} />
                }
                <span className="text-[11px] font-medium uppercase tracking-wider" style={{ color: '#4e4228' }}>
                  {dropboxLoading ? 'Opening Dropbox…' : 'Also Attach from Dropbox'}
                </span>
              </button>
            )}

            {/* Dropbox attachments list */}
            {dropboxAttachments.length > 0 && (
              <div className={imagePreview ? 'mt-4' : 'mt-3'}>
                <div className="flex items-center justify-between mb-2.5">
                  <p className="text-[10px] uppercase tracking-widest font-medium" style={{ color: '#4e4228' }}>
                    Dropbox Links · {dropboxAttachments.length}
                  </p>
                  <button
                    onClick={handleDropboxAttach}
                    disabled={isSubmitting || dropboxLoading}
                    className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-widest transition-colors disabled:opacity-40 text-blue-400 hover:text-blue-300">
                    {dropboxLoading
                      ? <><Loader2 className="w-2.5 h-2.5 animate-spin" /> Opening…</>
                      : <><Paperclip className="w-2.5 h-2.5" /> Add More</>
                    }
                  </button>
                </div>
                <div className="space-y-2">
                  {dropboxAttachments.map(file => (
                    <div key={file.link} className="flex items-center gap-3 rounded-xl px-3 py-2.5"
                      style={{ background: '#252015', border: '1px solid #3d3420' }}>
                      {file.thumbnail ? (
                        <img src={file.thumbnail} alt={file.name} className="w-8 h-8 rounded-lg object-cover shrink-0" style={{ background: '#3d3420' }} />
                      ) : (
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                          style={{ background: 'rgba(0,97,254,0.10)', border: '1px solid rgba(0,97,254,0.20)' }}>
                          <Paperclip className="w-3.5 h-3.5 text-blue-400" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate" style={{ color: '#f8f2e4' }}>{file.name}</p>
                        {file.size > 0 && (
                          <p className="text-[10px] mt-0.5" style={{ color: '#4e4228' }}>{formatFileSize(file.size)}</p>
                        )}
                      </div>
                      <a href={file.link} target="_blank" rel="noopener noreferrer"
                        className="shrink-0 p-1 transition-colors hover:text-brand-gold"
                        style={{ color: '#4e4228' }} title="Open in Dropbox">
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      </a>
                      <button onClick={() => removeDropboxAttachment(file.link)} disabled={isSubmitting}
                        className="shrink-0 p-1 transition-colors hover:text-rose-400"
                        style={{ color: '#4e4228' }} title="Remove attachment">
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
          <div className="rounded-2xl p-5" style={cardStyle}>
            <label className="block text-xs font-medium uppercase tracking-wider mb-3" style={{ color: '#8a7858' }}>
              Publish to
            </label>
            <div className="grid grid-cols-2 gap-3">
              {PLATFORMS.map(({ id, label, Icon, gradient, border, bg, text }) => {
                const active = selectedPlatforms[id]
                return (
                  <button
                    key={id}
                    onClick={() => togglePlatform(id)}
                    disabled={isSubmitting}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all duration-200 ${
                      active ? `${bg} ${border} ${text}` : 'text-[#8a7858]'
                    }`}
                    style={active ? {} : { background: '#252015', border: '1px solid #3d3420' }}>
                    <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${gradient} flex items-center justify-center shrink-0 transition-opacity ${active ? 'opacity-100' : 'opacity-30'}`}>
                      <Icon className="w-3.5 h-3.5 text-white" strokeWidth={2} />
                    </div>
                    <span className="text-sm font-medium flex-1">{label}</span>
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${active ? 'border-current bg-current' : ''}`}
                      style={active ? {} : { borderColor: '#3d3420' }}>
                      {active && <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#0d0b08' }} />}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* When to post */}
          <div className="rounded-2xl p-5" style={cardStyle}>
            <label className="block text-xs font-medium uppercase tracking-wider mb-3" style={{ color: '#8a7858' }}>
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
                    ? { background: 'rgba(212,168,58,0.10)', border: '1px solid rgba(212,168,58,0.22)', color: '#d4a83a' }
                    : { background: '#252015', border: '1px solid #3d3420', color: '#8a7858' }
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
                className="w-full rounded-xl px-4 py-2.5 text-sm focus:outline-none transition-all [color-scheme:dark]"
                style={{ background: '#252015', border: '1px solid #3d3420', color: '#f8f2e4' }}
                onFocus={e => e.target.style.borderColor = '#d4a83a'}
                onBlur={e => e.target.style.borderColor = '#3d3420'}
              />
            )}
          </div>

          {/* Submit button */}
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || charOver || submitState === 'success'}
            className="w-full flex items-center justify-center gap-3 py-4 rounded-2xl text-sm font-semibold transition-all duration-200 hover:-translate-y-px active:translate-y-0 disabled:opacity-30 disabled:cursor-not-allowed disabled:translate-y-0"
            style={{ background: '#c4556e', color: '#fff' }}>
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
              <Eye className="w-3.5 h-3.5" style={{ color: '#8a7858' }} />
              <span className="text-xs font-medium uppercase tracking-widest" style={{ color: '#8a7858' }}>Preview</span>
            </div>

            <div className="rounded-2xl overflow-hidden" style={cardStyle}>
              {/* Mock post header */}
              <div className="flex items-center gap-3 px-4 py-4" style={{ borderBottom: '1px solid #3d3420' }}>
                <div className="w-10 h-10 rounded-full overflow-hidden shrink-0 border"
                  style={{ borderColor: '#3d3420' }}>
                  <img
                    src="https://pub-ba8be99ab92a493c8f41012c737905d5.r2.dev/dancescapes%20logo.jpg"
                    alt="Logo"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium leading-tight truncate" style={{ color: '#f8f2e4' }}>
                    {profile?.clients?.business_name || 'Your Business'}
                  </p>
                  <p className="text-[10px]" style={{ color: '#4e4228' }}>Just now</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {activePlatforms.map(id => {
                    const p = PLATFORMS.find(p => p.id === id)
                    if (!p) return null
                    return (
                      <div key={id} className={`w-5 h-5 rounded-md bg-gradient-to-br ${p.gradient} flex items-center justify-center`}>
                        <p.Icon className="w-2.5 h-2.5 text-white" strokeWidth={2.5} />
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Post content */}
              <div className="px-4 py-3 min-h-[60px]">
                {content ? (
                  <p className="text-sm leading-relaxed whitespace-pre-wrap break-words" style={{ color: '#c8b898' }}>
                    {content.length > 300 ? content.slice(0, 300) + '…' : content}
                  </p>
                ) : (
                  <p className="text-sm italic" style={{ color: '#4e4228' }}>Your post content will appear here…</p>
                )}
              </div>

              {/* Local image preview */}
              {imagePreview && (
                <img src={imagePreview} alt="Post media" className="w-full object-cover max-h-52" />
              )}

              {/* Dropbox attachments preview */}
              {dropboxAttachments.length > 0 && (
                <div className="px-4 py-3" style={{ borderTop: '1px solid #3d3420' }}>
                  <p className="text-[10px] font-medium uppercase tracking-widest mb-2" style={{ color: '#4e4228' }}>
                    Dropbox · {dropboxAttachments.length} file{dropboxAttachments.length !== 1 ? 's' : ''}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {dropboxAttachments.slice(0, 3).map(file => (
                      <div key={file.link} className="flex items-center gap-1.5 rounded-lg px-2 py-1 max-w-[140px]"
                        style={{ background: '#252015', border: '1px solid #3d3420' }}>
                        {file.thumbnail
                          ? <img src={file.thumbnail} alt="" className="w-4 h-4 rounded object-cover shrink-0" />
                          : <Paperclip className="w-3 h-3 text-blue-400 shrink-0" />
                        }
                        <span className="text-[10px] truncate" style={{ color: '#c8b898' }}>{file.name}</span>
                      </div>
                    ))}
                    {dropboxAttachments.length > 3 && (
                      <div className="flex items-center px-2 py-1 rounded-lg"
                        style={{ background: '#252015', border: '1px solid #3d3420' }}>
                        <span className="text-[10px]" style={{ color: '#4e4228' }}>+{dropboxAttachments.length - 3} more</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Footer */}
              <div className="px-4 py-3" style={{ borderTop: '1px solid #3d3420' }}>
                {activePlatforms.length === 0 ? (
                  <span className="text-xs" style={{ color: '#4e4228' }}>No platforms selected</span>
                ) : (
                  <span className="text-xs" style={{ color: '#8a7858' }}>
                    Publishing to{' '}
                    <span className="font-medium" style={{ color: '#c8b898' }}>
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
