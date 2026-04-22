import { useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, ExternalLink, AlertCircle } from 'lucide-react'
import * as pdfjsLib from 'pdfjs-dist'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker

export default function PdfDocumentViewer({ url, fileName }) {
  const containerRef = useRef(null)
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState('')
  const [pageCount, setPageCount] = useState(0)
  const objectUrl = useMemo(() => url, [url])

  useEffect(() => {
    let cancelled = false
    let cleanup = () => {}

    async function renderPdf() {
      if (!objectUrl || !containerRef.current) return

      setStatus('loading')
      setError('')
      containerRef.current.innerHTML = ''

      try {
        const loadingTask = pdfjsLib.getDocument(objectUrl)
        const pdf = await loadingTask.promise

        if (cancelled) {
          await pdf.destroy()
          return
        }

        setPageCount(pdf.numPages)

        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
          const page = await pdf.getPage(pageNumber)
          const viewport = page.getViewport({ scale: 1.25 })
          const canvas = document.createElement('canvas')
          const context = canvas.getContext('2d')

          canvas.width = viewport.width
          canvas.height = viewport.height
          canvas.className = 'h-auto w-full rounded-[24px] border bg-white shadow-sm'
          canvas.style.borderColor = 'var(--portal-border)'

          if (!context) {
            throw new Error('Could not create PDF canvas context.')
          }

          await page.render({ canvasContext: context, viewport }).promise

          if (!cancelled && containerRef.current) {
            const wrapper = document.createElement('div')
            wrapper.className = 'space-y-2'

            const label = document.createElement('p')
            label.className = 'text-[11px] font-semibold uppercase tracking-[0.22em]'
            label.style.color = 'var(--portal-text-soft)'
            label.textContent = `Page ${pageNumber}`

            wrapper.appendChild(label)
            wrapper.appendChild(canvas)
            containerRef.current.appendChild(wrapper)
          }
        }

        setStatus('ready')
        cleanup = () => {
          pdf.destroy().catch(() => {})
        }
      } catch (renderError) {
        if (!cancelled) {
          setStatus('error')
          setError(renderError.message || 'Could not render this PDF.')
        }
      }
    }

    renderPdf()

    return () => {
      cancelled = true
      cleanup()
    }
  }, [objectUrl])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold" style={{ color: 'var(--portal-text)' }}>{fileName || 'PDF document'}</p>
          <p className="text-xs" style={{ color: 'var(--portal-text-muted)' }}>
            {status === 'ready' ? `${pageCount} page${pageCount === 1 ? '' : 's'} rendered with PDF.js` : 'Signed preview link expires shortly'}
          </p>
        </div>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="portal-button-secondary inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-xs font-semibold transition-all"
        >
          Open Original
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>

      {status === 'loading' && (
        <div className="portal-surface-strong flex items-center justify-center gap-3 rounded-[24px] p-8">
          <Loader2 className="h-5 w-5 animate-spin" style={{ color: 'var(--portal-primary)' }} />
          <span className="text-sm" style={{ color: 'var(--portal-text-muted)' }}>Rendering PDF preview…</span>
        </div>
      )}

      {status === 'error' && (
        <div className="portal-status-danger flex items-start gap-3 rounded-[24px] p-4">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold">Preview unavailable</p>
            <p className="text-xs">{error}</p>
          </div>
        </div>
      )}

      <div ref={containerRef} className="space-y-5" />
    </div>
  )
}
