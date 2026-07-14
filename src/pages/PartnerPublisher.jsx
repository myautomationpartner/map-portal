import { useEffect, useMemo, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Bell, CalendarDays, Camera, Check, Image as ImageIcon, Inbox, Loader2, Mic, Pencil, RefreshCw, Send, Sparkles, X } from 'lucide-react'
import { supabase } from '../lib/supabase'

const N8N_BASE = import.meta.env.VITE_N8N_BASE_URL || 'https://n8n.myautomationpartner.com'
const PARTNER_URL = import.meta.env.VITE_PARTNER_ASSIST_URL || `${N8N_BASE}/webhook/partner-assist`
const PUBLISH_URL = import.meta.env.VITE_SOCIAL_PUBLISH_URL || `${N8N_BASE}/webhook/social-publish`
const IMAGE_URL = import.meta.env.VITE_PARTNER_IMAGE_URL || `${N8N_BASE}/webhook/partner-image`
const starterMessage = { id: 'welcome', role: 'assistant', type: 'text', text: 'Tell me what you want to create. I can write the post, use or generate an image, prepare each channel, and publish only after you approve it.' }
const quickPrompts = ['Promote a service', 'Announce an update', 'Create an offer', 'Build this week']
const makeId = () => crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`

async function fetchProfile() {
  const { data, error } = await supabase.from('users').select('*, clients(*)').single()
  if (error) throw error
  return data
}

function AssistantAvatar() {
  return <div className="relative mt-1 h-11 w-11 shrink-0 rounded-full border-[3px] border-[#14b9c1] bg-[#071d28]"><div className="absolute inset-1 flex items-center justify-center rounded-full border border-[#8a63ff]/60 text-[10px] font-black text-white">MAP</div><span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-[#8fd128]" /></div>
}

function ChannelBadge({ channel }) {
  const mark = channel === 'facebook' ? 'f' : channel === 'instagram' ? '◎' : channel === 'x' ? 'X' : channel[0]?.toUpperCase()
  return <div className="flex items-center gap-2 rounded-2xl border border-[#79d8dd] bg-[#e7fbfb] px-3 py-3"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#0f858c] text-sm font-bold text-white">{mark}</span><span className="truncate text-sm font-semibold capitalize">{channel}</span><Check className="ml-auto h-4 w-4 text-[#57bb27]" /></div>
}

function MessageCard({ message, onAction }) {
  if (message.role === 'user') return <div className="flex justify-end gap-2 pl-12"><div className="max-w-[84%] whitespace-pre-wrap rounded-[22px] rounded-br-md bg-gradient-to-br from-[#16b9c1] to-[#079da7] px-5 py-3.5 text-[15px] font-medium leading-6 text-white">{message.text}</div></div>
  return <div className="flex items-start gap-3"><AssistantAvatar /><div className="min-w-0 flex-1">
    {message.text && <div className="rounded-[22px] rounded-tl-md border border-[#d8e1e4] bg-white px-5 py-4 text-[15px] font-medium leading-6 shadow-sm">{message.text}</div>}
    {message.type === 'caption' && <div className="mt-3 rounded-[22px] border border-[#d8e1e4] bg-white p-4 shadow-sm"><p className="whitespace-pre-wrap text-[15px] font-bold leading-6">{message.caption}</p><div className="mt-3 flex flex-wrap gap-2"><button onClick={() => navigator.clipboard?.writeText(message.caption || '')} className="rounded-xl border px-3 py-2 text-xs font-semibold">Copy</button><button onClick={() => onAction({ type: 'generate_image', message })} className="rounded-xl bg-[#e9fbfb] px-3 py-2 text-xs font-bold text-[#107d86]">Generate image</button><button onClick={() => onAction({ type: 'prepare_publish', message })} className="rounded-xl bg-[#12b7c0] px-3 py-2 text-xs font-black text-white">Prepare post</button></div></div>}
    {message.type === 'image' && <div className="mt-3 rounded-[24px] border border-[#d8e1e4] bg-white p-3 shadow-sm"><img src={message.imageUrl} alt="Generated creative" className="max-h-[520px] w-full rounded-2xl object-cover" /><div className="mt-3 flex gap-2"><button onClick={() => onAction({ type: 'replace_image' })} className="rounded-xl px-3 py-2 text-xs font-semibold">Replace</button><button onClick={() => onAction({ type: 'regenerate_image', message })} className="rounded-xl px-3 py-2 text-xs font-semibold">Regenerate</button></div></div>}
    {message.type === 'publish_ready' && <div className="mt-3 rounded-[24px] border border-[#d8e1e4] bg-white p-4 shadow-sm">{message.caption && <p className="mb-4 whitespace-pre-wrap text-sm font-semibold leading-6">{message.caption}</p>}{message.imageUrl && <img src={message.imageUrl} alt="Preview" className="mb-4 max-h-80 w-full rounded-2xl object-cover" />}<div className="grid grid-cols-2 gap-2">{(message.channels || ['facebook', 'instagram']).map(channel => <ChannelBadge key={channel} channel={channel} />)}</div><div className="mt-4 grid grid-cols-[1fr_auto] gap-2"><button onClick={() => onAction({ type: 'publish', message })} className="flex items-center justify-center gap-2 rounded-2xl bg-[#10b7c0] px-4 py-4 text-sm font-black"><Check className="h-5 w-5" />Review & post</button><button onClick={() => onAction({ type: 'edit_post', message })} className="rounded-2xl border bg-[#eef3f4] px-4"><Pencil className="h-5 w-5" /></button></div></div>}
  </div></div>
}

function fallback(prompt) {
  const topic = prompt.replace(/^(create|build|write|make)\s+(me\s+)?(a\s+)?(post\s+)?(about|for)?\s*/i, '').trim() || 'your business update'
  return { id: makeId(), role: 'assistant', type: 'caption', text: 'I created a ready-to-edit draft.', caption: `Here is what is new with ${topic}. We are making it easier for customers to get the help, service, and follow-up they need.\n\nWant to learn more? Send us a message today.` }
}

export default function PartnerPublisher() {
  useOutletContext()
  const { data: profile } = useQuery({ queryKey: ['profile'], queryFn: fetchProfile })
  const [messages, setMessages] = useState(() => { try { return JSON.parse(localStorage.getItem('map-partner-chat')) || [starterMessage] } catch { return [starterMessage] } })
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [attachment, setAttachment] = useState(null)
  const [review, setReview] = useState(null)
  const [publishing, setPublishing] = useState(false)
  const [conversationId, setConversationId] = useState(() => localStorage.getItem('map-partner-conversation') || makeId())
  const fileInputRef = useRef(null)
  const composerRef = useRef(null)
  const endRef = useRef(null)
  const clientId = profile?.client_id
  const workspaceName = profile?.clients?.name || 'My Automation Partner'
  const lastDraft = useMemo(() => [...messages].reverse().find(m => m.caption || m.imageUrl || m.type === 'publish_ready'), [messages])

  useEffect(() => { localStorage.setItem('map-partner-chat', JSON.stringify(messages.slice(-60))); endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, sending])
  useEffect(() => { localStorage.setItem('map-partner-conversation', conversationId) }, [conversationId])
  useEffect(() => { if (composerRef.current) { composerRef.current.style.height = '0px'; composerRef.current.style.height = `${Math.min(composerRef.current.scrollHeight, 144)}px` } }, [input])

  useEffect(() => {
    document.body.classList.add('partner-publisher-active')
    const hidden = new Map()
    const isOurPublisher = node => node.closest?.('[data-partner-publisher="true"]')
    const hideCandidate = node => {
      if (!(node instanceof HTMLElement) || isOurPublisher(node)) return
      const text = node.textContent || ''
      if (!/Ask, speak, or choose a shortcut|Partner training|Open Publisher|Open Content Partner/i.test(text)) return
      let target = node
      while (target.parentElement && target.parentElement !== document.body && !isOurPublisher(target.parentElement)) {
        const style = getComputedStyle(target)
        if (style.position === 'fixed' || style.position === 'sticky' || target.getAttribute('role') === 'dialog') break
        target = target.parentElement
      }
      if (!hidden.has(target)) { hidden.set(target, target.style.display); target.style.setProperty('display', 'none', 'important') }
    }
    const sweep = () => document.querySelectorAll('body *').forEach(hideCandidate)
    sweep()
    const observer = new MutationObserver(sweep)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => { observer.disconnect(); hidden.forEach((display, node) => { node.style.display = display }); document.body.classList.remove('partner-publisher-active') }
  }, [])

  async function uploadFile(file) {
    const form = new FormData(); const filename = `${clientId || 'partner'}/${Date.now()}.${file.name.split('.').pop() || 'jpg'}`
    form.append('file', file, filename); form.append('filename', filename); form.append('clientId', clientId || '')
    const response = await fetch(`${N8N_BASE}/webhook/r2-upload`, { method: 'POST', body: form })
    if (!response.ok) throw new Error('The image could not be uploaded.')
    return (await response.json()).publicUrl
  }

  async function sendMessage(text) {
    const trimmed = text.trim(); if (!trimmed || sending) return
    const userMessage = { id: makeId(), role: 'user', type: 'text', text: trimmed }
    setMessages(prev => [...prev, userMessage]); setInput(''); setSending(true); setError('')
    try {
      const attachmentUrl = attachment?.file ? await uploadFile(attachment.file) : null
      const response = await fetch(PARTNER_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ conversationId, clientId, workspaceName, message: trimmed, attachment: attachmentUrl ? { name: attachment.name, type: attachment.type, url: attachmentUrl } : null, history: [...messages, userMessage].slice(-20) }) })
      const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.message || 'Partner unavailable')
      const incoming = Array.isArray(data.messages) ? data.messages : [data.message || data]
      setMessages(prev => [...prev, ...incoming.filter(Boolean).map(item => typeof item === 'string' ? { id: makeId(), role: 'assistant', type: 'text', text: item } : { id: item.id || makeId(), role: 'assistant', type: item.type || 'text', ...item })])
      if (data.conversationId) setConversationId(data.conversationId)
    } catch { setMessages(prev => [...prev, fallback(trimmed)]); setError('Live Partner services are temporarily unavailable, so this draft was created locally.') }
    finally { setAttachment(null); setSending(false) }
  }

  async function generateImage(source) {
    setSending(true); setError('')
    try { const response = await fetch(IMAGE_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId, workspaceName, conversationId, prompt: source?.caption || lastDraft?.caption || input || 'Create a natural social media image.' }) }); const data = await response.json(); if (!response.ok || !data.imageUrl) throw new Error(); setMessages(prev => [...prev, { id: makeId(), role: 'assistant', type: 'image', text: 'Done — here is your image.', imageUrl: data.imageUrl }]) } catch { setError('Image generation is not configured or failed.') } finally { setSending(false) }
  }

  function preparePublish(source = lastDraft) { setMessages(prev => [...prev, { id: makeId(), role: 'assistant', type: 'publish_ready', text: 'Everything is prepared. Review it before anything goes live.', caption: source?.caption || lastDraft?.caption || '', imageUrl: source?.imageUrl || lastDraft?.imageUrl || null, channels: ['facebook', 'instagram'] }]) }
  function handleAction(action) { if (action.type === 'replace_image') return fileInputRef.current?.click(); if (action.type === 'generate_image' || action.type === 'regenerate_image') return generateImage(action.message); if (action.type === 'prepare_publish') return preparePublish(action.message); if (action.type === 'edit_post') return setInput(action.message?.caption || ''); if (action.type === 'publish') return setReview(action.message) }

  async function publishPost(item) {
    setPublishing(true); setError('')
    try { const { data: post, error: insertError } = await supabase.from('posts').insert({ client_id: clientId, content: item.caption.trim(), media_url: item.imageUrl || null, platforms: item.channels, status: 'draft' }).select().single(); if (insertError) throw insertError; const response = await fetch(PUBLISH_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ postId: post.id, clientId, content: item.caption.trim(), mediaUrl: item.imageUrl || null, platforms: item.channels }) }); const data = await response.json().catch(() => ({})); if (!response.ok || data.success === false) throw new Error(data.message || 'Publishing failed'); await supabase.from('posts').update({ status: 'published', published_at: new Date().toISOString() }).eq('id', post.id); setReview(null); setMessages(prev => [...prev, { id: makeId(), role: 'assistant', type: 'text', text: 'Published successfully.' }]) } catch (err) { setError(err.message || 'Publishing failed. Nothing was posted.') } finally { setPublishing(false) }
  }

  function startVoice() { const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition; if (!Recognition) return setError('Voice dictation is not supported in this browser.'); const recognition = new Recognition(); recognition.lang = 'en-US'; recognition.onresult = event => setInput(prev => `${prev}${prev ? ' ' : ''}${event.results[0][0].transcript}`); recognition.start() }

  return <div data-partner-publisher="true" className="min-h-[100dvh] bg-[#f3f8f9] text-[#10242d]">
    <header className="sticky top-0 z-20 bg-[#061b27] px-5 pb-4 pt-[max(20px,env(safe-area-inset-top))] text-white shadow-lg"><div className="mx-auto flex max-w-3xl items-center justify-between"><div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#0b2a38] text-xs font-black">MAP</div><h1 className="text-2xl font-black">My Partner</h1><span className="h-2.5 w-2.5 rounded-full bg-[#89c52b]" /></div><button onClick={() => { setMessages([starterMessage]); localStorage.removeItem('map-partner-chat') }} className="rounded-full border border-white/20 p-3"><RefreshCw className="h-5 w-5" /></button></div><nav className="mx-auto mt-5 grid max-w-3xl grid-cols-3 rounded-[24px] border border-white/15 bg-[#0c2937] p-1.5 text-sm font-bold text-slate-300"><button className="flex justify-center gap-2 rounded-[18px] px-3 py-3"><Inbox className="h-5 w-5" />Inbox</button><button className="flex justify-center gap-2 rounded-[18px] bg-[#12b7c0] px-3 py-3 text-[#052530]"><Sparkles className="h-5 w-5" />Post</button><button className="flex justify-center gap-2 rounded-[18px] px-3 py-3"><CalendarDays className="h-5 w-5" />Scheduled</button></nav></header>
    <main className="mx-auto flex max-w-3xl flex-col gap-5 px-4 pb-56 pt-6 sm:px-6">{messages.map(message => <MessageCard key={message.id} message={message} onAction={handleAction} />)}{sending && <div className="flex gap-3"><AssistantAvatar /><div className="rounded-2xl bg-white p-4"><Loader2 className="h-5 w-5 animate-spin" /></div></div>}{error && <div className="ml-14 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">{error}</div>}{messages.length === 1 && <div className="ml-14 flex flex-wrap gap-2">{quickPrompts.map(prompt => <button key={prompt} onClick={() => sendMessage(prompt)} className="rounded-full border bg-white px-4 py-2 text-xs font-bold">{prompt}</button>)}</div>}<div ref={endRef} /></main>
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[#dce5e7] bg-[#f7fbfb]/95 px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 backdrop-blur"><div className="mx-auto max-w-3xl">{attachment && <div className="mb-2 flex items-center gap-2 rounded-xl bg-[#e6f6f7] px-3 py-2 text-xs font-semibold">{attachment.name}<button onClick={() => setAttachment(null)} className="ml-auto"><X className="h-4 w-4" /></button></div>}<form onSubmit={event => { event.preventDefault(); sendMessage(input) }} className="flex items-end gap-2 rounded-[28px] border border-[#d5cbb9] bg-[#fffdf8] p-2 shadow-lg"><input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={event => { const file = event.target.files?.[0]; if (file) setAttachment({ file, name: file.name, type: file.type }); event.target.value = '' }} /><button type="button" onClick={() => fileInputRef.current?.click()} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full"><Camera className="h-6 w-6" /></button><textarea ref={composerRef} value={input} onChange={event => setInput(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendMessage(input) } }} rows={1} placeholder="Ask My Partner anything..." className="max-h-36 min-h-12 min-w-0 flex-1 resize-none overflow-y-auto bg-transparent px-1 py-3 text-base font-semibold leading-6 outline-none" /><button type="button" onClick={startVoice} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[#9bdddf] bg-[#e9fbfb]"><Mic className="h-6 w-6" /></button><button type="submit" disabled={sending || !input.trim()} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#12b7c0] text-white disabled:bg-[#aeb7ba]"><Send className="h-6 w-6" /></button></form><p className="mt-2 text-center text-[11px] font-semibold text-[#65777e]">Voice and photos work here. Nothing posts without review.</p></div></div>
    {review && <div className="fixed inset-0 z-[100] flex items-end justify-center bg-[#03131c]/70 p-3 sm:items-center"><div className="max-h-[90vh] w-full max-w-xl overflow-auto rounded-[28px] bg-white p-5"><div className="flex justify-between"><h2 className="text-2xl font-black">Ready to publish</h2><button onClick={() => setReview(null)}><X /></button></div>{review.imageUrl && <img src={review.imageUrl} alt="Final post" className="mt-4 max-h-80 w-full rounded-2xl object-cover" />}<textarea value={review.caption || ''} onChange={event => setReview(prev => ({ ...prev, caption: event.target.value }))} rows={7} className="mt-4 w-full rounded-2xl border p-4" /><button onClick={() => publishPost(review)} disabled={publishing} className="mt-5 flex w-full justify-center rounded-2xl bg-[#12b7c0] px-5 py-4 font-black">{publishing ? 'Publishing…' : 'Publish now'}</button></div></div>}
  </div>
}
