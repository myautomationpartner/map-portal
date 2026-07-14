import { useEffect, useRef, useState } from 'react'
import { Camera, PaperPlaneRight, StopCircle, Waveform } from '@phosphor-icons/react'

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
  const voiceBaseRef = useRef('')
  const [listening, setListening] = useState(false)
  const [speechSupported, setSpeechSupported] = useState(() => (
    typeof window === 'undefined' ? true : Boolean(getSpeechRecognition())
  ))

  useEffect(() => {
    return () => recognitionRef.current?.abort?.()
  }, [])

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

  return (
    <div className={`mobile-voice-composer ${compact ? 'is-compact' : ''} ${onPhotos ? 'has-photos' : ''} ${showSend ? '' : 'no-send'}`}>
      {onPhotos ? (
        <>
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*,video/*"
            multiple
            className="sr-only"
            onChange={(event) => {
              const files = Array.from(event.target.files || [])
              if (files.length) onPhotos(files)
              event.target.value = ''
            }}
          />
          <button
            type="button"
            className="mobile-voice-composer-action is-photo"
            onClick={() => photoInputRef.current?.click()}
            aria-label="Choose recent photos or videos"
          >
            <Camera size={21} weight="regular" />
          </button>
        </>
      ) : null}
      <textarea
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
