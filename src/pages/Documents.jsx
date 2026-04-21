import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useOutletContext } from 'react-router-dom'
import {
  FileText,
  FileImage,
  FileSpreadsheet,
  FileBadge,
  Loader2,
  Upload,
  ExternalLink,
  Share2,
  Copy,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  Link2,
  CalendarClock,
  Archive,
} from 'lucide-react'
import PdfDocumentViewer from '../components/PdfDocumentViewer'
import {
  MAX_DOCUMENT_BYTES,
  UPLOAD_MIME_OPTIONS,
  createShareLink,
  fetchDocuments,
  fetchProfile,
  fetchShareLinks,
  getDocumentUrl,
  getSessionClaims,
  getUploadUrl,
  revokeShareLink,
  uploadFileToSignedUrl,
} from '../lib/portalApi'
import { supabaseUrl } from '../lib/supabase'

const FUNCTION_BASE = `${supabaseUrl}/functions/v1`

function formatDate(value) {
  if (!value) return '—'
  return new Date(value).toLocaleString()
}

function formatBytes(value) {
  if (!value && value !== 0) return '—'
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

function DocumentIcon({ mimeType, className, style }) {
  if (mimeType?.startsWith('image/')) {
    return <FileImage className={className} style={style} />
  }
  if (mimeType?.includes('sheet')) {
    return <FileSpreadsheet className={className} style={style} />
  }
  if (mimeType?.includes('presentation')) {
    return <FileBadge className={className} style={style} />
  }
  return <FileText className={className} style={style} />
}

function buildShareUrl(token) {
  return `${window.location.origin}/share/${token}`
}

function ShareLinkCard({ link, documentName, canManage, onRevoke }) {
  const shareUrl = buildShareUrl(link.token)
  const isRevoked = !!link.revoked_at
  const hasReachedLimit = link.max_uses !== null && link.use_count >= link.max_uses

  return (
    <div className="rounded-2xl p-4 space-y-3" style={{ background: '#141109', border: '1px solid #3d3420' }}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold" style={{ color: '#f8f2e4' }}>{documentName}</p>
          <p className="text-xs" style={{ color: '#8a7858' }}>
            Created {formatDate(link.created_at)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs font-semibold" style={{ color: isRevoked ? '#e8899a' : '#6bc18e' }}>
            {isRevoked ? 'Revoked' : hasReachedLimit ? 'Usage limit reached' : 'Active'}
          </p>
          <p className="text-[11px]" style={{ color: '#8a7858' }}>
            Uses {link.use_count}/{link.max_uses ?? '∞'}
          </p>
        </div>
      </div>

      <div className="rounded-xl px-3 py-3 text-xs break-all" style={{ background: '#1e1910', border: '1px solid #3d3420', color: '#c8b898' }}>
        {shareUrl}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs" style={{ color: '#8a7858' }}>
        <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1" style={{ background: '#1e1910', border: '1px solid #3d3420' }}>
          <CalendarClock className="w-3.5 h-3.5" />
          Expires {link.expires_at ? formatDate(link.expires_at) : 'Never'}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1" style={{ background: '#1e1910', border: '1px solid #3d3420' }}>
          <ShieldCheck className="w-3.5 h-3.5" />
          Token {link.token.slice(0, 8)}…
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => navigator.clipboard.writeText(shareUrl)}
          className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold transition-all hover:-translate-y-px"
          style={{ background: '#252015', border: '1px solid #3d3420', color: '#f8f2e4' }}
        >
          <Copy className="w-3.5 h-3.5" />
          Copy link
        </button>
        <a
          href={shareUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold transition-all hover:-translate-y-px"
          style={{ background: '#252015', border: '1px solid #3d3420', color: '#d4a83a' }}
        >
          <ExternalLink className="w-3.5 h-3.5" />
          Open public page
        </a>
        {canManage && !isRevoked && (
          <button
            type="button"
            onClick={() => onRevoke(link.id)}
            className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold transition-all hover:-translate-y-px"
            style={{ background: 'rgba(196,85,110,0.08)', border: '1px solid rgba(196,85,110,0.2)', color: '#e8899a' }}
          >
            <Archive className="w-3.5 h-3.5" />
            Revoke
          </button>
        )}
      </div>
    </div>
  )
}

function DocumentPreview({ selectedDocument, previewState, onRefreshPreview }) {
  if (!selectedDocument) {
    return (
      <div className="rounded-3xl p-8 h-full flex flex-col items-center justify-center text-center" style={{ background: '#1e1910', border: '1px solid #3d3420' }}>
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4" style={{ background: '#252015' }}>
          <FileText className="w-7 h-7" style={{ color: '#8a7858' }} />
        </div>
        <h3 className="font-display text-2xl font-semibold mb-2" style={{ color: '#f8f2e4' }}>Select a document</h3>
        <p className="text-sm max-w-md" style={{ color: '#8a7858' }}>
          Signed document access stays in the Edge Function layer. Choose a file from the left to request a short-lived viewing URL.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-3xl p-6 md:p-7 space-y-5" style={{ background: '#1e1910', border: '1px solid #3d3420' }}>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl flex items-center justify-center" style={{ background: '#252015', border: '1px solid #3d3420' }}>
            <DocumentIcon mimeType={selectedDocument.mime_type} className="w-5 h-5" style={{ color: '#d4a83a' }} />
          </div>
          <div>
            <h3 className="text-lg font-semibold" style={{ color: '#f8f2e4' }}>{selectedDocument.file_name}</h3>
            <p className="text-xs" style={{ color: '#8a7858' }}>
              {selectedDocument.category || 'Uncategorized'} · {formatBytes(selectedDocument.size_bytes)} · {formatDate(selectedDocument.created_at)}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onRefreshPreview}
            className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold transition-all hover:-translate-y-px"
            style={{ background: '#252015', border: '1px solid #3d3420', color: '#f8f2e4' }}
          >
            <Link2 className="w-3.5 h-3.5" />
            Refresh signed URL
          </button>
          {previewState.url && (
            <a
              href={previewState.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold transition-all hover:-translate-y-px"
              style={{ background: '#252015', border: '1px solid #3d3420', color: '#d4a83a' }}
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Open raw file
            </a>
          )}
        </div>
      </div>

      {previewState.loading && (
        <div className="rounded-2xl p-8 flex items-center justify-center gap-3" style={{ background: '#141109', border: '1px solid #3d3420' }}>
          <Loader2 className="w-5 h-5 animate-spin" style={{ color: '#d4a83a' }} />
          <span className="text-sm" style={{ color: '#c8b898' }}>Requesting signed document URL…</span>
        </div>
      )}

      {previewState.error && (
        <div className="rounded-2xl p-4 flex items-start gap-3" style={{ background: 'rgba(196,85,110,0.08)', border: '1px solid rgba(196,85,110,0.2)', color: '#e8899a' }}>
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold">Preview unavailable</p>
            <p className="text-xs">{previewState.error}</p>
          </div>
        </div>
      )}

      {previewState.url && !previewState.loading && !previewState.error && (
        selectedDocument.mime_type === 'application/pdf' ? (
          <PdfDocumentViewer url={previewState.url} fileName={selectedDocument.file_name} />
        ) : selectedDocument.mime_type?.startsWith('image/') ? (
          <div className="space-y-3">
            <p className="text-xs" style={{ color: '#8a7858' }}>Image preview from signed URL</p>
            <img
              src={previewState.url}
              alt={selectedDocument.file_name}
              className="w-full rounded-2xl border border-[#3d3420] object-contain bg-[#141109] max-h-[70vh]"
            />
          </div>
        ) : (
          <div className="rounded-2xl p-5" style={{ background: '#141109', border: '1px solid #3d3420' }}>
            <p className="text-sm font-semibold mb-1" style={{ color: '#f8f2e4' }}>Preview fallback</p>
            <p className="text-xs mb-4" style={{ color: '#8a7858' }}>
              This file type doesn’t render inline yet, but the signed URL is ready.
            </p>
            <a
              href={previewState.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold transition-all hover:-translate-y-px"
              style={{ background: '#252015', border: '1px solid #3d3420', color: '#d4a83a' }}
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Open file in new tab
            </a>
          </div>
        )
      )}
    </div>
  )
}

export default function Documents() {
  const { session } = useOutletContext()
  const queryClient = useQueryClient()
  const claims = getSessionClaims(session)
  const [selectedId, setSelectedId] = useState(null)
  const [previewState, setPreviewState] = useState({ loading: false, error: '', url: '' })
  const [uploadForm, setUploadForm] = useState({ category: '', description: '' })
  const [uploadNotice, setUploadNotice] = useState({ type: '', message: '' })
  const [shareDraft, setShareDraft] = useState({ expiresAt: '', maxUses: '' })
  const [shareNotice, setShareNotice] = useState({ type: '', message: '' })

  const { data: profile } = useQuery({
    queryKey: ['profile'],
    queryFn: fetchProfile,
  })

  const { data: documents = [], isLoading: documentsLoading } = useQuery({
    queryKey: ['documents'],
    queryFn: fetchDocuments,
  })

  const { data: shareLinks = [] } = useQuery({
    queryKey: ['share-links'],
    queryFn: fetchShareLinks,
  })

  const selectedDocument = useMemo(
    () => documents.find((document) => document.id === selectedId) || documents[0] || null,
    [documents, selectedId],
  )

  const selectedDocumentShareLinks = useMemo(
    () => shareLinks.filter((link) => link.document_id === selectedDocument?.id),
    [shareLinks, selectedDocument],
  )

  const canManageShares = (claims.user_role || profile?.role) === 'admin'

  const previewMutation = useMutation({
    mutationFn: getDocumentUrl,
    onMutate: () => setPreviewState({ loading: true, error: '', url: '' }),
    onSuccess: (payload) => {
      setPreviewState({ loading: false, error: '', url: payload.signed_url })
    },
    onError: (error) => {
      setPreviewState({ loading: false, error: error.message, url: '' })
    },
  })

  const uploadMutation = useMutation({
    mutationFn: async (file) => {
      const payload = await getUploadUrl({
        filename: file.name,
        mime_type: file.type,
        size_bytes: file.size,
        category: uploadForm.category || null,
        description: uploadForm.description || null,
      })
      await uploadFileToSignedUrl(payload.upload_url, file)
      return payload
    },
    onSuccess: async () => {
      setUploadNotice({ type: 'success', message: 'Upload complete. Document list refreshed.' })
      setUploadForm({ category: '', description: '' })
      await queryClient.invalidateQueries({ queryKey: ['documents'] })
    },
    onError: (error) => {
      setUploadNotice({ type: 'error', message: error.message })
    },
  })

  const createShareMutation = useMutation({
    mutationFn: createShareLink,
    onSuccess: async (link) => {
      setShareNotice({ type: 'success', message: `Share link created: ${buildShareUrl(link.token)}` })
      setShareDraft({ expiresAt: '', maxUses: '' })
      await queryClient.invalidateQueries({ queryKey: ['share-links'] })
    },
    onError: (error) => {
      setShareNotice({ type: 'error', message: error.message })
    },
  })

  const revokeShareMutation = useMutation({
    mutationFn: revokeShareLink,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['share-links'] })
    },
  })

  function handlePreview(documentId) {
    setSelectedId(documentId)
    previewMutation.mutate(documentId)
  }

  function handleFileChange(event) {
    const file = event.target.files?.[0]
    if (!file) return

    setUploadNotice({ type: '', message: '' })

    if (!UPLOAD_MIME_OPTIONS.includes(file.type)) {
      setUploadNotice({ type: 'error', message: 'That file type is not allowed by the storage bucket.' })
      return
    }

    if (file.size > MAX_DOCUMENT_BYTES) {
      setUploadNotice({ type: 'error', message: 'That file is larger than the 50 MB bucket limit.' })
      return
    }

    uploadMutation.mutate(file)
    event.target.value = ''
  }

  function handleCreateShare(event) {
    event.preventDefault()
    if (!selectedDocument || !canManageShares) return

    setShareNotice({ type: '', message: '' })
    createShareMutation.mutate({
      documentId: selectedDocument.id,
      expiresAt: shareDraft.expiresAt ? new Date(shareDraft.expiresAt).toISOString() : null,
      maxUses: shareDraft.maxUses ? Number(shareDraft.maxUses) : null,
    })
  }

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest font-medium mb-2" style={{ color: '#8a7858' }}>Phase 4 Documents</p>
          <h1 className="font-display text-3xl md:text-4xl font-semibold mb-3" style={{ color: '#f8f2e4' }}>
            Document Center
          </h1>
          <p className="text-sm leading-relaxed max-w-3xl" style={{ color: '#8a7858' }}>
            This view reads `documents` and `share_links` through Supabase RLS, and uses the deployed Edge Functions for signed viewing and uploads.
          </p>
        </div>

        <div className="rounded-2xl px-4 py-3 text-sm space-y-1" style={{ background: '#1e1910', border: '1px solid #3d3420' }}>
          <p style={{ color: '#f8f2e4' }}>
            {profile?.clients?.business_name || 'Client'} · role <span style={{ color: '#d4a83a' }}>{claims.user_role || profile?.role || 'unknown'}</span>
          </p>
          <p style={{ color: '#8a7858' }}>
            client_slug <span style={{ color: '#c8b898' }}>{claims.client_slug || profile?.clients?.slug || 'unavailable'}</span>
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[360px_minmax(0,1fr)] gap-6">
        <div className="space-y-6">
          <section className="rounded-3xl overflow-hidden" style={{ background: '#1e1910', border: '1px solid #3d3420' }}>
            <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid #3d3420' }}>
              <div>
                <h2 className="text-sm font-semibold" style={{ color: '#f8f2e4' }}>Documents</h2>
                <p className="text-xs" style={{ color: '#8a7858' }}>Tenant-scoped by Supabase RLS</p>
              </div>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ background: '#252015', border: '1px solid #3d3420', color: '#c8b898' }}>
                {documents.length} total
              </span>
            </div>

            <div className="max-h-[70vh] overflow-auto">
              {documentsLoading ? (
                <div className="p-6 flex items-center gap-3" style={{ color: '#8a7858' }}>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm">Loading documents…</span>
                </div>
              ) : documents.length > 0 ? (
                <div className="divide-y divide-[#3d3420]">
                  {documents.map((document) => {
                    const isSelected = selectedDocument?.id === document.id

                    return (
                      <button
                        key={document.id}
                        type="button"
                        onClick={() => handlePreview(document.id)}
                        className="w-full text-left p-4 transition-all"
                        style={isSelected
                          ? { background: 'rgba(212,168,58,0.08)' }
                          : { background: 'transparent' }}
                      >
                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0" style={{ background: '#252015', border: '1px solid #3d3420' }}>
                            <DocumentIcon mimeType={document.mime_type} className="w-4 h-4" style={{ color: '#d4a83a' }} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold truncate" style={{ color: '#f8f2e4' }}>{document.file_name}</p>
                            <p className="text-xs mt-1" style={{ color: '#8a7858' }}>
                              {document.category || 'Uncategorized'} · {formatDate(document.created_at)}
                            </p>
                            <p className="text-[11px] mt-1" style={{ color: '#4e4228' }}>
                              {document.mime_type} · {formatBytes(document.size_bytes)}
                            </p>
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              ) : (
                <div className="p-6 space-y-2">
                  <p className="text-sm font-semibold" style={{ color: '#f8f2e4' }}>No documents yet</p>
                  <p className="text-xs" style={{ color: '#8a7858' }}>
                    The upload flow below calls `{FUNCTION_BASE}/get-upload-url` and will create the first pending document row for this tenant.
                  </p>
                </div>
              )}
            </div>
          </section>

          <section className="rounded-3xl overflow-hidden" style={{ background: '#1e1910', border: '1px solid #3d3420' }}>
            <div className="px-5 py-4" style={{ borderBottom: '1px solid #3d3420' }}>
              <h2 className="text-sm font-semibold" style={{ color: '#f8f2e4' }}>Upload a file</h2>
              <p className="text-xs" style={{ color: '#8a7858' }}>Signed upload URL + direct browser PUT. Backend remains source of truth.</p>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="block text-xs uppercase tracking-widest font-medium mb-2" style={{ color: '#8a7858' }}>Category</label>
                  <input
                    type="text"
                    value={uploadForm.category}
                    onChange={(event) => setUploadForm((current) => ({ ...current, category: event.target.value }))}
                    placeholder="Invoice, contract, report…"
                    className="w-full rounded-xl px-4 py-3 text-sm focus:outline-none"
                    style={{ background: '#252015', border: '1px solid #3d3420', color: '#f8f2e4' }}
                  />
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-widest font-medium mb-2" style={{ color: '#8a7858' }}>Description</label>
                  <textarea
                    value={uploadForm.description}
                    onChange={(event) => setUploadForm((current) => ({ ...current, description: event.target.value }))}
                    placeholder="Optional internal note"
                    className="w-full rounded-xl px-4 py-3 text-sm focus:outline-none min-h-[92px]"
                    style={{ background: '#252015', border: '1px solid #3d3420', color: '#f8f2e4' }}
                  />
                </div>
              </div>

              <label
                className="flex flex-col items-center justify-center gap-3 rounded-2xl px-5 py-8 text-center cursor-pointer transition-all"
                style={{ background: '#141109', border: '1px dashed #3d3420' }}
              >
                <Upload className="w-7 h-7" style={{ color: '#d4a83a' }} />
                <div>
                  <p className="text-sm font-semibold" style={{ color: '#f8f2e4' }}>Choose a document to upload</p>
                  <p className="text-xs mt-1" style={{ color: '#8a7858' }}>
                    PDF, images, DOCX, XLSX, or PPTX up to 50 MB
                  </p>
                </div>
                <input type="file" className="hidden" onChange={handleFileChange} />
              </label>

              {uploadNotice.message && (
                <div
                  className="rounded-2xl p-4 flex items-start gap-3"
                  style={uploadNotice.type === 'success'
                    ? { background: 'rgba(107,193,142,0.08)', border: '1px solid rgba(107,193,142,0.2)', color: '#6bc18e' }
                    : { background: 'rgba(196,85,110,0.08)', border: '1px solid rgba(196,85,110,0.2)', color: '#e8899a' }}
                >
                  {uploadNotice.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /> : <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />}
                  <p className="text-sm">{uploadNotice.message}</p>
                </div>
              )}

              {uploadMutation.isPending && (
                <div className="flex items-center gap-3 text-sm" style={{ color: '#8a7858' }}>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Uploading file to the signed storage URL…
                </div>
              )}
            </div>
          </section>
        </div>

        <div className="space-y-6">
          <DocumentPreview
            selectedDocument={selectedDocument}
            previewState={previewState}
            onRefreshPreview={() => selectedDocument && handlePreview(selectedDocument.id)}
          />

          <section className="rounded-3xl overflow-hidden" style={{ background: '#1e1910', border: '1px solid #3d3420' }}>
            <div className="px-5 py-4 flex items-center justify-between gap-4" style={{ borderBottom: '1px solid #3d3420' }}>
              <div>
                <h2 className="text-sm font-semibold" style={{ color: '#f8f2e4' }}>Share links</h2>
                <p className="text-xs" style={{ color: '#8a7858' }}>Managed through `share_links` and resolved through `/functions/v1/resolve-share-link`.</p>
              </div>
              {selectedDocument && (
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ background: '#252015', border: '1px solid #3d3420', color: '#c8b898' }}>
                  {selectedDocumentShareLinks.length} for selected doc
                </span>
              )}
            </div>

            <div className="p-5 space-y-5">
              {selectedDocument && canManageShares ? (
                <form onSubmit={handleCreateShare} className="grid grid-cols-1 md:grid-cols-[1fr_180px_auto] gap-3">
                  <div>
                    <label className="block text-xs uppercase tracking-widest font-medium mb-2" style={{ color: '#8a7858' }}>Expires at</label>
                    <input
                      type="datetime-local"
                      value={shareDraft.expiresAt}
                      onChange={(event) => setShareDraft((current) => ({ ...current, expiresAt: event.target.value }))}
                      className="w-full rounded-xl px-4 py-3 text-sm focus:outline-none"
                      style={{ background: '#252015', border: '1px solid #3d3420', color: '#f8f2e4' }}
                    />
                  </div>
                  <div>
                    <label className="block text-xs uppercase tracking-widest font-medium mb-2" style={{ color: '#8a7858' }}>Max uses</label>
                    <input
                      type="number"
                      min="1"
                      value={shareDraft.maxUses}
                      onChange={(event) => setShareDraft((current) => ({ ...current, maxUses: event.target.value }))}
                      placeholder="Unlimited"
                      className="w-full rounded-xl px-4 py-3 text-sm focus:outline-none"
                      style={{ background: '#252015', border: '1px solid #3d3420', color: '#f8f2e4' }}
                    />
                  </div>
                  <div className="md:self-end">
                    <button
                      type="submit"
                      disabled={createShareMutation.isPending}
                      className="w-full md:w-auto inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition-all hover:-translate-y-px disabled:opacity-60"
                      style={{ background: '#d4a83a', color: '#0d0b08' }}
                    >
                      {createShareMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />}
                      Create share link
                    </button>
                  </div>
                </form>
              ) : selectedDocument ? (
                <div className="rounded-2xl p-4 text-sm" style={{ background: '#141109', border: '1px solid #3d3420', color: '#8a7858' }}>
                  Share-link creation is limited to `admin` users. Your current app role is `{claims.user_role || profile?.role || 'unknown'}`.
                </div>
              ) : null}

              {shareNotice.message && (
                <div
                  className="rounded-2xl p-4 flex items-start gap-3"
                  style={shareNotice.type === 'success'
                    ? { background: 'rgba(107,193,142,0.08)', border: '1px solid rgba(107,193,142,0.2)', color: '#6bc18e' }
                    : { background: 'rgba(196,85,110,0.08)', border: '1px solid rgba(196,85,110,0.2)', color: '#e8899a' }}
                >
                  {shareNotice.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /> : <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />}
                  <p className="text-sm break-all">{shareNotice.message}</p>
                </div>
              )}

              {selectedDocument ? (
                selectedDocumentShareLinks.length > 0 ? (
                  <div className="space-y-3">
                    {selectedDocumentShareLinks.map((link) => (
                      <ShareLinkCard
                        key={link.id}
                        link={link}
                        documentName={selectedDocument.file_name}
                        canManage={canManageShares}
                        onRevoke={(id) => revokeShareMutation.mutate(id)}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="rounded-2xl p-4 text-sm" style={{ background: '#141109', border: '1px solid #3d3420', color: '#8a7858' }}>
                    No share links yet for this document.
                  </div>
                )
              ) : (
                <div className="rounded-2xl p-4 text-sm" style={{ background: '#141109', border: '1px solid #3d3420', color: '#8a7858' }}>
                  Select a document to review or create share links.
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
