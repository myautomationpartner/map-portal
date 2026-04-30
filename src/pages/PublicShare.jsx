import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useLocation, useParams } from 'react-router-dom'
import { AlertCircle, CheckCircle2, Clock3, ExternalLink, FileText, Loader2, Share2 } from 'lucide-react'
import PdfDocumentViewer from '../components/PdfDocumentViewer'
import { resolveShareLink } from '../lib/portalApi'
import { buildTenantConfig } from '../lib/tenantConfig'

function getMessage(errorCode) {
  if (errorCode === 'invalid_token') return 'This share link does not exist or has already been revoked.'
  if (errorCode === 'link_expired') return 'This share link has expired.'
  if (errorCode === 'link_usage_exceeded') return 'This share link has reached its usage limit.'
  if (errorCode === 'document_archived') return 'This document has been archived and is no longer available.'
  if (errorCode === 'document_missing') return 'The shared document no longer exists.'
  if (errorCode === 'missing_token') return 'No share token was provided.'
  return 'We could not resolve this share link.'
}

function formatShareExpiry(value) {
  if (!value) return 'No expiration date was set for this share.'

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return 'Expiration details are not available.'

  return `Access expires ${parsed.toLocaleString()}.`
}

export default function PublicShare() {
  const { token: routeToken } = useParams()
  const location = useLocation()
  const shareToken = useMemo(
    () => routeToken || new URLSearchParams(location.search).get('token') || '',
    [location.search, routeToken],
  )

  const shareQuery = useQuery({
    queryKey: ['public-share', shareToken],
    queryFn: () => resolveShareLink(shareToken),
    enabled: !!shareToken,
    retry: false,
  })

  const payload = shareQuery.data
  const tenant = useMemo(() => buildTenantConfig({ sharePayload: payload }), [payload])
  const isPdf = payload?.mime_type === 'application/pdf'
  const isImage = payload?.mime_type?.startsWith('image/')

  return (
    <div className="portal-shell relative min-h-screen px-4 py-8 md:px-6 md:py-12">
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: 'radial-gradient(ellipse 78% 58% at 50% 0%, color-mix(in srgb, var(--portal-cyan) 18%, transparent) 0%, transparent 68%)' }}
      />

      <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-6">
        <section className="portal-surface rounded-[36px] p-6 md:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <span className="portal-chip inline-flex rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em]">
                Secure file share
              </span>
              <h1 className="portal-page-title mt-4 font-display">
                {tenant.displayName} has shared a file with you.
              </h1>
              <p className="mt-3 text-sm md:text-base" style={{ color: 'var(--portal-text-muted)' }}>
                Open the file preview below or download the original file while this shared access remains active.
              </p>
            </div>

            <div className="portal-panel min-w-[240px] rounded-[28px] p-4 md:p-5">
              <div className="flex items-start gap-3">
                <div
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl"
                  style={{ background: 'color-mix(in srgb, var(--portal-cyan) 12%, transparent)', color: 'var(--portal-primary)' }}
                >
                  <Clock3 className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em]" style={{ color: 'var(--portal-text-soft)' }}>
                    Shared access
                  </p>
                  <p className="mt-2 text-sm font-medium" style={{ color: 'var(--portal-text)' }}>
                    {payload ? formatShareExpiry(payload.expires_at) : 'Checking availability…'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {!shareToken ? (
          <section className="portal-panel rounded-[34px] p-6 md:p-7">
            <div className="portal-status-danger flex items-start gap-3 rounded-[24px] p-4">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="text-sm font-semibold">Link unavailable</p>
                <p className="text-sm">This page needs a valid shared-file link to open the document.</p>
              </div>
            </div>
          </section>
        ) : null}

        {shareQuery.isLoading ? (
          <section className="portal-panel rounded-[34px] p-6 md:p-7">
            <div className="portal-surface-strong flex items-center gap-3 rounded-[24px] p-6">
              <Loader2 className="h-5 w-5 animate-spin" style={{ color: 'var(--portal-primary)' }} />
              <div>
                <p className="text-sm font-semibold" style={{ color: 'var(--portal-text)' }}>Loading shared file</p>
                <p className="text-sm" style={{ color: 'var(--portal-text-muted)' }}>Preparing a secure preview now.</p>
              </div>
            </div>
          </section>
        ) : null}

        {shareQuery.isError ? (
          <section className="portal-panel rounded-[34px] p-6 md:p-7">
            <div className="portal-status-danger flex items-start gap-3 rounded-[24px] p-4">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="text-sm font-semibold">Link unavailable</p>
                <p className="text-sm">{getMessage(shareQuery.error?.payload?.error || shareQuery.error?.message)}</p>
              </div>
            </div>
          </section>
        ) : null}

        {shareQuery.isSuccess && payload ? (
          <>
            <section className="portal-panel rounded-[34px] p-5 md:p-6">
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
                <div className="min-w-0">
                  <div className="mb-4 flex flex-wrap items-center gap-3">
                    <div
                      className="flex h-12 w-12 items-center justify-center rounded-[18px]"
                      style={{ background: 'var(--portal-surface-muted)', color: 'var(--portal-primary)' }}
                    >
                      <Share2 className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-xl font-semibold md:text-2xl" style={{ color: 'var(--portal-text)' }}>
                        {payload.file_name}
                      </p>
                      <p className="mt-1 text-sm" style={{ color: 'var(--portal-text-muted)' }}>
                        {payload.mime_type}
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="portal-surface-strong rounded-[24px] p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.22em]" style={{ color: 'var(--portal-text-soft)' }}>
                        Access status
                      </p>
                      <div className="portal-status-success mt-3 flex items-start gap-3 rounded-[20px] p-3">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                        <div>
                          <p className="text-sm font-semibold">Ready to view</p>
                          <p className="text-sm">{formatShareExpiry(payload.expires_at)}</p>
                        </div>
                      </div>
                    </div>

                    <div className="portal-surface-strong rounded-[24px] p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.22em]" style={{ color: 'var(--portal-text-soft)' }}>
                        File details
                      </p>
                      <p className="mt-3 text-sm font-medium" style={{ color: 'var(--portal-text)' }}>
                        Use the preview below, or open the original file in a new tab if needed.
                      </p>
                    </div>
                  </div>
                </div>

                <a
                  href={payload.signed_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="portal-button-primary inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold"
                >
                  Open original file
                  <ExternalLink className="h-4 w-4" />
                </a>
              </div>
            </section>

            <section className="portal-panel rounded-[34px] p-5 md:p-6">
              {isPdf ? (
                <PdfDocumentViewer url={payload.signed_url} fileName={payload.file_name} />
              ) : isImage ? (
                <div className="portal-surface-strong rounded-[28px] p-4">
                  <img
                    src={payload.signed_url}
                    alt={payload.file_name}
                    className="max-h-[72vh] w-full rounded-[24px] border object-contain"
                    style={{ borderColor: 'var(--portal-border)', background: 'white' }}
                  />
                </div>
              ) : (
                <div className="portal-surface-strong rounded-[28px] p-8 text-center">
                  <FileText className="mx-auto mb-3 h-9 w-9" style={{ color: 'var(--portal-primary)' }} />
                  <p className="text-base font-semibold" style={{ color: 'var(--portal-text)' }}>
                    Preview not available for this file type
                  </p>
                  <p className="mt-2 text-sm" style={{ color: 'var(--portal-text-muted)' }}>
                    Open the original file to view or download it before access expires.
                  </p>
                  <a
                    href={payload.signed_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="portal-button-secondary mt-5 inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold"
                  >
                    Open original file
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </div>
              )}
            </section>
          </>
        ) : null}

        <p className="text-center text-sm" style={{ color: 'var(--portal-text-soft)' }}>
          Need help?{' '}
          <a
            href={`mailto:${tenant.supportEmail}`}
            style={{ color: 'var(--portal-text-muted)' }}
            className="font-medium transition-colors hover:text-[var(--portal-primary)]"
          >
            {tenant.supportEmail}
          </a>
        </p>
      </div>
    </div>
  )
}
