import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useLocation, useParams } from 'react-router-dom'
import { AlertCircle, CheckCircle2, ExternalLink, FileText, Loader2 } from 'lucide-react'
import PdfDocumentViewer from '../components/PdfDocumentViewer'
import { resolveShareLink } from '../lib/portalApi'

function getMessage(errorCode) {
  if (errorCode === 'invalid_token') return 'This share link does not exist or has already been revoked.'
  if (errorCode === 'link_expired') return 'This share link has expired.'
  if (errorCode === 'link_usage_exceeded') return 'This share link has reached its usage limit.'
  if (errorCode === 'document_archived') return 'This document has been archived and is no longer available.'
  if (errorCode === 'document_missing') return 'The shared document no longer exists.'
  if (errorCode === 'missing_token') return 'No share token was provided.'
  return 'We could not resolve this share link.'
}

export default function PublicShare() {
  const { token: routeToken } = useParams()
  const location = useLocation()
  const derivedToken = useMemo(
    () => routeToken || new URLSearchParams(location.search).get('token') || '',
    [location.search, routeToken],
  )
  const [tokenInput, setTokenInput] = useState(derivedToken)
  const [submittedToken, setSubmittedToken] = useState(derivedToken)

  const shareQuery = useQuery({
    queryKey: ['public-share', submittedToken],
    queryFn: () => resolveShareLink(submittedToken),
    enabled: !!submittedToken,
    retry: false,
  })

  function handleSubmit(event) {
    event.preventDefault()
    setSubmittedToken(tokenInput.trim())
  }

  const payload = shareQuery.data
  const isPdf = payload?.mime_type === 'application/pdf'
  const isImage = payload?.mime_type?.startsWith('image/')

  return (
    <div className="min-h-screen px-4 py-10 md:py-16" style={{ background: '#0d0b08' }}>
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse 80% 55% at 50% 0%, rgba(212,168,58,0.06) 0%, transparent 70%)' }} />
      <div className="relative max-w-5xl mx-auto space-y-6">
        <div className="text-center space-y-3">
          <p className="text-xs uppercase tracking-[0.35em]" style={{ color: '#8a7858' }}>My Automation Partner</p>
          <h1 className="font-display text-4xl md:text-5xl font-semibold" style={{ color: '#f8f2e4' }}>Secure Share Link</h1>
          <p className="text-sm max-w-2xl mx-auto" style={{ color: '#8a7858' }}>
            This page validates the opaque token through the public `resolve-share-link` function, then uses the returned signed URL for a short-lived preview.
          </p>
        </div>

        <div className="rounded-3xl p-5 md:p-6 space-y-4" style={{ background: '#1e1910', border: '1px solid #3d3420' }}>
          <form onSubmit={handleSubmit} className="flex flex-col md:flex-row gap-3">
            <input
              type="text"
              value={tokenInput}
              onChange={(event) => setTokenInput(event.target.value)}
              placeholder="Paste share token"
              className="flex-1 rounded-2xl px-4 py-3 text-sm focus:outline-none"
              style={{ background: '#252015', border: '1px solid #3d3420', color: '#f8f2e4' }}
            />
            <button
              type="submit"
              className="inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-semibold transition-all hover:-translate-y-px"
              style={{ background: '#d4a83a', color: '#0d0b08' }}
            >
              Resolve link
            </button>
          </form>

          {shareQuery.isLoading && (
            <div className="rounded-2xl p-4 flex items-center gap-3" style={{ background: '#141109', border: '1px solid #3d3420', color: '#c8b898' }}>
              <Loader2 className="w-4 h-4 animate-spin" />
              Resolving token and issuing a short-lived signed URL…
            </div>
          )}

          {shareQuery.isError && (
            <div className="rounded-2xl p-4 flex items-start gap-3" style={{ background: 'rgba(196,85,110,0.08)', border: '1px solid rgba(196,85,110,0.2)', color: '#e8899a' }}>
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold">Link unavailable</p>
                <p className="text-xs">{getMessage(shareQuery.error?.payload?.error || shareQuery.error?.message)}</p>
              </div>
            </div>
          )}

          {shareQuery.isSuccess && payload && (
            <div className="rounded-2xl p-4 flex items-start gap-3" style={{ background: 'rgba(107,193,142,0.08)', border: '1px solid rgba(107,193,142,0.2)', color: '#6bc18e' }}>
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold">Link resolved</p>
                <p className="text-xs">
                  Signed URL expires at {new Date(payload.expires_at).toLocaleString()}.
                </p>
              </div>
            </div>
          )}
        </div>

        {shareQuery.isSuccess && payload && (
          <div className="rounded-3xl p-5 md:p-6 space-y-5" style={{ background: '#1e1910', border: '1px solid #3d3420' }}>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <p className="text-lg font-semibold" style={{ color: '#f8f2e4' }}>{payload.file_name}</p>
                <p className="text-xs" style={{ color: '#8a7858' }}>{payload.mime_type}</p>
              </div>
              <a
                href={payload.signed_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold transition-all hover:-translate-y-px"
                style={{ background: '#252015', border: '1px solid #3d3420', color: '#d4a83a' }}
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Open signed file
              </a>
            </div>

            {isPdf ? (
              <PdfDocumentViewer url={payload.signed_url} fileName={payload.file_name} />
            ) : isImage ? (
              <img
                src={payload.signed_url}
                alt={payload.file_name}
                className="w-full rounded-2xl border border-[#3d3420] object-contain bg-[#141109] max-h-[70vh]"
              />
            ) : (
              <div className="rounded-2xl p-6 text-center" style={{ background: '#141109', border: '1px solid #3d3420' }}>
                <FileText className="w-8 h-8 mx-auto mb-3" style={{ color: '#d4a83a' }} />
                <p className="text-sm font-semibold mb-1" style={{ color: '#f8f2e4' }}>Preview not available for this file type</p>
                <p className="text-xs" style={{ color: '#8a7858' }}>
                  Open the signed file directly before the short-lived URL expires.
                </p>
              </div>
            )}
          </div>
        )}

        <p className="text-center text-xs" style={{ color: '#4e4228' }}>
          Need help? <Link to="/login" style={{ color: '#8a7858' }}>Return to the client portal</Link>
        </p>
      </div>
    </div>
  )
}
