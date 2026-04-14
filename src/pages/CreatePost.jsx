import { useState, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useOutletContext, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import {
  Send, X, Clock, Calendar, CheckCircle2,
  AlertCircle, Loader2, Globe, Music2, Eye,
  UploadCloud, History, ChevronRight, Share2, Camera,
  ArrowUpRight, ImagePlus
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

export default function CreatePost() {
  useOutletContext()
  const fileInputRef = useRef(null)

  const [content, setContent] = useState('')
  const [imageFile, setImageFile] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
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

  function handleFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setErrorMsg('Only image files are supported.'); alert('Only image files are supported.');
      return
    }
    setImageFile(file)
    const reader = new FileReader()
    reader.onload = ev => setImagePreview(ev.target.result)
    reader.readAsDataURL(file)
    setErrorMsg('');
  }

  function removeImage() {
    setImageFile(null)
    setImagePreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function togglePlatform(id) {
    setSelectedPlatforms(prev => ({ ...prev, [id]: !prev[id] }))
  }

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

  async function handleSubmit() {
    setErrorMsg('');

    if (!content.trim()) {
      setErrorMsg('Please write some content for your post.'); alert('Please write some content for your post.');
      return
    }
    if (activePlatforms.length === 0) {
      setErrorMsg('Please select at least one platform.'); alert('Please select at least one platform.');
      return
    }
    if (mode === 'schedule' && !scheduledFor) {
      setErrorMsg('Please select a date and time to schedule.'); alert('Please select a date and time to schedule.');
      return
    }
    if (charOver) {
      setErrorMsg(`Your post exceeds the ${charLimit}-character limit.`); alert(`Your post exceeds the ${charLimit}-character limit.`);
      return
    }
    if (!clientId) {
      setErrorMsg('Unable to identify your client profile. Please refresh.'); alert('Unable to identify your client profile. Please refresh.');
      return
    }

    let savedPostId = null

    try {
      let mediaUrl = null

      if (imageFile) {
        setSubmitState('uploading')
        mediaUrl = await uploadToR2(imageFile)
      }

      setSubmitState('posting')

      // Save draft to Supabase
      const { data: post, error: insertErr } = await supabase
        .from('posts')
        .insert({
          client_id: clientId,
          content: content.trim(),
          media_url: mediaUrl,
          platforms: activePlatforms,
          status: 'draft',
          scheduled_for: mode === 'schedule' ? scheduledFor : null,
        })
        .select()
        .single()

      if (insertErr) throw insertErr
      savedPostId = post.id

      // Fire n8n webhook
      const n8nRes = await fetch(`${N8N_BASE}/webhook/social-publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          postId: post.id,
          clientId,
          content: content.trim(),
          mediaUrl,
          platforms: activePlatforms,
          scheduledFor: mode === 'schedule' ? scheduledFor : null,
        }),
      })

      const n8nData = await n8nRes.json().catch(() => ({}))
      // Use n8nData.success (set by n8n) to determine real outcome — n8n always returns HTTP 200
      const n8nSuccess = n8nRes.ok && n8nData?.success !== false
      const newStatus = n8nSuccess
        ? mode === 'schedule' ? 'scheduled' : 'published'
        : 'failed'

      // Update status in Supabase (zernioPostId is our tracking ID)
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
        setMode('now')
        setScheduledFor('')
        setSubmitState('idle')
        if (fileInputRef.current) fileInputRef.current.value = ''
      }, 3000)
    } catch (err) {
      console.error('[CreatePost]', err)
      // Mark the post as failed so it doesn't stay stuck as "draft"
      if (savedPostId) {
        supabase.from('posts').update({ status: 'failed' }).eq('id', savedPostId).then(() => {})
      }
      setErrorMsg(err.message || 'Something went wrong. Please try again.'); alert(err.message || 'Something went wrong. Please try again.');
      setSubmitState('error')
      setTimeout(() => setSubmitState('idle'), 4000)
    }
  }

  const isSubmitting = submitState === 'uploading' || submitState === 'posting'

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 mb-10">
        <div>
          <p className="text-[10px] text-brand-gold uppercase font-black tracking-[.3em] mb-2">Publishing Station</p>
          <h1 className="text-3xl md:text-5xl font-black text-white uppercase italic tracking-tighter leading-none">
            Social <span className="text-zinc-700">Publisher</span>
          </h1>
          <p className="text-zinc-500 text-sm mt-3 font-medium max-w-lg">
            Draft, schedule, and distribute high-impact social content to your entire studio ecosystem from one terminal.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <a
            href="https://www.dropbox.com/home"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 bg-zinc-900 border border-zinc-800 px-6 py-4 rounded-2xl group transition-all hover:border-brand-gold/30"
          >
            <div className="w-8 h-8 rounded-lg bg-brand-gold/10 border border-brand-gold/20 flex items-center justify-center">
               <ImagePlus className="w-4 h-4 text-brand-gold" />
            </div>
            <div>
              <p className="text-[9px] font-black text-zinc-600 uppercase tracking-widest leading-none mb-1">Creative Assets</p>
              <p className="text-xs font-black text-white uppercase tracking-tighter flex items-center gap-1.5">
                Open Asset Hub
                <ArrowUpRight className="w-3 h-3 group-hover:text-brand-gold" />
              </p>
            </div>
          </a>

          <Link
            to="/post/history"
            className="flex items-center gap-3 bg-zinc-900 border border-zinc-800 px-6 py-4 rounded-2xl group transition-all hover:border-brand-gold/30"
          >
            <div className="w-8 h-8 rounded-lg bg-zinc-950 border border-zinc-900 flex items-center justify-center">
               <History className="w-4 h-4 text-zinc-500" />
            </div>
            <div>
              <p className="text-[9px] font-black text-zinc-600 uppercase tracking-widest leading-none mb-1">Archive</p>
              <p className="text-xs font-black text-white uppercase tracking-tighter flex items-center gap-1.5">
                Post History
                <ChevronRight className="w-3 h-3 group-hover:text-brand-gold" />
              </p>
            </div>
          </Link>
        </div>
      </div>

      <div className="grid lg:grid-cols-5 gap-6">
        {/* ── Left column: form ── */}
        <div className="lg:col-span-3 space-y-5">

          {/* Status banners */}
          {submitState === 'success' && (
            <div className="flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl px-5 py-4">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-white">
                  {mode === 'schedule' ? 'Post scheduled!' : 'Post published!'}
                </p>
                <p className="text-xs text-zinc-500 mt-0.5">Your post has been sent to all selected platforms.</p>
              </div>
            </div>
          )}
          {errorMsg && (
            <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/20 rounded-2xl px-5 py-4">
              <AlertCircle className="w-4.5 h-4.5 text-red-400 shrink-0 mt-0.5" />
              <p className="text-sm text-red-300">{errorMsg}</p>
            </div>
          )}

          {/* Content */}
          <div className="bg-zinc-900/70 border border-zinc-800/60 rounded-2xl p-5">
            <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-3">
              Content
            </label>
            <textarea
              value={content}
              onChange={e => { setContent(e.target.value); setErrorMsg(''); }}
              placeholder="What would you like to share with your audience?"
              rows={7}
              disabled={isSubmitting}
              className="w-full bg-transparent text-white placeholder-zinc-600 text-sm leading-relaxed resize-none focus:outline-none"
            />
            <div className="flex items-center gap-3 mt-3 pt-3 border-t border-zinc-800/60">
              <div className="flex-1 h-1 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    charOver ? 'bg-red-500' : charWarning ? 'bg-amber-500' : 'bg-brand-gold'
                  }`}
                  style={{ width: `${charPercent}%` }}
                />
              </div>
              <span className={`text-xs tabular-nums font-medium shrink-0 ${
                charOver ? 'text-red-400' : charWarning ? 'text-amber-400' : 'text-zinc-500'
              }`}>
                {content.length} / {charLimit}
              </span>
            </div>
            {selectedPlatforms.google && (
              <p className="text-[10px] text-zinc-600 mt-1.5">
                Google Business posts are limited to 1,500 characters.
              </p>
            )}
          </div>

          {/* Media upload */}
          <div className="bg-zinc-900/70 border border-zinc-800/60 rounded-2xl p-5">
            <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-3">
              Media
            </label>
            {imagePreview ? (
              <div className="relative rounded-xl overflow-hidden">
                <img src={imagePreview} alt="Upload preview" className="w-full max-h-64 object-cover" />
                <button
                  onClick={removeImage}
                  disabled={isSubmitting}
                  className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/80 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
                <div className="absolute bottom-2 left-2 bg-black/60 backdrop-blur-sm text-[10px] text-zinc-300 px-2 py-1 rounded-lg truncate max-w-[80%]">
                  {imageFile?.name}
                </div>
              </div>
            ) : (
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isSubmitting}
                className="w-full flex flex-col items-center gap-4 border-2 border-dashed border-zinc-800 hover:border-brand-gold/40 hover:bg-brand-gold/5 rounded-3xl py-12 transition-all duration-400 group"
              >
                <div className="w-16 h-16 rounded-2xl bg-zinc-900 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <UploadCloud className="w-6 h-6 text-zinc-600 group-hover:text-brand-gold" />
                </div>
                <div className="text-center">
                  <p className="text-xs font-black text-zinc-400 uppercase tracking-widest group-hover:text-white">Attach Creative Media</p>
                  <p className="text-[10px] text-zinc-600 mt-2 font-bold italic">JPG, PNG, MP4 up to 50MB</p>
                </div>
              </button>
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
          <div className="bg-zinc-900/70 border border-zinc-800/60 rounded-2xl p-5">
            <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-3">
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
                      active
                        ? `${bg} ${border} ${text}`
                        : 'bg-zinc-800/40 border-zinc-700/40 text-zinc-500 hover:border-zinc-600/60 hover:text-zinc-400'
                    }`}
                  >
                    <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${gradient} flex items-center justify-center shrink-0 transition-opacity ${active ? 'opacity-100' : 'opacity-30'}`}>
                      <Icon className="w-3.5 h-3.5 text-white" strokeWidth={2} />
                    </div>
                    <span className="text-sm font-medium flex-1">{label}</span>
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                      active ? 'border-current bg-current' : 'border-zinc-600'
                    }`}>
                      {active && <div className="w-1.5 h-1.5 rounded-full bg-zinc-900" />}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* When to post */}
          <div className="bg-zinc-900/70 border border-zinc-800/60 rounded-2xl p-5">
            <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-3">
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
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-medium transition-all duration-200 ${
                      mode === value
                        ? 'bg-brand-gold/10 border-brand-gold/20 text-brand-gold'
                        : 'bg-zinc-800/40 border-zinc-700/40 text-zinc-500 hover:border-zinc-600/60 hover:text-zinc-400'
                  }`}
                >
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
                className="w-full bg-zinc-800/60 border border-zinc-700/60 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-brand-gold/50 transition-all [color-scheme:dark]"
              />
            )}
          </div>

          {/* Submit button */}
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || charOver || submitState === 'success'}
            className="w-full flex items-center justify-center gap-3 py-5 rounded-2xl bg-brand-gold text-zinc-950 font-black text-xs uppercase tracking-[.2em] shadow-[0_0_30px_rgba(194,160,83,0.15)] hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-30 disabled:grayscale disabled:scale-100"
          >
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
            className="sm:hidden flex items-center justify-center gap-2 text-sm text-zinc-500 hover:text-brand-gold transition-colors py-2"
          >
            <History className="w-4 h-4" />
            View Post History
          </Link>
        </div>

        {/* ── Right column: preview ── */}
        <div className="lg:col-span-2">
          <div className="sticky top-6">
            <div className="flex items-center gap-2 mb-3">
              <Eye className="w-3.5 h-3.5 text-zinc-500" />
              <span className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">Preview</span>
            </div>

            <div className="bg-zinc-900/70 border border-zinc-800/60 rounded-2xl overflow-hidden">
              {/* Mock post header */}
              <div className="flex items-center gap-3 px-4 py-4 border-b border-zinc-800/60">
                <div className="w-10 h-10 rounded-full bg-zinc-950 border border-zinc-900 flex items-center justify-center shrink-0 overflow-hidden">
                  <img src="https://pub-ba8be99ab92a493c8f41012c737905d5.r2.dev/dancescapes%20logo.jpg" alt="Logo" className="w-full h-full object-cover" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white leading-tight truncate">
                    {profile?.clients?.business_name || 'Your Business'}
                  </p>
                  <p className="text-[10px] text-zinc-500">Just now</p>
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
                  <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap break-words">
                    {content.length > 300 ? content.slice(0, 300) + '…' : content}
                  </p>
                ) : (
                  <p className="text-sm text-zinc-600 italic">Your post content will appear here…</p>
                )}
              </div>

              {/* Image preview */}
              {imagePreview && (
                <img src={imagePreview} alt="Post media" className="w-full object-cover max-h-52" />
              )}

              {/* Footer */}
              <div className="px-4 py-3 border-t border-zinc-800/60">
                {activePlatforms.length === 0 ? (
                  <span className="text-xs text-zinc-600">No platforms selected</span>
                ) : (
                  <span className="text-xs text-zinc-500">
                    Publishing to{' '}
                    <span className="text-zinc-300 font-medium">
                      {activePlatforms
                        .map(id => PLATFORMS.find(p => p.id === id)?.label)
                        .join(', ')}
                    </span>
                  </span>
                )}
                {mode === 'schedule' && scheduledFor && (
                  <div className="flex items-center gap-1 mt-1.5 text-xs text-brand-gold">
                    <Clock className="w-3 h-3" />
                    {new Date(scheduledFor).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
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


