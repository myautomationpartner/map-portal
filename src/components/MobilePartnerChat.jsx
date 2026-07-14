import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  CheckCircle,
  CircleNotch,
  FacebookLogo,
  File as FileIcon,
  InstagramLogo,
  PencilSimple,
  X,
  XLogo,
} from '@phosphor-icons/react'
import { createVisionImageDataUrl, createVisionImageDataUrls } from '../lib/imageAssist'
import { generatePublisherAssist, improvePublisherImage, sendPortalPartnerMessage } from '../lib/portalApi'
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

function base64ToImageFile(base64, mimeType = 'image/png', filename = 'partner-edited-image.png') {
  const binary = window.atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return new globalThis.File([bytes], filename, { type: mimeType })
}

function AssistantAvatar() {
  return (
    <span className="mobile-partner-message-avatar">
      <img src="/assets/map-option-b-mark.png" alt="" />
      <i aria-hidden="true" />
    </span>
  )
}

const POSTCARD_PLATFORMS = [
  { id: 'facebook', label: 'Facebook', Icon: FacebookLogo },
  { id: 'instagram', label: 'Instagram', Icon: InstagramLogo },
  { id: 'twitter', label: 'X', Icon: XLogo },
]

export function GeneratedPostcard({
  cardRef,
  draft,
  onChange,
  onReview,
  onReset,
  reviewLabel = 'Review & post',
  resetLabel = 'Try another photo',
  statusLabel = 'Ready to review',
}) {
  const [editing, setEditing] = useState(false)

  function togglePlatform(platformId) {
    const nextPlatforms = draft.platforms.includes(platformId)
      ? draft.platforms.filter((item) => item !== platformId)
      : [...draft.platforms, platformId]
    onChange({ ...draft, platforms: nextPlatforms })
  }

  return (
    <article ref={cardRef} className="mobile-partner-generated-postcard" aria-label="Ready-to-review social post">
      {draft.previewUrl ? <img src={draft.previewUrl} alt="Selected post creative" /> : null}
      <div className="mobile-partner-generated-brandbar">
        <strong>My Automation Partner</strong>
        <span><i aria-hidden="true" />{statusLabel}</span>
      </div>
      <div className="mobile-partner-generated-caption">
        {editing ? (
          <textarea
            value={draft.caption}
            onChange={(event) => onChange({ ...draft, caption: event.target.value })}
            aria-label="Edit post caption"
            rows={6}
          />
        ) : (
          <p>{draft.caption}</p>
        )}
      </div>
      <div className="mobile-partner-generated-platforms" aria-label="Choose social platforms">
        {POSTCARD_PLATFORMS.map(({ id, label, Icon }) => (
          <button
            type="button"
            key={id}
            data-selected={draft.platforms.includes(id) ? 'true' : undefined}
            aria-pressed={draft.platforms.includes(id)}
            onClick={() => togglePlatform(id)}
          >
            <Icon size={16} weight="fill" />
            <span>{label}</span>
          </button>
        ))}
      </div>
      <div className="mobile-partner-generated-actions">
        <button
          type="button"
          className="mobile-partner-primary"
          disabled={!draft.platforms.length || !draft.caption.trim()}
          onClick={() => onReview(draft)}
        >
          <CheckCircle size={19} weight="fill" />
          {reviewLabel}
        </button>
        <button type="button" onClick={() => setEditing((current) => !current)}>
          <PencilSimple size={17} />
          {editing ? 'Done' : 'Edit'}
        </button>
      </div>
      <button type="button" className="mobile-partner-generated-reset" onClick={onReset}>
        {resetLabel}
      </button>
    </article>
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
  const [generatedPost, setGeneratedPost] = useState(null)
  const attachmentUrlsRef = useRef(new Set())
  const generatedPostRef = useRef(null)
  const generatedPostPrompt = generatedPost?.prompt || ''

  useEffect(() => () => {
    attachmentUrlsRef.current.forEach((url) => URL.revokeObjectURL(url))
    attachmentUrlsRef.current.clear()
  }, [])

  useEffect(() => {
    if (!generatedPostPrompt) return undefined
    const frame = window.requestAnimationFrame(() => {
      generatedPostRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [generatedPostPrompt])

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
      if (generatedPost) {
        const recentConversation = messages
          .slice(-6)
          .map((message) => `${message.role === 'user' ? 'Customer' : 'Partner'}: ${message.content}`)
          .join('\n')
        const payload = await generatePublisherAssist({
          action: 'creative_chat',
          caption: generatedPost.caption,
          platforms: generatedPost.platforms,
          max_chars: 2200,
          context: [
            `Latest customer request: ${cleanText}`,
            `A postcard image is currently ${generatedPost.previewUrl ? 'attached' : 'not attached'}.`,
            recentConversation ? `Recent conversation:\n${recentConversation}` : '',
          ].filter(Boolean).join('\n'),
        })
        const decision = payload?.creative_decision
        if (!decision?.intent) throw new Error('My Partner could not understand that request.')

        const changesCaption = ['caption_edit', 'caption_and_image'].includes(decision.intent)
        const changesImage = ['image_edit', 'caption_and_image'].includes(decision.intent)
        let nextFiles = generatedPost.files
        let nextPreviewUrl = generatedPost.previewUrl

        if (changesCaption && !decision.caption?.trim()) {
          throw new Error('My Partner did not return an updated caption.')
        }
        if (changesImage) {
          const sourceFile = generatedPost.files.find((file) => String(file?.type || '').toLowerCase().startsWith('image/'))
          if (!sourceFile) throw new Error('Add a photo first, then ask me to change the image.')
          const imageDataUrl = await createVisionImageDataUrl(sourceFile, { maxDimension: 1536, quality: 0.86 })
          if (!imageDataUrl) throw new Error('That photo could not be prepared for editing.')
          const imagePayload = await improvePublisherImage({
            caption: changesCaption ? decision.caption : generatedPost.caption,
            platforms: generatedPost.platforms,
            mode: 'custom',
            instruction: decision.imageInstruction,
            use_brand_logo: decision.useBrandLogo === true,
            quality: 'low',
            image_data_url: imageDataUrl,
          })
          const mimeType = imagePayload.mime_type || 'image/png'
          const editedFile = base64ToImageFile(imagePayload.image_base64, mimeType)
          nextFiles = [editedFile, ...generatedPost.files.filter((file) => file !== sourceFile)]
          nextPreviewUrl = `data:${mimeType};base64,${imagePayload.image_base64}`
        }

        if (changesCaption || changesImage) {
          setGeneratedPost((current) => ({
            ...current,
            files: nextFiles,
            previewUrl: nextPreviewUrl,
            caption: changesCaption ? decision.caption : current.caption,
          }))
        }
        setMessages((current) => [
          ...current,
          createChatMessage('assistant', decision.assistantMessage || 'Done — I updated the postcard.'),
        ])
        return
      }

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

        setGeneratedPost({
          files: pendingAttachments.map((attachment) => attachment.file),
          caption,
          prompt: cleanText,
          imageCountAnalyzed: imageDataUrls.length,
          previewUrl: pendingAttachments.find((attachment) => attachment.previewUrl)?.previewUrl || '',
          platforms: [...platforms],
        })
        setAttachments([])
        setMessages((current) => [
          ...current,
          createChatMessage('assistant', 'I built a ready-to-review post from your photo and instructions.'),
        ])
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
        {generatedPost ? null : children}

        {messages.map((message) => (
          <div key={message.id} className={`mobile-partner-inline-message ${message.role}`}>
            {message.role === 'assistant' ? <AssistantAvatar /> : null}
            <div className="mobile-partner-inline-bubble">
              {message.attachments?.length ? (
                <div className="mobile-partner-message-attachments">
                  {message.attachments.map((attachment) => (
                    attachment.previewUrl
                      ? <img key={attachment.id} src={attachment.previewUrl} alt={attachment.name} />
                      : <span key={attachment.id}><FileIcon size={18} />{attachment.name}</span>
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

        {generatedPost ? (
          <GeneratedPostcard
            cardRef={generatedPostRef}
            draft={generatedPost}
            onChange={setGeneratedPost}
            onReset={() => setGeneratedPost(null)}
            onReview={(draft) => onPhotos(draft.files, {
              caption: draft.caption,
              prompt: draft.prompt,
              imageCountAnalyzed: draft.imageCountAnalyzed,
              platforms: draft.platforms,
              conversation: messages.map((message) => ({
                role: message.role,
                content: message.content,
              })),
            })}
          />
        ) : null}
      </main>

      <div className="mobile-partner-composer-dock">
        {attachments.length ? (
          <div className="mobile-partner-composer-attachments" aria-label="Attachments ready for this post">
            {attachments.map((attachment) => (
              <div key={attachment.id} className="mobile-partner-composer-attachment">
                {attachment.previewUrl
                  ? <img src={attachment.previewUrl} alt="" />
                  : <FileIcon size={22} weight="duotone" />}
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
          stableTyping
        />
        <p>{note}</p>
      </div>
    </>
  )
}
