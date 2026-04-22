import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useOutletContext } from 'react-router-dom'
import {
  Archive,
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  Copy,
  ExternalLink,
  FileBadge,
  FileCode2,
  FileImage,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  FolderPlus,
  Grid2X2,
  Link2,
  List,
  Loader2,
  Maximize2,
  MoreHorizontal,
  Search,
  Share2,
  ShieldCheck,
  Trash2,
  Upload,
} from 'lucide-react'
import PdfDocumentViewer from '../components/PdfDocumentViewer'
import TextDocumentViewer from '../components/TextDocumentViewer'
import {
  MAX_DOCUMENT_BYTES,
  createShareLink,
  deleteDocument,
  fetchDocuments,
  fetchProfile,
  fetchShareLinks,
  getDocumentUrl,
  getSessionClaims,
  getUploadUrl,
  resolveUploadMimeType,
  revokeShareLink,
  updateDocumentMetadata,
  uploadFileToSignedUrl,
} from '../lib/portalApi'

const LOCAL_FOLDERS_KEY = 'ds_document_folders'

const TEXT_PREVIEW_MIME = new Set([
  'text/csv',
  'application/csv',
  'text/tab-separated-values',
  'text/plain',
  'text/markdown',
  'application/json',
])

const NATIVE_IMAGE_PREVIEW_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/bmp',
  'image/tiff',
  'image/avif',
  'image/svg+xml',
])

const OFFICE_VIEWER_MIME = new Set([
  'application/msword',
  'application/vnd.ms-excel',
  'application/vnd.ms-powerpoint',
  'application/vnd.ms-word.document.macroEnabled.12',
  'application/vnd.ms-excel.sheet.macroEnabled.12',
  'application/vnd.ms-excel.template.macroEnabled.12',
  'application/vnd.ms-powerpoint.presentation.macroEnabled.12',
  'application/vnd.ms-powerpoint.slideshow.macroEnabled.12',
  'application/vnd.ms-powerpoint.template.macroEnabled.12',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.template',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.template',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.presentationml.slideshow',
  'application/vnd.openxmlformats-officedocument.presentationml.template',
])

const GOOGLE_VIEWER_MIME = new Set([
  'application/vnd.google-apps.document',
  'application/vnd.google-apps.spreadsheet',
  'application/vnd.google-apps.presentation',
  'application/vnd.google-apps.drawing',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.oasis.opendocument.spreadsheet',
  'application/vnd.oasis.opendocument.presentation',
  'application/rtf',
])

function loadLocalFolders() {
  try {
    const stored = localStorage.getItem(LOCAL_FOLDERS_KEY)
    const parsed = stored ? JSON.parse(stored) : []
    return Array.isArray(parsed) ? parsed.filter(Boolean) : []
  } catch {
    return []
  }
}

function saveLocalFolders(folders) {
  try {
    localStorage.setItem(LOCAL_FOLDERS_KEY, JSON.stringify(folders))
  } catch {
    return undefined
  }
}

function getViewerSource(document, signedUrl) {
  if (!signedUrl) return null

  if (OFFICE_VIEWER_MIME.has(document.mime_type)) {
    return {
      label: 'Microsoft 365 viewer',
      src: `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(signedUrl)}`,
    }
  }

  if (GOOGLE_VIEWER_MIME.has(document.mime_type) || document.mime_type === 'image/heic' || document.mime_type === 'image/heif') {
    return {
      label: 'Google Docs viewer',
      src: `https://docs.google.com/gview?embedded=1&url=${encodeURIComponent(signedUrl)}`,
    }
  }

  return null
}

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

function buildShareUrl(token) {
  return `${window.location.origin}/share/${token}`
}

function latestShareLinkForDocument(shareLinks, documentId) {
  return shareLinks
    .filter((link) => link.document_id === documentId && !link.revoked_at)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0] || null
}

function DocumentIcon({ mimeType, className, style }) {
  if (mimeType?.startsWith('image/')) {
    return <FileImage className={className} style={style} />
  }
  if (TEXT_PREVIEW_MIME.has(mimeType)) {
    return <FileCode2 className={className} style={style} />
  }
  if (mimeType?.includes('sheet')) {
    return <FileSpreadsheet className={className} style={style} />
  }
  if (mimeType?.includes('presentation')) {
    return <FileBadge className={className} style={style} />
  }
  return <FileText className={className} style={style} />
}

function documentFolder(document) {
  return (document.category || 'General').trim()
}

function statusPillStyle(isActive, isRevoked) {
  if (isRevoked) {
    return {
      background: 'rgba(223, 95, 143, 0.1)',
      border: '1px solid rgba(223, 95, 143, 0.2)',
      color: 'var(--portal-danger)',
    }
  }

  if (isActive) {
    return {
      background: 'rgba(31, 169, 113, 0.1)',
      border: '1px solid rgba(31, 169, 113, 0.2)',
      color: 'var(--portal-success)',
    }
  }

  return {
    background: 'rgba(201, 168, 76, 0.1)',
    border: '1px solid rgba(201, 168, 76, 0.22)',
    color: '#8c6d1c',
  }
}

function Notice({ kind, message }) {
  if (!message) return null

  const className = kind === 'success' ? 'portal-status-success' : kind === 'info' ? 'portal-status-info' : 'portal-status-danger'
  const Icon = kind === 'success' ? CheckCircle2 : AlertCircle

  return (
    <div className={`${className} flex items-start gap-3 rounded-2xl p-4 text-sm`}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <p className="break-all">{message}</p>
    </div>
  )
}

function ShareLinkCard({ link, documentName, canManage, onRevoke }) {
  const shareUrl = buildShareUrl(link.token)
  const isRevoked = !!link.revoked_at
  const hasReachedLimit = link.max_uses !== null && link.use_count >= link.max_uses

  return (
    <div className="portal-card rounded-[26px] p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold" style={{ color: 'var(--portal-text)' }}>{documentName}</p>
          <p className="text-xs" style={{ color: 'var(--portal-text-muted)' }}>
            Created {formatDate(link.created_at)}
          </p>
        </div>
        <span className="rounded-full px-2.5 py-1 text-[11px] font-semibold" style={statusPillStyle(!isRevoked && !hasReachedLimit, isRevoked)}>
          {isRevoked ? 'Revoked' : hasReachedLimit ? 'Limit reached' : 'Active'}
        </span>
      </div>

      <div className="rounded-2xl border px-3 py-3 text-xs break-all" style={{ background: 'rgba(245, 247, 255, 0.92)', borderColor: 'var(--portal-border)', color: 'var(--portal-text-muted)' }}>
        {shareUrl}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs" style={{ color: 'var(--portal-text-muted)' }}>
        <span className="portal-chip inline-flex items-center gap-1.5 rounded-full px-2.5 py-1">
          <CalendarClock className="h-3.5 w-3.5" />
          Expires {link.expires_at ? formatDate(link.expires_at) : 'Never'}
        </span>
        <span className="portal-chip inline-flex items-center gap-1.5 rounded-full px-2.5 py-1">
          <ShieldCheck className="h-3.5 w-3.5" />
          Uses {link.use_count}/{link.max_uses ?? '∞'}
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => navigator.clipboard.writeText(shareUrl)}
          className="portal-button-secondary inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-xs font-semibold transition-all"
        >
          <Copy className="h-3.5 w-3.5" />
          Copy link
        </button>
        <a
          href={shareUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="portal-button-primary inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-xs font-semibold transition-all"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Open public page
        </a>
        {canManage && !isRevoked && (
          <button
            type="button"
            onClick={() => onRevoke(link.id)}
            className="inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-xs font-semibold transition-all"
            style={{ background: 'rgba(223, 95, 143, 0.08)', border: '1px solid rgba(223, 95, 143, 0.18)', color: 'var(--portal-danger)' }}
          >
            <Archive className="h-3.5 w-3.5" />
            Revoke
          </button>
        )}
      </div>
    </div>
  )
}

function EmbeddedDocumentViewer({ document, signedUrl }) {
  const viewer = getViewerSource(document, signedUrl)

  if (!viewer) return null

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-semibold" style={{ color: 'var(--portal-text)' }}>{document.file_name}</p>
          <p className="text-xs" style={{ color: 'var(--portal-text-muted)' }}>
            Previewing through {viewer.label} for broader document compatibility.
          </p>
        </div>
        <a
          href={signedUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="portal-button-secondary inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-xs font-semibold transition-all"
        >
          Open original
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>

      <div className="overflow-hidden rounded-[28px] border bg-white" style={{ borderColor: 'var(--portal-border)' }}>
        <iframe
          src={viewer.src}
          title={`${document.file_name} preview`}
          className="min-h-[70vh] w-full bg-white"
        />
      </div>
    </div>
  )
}

function EmptyPreviewState() {
  return (
    <div className="portal-panel flex h-full min-h-[460px] flex-col items-center justify-center rounded-[32px] p-8 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-[22px]" style={{ background: 'linear-gradient(135deg, rgba(201, 168, 76, 0.18), rgba(232, 213, 160, 0.12))' }}>
        <FileText className="h-8 w-8" style={{ color: 'var(--portal-primary)' }} />
      </div>
      <h3 className="font-display text-2xl font-semibold" style={{ color: 'var(--portal-text)' }}>Choose a document</h3>
      <p className="mt-3 max-w-md text-sm leading-relaxed" style={{ color: 'var(--portal-text-muted)' }}>
        Select a file to load a preview on the right.
      </p>
    </div>
  )
}

function DocumentActionMenu({ document, isOpen, canManage, canShare, availableFolders, currentFolder, onOpen, onMove, onRename, onCreateShare, onCopyShare, onDelete }) {
  const [showFolderChooser, setShowFolderChooser] = useState(false)

  useEffect(() => {
    if (!isOpen) {
      setShowFolderChooser(false)
    }
  }, [isOpen])

  return (
    <div className="relative" data-document-action-menu="true">
      <button
        type="button"
        aria-label={`Open actions for ${document.file_name}`}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation()
          onOpen()
        }}
        className="inline-flex h-9 w-9 items-center justify-center rounded-full border transition-all"
        style={{ borderColor: 'var(--portal-border)', background: 'rgba(255,255,255,0.92)', color: 'var(--portal-text-muted)' }}
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>

      {isOpen && (
        <div
          className="absolute right-0 top-11 z-20 min-w-[180px] rounded-[20px] border p-2 shadow-lg"
          style={{ borderColor: 'var(--portal-border)', background: 'rgba(255,255,255,0.98)', boxShadow: '0 18px 40px rgba(26, 24, 20, 0.12)' }}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          {canManage ? (
            showFolderChooser ? (
              <div className="space-y-1">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    setShowFolderChooser(false)
                  }}
                  className="flex w-full items-center gap-2 rounded-2xl px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-[0.18em] transition-all"
                  style={{ color: 'var(--portal-text-soft)' }}
                >
                  Back
                </button>
                {availableFolders.map((folder) => (
                  <button
                    key={folder}
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      onMove(document, folder)
                    }}
                    className="flex w-full items-center justify-between gap-3 rounded-2xl px-3 py-2.5 text-left text-sm font-medium transition-all"
                    style={folder === currentFolder
                      ? { background: 'rgba(201, 168, 76, 0.12)', color: 'var(--portal-primary)' }
                      : { color: 'var(--portal-text)' }}
                  >
                    <span className="truncate">{folder}</span>
                    {folder === currentFolder ? <span className="text-[11px] font-semibold">Current</span> : null}
                  </button>
                ))}
              </div>
            ) : (
              <div className="space-y-1">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    setShowFolderChooser(true)
                  }}
                  className="flex w-full items-center gap-2 rounded-2xl px-3 py-2.5 text-left text-sm font-medium transition-all"
                  style={{ color: 'var(--portal-text)' }}
                >
                  Move to folder
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    onRename(document)
                  }}
                  className="flex w-full items-center gap-2 rounded-2xl px-3 py-2.5 text-left text-sm font-medium transition-all"
                  style={{ color: 'var(--portal-text)' }}
                >
                  Rename
                </button>
                {canShare && (
                  <>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation()
                        onCreateShare(document)
                      }}
                      className="flex w-full items-center gap-2 rounded-2xl px-3 py-2.5 text-left text-sm font-medium transition-all"
                      style={{ color: 'var(--portal-text)' }}
                    >
                      Create share link
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation()
                        onCopyShare(document)
                      }}
                      className="flex w-full items-center gap-2 rounded-2xl px-3 py-2.5 text-left text-sm font-medium transition-all"
                      style={{ color: 'var(--portal-text)' }}
                    >
                      <Copy className="h-4 w-4" />
                      Copy share link
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    onDelete(document)
                  }}
                  className="flex w-full items-center gap-2 rounded-2xl px-3 py-2.5 text-left text-sm font-medium transition-all"
                  style={{ color: 'var(--portal-danger)', background: 'rgba(223, 95, 143, 0.06)' }}
                >
                  <Trash2 className="h-4 w-4" />
                  Delete
                </button>
              </div>
            )
          ) : (
            <p className="px-3 py-2 text-sm" style={{ color: 'var(--portal-text-muted)' }}>
              Admin access required
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function getPreviewPopoutUrl(document, signedUrl) {
  if (!document || !signedUrl) return ''
  const viewer = getViewerSource(document, signedUrl)
  return viewer?.src || signedUrl
}

function DocumentPreview({ selectedDocument, previewState, onRefreshPreview }) {
  const previewFrameRef = useRef(null)

  async function handleFullscreenPreview() {
    if (!previewFrameRef.current || !previewState.url) return

    try {
      if (document.fullscreenElement === previewFrameRef.current) {
        await document.exitFullscreen()
        return
      }

      if (document.fullscreenElement) {
        await document.exitFullscreen()
      }

      await previewFrameRef.current.requestFullscreen()
    } catch {
      window.open(getPreviewPopoutUrl(selectedDocument, previewState.url), '_blank', 'noopener,noreferrer')
    }
  }

  if (!selectedDocument) {
    return <EmptyPreviewState />
  }

  return (
    <div className="portal-panel rounded-[32px] p-5 md:p-6 space-y-5">
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-[18px]" style={{ background: 'linear-gradient(135deg, rgba(201, 168, 76, 0.18), rgba(232, 213, 160, 0.12))' }}>
            <DocumentIcon mimeType={selectedDocument.mime_type} className="h-5 w-5" style={{ color: 'var(--portal-primary)' }} />
          </div>
          <div className="min-w-0">
            <h3 className="truncate text-lg font-semibold" style={{ color: 'var(--portal-text)' }}>{selectedDocument.file_name}</h3>
            <p className="text-xs" style={{ color: 'var(--portal-text-muted)' }}>
              {documentFolder(selectedDocument)} · {formatBytes(selectedDocument.size_bytes)} · {formatDate(selectedDocument.updated_at || selectedDocument.created_at)}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onRefreshPreview}
            className="portal-button-secondary inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-xs font-semibold transition-all"
          >
            <Link2 className="h-3.5 w-3.5" />
            Refresh preview
          </button>
          {previewState.url && (
            <button
              type="button"
              onClick={handleFullscreenPreview}
              className="portal-button-secondary inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-xs font-semibold transition-all"
            >
              <Maximize2 className="h-3.5 w-3.5" />
              Full screen
            </button>
          )}
          {previewState.url && (
            <a
              href={getPreviewPopoutUrl(selectedDocument, previewState.url)}
              target="_blank"
              rel="noopener noreferrer"
              className="portal-button-primary inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-xs font-semibold transition-all"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Pop out preview
            </a>
          )}
        </div>
      </div>

      {previewState.loading && (
        <div className="portal-surface-strong flex items-center justify-center gap-3 rounded-[26px] p-8">
          <Loader2 className="h-5 w-5 animate-spin" style={{ color: 'var(--portal-primary)' }} />
          <span className="text-sm" style={{ color: 'var(--portal-text-muted)' }}>Requesting signed document URL…</span>
        </div>
      )}

      {previewState.error && <Notice kind="error" message={previewState.error} />}

      {previewState.url && !previewState.loading && !previewState.error && (
        <div
          ref={previewFrameRef}
          className="rounded-[30px] bg-[var(--portal-surface)] [&:fullscreen]:overflow-auto [&:fullscreen]:p-6"
        >
          {selectedDocument.mime_type === 'application/pdf' ? (
            <PdfDocumentViewer url={previewState.url} fileName={selectedDocument.file_name} />
          ) : TEXT_PREVIEW_MIME.has(selectedDocument.mime_type) ? (
            <TextDocumentViewer
              url={previewState.url}
              fileName={selectedDocument.file_name}
              mimeType={selectedDocument.mime_type === 'application/csv' ? 'text/csv' : selectedDocument.mime_type}
            />
          ) : NATIVE_IMAGE_PREVIEW_MIME.has(selectedDocument.mime_type) ? (
            <div className="space-y-3">
              <p className="text-xs" style={{ color: 'var(--portal-text-muted)' }}>Image preview from the signed URL</p>
              <img
                src={previewState.url}
                alt={selectedDocument.file_name}
                className="max-h-[70vh] w-full rounded-[28px] border bg-white object-contain"
                style={{ borderColor: 'var(--portal-border)' }}
              />
            </div>
          ) : getViewerSource(selectedDocument, previewState.url) ? (
            <EmbeddedDocumentViewer document={selectedDocument} signedUrl={previewState.url} />
          ) : (
            <div className="portal-surface-strong rounded-[26px] p-5">
              <p className="text-sm font-semibold" style={{ color: 'var(--portal-text)' }}>Preview not available inline</p>
              <p className="mt-1 text-xs" style={{ color: 'var(--portal-text-muted)' }}>
                This file type does not render inline yet, but the signed URL is ready to open.
              </p>
              <a
                href={previewState.url}
                target="_blank"
                rel="noopener noreferrer"
                className="portal-button-primary mt-4 inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-xs font-semibold transition-all"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Open file in new tab
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function Documents() {
  const { session } = useOutletContext()
  const queryClient = useQueryClient()
  const claims = getSessionClaims(session)

  const [selectedId, setSelectedId] = useState(null)
  const [uploadedFallbackDocuments, setUploadedFallbackDocuments] = useState([])
  const [previewState, setPreviewState] = useState({ loading: false, error: '', url: '' })
  const [uploadForm, setUploadForm] = useState({ category: '', description: '' })
  const [uploadNotice, setUploadNotice] = useState({ type: '', message: '' })
  const [shareDraft, setShareDraft] = useState({ expiresAt: '', maxUses: '' })
  const [shareNotice, setShareNotice] = useState({ type: '', message: '' })
  const [folderNotice, setFolderNotice] = useState({ type: '', message: '' })
  const [fileNotice, setFileNotice] = useState({ type: '', message: '' })
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedFolder, setSelectedFolder] = useState('All Files')
  const [libraryView, setLibraryView] = useState('list')
  const [folderDraft, setFolderDraft] = useState('')
  const [localFolders, setLocalFolders] = useState(loadLocalFolders)
  const [folderForm, setFolderForm] = useState({ docId: '', mode: '', custom: '' })
  const [openActionMenuId, setOpenActionMenuId] = useState(null)

  const { data: profile } = useQuery({
    queryKey: ['profile'],
    queryFn: fetchProfile,
  })

  const {
    data: documents = [],
    isLoading: documentsLoading,
    error: documentsError,
  } = useQuery({
    queryKey: ['documents'],
    queryFn: fetchDocuments,
  })

  const {
    data: shareLinks = [],
    error: shareLinksError,
  } = useQuery({
    queryKey: ['share-links'],
    queryFn: fetchShareLinks,
  })

  const visibleDocuments = documents.length > 0 ? documents : uploadedFallbackDocuments

  const folders = useMemo(() => {
    const documentFolders = visibleDocuments.map((document) => documentFolder(document))
    return ['All Files', ...Array.from(new Set([...documentFolders, ...localFolders])).sort((a, b) => a.localeCompare(b))]
  }, [visibleDocuments, localFolders])

  const filteredDocuments = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase()

    return visibleDocuments.filter((document) => {
      const matchesFolder = selectedFolder === 'All Files' || documentFolder(document) === selectedFolder
      const matchesQuery = normalizedQuery.length === 0 || [
        document.file_name,
        document.mime_type,
        document.category,
        document.description,
      ].some((value) => value?.toLowerCase().includes(normalizedQuery))

      return matchesFolder && matchesQuery
    })
  }, [searchQuery, selectedFolder, visibleDocuments])

  const selectedDocument = useMemo(
    () => filteredDocuments.find((document) => document.id === selectedId)
      || visibleDocuments.find((document) => document.id === selectedId)
      || filteredDocuments[0]
      || visibleDocuments[0]
      || null,
    [filteredDocuments, visibleDocuments, selectedId],
  )

  const selectedDocumentShareLinks = useMemo(
    () => shareLinks.filter((link) => link.document_id === selectedDocument?.id),
    [shareLinks, selectedDocument],
  )

  const canManageShares = (claims.user_role || profile?.role) === 'admin'
  const canManageDocuments = canManageShares

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
      const mimeType = resolveUploadMimeType(file)
      const payload = await getUploadUrl({
        filename: file.name,
        mime_type: mimeType,
        size_bytes: file.size,
        category: uploadForm.category || null,
        description: uploadForm.description || null,
      })
      await uploadFileToSignedUrl(payload.upload_url, file, mimeType)
      return { ...payload, resolvedMimeType: mimeType }
    },
    onSuccess: async (payload, file) => {
      const optimisticDocument = {
        id: payload.document_id,
        file_name: file.name,
        mime_type: payload.expected_mime || payload.resolvedMimeType || file.type,
        category: uploadForm.category || null,
        description: uploadForm.description || null,
        size_bytes: file.size,
        storage_path: payload.storage_path,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }

      setUploadedFallbackDocuments((current) => [optimisticDocument, ...current.filter((document) => document.id !== optimisticDocument.id)].slice(0, 10))
      queryClient.setQueryData(['documents'], (current = []) => [optimisticDocument, ...current.filter((document) => document.id !== optimisticDocument.id)])
      setSelectedId(payload.document_id)
      setUploadNotice({ type: 'success', message: 'Upload complete. Document list refreshed.' })

      if (uploadForm.category?.trim()) {
        setLocalFolders((current) => {
          if (current.includes(uploadForm.category.trim())) return current
          const next = [...current, uploadForm.category.trim()].sort((a, b) => a.localeCompare(b))
          saveLocalFolders(next)
          return next
        })
      }

      setUploadForm({ category: '', description: '' })
      await queryClient.invalidateQueries({ queryKey: ['documents'] })
      previewMutation.mutate(payload.document_id)
    },
    onError: (error) => {
      setUploadNotice({ type: 'error', message: error.message })
    },
  })

  const createShareMutation = useMutation({
    mutationFn: createShareLink,
    onSuccess: async (link) => {
      const shareUrl = buildShareUrl(link.token)
      setShareNotice({ type: 'success', message: `Share link created: ${shareUrl}` })
      setShareDraft({ expiresAt: '', maxUses: '' })
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl).catch(() => {})
      }
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

  const updateDocumentMutation = useMutation({
    mutationFn: ({ documentId, changes }) => updateDocumentMetadata(documentId, changes),
    onSuccess: async (updatedDocument) => {
      queryClient.setQueryData(['documents'], (current = []) =>
        current.map((document) => (document.id === updatedDocument.id ? { ...document, ...updatedDocument } : document)))
      setUploadedFallbackDocuments((current) =>
        current.map((document) => (document.id === updatedDocument.id ? { ...document, ...updatedDocument } : document)))

      if (updatedDocument.category?.trim()) {
        setLocalFolders((current) => {
          if (current.includes(updatedDocument.category.trim())) return current
          const next = [...current, updatedDocument.category.trim()].sort((a, b) => a.localeCompare(b))
          saveLocalFolders(next)
          return next
        })
      }

      if (Object.prototype.hasOwnProperty.call(updatedDocument, 'file_name')) {
        setFileNotice({ type: 'success', message: 'File renamed.' })
      } else {
        setFolderNotice({ type: 'success', message: 'Folder saved.' })
      }
      await queryClient.invalidateQueries({ queryKey: ['documents'] })
    },
    onError: (error) => {
      setFolderNotice({ type: 'error', message: error.message })
      setFileNotice({ type: 'error', message: error.message })
    },
  })

  const deleteDocumentMutation = useMutation({
    mutationFn: ({ documentId, storagePath }) => deleteDocument(documentId, storagePath),
    onSuccess: async (_data, variables) => {
      queryClient.setQueryData(['documents'], (current = []) =>
        current.filter((document) => document.id !== variables.documentId))
      setUploadedFallbackDocuments((current) =>
        current.filter((document) => document.id !== variables.documentId))

      const remainingDocuments = visibleDocuments.filter((document) => document.id !== variables.documentId)
      if (selectedId === variables.documentId) {
        setSelectedId(remainingDocuments[0]?.id || null)
        setPreviewState({ loading: false, error: '', url: '' })
      }

      setFileNotice({ type: 'success', message: 'File deleted.' })
      await queryClient.invalidateQueries({ queryKey: ['documents'] })
    },
    onError: (error) => {
      setFileNotice({ type: 'error', message: error.message })
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

    const mimeType = resolveUploadMimeType(file)

    if (!mimeType) {
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
      clientId: claims.client_id || profile?.client_id || null,
      expiresAt: shareDraft.expiresAt ? new Date(shareDraft.expiresAt).toISOString() : null,
      maxUses: shareDraft.maxUses ? Number(shareDraft.maxUses) : null,
    })
  }

  function handleCreateFolder(event) {
    event.preventDefault()
    const nextFolder = folderDraft.trim()
    if (!nextFolder) return

    if (!folders.includes(nextFolder)) {
      const next = [...localFolders, nextFolder].sort((a, b) => a.localeCompare(b))
      setLocalFolders(next)
      saveLocalFolders(next)
    }

    setFolderDraft('')
    setSelectedFolder(nextFolder)
    setFolderNotice({ type: 'success', message: `Folder "${nextFolder}" created.` })
  }

  function handleSaveFolderAssignment() {
    if (!selectedDocument || !canManageDocuments) return

    const nextFolder = (activeFolderMode === '__custom__' ? activeFolderCustom : activeFolderMode).trim() || 'General'
    setFolderNotice({ type: '', message: '' })
    updateDocumentMutation.mutate({
      documentId: selectedDocument.id,
      changes: { category: nextFolder },
    })
  }

  function handleMoveDocument(document, nextFolder) {
    setSelectedId(document.id)

    if (!document || !canManageDocuments) return

    const normalizedFolder = nextFolder?.trim()
    if (!normalizedFolder || normalizedFolder === documentFolder(document)) return

    setOpenActionMenuId(null)

    setFolderNotice({ type: '', message: '' })
    updateDocumentMutation.mutate({
      documentId: document.id,
      changes: { category: normalizedFolder },
    })
  }

  function handleRenameDocument(document) {
    setOpenActionMenuId(null)
    setSelectedId(document.id)
    handleRenameFileForDocument(document)
  }

  function handleRenameFileForDocument(document) {
    if (!document || !canManageDocuments) return

    const promptedName = window.prompt('Rename file', document.file_name)
    const nextName = promptedName?.trim()
    if (!nextName || nextName === document.file_name) return

    setFileNotice({ type: '', message: '' })
    updateDocumentMutation.mutate({
      documentId: document.id,
      changes: { file_name: nextName },
    })
  }

  function handleDeleteDocument(document) {
    setOpenActionMenuId(null)
    setSelectedId(document.id)

    if (!document || !canManageDocuments) return

    const confirmed = window.confirm(`Delete "${document.file_name}"? This will permanently remove the file from the portal.`)
    if (!confirmed) return

    setFileNotice({ type: '', message: '' })
    deleteDocumentMutation.mutate({
      documentId: document.id,
      storagePath: document.storage_path,
    })
  }

  function handleCreateShareForDocument(document) {
    setOpenActionMenuId(null)
    setSelectedId(document.id)
    if (!document || !canManageShares) return

    setShareNotice({ type: '', message: '' })
    createShareMutation.mutate({
      documentId: document.id,
      clientId: claims.client_id || profile?.client_id || null,
      expiresAt: null,
      maxUses: null,
    })
  }

  async function handleCopyShareForDocument(document) {
    setOpenActionMenuId(null)
    setSelectedId(document.id)

    if (!document || !canManageShares) return

    const existingLink = latestShareLinkForDocument(shareLinks, document.id)
    if (!existingLink) {
      setShareNotice({ type: 'info', message: 'No active share link yet. Create one first from the same menu.' })
      return
    }

    const shareUrl = buildShareUrl(existingLink.token)
    try {
      await navigator.clipboard.writeText(shareUrl)
      setShareNotice({ type: 'success', message: `Copied share link: ${shareUrl}` })
    } catch {
      setShareNotice({ type: 'error', message: 'Could not copy the share link to the clipboard.' })
    }
  }

  const folderCounts = useMemo(() => {
    const counts = { 'All Files': visibleDocuments.length }
    for (const folder of folders) {
      if (folder === 'All Files') continue
      counts[folder] = visibleDocuments.filter((document) => documentFolder(document) === folder).length
    }
    return counts
  }, [folders, visibleDocuments])

  const folderSelectOptions = folders.filter((folder) => folder !== 'All Files')
  const selectedDocumentFolder = selectedDocument ? documentFolder(selectedDocument) : 'General'
  const activeFolderMode = selectedDocument && folderForm.docId === selectedDocument.id
    ? folderForm.mode
    : (folderSelectOptions.includes(selectedDocumentFolder) ? selectedDocumentFolder : '__custom__')
  const activeFolderCustom = selectedDocument && folderForm.docId === selectedDocument.id
    ? folderForm.custom
    : (folderSelectOptions.includes(selectedDocumentFolder) ? '' : selectedDocumentFolder)

  useEffect(() => {
    if (!openActionMenuId) return undefined

    function handlePointerDown(event) {
      const target = event.target
      if (target instanceof Element && target.closest('[data-document-action-menu="true"]')) {
        return
      }
      setOpenActionMenuId(null)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [openActionMenuId])

  return (
    <div className="portal-page mx-auto max-w-[1640px] space-y-5 md:p-6 xl:p-8">
      <section className="portal-surface rounded-[36px] p-5 md:p-7">
        <div className="portal-page-header">
          <div className="max-w-4xl">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="portal-chip rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em]">
                Documents
              </span>
            </div>
            <h1 className="portal-page-title font-display">Documents</h1>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="portal-stat-card rounded-[24px] px-4 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em]" style={{ color: 'var(--portal-text-soft)' }}>Total files</p>
              <p className="mt-2 text-2xl font-semibold" style={{ color: 'var(--portal-text)' }}>{visibleDocuments.length}</p>
              <p className="mt-1 text-xs" style={{ color: 'var(--portal-text-muted)' }}>Available in this library</p>
            </div>
            <div className="portal-stat-card rounded-[24px] px-4 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em]" style={{ color: 'var(--portal-text-soft)' }}>Folders</p>
              <p className="mt-2 text-2xl font-semibold" style={{ color: 'var(--portal-text)' }}>{folders.length - 1}</p>
              <p className="mt-1 text-xs" style={{ color: 'var(--portal-text-muted)' }}>Current folder groups</p>
            </div>
            <div className="portal-stat-card rounded-[24px] px-4 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em]" style={{ color: 'var(--portal-text-soft)' }}>Share links</p>
              <p className="mt-2 text-2xl font-semibold" style={{ color: 'var(--portal-text)' }}>{shareLinks.length}</p>
              <p className="mt-1 text-xs" style={{ color: 'var(--portal-text-muted)' }}>Active and archived links</p>
            </div>
          </div>
        </div>
      </section>

      <section className="portal-command-bar rounded-[30px]">
        <div className="portal-command-bar-group">
          <button
            type="button"
            onClick={() => document.getElementById('documents-upload-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            className="portal-button-primary inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold"
          >
            <Upload className="h-4 w-4" />
            Upload
          </button>
          <button
            type="button"
            onClick={() => selectedDocument && handlePreview(selectedDocument.id)}
            className="portal-button-secondary inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold"
            disabled={!selectedDocument}
          >
            <Link2 className="h-4 w-4" />
            Refresh preview
          </button>
          <div className="portal-chip inline-flex items-center gap-2 rounded-full px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.22em]">
            <FolderOpen className="h-3.5 w-3.5" />
            {selectedFolder}
          </div>
        </div>

        <div className="portal-command-bar-group">
          <div className="relative min-w-[240px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'var(--portal-text-soft)' }} />
            <input
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search by file name or note"
              className="portal-input py-3 pl-10 pr-4 text-sm"
            />
          </div>
          <div className="portal-chip inline-flex items-center gap-1 rounded-full p-1">
            <button
              type="button"
              onClick={() => setLibraryView('list')}
              className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold transition-all"
              style={libraryView === 'list' ? { background: 'white', color: 'var(--portal-primary)' } : { color: 'var(--portal-text-soft)' }}
            >
              <List className="h-4 w-4" />
              <span>List view</span>
            </button>
            <button
              type="button"
              onClick={() => setLibraryView('grid')}
              className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold transition-all"
              style={libraryView === 'grid' ? { background: 'white', color: 'var(--portal-primary)' } : { color: 'var(--portal-text-soft)' }}
            >
              <Grid2X2 className="h-4 w-4" />
              <span>Grid view</span>
            </button>
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[260px_minmax(0,1fr)_420px]">
        <aside className="space-y-6">
          <section className="portal-panel overflow-hidden rounded-[34px]">
            <div className="border-b px-5 py-5" style={{ borderColor: 'var(--portal-border)' }}>
              <h2 className="text-base font-semibold" style={{ color: 'var(--portal-text)' }}>Folders</h2>
            </div>
            <div className="space-y-4 p-5">
              <form onSubmit={handleCreateFolder} className="flex gap-2">
                <input
                  type="text"
                  value={folderDraft}
                  onChange={(event) => setFolderDraft(event.target.value)}
                  placeholder="New folder"
                  className="portal-input px-4 py-3 text-sm"
                />
                <button type="submit" className="portal-button-secondary inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold">
                  <FolderPlus className="h-4 w-4" />
                </button>
              </form>

              <div className="space-y-2">
                {folders.map((folder) => (
                  <button
                    key={folder}
                    type="button"
                    onClick={() => setSelectedFolder(folder)}
                    className="flex w-full items-center justify-between rounded-2xl px-3 py-3 text-left transition-all"
                    style={selectedFolder === folder
                      ? { background: 'linear-gradient(135deg, rgba(201,168,76,0.16), rgba(232,213,160,0.08))', border: '1px solid rgba(201,168,76,0.24)' }
                      : { background: 'rgba(255,255,255,0.78)', border: '1px solid var(--portal-border)' }}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold" style={{ color: 'var(--portal-text)' }}>{folder}</p>
                      <p className="text-[11px]" style={{ color: 'var(--portal-text-soft)' }}>{folderCounts[folder] || 0} file{(folderCounts[folder] || 0) === 1 ? '' : 's'}</p>
                    </div>
                  </button>
                ))}
              </div>

              <Notice kind={folderNotice.type} message={folderNotice.message} />
            </div>
          </section>

          <section id="documents-upload-panel" className="portal-panel overflow-hidden rounded-[34px]">
            <div className="border-b px-5 py-5" style={{ borderColor: 'var(--portal-border)' }}>
              <h2 className="text-base font-semibold" style={{ color: 'var(--portal-text)' }}>Upload</h2>
            </div>

            <div className="space-y-4 p-5">
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.22em]" style={{ color: 'var(--portal-text-soft)' }}>
                  Folder
                </label>
                <input
                  type="text"
                  value={uploadForm.category}
                  onChange={(event) => setUploadForm((current) => ({ ...current, category: event.target.value }))}
                  placeholder={selectedFolder === 'All Files' ? 'Folder name' : selectedFolder}
                  className="portal-input px-4 py-3 text-sm"
                />
              </div>

              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.22em]" style={{ color: 'var(--portal-text-soft)' }}>
                  Description
                </label>
                <textarea
                  value={uploadForm.description}
                  onChange={(event) => setUploadForm((current) => ({ ...current, description: event.target.value }))}
                  placeholder="Optional internal note"
                  className="portal-input min-h-[110px] px-4 py-3 text-sm"
                />
              </div>

              <label
                className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-[28px] border border-dashed px-5 py-8 text-center transition-all"
                style={{ borderColor: 'rgba(201, 168, 76, 0.28)', background: 'linear-gradient(145deg, rgba(201, 168, 76, 0.1), rgba(232, 213, 160, 0.08))' }}
              >
                <div className="flex h-14 w-14 items-center justify-center rounded-[20px] bg-white shadow-sm">
                  <Upload className="h-6 w-6" style={{ color: 'var(--portal-primary)' }} />
                </div>
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--portal-text)' }}>Choose a document to upload</p>
                  <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--portal-text-muted)' }}>
                    PDFs, Office docs, CSV and text files, plus common image formats up to 50 MB.
                  </p>
                </div>
                <input type="file" className="hidden" onChange={handleFileChange} />
              </label>

              <Notice kind={uploadNotice.type} message={uploadNotice.message} />

              {uploadMutation.isPending && (
                <div className="portal-status-info flex items-center gap-3 rounded-2xl p-4 text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Uploading file to the signed storage URL…
                </div>
              )}
            </div>
          </section>
        </aside>

        <section className="portal-panel overflow-visible rounded-[34px]">
          <div className="border-b px-5 py-5 md:px-6" style={{ borderColor: 'var(--portal-border)' }}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold" style={{ color: 'var(--portal-text)' }}>{selectedFolder}</h2>
                <p className="mt-1 text-sm" style={{ color: 'var(--portal-text-muted)' }}>
                  {selectedFolder === 'All Files' ? 'Tenant-scoped files from the secure library.' : `Files inside the ${selectedFolder} folder.`}
                </p>
              </div>
              <span className="portal-chip rounded-full px-3 py-1 text-[11px] font-semibold">
                {filteredDocuments.length} shown
              </span>
            </div>
          </div>

          {documentsError && <div className="p-5"><Notice kind="error" message={documentsError.message} /></div>}

          {documentsLoading ? (
            <div className="flex items-center gap-3 px-6 py-10" style={{ color: 'var(--portal-text-muted)' }}>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Loading documents…</span>
            </div>
          ) : filteredDocuments.length > 0 ? (
            libraryView === 'grid' ? (
              <div className="grid gap-3 p-5 sm:grid-cols-2 2xl:grid-cols-3">
                {filteredDocuments.map((document) => {
                  const isSelected = selectedDocument?.id === document.id

                  return (
                    <div
                      key={document.id}
                      onClick={() => handlePreview(document.id)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          handlePreview(document.id)
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      className="relative rounded-[24px] p-4 text-left transition-all cursor-pointer"
                      style={isSelected
                        ? { background: 'linear-gradient(145deg, rgba(201,168,76,0.14), rgba(232,213,160,0.08))', border: '1px solid rgba(201,168,76,0.24)', boxShadow: '0 14px 28px rgba(26,24,20,0.06)' }
                        : { background: 'rgba(255,255,255,0.84)', border: '1px solid var(--portal-border)' }}
                    >
                      <div className="absolute right-3 top-3">
                        <DocumentActionMenu
                          document={document}
                          isOpen={openActionMenuId === document.id}
                          canManage={canManageDocuments}
                          canShare={canManageShares}
                          availableFolders={folderSelectOptions}
                          currentFolder={documentFolder(document)}
                          onOpen={() => setOpenActionMenuId((current) => (current === document.id ? null : document.id))}
                          onMove={handleMoveDocument}
                          onRename={handleRenameDocument}
                          onCreateShare={handleCreateShareForDocument}
                          onCopyShare={handleCopyShareForDocument}
                          onDelete={handleDeleteDocument}
                        />
                      </div>
                      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-[14px]" style={{ background: 'rgba(245, 240, 235, 0.96)' }}>
                        <DocumentIcon mimeType={document.mime_type} className="h-5 w-5" style={{ color: 'var(--portal-primary)' }} />
                      </div>
                      <p className="truncate text-sm font-semibold" style={{ color: 'var(--portal-text)' }}>{document.file_name}</p>
                      <p className="mt-3 text-xs" style={{ color: 'var(--portal-text-soft)' }}>
                        {formatDate(document.updated_at || document.created_at)} · {formatBytes(document.size_bytes)}
                      </p>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="portal-scroll overflow-auto">
                <table className="min-w-full border-separate border-spacing-0">
                  <thead>
                    <tr style={{ background: 'rgba(250, 246, 241, 0.9)' }}>
                      <th className="px-6 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.2em]" style={{ color: 'var(--portal-text-soft)' }}>Name</th>
                      <th className="px-4 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.2em]" style={{ color: 'var(--portal-text-soft)' }}>Modified</th>
                      <th className="px-4 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.2em]" style={{ color: 'var(--portal-text-soft)' }}>Size</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDocuments.map((document) => {
                      const isSelected = selectedDocument?.id === document.id
                      return (
                        <tr
                          key={document.id}
                          className="portal-table-row cursor-pointer transition-all"
                          onClick={() => handlePreview(document.id)}
                          style={isSelected ? { background: 'rgba(201, 168, 76, 0.1)' } : undefined}
                        >
                          <td className="border-t px-6 py-3.5" style={{ borderColor: 'var(--portal-border)' }}>
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex min-w-0 items-center gap-3">
                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[12px]" style={{ background: 'rgba(245, 240, 235, 0.96)' }}>
                                  <DocumentIcon mimeType={document.mime_type} className="h-4 w-4" style={{ color: 'var(--portal-primary)' }} />
                                </div>
                                <p className="truncate text-sm font-semibold" style={{ color: 'var(--portal-text)' }}>{document.file_name}</p>
                              </div>
                              <div className="shrink-0">
                                <DocumentActionMenu
                                  document={document}
                                  isOpen={openActionMenuId === document.id}
                                  canManage={canManageDocuments}
                                  canShare={canManageShares}
                                  availableFolders={folderSelectOptions}
                                  currentFolder={documentFolder(document)}
                                  onOpen={() => setOpenActionMenuId((current) => (current === document.id ? null : document.id))}
                                  onMove={handleMoveDocument}
                                  onRename={handleRenameDocument}
                                  onCreateShare={handleCreateShareForDocument}
                                  onCopyShare={handleCopyShareForDocument}
                                  onDelete={handleDeleteDocument}
                                />
                              </div>
                            </div>
                          </td>
                          <td className="border-t px-4 py-3.5 text-sm" style={{ borderColor: 'var(--portal-border)', color: 'var(--portal-text-muted)' }}>
                            {formatDate(document.updated_at || document.created_at)}
                          </td>
                          <td className="border-t px-4 py-3.5 text-sm" style={{ borderColor: 'var(--portal-border)', color: 'var(--portal-text-muted)' }}>
                            {formatBytes(document.size_bytes)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )
          ) : (
            <div className="px-5 py-12 text-center">
              <div className="mx-auto max-w-md rounded-[28px] border border-dashed px-6 py-10" style={{ borderColor: 'var(--portal-border-strong)', color: 'var(--portal-text-muted)' }}>
                <p className="text-sm font-semibold" style={{ color: 'var(--portal-text)' }}>No documents match this view</p>
                <p className="mt-2 text-xs">Try another folder, clear your search, or upload the first file for this workspace.</p>
              </div>
            </div>
          )}
        </section>

        <aside className="space-y-6">
          <DocumentPreview
            selectedDocument={selectedDocument}
            previewState={previewState}
            onRefreshPreview={() => selectedDocument && handlePreview(selectedDocument.id)}
          />

          <section className="portal-panel overflow-hidden rounded-[34px]">
            <div className="border-b px-5 py-5" style={{ borderColor: 'var(--portal-border)' }}>
              <h2 className="text-base font-semibold" style={{ color: 'var(--portal-text)' }}>Details</h2>
            </div>

            <div className="space-y-4 p-5">
              {selectedDocument ? (
                <>
                  <div className="rounded-[24px] border p-4" style={{ borderColor: 'var(--portal-border)', background: 'rgba(255,255,255,0.86)' }}>
                    <div className="mb-4 flex items-start gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-[18px]" style={{ background: 'rgba(245, 240, 235, 0.96)' }}>
                        <DocumentIcon mimeType={selectedDocument.mime_type} className="h-5 w-5" style={{ color: 'var(--portal-primary)' }} />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold" style={{ color: 'var(--portal-text)' }}>{selectedDocument.file_name}</p>
                        <p className="mt-1 text-xs" style={{ color: 'var(--portal-text-muted)' }}>{selectedDocument.mime_type}</p>
                      </div>
                    </div>

                    <div className="space-y-3 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <span style={{ color: 'var(--portal-text-soft)' }}>Folder</span>
                        <span style={{ color: 'var(--portal-text)' }}>{documentFolder(selectedDocument)}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span style={{ color: 'var(--portal-text-soft)' }}>Size</span>
                        <span style={{ color: 'var(--portal-text)' }}>{formatBytes(selectedDocument.size_bytes)}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span style={{ color: 'var(--portal-text-soft)' }}>Updated</span>
                        <span style={{ color: 'var(--portal-text)' }}>{formatDate(selectedDocument.updated_at || selectedDocument.created_at)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-[24px] border p-4" style={{ borderColor: 'var(--portal-border)', background: 'rgba(255,255,255,0.86)' }}>
                    <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.22em]" style={{ color: 'var(--portal-text-soft)' }}>
                      Move to folder
                    </label>
                    {canManageDocuments ? (
                      <div className="space-y-3">
                        <select
                          value={activeFolderMode}
                          onChange={(event) => setFolderForm({ docId: selectedDocument.id, mode: event.target.value, custom: activeFolderCustom })}
                          className="portal-input px-4 py-3 text-sm"
                        >
                          {folderSelectOptions.map((folder) => (
                            <option key={folder} value={folder}>{folder}</option>
                          ))}
                          <option value="__custom__">Create / use custom folder</option>
                        </select>
                        {activeFolderMode === '__custom__' && (
                          <input
                            type="text"
                            value={activeFolderCustom}
                            onChange={(event) => setFolderForm({ docId: selectedDocument.id, mode: '__custom__', custom: event.target.value })}
                            placeholder="Folder name"
                            className="portal-input px-4 py-3 text-sm"
                          />
                        )}
                        <button
                          type="button"
                          onClick={handleSaveFolderAssignment}
                          disabled={updateDocumentMutation.isPending}
                          className="portal-button-primary inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold"
                        >
                          {updateDocumentMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderOpen className="h-4 w-4" />}
                          Save folder
                        </button>
                      </div>
                    ) : (
                      <div className="portal-status-info rounded-2xl p-4 text-sm">
                        Folder changes are limited to `admin` users.
                      </div>
                    )}
                  </div>

                  {selectedDocument.description && (
                    <div className="rounded-[24px] border p-4 text-sm" style={{ borderColor: 'var(--portal-border)', background: 'rgba(255,255,255,0.86)', color: 'var(--portal-text-muted)' }}>
                      {selectedDocument.description}
                    </div>
                  )}

                  <Notice kind={fileNotice.type} message={fileNotice.message} />
                </>
              ) : (
                <div className="rounded-[24px] border p-4 text-sm" style={{ borderColor: 'var(--portal-border)', background: 'rgba(255,255,255,0.86)', color: 'var(--portal-text-muted)' }}>
                  Select a file to inspect its details and move it between folders.
                </div>
              )}

              <div className="rounded-[24px] border p-4 text-sm" style={{ borderColor: 'var(--portal-border)', background: 'rgba(255,255,255,0.86)' }}>
                <p className="font-semibold" style={{ color: 'var(--portal-text)' }}>Workspace access</p>
                <p className="mt-2" style={{ color: 'var(--portal-text-muted)' }}>
                  {profile?.clients?.business_name || 'Client'} · {claims.user_role || profile?.role || 'unknown'} · {claims.client_slug || profile?.clients?.slug || 'tenant'}
                </p>
              </div>
            </div>
          </section>

          <section className="portal-panel overflow-hidden rounded-[34px]">
            <div className="border-b px-5 py-5" style={{ borderColor: 'var(--portal-border)' }}>
              <h2 className="text-base font-semibold" style={{ color: 'var(--portal-text)' }}>Share links</h2>
            </div>

            <div className="space-y-5 p-5">
              {shareLinksError && <Notice kind="error" message={shareLinksError.message} />}

              {selectedDocument && canManageShares ? (
                <form onSubmit={handleCreateShare} className="grid grid-cols-1 gap-3">
                  <div>
                    <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.22em]" style={{ color: 'var(--portal-text-soft)' }}>
                      Expires at
                    </label>
                    <input
                      type="datetime-local"
                      value={shareDraft.expiresAt}
                      onChange={(event) => setShareDraft((current) => ({ ...current, expiresAt: event.target.value }))}
                      className="portal-input px-4 py-3 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.22em]" style={{ color: 'var(--portal-text-soft)' }}>
                      Max uses
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={shareDraft.maxUses}
                      onChange={(event) => setShareDraft((current) => ({ ...current, maxUses: event.target.value }))}
                      placeholder="Unlimited"
                      className="portal-input px-4 py-3 text-sm"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={createShareMutation.isPending}
                    className="portal-button-primary inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition-all disabled:opacity-60"
                  >
                    {createShareMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
                    Create link
                  </button>
                </form>
              ) : selectedDocument ? (
                <div className="portal-status-info rounded-2xl p-4 text-sm">
                  Share-link creation is limited to `admin` users. Your current app role is `{claims.user_role || profile?.role || 'unknown'}`.
                </div>
              ) : null}

              <Notice kind={shareNotice.type} message={shareNotice.message} />

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
                  <div className="portal-surface-strong rounded-[24px] p-4 text-sm" style={{ color: 'var(--portal-text-muted)' }}>
                    No share links yet for this document.
                  </div>
                )
              ) : (
                <div className="portal-surface-strong rounded-[24px] p-4 text-sm" style={{ color: 'var(--portal-text-muted)' }}>
                  Select a document to review or create share links.
                </div>
              )}
            </div>
          </section>
        </aside>
      </div>
    </div>
  )
}
