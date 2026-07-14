import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  PaperPlaneRight,
  Plus,
  StopCircle,
  Waveform,
} from '@phosphor-icons/react'

function getSpeechRecognition() {
  if (typeof window === 'undefined') return null
  return window.SpeechRecognition || window.webkitSpeechRecognition || null
}

function resizeTextarea(textarea) {
  if (!textarea) return
  textarea.style.height = 'auto'
  const maxHeight = Number.parseFloat(window.getComputedStyle(textarea).maxHeight) || 112
  const nextHeight = Math.min(textarea.scrollHeight, maxHeight)
  textarea.style.height = `${nextHeight}px`
  textarea.style.overflowY = textarea.scrollHeight > maxHeight ? 'auto' : 'hidden'
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
  stableTyping = false,
}) {
  const recognitionRef = useRef(null)
  const photoInputRef = useRef(null)
  const textareaRef = useRef(null)
  const sendButtonRef = useRef(null)
  const lastInputValueRef = useRef(String(value || ''))
  const voiceBaseRef = useRef('')
  const [listening, setListening] = useState(false)
  const [speechSupported, setSpeechSupported] = useState(() => (
    typeof window === 'undefined' ? true : Boolean(getSpeechRecognition())
  ))

  useEffect(() => {
    return () => recognitionRef.current?.abort?.()
  }, [])

  useLayoutEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    const nextValue = String(value || '')
    if (lastInputValueRef.current !== nextValue && textarea.value !== nextValue) {
      textarea.value = nextValue
    }
    lastInputValueRef.current = nextValue
    resizeTextarea(textarea)
  }, [value])

  useLayoutEffect(() => {
    if (!sendButtonRef.current) return
    sendButtonRef.current.disabled = disabled || (!stableTyping && !String(textareaRef.current?.value || '').trim())
  })

  function applyLocalValue(nextValue, { notify = true } = {}) {
    const textarea = textareaRef.current
    const normalizedValue = String(nextValue || '')
    if (textarea && textarea.value !== normalizedValue) textarea.value = normalizedValue
    lastInputValueRef.current = normalizedValue
    resizeTextarea(textarea)
    if (sendButtonRef.current) {
      sendButtonRef.current.disabled = disabled || !normalizedValue.trim()
    }
    if (notify) onChange(normalizedValue)
  }

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
    voiceBaseRef.current = String(textareaRef.current?.value ?? value).trim()

    recognition.onresult = (event) => {
      let transcript = ''
      for (let index = 0; index < event.results.length; index += 1) {
        transcript += event.results[index][0]?.transcript || ''
      }
      const nextValue = [voiceBaseRef.current, transcript.trim()].filter(Boolean).join(voiceBaseRef.current ? ' ' : '')
      if (stableTyping) applyLocalValue(nextValue, { notify: false })
      else onChange(nextValue)
    }
    recognition.onend = () => setListening(false)
    recognition.onerror = () => setListening(false)
    recognitionRef.current = recognition
    recognition.start()
    setListening(true)
  }

  function handleSubmit(event) {
    event?.preventDefault?.()
    const cleanValue = String(textareaRef.current?.value ?? value).trim()
    if (!showSend || !cleanValue || disabled) return
    if (stableTyping) applyLocalValue('', { notify: true })
    onSubmit?.(cleanValue)
  }

  function handleAttachmentSelection(event) {
    const files = Array.from(event.target.files || [])
    if (files.length) onPhotos?.(files)
    event.target.value = ''
  }

  return (
    <div className={`mobile-voice-composer ${compact ? 'is-compact' : ''} ${onPhotos ? 'has-photos' : ''} ${showSend ? '' : 'no-send'}`}>
      {onPhotos ? (
        <div className="mobile-voice-composer-attachment">
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*,video/*"
            multiple
            className="sr-only"
            onChange={handleAttachmentSelection}
          />
          <button
            type="button"
            className="mobile-voice-composer-action is-attachment"
            onClick={() => photoInputRef.current?.click()}
            aria-label="Add a photo or file"
          >
            <Plus size={22} weight="bold" />
          </button>
        </div>
      ) : null}
      <textarea
        ref={textareaRef}
        defaultValue={value}
        onInput={stableTyping ? undefined : (event) => {
          const nextValue = event.currentTarget.value
          lastInputValueRef.current = nextValue
          resizeTextarea(event.currentTarget)
          if (sendButtonRef.current) {
            sendButtonRef.current.disabled = disabled || !nextValue.trim()
          }
          onChange(nextValue)
        }}
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
          ref={sendButtonRef}
          type="button"
          className="mobile-voice-composer-send"
          disabled={disabled}
          aria-label="Send to My Partner"
          onClick={handleSubmit}
        >
          <PaperPlaneRight size={20} weight="fill" />
        </button>
      ) : null}
    </div>
  )
}
