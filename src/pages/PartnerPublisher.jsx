import { useEffect, useMemo, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Bell, CalendarDays, Camera, Check, ChevronRight, Image as ImageIcon,
  Inbox, Loader2, Mic, Paperclip, Pencil, RefreshCw, Send, Sparkles,
} from 'lucide-react'
import { supabase } from '../lib/supabase'

const N8N_BASE = import.meta.env.VITE_N8N_BASE_URL || 'https://n8n.myautomationpartner.com'
const PARTNER_URL = import.meta.env.VITE_PARTNER_ASSIST_URL || `${N8N_BASE}/webhook/partner-assist`

async function fetchProfile() {
  const { data, error } = await supabase.from('users').select('*, clients(*)').single()
  if (error) throw error
  return data
}

const starterMessage = {
  id: 'welcome',
  role: 'assistant',
  type: 'text',
  text: 'Tell me what you want to create. I can write the post, generate or use an image, prepare each channel, and publish only after you approve it.',
}

const quickPrompts = [
  'Promote a service',
  'Announce an update',
  'Create an offer',
  'Build this week',
]

function ChannelBadge({ channel, selected = true }) {
  const initial = channel === 'facebook' ? 'f' : channel === 'instagram' ? '◎' : channel === 'x' ? 'X' : channel[0]?.toUpperCase()
  return (
    <div className={`flex min-w-0 items-center gap-2 rounded-2xl border px-3 py-3 ${selected ? 'border-[#79d8dd] bg-[#e7fbfb]' : 'border-slate-200 bg-white'}`}>
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#0f858c] text-sm font-bold text-white">{initial}</span>
      <span className="truncate text-sm font-semibold capitalize text-[#12323c]">{channel}</span>
      {selected && <Check className="ml-auto h-4 w-4 text-[#57bb27]" />}
    </div>
  )
}

function AssistantAvatar() {
  return (
    <div className="relative mt-1 h-11 w-11 shrink-0 rounded-full border-[3px] border-[#14b9c1] bg-[#071d28] shadow-sm">
      <div className="absolute inset-1 flex items-center justify-center rounded-full border border-[#8a63ff]/60 text-[10px] font-black tracking-tight text-white">MAP</div>
      <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-[#8fd128]" />
    </div>
  )
}

function MessageCard({ message, onAction }) {
  const assistant = message.role === 'assistant'

  if (!assistant) {
    return (
      <div className="flex justify-end gap-2 pl-12">
        <div className="max-w-[82%] rounded-[22px] rounded-br-md bg-gradient-to-br from-[#16b9c1] to-[#079da7] px-5 py-3.5 text-[15px] font-medium leading-6 text-white shadow-sm">
          {message.text}
        </div>
        <div className="mt-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#1a3846] text-xs font-bold text-white">KM</div>
      </div>
    )
  }

  return (
    <div className="flex items-start gap-3">
      <AssistantAvatar />
      <div className="min-w-0 flex-1">
        {message.text && (
          <div className="rounded-[22px] rounded-tl-md border border-[#d8e1e4] bg-white px-5 py-4 text-[15px] font-medium leading-6 text-[#10242d] shadow-[0_8px_25px_rgba(13,42,52,0.07)]">
            {message.text}
          </div>
        )}

        {message.type === 'options' && (
          <div className="mt-3 rounded-[24px] border border-[#d8e1e4] bg-white p-3 shadow-[0_8px_25px_rgba(13,42,52,0.07)]">
            <div className="grid grid-cols-3 gap-2">
              {(message.options || []).map((option, index) => (
                <button key={option.id || index} onClick={() => onAction({ type: 'select_option', option, index })}
                  className="group rounded-2xl border border-transparent p-1 text-left transition hover:border-[#28c2c8] hover:bg-[#effcfc]">
                  <div className="aspect-[4/5] overflow-hidden rounded-xl bg-[#e8eff0]">
                    {option.imageUrl ? <img src={option.imageUrl} alt="Post option" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center"><ImageIcon className="h-7 w-7 text-slate-400" /></div>}
                  </div>
                  <p className="mt-2 text-center text-xs font-bold text-[#17313b]">Option {String.fromCharCode(65 + index)}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {message.type === 'caption' && (
          <div className="mt-3 rounded-[22px] border border-[#d8e1e4] bg-white p-4 shadow-[0_8px_25px_rgba(13,42,52,0.07)]">
            <p className="whitespace-pre-wrap text-[15px] font-bold leading-6 text-[#10242d]">{message.caption}</p>
            <button onClick={() => navigator.clipboard?.writeText(message.caption || '')} className="mt-3 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600">Copy</button>
          </div>
        )}

        {message.type === 'image' && (
          <div className="mt-3 overflow-hidden rounded-[24px] border border-[#d8e1e4] bg-white p-3 shadow-[0_8px_25px_rgba(13,42,52,0.07)]">
            <img src={message.imageUrl} alt="Generated social creative" className="max-h-[520px] w-full rounded-2xl object-cover" />
            <div className="grid grid-cols-3 gap-2 pt-3">
              <button onClick={() => onAction({ type: 'replace_image' })} className="flex items-center justify-center gap-1 rounded-xl py-2 text-xs font-semibold text-[#24424c]"><Paperclip className="h-4 w-4" />Replace</button>
              <button onClick={() => onAction({ type: 'edit_image' })} className="flex items-center justify-center gap-1 rounded-xl py-2 text-xs font-semibold text-[#24424c]"><Pencil className="h-4 w-4" />Edit</button>
              <button onClick={() => onAction({ type: 'regenerate_image' })} className="flex items-center justify-center gap-1 rounded-xl py-2 text-xs font-semibold text-[#24424c]"><RefreshCw className="h-4 w-4" />Regenerate</button>
            </div>
          </div>
        )}

        {message.type === 'publish_ready' && (
          <div className="mt-3 rounded-[24px] border border-[#d8e1e4] bg-white p-4 shadow-[0_8px_25px_rgba(13,42,52,0.07)]">
            <div className="grid grid-cols-2 gap-2">
              {(message.channels || ['facebook', 'instagram']).map(channel => <ChannelBadge key={channel} channel={channel} />)}
            </div>
            <div className="mt-4 grid grid-cols-[1fr_auto] gap-2">
              <button onClick={() => onAction({ type: 'publish', message })} className="flex items-center justify-center gap-2 rounded-2xl bg-[#10b7c0] px-4 py-4 text-sm font-black text-[#06242d] shadow-sm">
                <Check className="h-5 w-5" /> Review & post
              </button>
              <button onClick={() => onAction({ type: 'edit_post', message })} className="rounded-2xl border border-[#d4dde0] bg-[#eef3f4] px-4 text-sm font-bold text-[#18303a]"><Pencil className="h-5 w-5" /></button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function PartnerPublisher() {
  useOutletContext()
  const { data: profile } = useQuery({ queryKey: ['profile'], queryFn: fetchProfile })
  const [messages, setMessages] = useState([starterMessage])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [conversationId, setConversationId] = useState(() => crypto.randomUUID?.() || String(Date.now()))
  const [attachment, setAttachment] = useState(null)
  const fileInputRef = useRef(null)
  const endRef = useRef(null)

  const clientId = profile?.client_id
  const workspaceName = profile?.clients?.name || 'My Automation Partner'

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, sending])

  const lastDraft = useMemo(() => {
    const reversed = [...messages].reverse()
    return reversed.find(message => message.caption || message.imageUrl || message.type === 'publish_ready')
  }, [messages])

  async function sendPartnerMessage(text, action = null) {
    const trimmed = (text || '').trim()
    if ((!trimmed && !action) || sending) return

    const userMessage = trimmed ? { id: crypto.randomUUID?.() || String(Date.now()), role: 'user', type: 'text', text: trimmed } : null
    if (userMessage) setMessages(previous => [...previous, userMessage])
    setInput('')
    setSending(true)
    setError('')

    try {
      const body = {
        conversationId,
        clientId,
        workspaceName,
        message: trimmed,
        action,
        attachment,
        history: [...messages, ...(userMessage ? [userMessage] : [])].slice(-20),
      }
      const response = await fetch(PARTNER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.message || 'My Partner could not respond.')

      const incoming = Array.isArray(data.messages) ? data.messages : [data.message || data]
      const normalized = incoming.filter(Boolean).map((message, index) => typeof message === 'string'
        ? { id: `${Date.now()}-${index}`, role: 'assistant', type: 'text', text: message }
        : { id: message.id || `${Date.now()}-${index}`, role: 'assistant', type: message.type || 'text', ...message })
      setMessages(previous => [...previous, ...normalized])
      if (data.conversationId) setConversationId(data.conversationId)
      setAttachment(null)
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.')
    } finally {
      setSending(false)
    }
  }

  async function handleAction(action) {
    if (action.type === 'select_option') {
      await sendPartnerMessage(`Use option ${action.index + 1}.`, action)
      return
    }
    if (['replace_image', 'edit_image'].includes(action.type)) {
      fileInputRef.current?.click()
      return
    }
    if (action.type === 'publish') {
      await sendPartnerMessage('Review this and prepare it for publishing.', action)
      return
    }
    await sendPartnerMessage('', action)
  }

  function handleFile(event) {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      setAttachment({ name: file.name, type: file.type, dataUrl: reader.result })
      setInput(previous => previous || 'Use this photo for the post.')
    }
    reader.readAsDataURL(file)
  }

  return (
    <div className="min-h-screen bg-[#f3f8f9] text-[#10242d] md:px-5 md:py-5">
      <div className="mx-auto min-h-screen max-w-4xl overflow-hidden bg-[#f3f8f9] md:min-h-[calc(100vh-40px)] md:rounded-[32px] md:border md:border-[#dce5e7] md:shadow-2xl">
        <header className="sticky top-0 z-20 bg-[#061b27] px-5 pb-4 pt-5 text-white shadow-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#0b2a38] text-xs font-black text-white">MAP</div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-black tracking-tight">My Partner</h1>
                <span className="h-2.5 w-2.5 rounded-full bg-[#89c52b]" />
                <span className="text-sm font-semibold text-slate-300">Live</span>
              </div>
            </div>
            <button className="flex h-12 w-12 items-center justify-center rounded-full border border-white/20 bg-white/5"><Bell className="h-6 w-6" /></button>
          </div>

          <nav className="mt-5 grid grid-cols-3 rounded-[24px] border border-white/15 bg-[#0c2937] p-1.5 text-sm font-bold text-slate-300">
            <button className="flex items-center justify-center gap-2 rounded-[18px] px-3 py-3"><Inbox className="h-5 w-5" />Inbox</button>
            <button className="flex items-center justify-center gap-2 rounded-[18px] bg-[#12b7c0] px-3 py-3 text-[#052530] shadow"><Sparkles className="h-5 w-5" />Post</button>
            <button className="flex items-center justify-center gap-2 rounded-[18px] px-3 py-3"><CalendarDays className="h-5 w-5" />Scheduled</button>
          </nav>
        </header>

        <main className="mx-auto flex max-w-3xl flex-col gap-5 px-4 pb-40 pt-6 sm:px-6">
          {messages.map(message => <MessageCard key={message.id} message={message} onAction={handleAction} />)}

          {sending && (
            <div className="flex items-start gap-3"><AssistantAvatar /><div className="rounded-[22px] rounded-tl-md border border-[#d8e1e4] bg-white px-5 py-4 shadow-sm"><Loader2 className="h-5 w-5 animate-spin text-[#0db2bc]" /></div></div>
          )}

          {error && <div className="ml-14 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div>}

          {messages.length === 1 && (
            <div className="ml-14 flex flex-wrap gap-2">
              {quickPrompts.map(prompt => <button key={prompt} onClick={() => sendPartnerMessage(prompt)} className="rounded-full border border-[#cddde0] bg-white px-4 py-2 text-xs font-bold text-[#1a4c58] shadow-sm">{prompt}</button>)}
            </div>
          )}
          <div ref={endRef} />
        </main>

        <div className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-4xl border-t border-[#dce5e7] bg-[#f7fbfb]/95 px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-3 backdrop-blur md:bottom-5 md:rounded-b-[32px] md:border-x">
          {attachment && <div className="mx-auto mb-2 flex max-w-3xl items-center gap-2 rounded-xl bg-[#e6f6f7] px-3 py-2 text-xs font-semibold text-[#15515b]"><ImageIcon className="h-4 w-4" />{attachment.name}</div>}
          <form onSubmit={event => { event.preventDefault(); sendPartnerMessage(input) }} className="mx-auto flex max-w-3xl items-center gap-2 rounded-[28px] border border-[#d5cbb9] bg-[#fffdf8] p-2 shadow-[0_10px_30px_rgba(14,44,54,0.12)]">
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
            <button type="button" onClick={() => fileInputRef.current?.click()} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-[#7c7f78]"><Camera className="h-6 w-6" /></button>
            <input value={input} onChange={event => setInput(event.target.value)} placeholder="Ask My Partner anything..." className="min-w-0 flex-1 bg-transparent px-1 text-base font-semibold text-[#10242d] outline-none placeholder:text-[#899397]" />
            <button type="button" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[#9bdddf] bg-[#e9fbfb] text-[#107d86]"><Mic className="h-6 w-6" /></button>
            <button type="submit" disabled={sending || (!input.trim() && !attachment)} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#12b7c0] text-white disabled:bg-[#aeb7ba]"><Send className="h-6 w-6" /></button>
          </form>
          <p className="mx-auto mt-2 max-w-3xl text-center text-[11px] font-semibold text-[#65777e]">Voice and photos work here. Nothing posts without review.</p>
        </div>
      </div>
    </div>
  )
}
