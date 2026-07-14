import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CircleNotch, File, X } from '@phosphor-icons/react'
import { createVisionImageDataUrls } from '../lib/imageAssist'
import { generatePublisherAssist, sendPortalPartnerMessage } from '../lib/portalApi'
import MobileVoiceComposer from './MobileVoiceComposer'

const ACTION_DESTINATIONS = {
  open_inbox: { label: 'Open Inbox', to: '/inbox' },
  open_social_setup: { label: 'Social setup', to: '/settings' },
  open_create_post: { label: 'Open Publisher', to: '/post' },
  open_partner_training: { label: 'Partner training', to: '/settings' },
  open_settings_chat: { label: 'Website Chat settings', to: '/settings' },
  open_content_partner: { label: 'Open Content Partner', to: '/inbox' },
}

function createChatMessage(role, content, actions = [], attachments = []) {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    role,
    content,
    actions: actions.filter((action) => ACTION_DESTINATIONS[action?.type]),
    attachments,
  }
}

function createPendingAttachment(file, index, attachmentUrls) {
  const isImage = String(file.type || '').toLowerCase().startsWith('image/')
  const previewUrl = isImage ? URL.createObjectURL(file) : ''
  if (previewUrl) attachmentUrls.add(previewUrl)

  return {
    id: `${file.name || 'attachment'}-${file.lastModified || Date.now()}-${index}`,
    file,
    name: file.name || `Attachment ${index + 1}`,
    isImage,
    previewUrl,
  }
}

function AssistantAvatar() {
  return (
    <span className="mobile-partner-message-avatar">
      <img src="/assets/map-option-b-mark.png" alt="" />
      <i aria-hidden="true" />
    </span>
  )
}

export default function MobilePartnerChat({
  children,
  contextPath,
  placeholder,
  note,
  onPhotos,
  platforms = [],
  readOnly = false,
  conversationClassName = 'mobile-partner-conversation',
}) {
  const navigate = useNavigate()
  const [composer, setComposer] = useState('')
  const [messages, setMessages] = useState([])
  const [pending, setPending] = useState(false)
  const [attachments, setAttachments] = useState([])
  const attachmentUrlsRef = useRef(new Set())

  useEffect(() => () => {
    attachmentUrlsRef.current.forEach((url) => URL.revokeObjectURL(url))
    attachmentUrlsRef.current.clear()
  }, [])

  function stageAttachments(files) {
    const nextFiles = Array.from(files || []).slice(0, 4)
    attachments.forEach((attachment) => {
      if (attachment.previewUrl) {
        URL.revokeObjectURL(attachment.previewUrl)
        attachmentUrlsRef.current.delete(attachment.previewUrl)
      }
    })
    setAttachments(nextFiles.map((file, index) => createPendingAttachment(file, index, attachmentUrlsRef.current)))
  }

  function removeAttachment(id) {
    const attachment = attachments.find((item) => item.id === id)
    if (attachment?.previewUrl) {
      URL.revokeObjectURL(attachment.previewUrl)
      attachmentUrlsRef.current.delete(attachment.previewUrl)
    }
    setAttachments((current) => current.filter((item) => item.id !== id))
  }

  async function sendMessage(text) {
    const cleanText = String(text || '').trim()
    if (!cleanText || pending) return

    const pendingAttachments = [...attachments]
    setMessages((current) => [...current, createChatMessage('user', cleanText, [], pendingAttachments)])
    setComposer('')
    setPending(true)

    try {
      if (pendingAttachments.length && onPhotos) {
        if (readOnly) throw new Error('This portal is read-only right now, so it cannot create a new post draft.')
        const imageDataUrls = await createVisionImageDataUrls(pendingAttachments.map((attachment) => attachment.file))
        const payload = await generatePublisherAssist({
          action: 'create',
          caption: cleanText,
          platforms,
          max_chars: 2200,
          context: 'Create a new social post from the customer request and attached media. The result must remain a draft until the customer reviews and approves it.',
          image_data_urls: imageDataUrls,
        })
        const caption = payload?.suggestions?.[0]?.caption
        if (!caption) throw new Error('My Partner could not create a caption from that request.')

        onPhotos(pendingAttachments.map((attachment) => attachment.file), {
          caption,
          prompt: cleanText,
          imageCountAnalyzed: imageDataUrls.length,
        })
        return
      }

      const payload = await sendPortalPartnerMessage({
        message: cleanText,
        currentPath: contextPath,
        readOnly: Boolean(readOnly),
      })
      setMessages((current) => [
        ...current,
        createChatMessage(
          'assistant',
          payload?.reply || 'I can help you move that forward safely.',
          payload?.actions || [],
        ),
      ])
    } catch (error) {
      setComposer(cleanText)
      setMessages((current) => [
        ...current,
        createChatMessage(
          'assistant',
          error instanceof Error ? error.message : 'My Partner could not respond right now.',
        ),
      ])
    } finally {
      setPending(false)
    }
  }

  return (
    <>
      <main className={conversationClassName}>
        {children}

        {messages.map((message) => (
          <div key={message.id} className={`mobile-partner-inline-message ${message.role}`}>
            {message.role === 'assistant' ? <AssistantAvatar /> : null}
            <div className="mobile-partner-inline-bubble">
              {message.attachments?.length ? (
                <div className="mobile-partner-message-attachments">
                  {message.attachments.map((attachment) => (
                    attachment.previewUrl
                      ? <img key={attachment.id} src={attachment.previewUrl} alt={attachment.name} />
                      : <span key={attachment.id}><File size={18} />{attachment.name}</span>
                  ))}
                </div>
              ) : null}
              <p>{message.content}</p>
              {message.actions.length ? (
                <div className="mobile-partner-inline-actions">
                  {message.actions.map((action) => {
                    const destination = ACTION_DESTINATIONS[action.type]
                    return (
                      <button key={action.type} type="button" onClick={() => navigate(destination.to)}>
                        {destination.label}
                      </button>
                    )
                  })}
                </div>
              ) : null}
            </div>
          </div>
        ))}

        {pending ? (
          <div className="mobile-partner-inline-message assistant" aria-label="My Partner is responding">
            <AssistantAvatar />
            <div className="mobile-partner-inline-bubble is-pending">
              <CircleNotch size={18} weight="bold" className="mobile-partner-inline-spinner" />
              <span>Thinking…</span>
            </div>
          </div>
        ) : null}
      </main>

      <div className="mobile-partner-composer-dock">
        {attachments.length ? (
          <div className="mobile-partner-composer-attachments" aria-label="Attachments ready for this post">
            {attachments.map((attachment) => (
              <div key={attachment.id} className="mobile-partner-composer-attachment">
                {attachment.previewUrl
                  ? <img src={attachment.previewUrl} alt="" />
                  : <File size={22} weight="duotone" />}
                <span>{attachment.name}</span>
                <button type="button" onClick={() => removeAttachment(attachment.id)} aria-label={`Remove ${attachment.name}`}>
                  <X size={14} weight="bold" />
                </button>
              </div>
            ))}
          </div>
        ) : null}
        <MobileVoiceComposer
          value={composer}
          onChange={setComposer}
          onSubmit={sendMessage}
          onPhotos={onPhotos ? stageAttachments : undefined}
          placeholder={placeholder}
          disabled={pending}
          submitOnEnter={false}
        />
        <p>{note}</p>
      </div>
    </>
  )
}
