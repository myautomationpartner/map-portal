import { useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, ExternalLink, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react'
import * as pdfjsLib from 'pdfjs-dist'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker

export default function PdfDocumentViewer({ url, fileName }) {
  const containerRef = useRef(null)
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState('')
  const [pageCount, setPageCount] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
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
        setCurrentPage((page) => {
          if (page < 1) return 1
          if (page > pdf.numPages) return pdf.numPages
          return page
        })

        const page = await pdf.getPage(Math.min(currentPage, pdf.numPages))
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
          containerRef.current.appendChild(canvas)
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
  }, [objectUrl, currentPage])

  useEffect(() => {
    setCurrentPage(1)
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
        <div className="flex flex-wrap items-center gap-2">
          {pageCount > 0 && (
            <div className="inline-flex items-center gap-1 rounded-2xl border px-2 py-1.5" style={{ borderColor: 'var(--portal-border)', background: 'rgba(255,255,255,0.85)' }}>
              <button
                type="button"
                onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                disabled={status !== 'ready' || currentPage <= 1}
                className="portal-button-secondary inline-flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-semibold disabled:opacity-40"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Prev
              </button>
              <span className="px-2 text-xs font-semibold" style={{ color: 'var(--portal-text-muted)' }}>
                {currentPage} / {pageCount}
              </span>
              <button
                type="button"
                onClick={() => setCurrentPage((page) => Math.min(pageCount, page + 1))}
                disabled={status !== 'ready' || currentPage >= pageCount}
                className="portal-button-secondary inline-flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-semibold disabled:opacity-40"
              >
                Next
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
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

      {status === 'ready' && pageCount > 0 && (
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em]" style={{ color: 'var(--portal-text-soft)' }}>
          Page {currentPage}
        </p>
      )}

      <div ref={containerRef} />
    </div>
  )
}
