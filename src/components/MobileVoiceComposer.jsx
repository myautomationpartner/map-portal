import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  Camera,
  FolderOpen,
  Images,
  PaperPlaneRight,
  Plus,
  StopCircle,
  Waveform,
} from '@phosphor-icons/react'

function getSpeechRecognition() {
  if (typeof window === 'undefined') return null
  return window.SpeechRecognition || window.webkitSpeechRecognition || null
}

export default function MobileVoiceComposer({
  value,
  onChange,
  onSubmit,
  onPhotos,
  placeholder = 'Ask My Partner anything…',
  disabled = false,
  compact = false,
  showSend = true,
  submitOnEnter = true,
}) {
  const recognitionRef = useRef(null)
  const photoInputRef = useRef(null)
  const cameraInputRef = useRef(null)
  const fileInputRef = useRef(null)
  const attachmentMenuRef = useRef(null)
  const textareaRef = useRef(null)
  const voiceBaseRef = useRef('')
  const [listening, setListening] = useState(false)
  const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false)
  const [speechSupported, setSpeechSupported] = useState(() => (
    typeof window === 'undefined' ? true : Boolean(getSpeechRecognition())
  ))

  useEffect(() => {
    return () => recognitionRef.current?.abort?.()
  }, [])

  useEffect(() => {
    if (!attachmentMenuOpen) return undefined

    function closeOnOutsidePress(event) {
      if (!attachmentMenuRef.current?.contains(event.target)) setAttachmentMenuOpen(false)
    }

    function closeOnEscape(event) {
      if (event.key === 'Escape') setAttachmentMenuOpen(false)
    }

    document.addEventListener('pointerdown', closeOnOutsidePress)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePress)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [attachmentMenuOpen])

  useLayoutEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return

    textarea.style.height = 'auto'
    const maxHeight = Number.parseFloat(window.getComputedStyle(textarea).maxHeight) || 112
    const nextHeight = Math.min(textarea.scrollHeight, maxHeight)
    textarea.style.height = `${nextHeight}px`
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? 'auto' : 'hidden'
  }, [value])

  function toggleListening() {
    if (listening) {
      recognitionRef.current?.stop?.()
      setListening(false)
      return
    }

    const SpeechRecognition = getSpeechRecognition()
    if (!SpeechRecognition) {
      setSpeechSupported(false)
      return
    }

    const recognition = new SpeechRecognition()
    recognition.lang = 'en-US'
    recognition.continuous = true
    recognition.interimResults = true
    voiceBaseRef.current = String(value || '').trim()

    recognition.onresult = (event) => {
      let transcript = ''
      for (let index = 0; index < event.results.length; index += 1) {
        transcript += event.results[index][0]?.transcript || ''
      }
      const nextValue = [voiceBaseRef.current, transcript.trim()].filter(Boolean).join(voiceBaseRef.current ? ' ' : '')
      onChange(nextValue)
    }
    recognition.onend = () => setListening(false)
    recognition.onerror = () => setListening(false)
    recognitionRef.current = recognition
    recognition.start()
    setListening(true)
  }

  function handleSubmit(event) {
    event?.preventDefault?.()
    const cleanValue = String(value || '').trim()
    if (!showSend || !cleanValue || disabled) return
    onSubmit?.(cleanValue)
  }

  function handleAttachmentSelection(event) {
    const files = Array.from(event.target.files || [])
    if (files.length) onPhotos?.(files)
    event.target.value = ''
  }

  function openAttachmentPicker(inputRef) {
    setAttachmentMenuOpen(false)
    window.requestAnimationFrame(() => inputRef.current?.click())
  }

  return (
    <div className={`mobile-voice-composer ${compact ? 'is-compact' : ''} ${onPhotos ? 'has-photos' : ''} ${showSend ? '' : 'no-send'}`}>
      {onPhotos ? (
        <div className="mobile-voice-composer-attachment" ref={attachmentMenuRef}>
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*,video/*"
            multiple
            className="sr-only"
            onChange={handleAttachmentSelection}
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            onChange={handleAttachmentSelection}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            multiple
            className="sr-only"
            onChange={handleAttachmentSelection}
          />
          <button
            type="button"
            className={`mobile-voice-composer-action is-attachment ${attachmentMenuOpen ? 'is-open' : ''}`}
            onClick={() => setAttachmentMenuOpen((open) => !open)}
            aria-label="Add a photo or file"
            aria-haspopup="menu"
            aria-expanded={attachmentMenuOpen}
          >
            <Plus size={22} weight="bold" />
          </button>
          {attachmentMenuOpen ? (
            <div className="mobile-voice-attachment-menu" role="menu" aria-label="Add to post">
              <button type="button" role="menuitem" onClick={() => openAttachmentPicker(cameraInputRef)}>
                <Camera size={20} weight="regular" />
                <span>Take Photo</span>
              </button>
              <button type="button" role="menuitem" onClick={() => openAttachmentPicker(photoInputRef)}>
                <Images size={20} weight="regular" />
                <span>Photo Library</span>
              </button>
              <button type="button" role="menuitem" onClick={() => openAttachmentPicker(fileInputRef)}>
                <FolderOpen size={20} weight="regular" />
                <span>Choose File</span>
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        rows={1}
        onKeyDown={(event) => {
          if (submitOnEnter && event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            handleSubmit(event)
          }
        }}
      />
      <button
        type="button"
        className={`mobile-voice-composer-action is-voice ${listening ? 'is-listening' : ''}`}
        onClick={toggleListening}
        disabled={!speechSupported}
        aria-label={listening ? 'Stop voice input' : 'Start voice input'}
        title={speechSupported ? 'Speak your message' : 'Voice input is not supported in this browser'}
      >
        {listening ? <StopCircle size={21} weight="fill" /> : <Waveform size={21} weight="bold" />}
      </button>
      {showSend ? (
        <button
          type="button"
          className="mobile-voice-composer-send"
          disabled={!String(value || '').trim() || disabled}
          aria-label="Send to My Partner"
          onClick={handleSubmit}
        >
          <PaperPlaneRight size={20} weight="fill" />
        </button>
      ) : null}
    </div>
  )
}
