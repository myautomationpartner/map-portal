import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useOutletContext } from 'react-router-dom'
import {
  Archive,
  AlertCircle,
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
  Trash2,
  Upload,
  X,
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
const ALL_FILES_FOLDER = 'All Files'
const SHARED_FILES_FOLDER = 'Shared files'
const DESKTOP_PANE_BREAKPOINT = 1280
const MIN_FOLDER_PANE = 220
const MAX_FOLDER_PANE = 380
const MIN_PREVIEW_PANE = 320
const MAX_PREVIEW_PANE = 720

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

function isShareLinkActive(link) {
  if (!link || link.revoked_at) return false
  if (link.expires_at && new Date(link.expires_at).getTime() <= Date.now()) return false
  if (link.max_uses !== null && link.use_count >= link.max_uses) return false
  return true
}

async function copyTextToClipboard(value) {
  if (!value) throw new Error('Nothing to copy.')

  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value)
    return
  }

  const fallbackInput = window.document.createElement('textarea')
  fallbackInput.value = value
  fallbackInput.setAttribute('readonly', '')
  fallbackInput.style.position = 'absolute'
  fallbackInput.style.left = '-9999px'
  window.document.body.appendChild(fallbackInput)
  fallbackInput.select()

  try {
    const copied = window.document.execCommand('copy')
    if (!copied) throw new Error('Clipboard copy failed.')
  } finally {
    window.document.body.removeChild(fallbackInput)
  }
}

async function downloadSignedFile(signedUrl, fileName) {
  const response = await fetch(signedUrl)
  if (!response.ok) {
    throw new Error('Could not download this file right now.')
  }

  const blob = await response.blob()
  const objectUrl = window.URL.createObjectURL(blob)
  const anchor = window.document.createElement('a')
  anchor.href = objectUrl
  anchor.download = fileName || 'download'
  window.document.body.appendChild(anchor)
  anchor.click()
  window.document.body.removeChild(anchor)
  window.URL.revokeObjectURL(objectUrl)
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

function DocumentActionMenu({ document, isOpen, canManage, availableFolders, currentFolder, activeShareLink, onOpen, onMove, onRename, onShare, onCopyShare, onRevokeShare, onDownload, onDelete }) {
  const [showFolderChooser, setShowFolderChooser] = useState(false)
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0, direction: 'down' })
  const buttonRef = useRef(null)
  const menuRef = useRef(null)

  useEffect(() => {
    if (!isOpen) {
      setShowFolderChooser(false)
      return undefined
    }

    function updateMenuPosition() {
      const buttonRect = buttonRef.current?.getBoundingClientRect()
      const menuRect = menuRef.current?.getBoundingClientRect()
      if (!buttonRect) return

      const estimatedMenuWidth = menuRect?.width || 220
      const estimatedMenuHeight = menuRect?.height || (showFolderChooser ? 320 : 360)
      const horizontalPadding = 12
      const verticalGap = 8
      const spaceBelow = window.innerHeight - buttonRect.bottom
      const spaceAbove = buttonRect.top
      const direction = spaceBelow < estimatedMenuHeight + 20 && spaceAbove > spaceBelow ? 'up' : 'down'
      const unclampedLeft = buttonRect.right - estimatedMenuWidth
      const left = Math.min(
        Math.max(horizontalPadding, unclampedLeft),
        window.innerWidth - estimatedMenuWidth - horizontalPadding,
      )
      const top = direction === 'up'
        ? Math.max(horizontalPadding, buttonRect.top - estimatedMenuHeight - verticalGap)
        : Math.min(window.innerHeight - estimatedMenuHeight - horizontalPadding, buttonRect.bottom + verticalGap)

      setMenuPosition({ top, left, direction })
    }

    const frameId = window.requestAnimationFrame(updateMenuPosition)
    window.addEventListener('resize', updateMenuPosition)
    window.addEventListener('scroll', updateMenuPosition, true)

    return () => {
      window.cancelAnimationFrame(frameId)
      window.removeEventListener('resize', updateMenuPosition)
      window.removeEventListener('scroll', updateMenuPosition, true)
    }
  }, [isOpen, showFolderChooser])

  return (
    <div className="relative" data-document-action-menu="true">
      <button
        ref={buttonRef}
        type="button"
        aria-label={`Open actions for ${document.file_name}`}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation()
          setShowFolderChooser(false)
          onOpen()
        }}
        className="inline-flex h-9 w-9 items-center justify-center rounded-full border transition-all"
        style={{ borderColor: 'var(--portal-border)', background: 'rgba(255,255,255,0.92)', color: 'var(--portal-text-muted)' }}
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>

      {isOpen ? createPortal(
        <div
          ref={menuRef}
          className="fixed z-[120] min-w-[180px] rounded-[20px] border p-2 shadow-lg"
          style={{
            top: `${menuPosition.top}px`,
            left: `${menuPosition.left}px`,
            borderColor: 'var(--portal-border)',
            background: 'rgba(255,255,255,0.98)',
            boxShadow: '0 18px 40px rgba(26, 24, 20, 0.12)',
          }}
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
                    onShare(document)
                  }}
                  className="flex w-full items-center gap-2 rounded-2xl px-3 py-2.5 text-left text-sm font-medium transition-all"
                  style={{ color: 'var(--portal-text)' }}
                >
                  <Share2 className="h-4 w-4" />
                  Share file
                </button>
                {activeShareLink ? (
                  <>
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
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation()
                        onRevokeShare(document)
                      }}
                      className="flex w-full items-center gap-2 rounded-2xl px-3 py-2.5 text-left text-sm font-medium transition-all"
                      style={{ color: 'var(--portal-danger)', background: 'rgba(223, 95, 143, 0.06)' }}
                    >
                      <Archive className="h-4 w-4" />
                      Revoke share
                    </button>
                  </>
                ) : null}
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
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    onDownload(document)
                  }}
                  className="flex w-full items-center gap-2 rounded-2xl px-3 py-2.5 text-left text-sm font-medium transition-all"
                  style={{ color: 'var(--portal-text)' }}
                >
                  <ExternalLink className="h-4 w-4" />
                  Download
                </button>
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
        </div>,
        window.document.body,
      ) : null}
    </div>
  )
}

function ShareDialog({
  document,
  draft,
  activeShareLink,
  shareNotice,
  onChange,
  onClose,
  onSubmit,
  onCopy,
  onRevoke,
  isSubmitting,
  isRevoking,
}) {
  if (!document) return null

  const activeShareUrl = activeShareLink ? buildShareUrl(activeShareLink.token) : ''

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(26,24,20,0.34)] p-4">
      <div className="w-full max-w-lg rounded-[32px] border bg-white shadow-2xl" style={{ borderColor: 'var(--portal-border)' }}>
        <div className="flex items-center justify-between border-b px-6 py-5" style={{ borderColor: 'var(--portal-border)' }}>
          <div>
            <h3 className="text-lg font-semibold" style={{ color: 'var(--portal-text)' }}>Share file</h3>
            <p className="mt-1 text-sm" style={{ color: 'var(--portal-text-muted)' }}>{document.file_name}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border"
            style={{ borderColor: 'var(--portal-border)', color: 'var(--portal-text-muted)' }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-4 px-6 py-6">
          {activeShareLink ? (
            <div className="space-y-3 rounded-[24px] border p-4" style={{ borderColor: 'var(--portal-border)', background: 'rgba(247, 244, 236, 0.72)' }}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--portal-text)' }}>Share link ready</p>
                  <p className="mt-1 text-xs" style={{ color: 'var(--portal-text-muted)' }}>
                    Copy the URL below and send it however you like.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onRevoke}
                  disabled={isRevoking}
                  className="inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-xs font-semibold transition-all disabled:opacity-60"
                  style={{ color: 'var(--portal-danger)', background: 'rgba(223, 95, 143, 0.08)' }}
                >
                  <Archive className="h-3.5 w-3.5" />
                  Revoke
                </button>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  type="text"
                  readOnly
                  value={activeShareUrl}
                  onFocus={(event) => event.target.select()}
                  className="portal-input min-w-0 flex-1 px-4 py-3 text-sm"
                />
                <button
                  type="button"
                  onClick={onCopy}
                  className="portal-button-primary inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold"
                >
                  <Copy className="h-4 w-4" />
                  Copy
                </button>
              </div>

              <div className="flex flex-wrap gap-3 text-xs" style={{ color: 'var(--portal-text-muted)' }}>
                <span>Created {formatDate(activeShareLink.created_at)}</span>
                <span>Expires {activeShareLink.expires_at ? formatDate(activeShareLink.expires_at) : 'Never'}</span>
                <span>Uses {activeShareLink.max_uses !== null ? `${activeShareLink.use_count}/${activeShareLink.max_uses}` : `${activeShareLink.use_count} / Unlimited`}</span>
              </div>
            </div>
          ) : null}

          {shareNotice?.message ? <Notice kind={shareNotice.type} message={shareNotice.message} /> : null}

          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.22em]" style={{ color: 'var(--portal-text-soft)' }}>
              {activeShareLink ? 'Create a replacement link that expires at' : 'Expires at'}
            </label>
            <input
              type="datetime-local"
              value={draft.expiresAt}
              onChange={(event) => onChange((current) => ({ ...current, expiresAt: event.target.value }))}
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
              value={draft.maxUses}
              onChange={(event) => onChange((current) => ({ ...current, maxUses: event.target.value }))}
              placeholder="Unlimited"
              className="portal-input px-4 py-3 text-sm"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="portal-button-secondary rounded-2xl px-4 py-3 text-sm font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="portal-button-primary inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold disabled:opacity-60"
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
              {activeShareLink ? 'Create new link' : 'Create link'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function UploadDialog({ isOpen, draft, folders, onChange, onClose, onSubmit, isSubmitting }) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(26,24,20,0.34)] p-4">
      <div className="w-full max-w-lg rounded-[32px] border bg-white shadow-2xl" style={{ borderColor: 'var(--portal-border)' }}>
        <div className="flex items-center justify-between border-b px-6 py-5" style={{ borderColor: 'var(--portal-border)' }}>
          <div>
            <h3 className="text-lg font-semibold" style={{ color: 'var(--portal-text)' }}>File Upload</h3>
            <p className="mt-1 text-sm" style={{ color: 'var(--portal-text-muted)' }}>Choose a folder and upload a file.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border"
            style={{ borderColor: 'var(--portal-border)', color: 'var(--portal-text-muted)' }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-6 py-6">
          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.22em]" style={{ color: 'var(--portal-text-soft)' }}>
              Folder
            </label>
            <select
              value={draft.category}
              onChange={(event) => onChange((current) => ({ ...current, category: event.target.value }))}
              className="portal-input px-4 py-3 text-sm"
            >
              <option value="">Choose folder</option>
              {folders.map((folder) => (
                <option key={folder} value={folder}>{folder}</option>
              ))}
            </select>
          </div>

          <input
            type="text"
            value={draft.description}
            onChange={(event) => onChange((current) => ({ ...current, description: event.target.value }))}
            placeholder="Optional internal note"
            className="portal-input px-4 py-3 text-sm"
          />

          <label
            className="flex cursor-pointer items-center gap-3 rounded-[24px] border border-dashed px-4 py-4 transition-all"
            style={{ borderColor: 'rgba(201, 168, 76, 0.28)', background: 'linear-gradient(145deg, rgba(201, 168, 76, 0.08), rgba(232, 213, 160, 0.06))' }}
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[16px] bg-white shadow-sm">
              <Upload className="h-5 w-5" style={{ color: 'var(--portal-primary)' }} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold" style={{ color: 'var(--portal-text)' }}>Choose document</p>
              <p className="mt-1 text-xs" style={{ color: 'var(--portal-text-muted)' }}>
                Upload into the selected folder.
              </p>
            </div>
            <input
              type="file"
              className="hidden"
              onChange={onSubmit}
              disabled={isSubmitting || !draft.category}
            />
          </label>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="portal-button-secondary rounded-2xl px-4 py-3 text-sm font-semibold"
            >
              Close
            </button>
          </div>
        </div>
      </div>
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
  const layoutRef = useRef(null)

  const [selectedId, setSelectedId] = useState(null)
  const [uploadedFallbackDocuments, setUploadedFallbackDocuments] = useState([])
  const [previewState, setPreviewState] = useState({ loading: false, error: '', url: '' })
  const [uploadForm, setUploadForm] = useState({ category: '', description: '' })
  const [shareDraft, setShareDraft] = useState({ expiresAt: '', maxUses: '' })
  const [shareNotice, setShareNotice] = useState({ type: '', message: '' })
  const [folderNotice, setFolderNotice] = useState({ type: '', message: '' })
  const [fileNotice, setFileNotice] = useState({ type: '', message: '' })
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedFolder, setSelectedFolder] = useState(ALL_FILES_FOLDER)
  const [libraryView, setLibraryView] = useState('list')
  const [folderDraft, setFolderDraft] = useState('')
  const [localFolders, setLocalFolders] = useState(loadLocalFolders)
  const [openActionMenuId, setOpenActionMenuId] = useState(null)
  const [shareDialogDocument, setShareDialogDocument] = useState(null)
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false)
  const [isDesktopLayout, setIsDesktopLayout] = useState(() => window.innerWidth >= DESKTOP_PANE_BREAKPOINT)
  const [paneSizes, setPaneSizes] = useState({ folders: 260, preview: 400 })
  const [activePaneResize, setActivePaneResize] = useState(null)

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
    return [
      SHARED_FILES_FOLDER,
      ALL_FILES_FOLDER,
      ...Array.from(new Set([...documentFolders, ...localFolders])).sort((a, b) => a.localeCompare(b)),
    ]
  }, [visibleDocuments, localFolders])

  const sharedFileEntries = useMemo(() => {
    const latestLinksByDocument = new Map()

    shareLinks
      .filter(isShareLinkActive)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .forEach((link) => {
        if (!latestLinksByDocument.has(link.document_id)) {
          latestLinksByDocument.set(link.document_id, link)
        }
      })

    return Array.from(latestLinksByDocument.entries())
      .map(([documentId, link]) => ({
        document: visibleDocuments.find((document) => document.id === documentId),
        link,
      }))
      .filter((entry) => entry.document)
  }, [shareLinks, visibleDocuments])

  const sharedDocuments = useMemo(
    () => sharedFileEntries.map((entry) => entry.document),
    [sharedFileEntries],
  )

  const activeShareByDocumentId = useMemo(
    () => new Map(sharedFileEntries.map((entry) => [entry.document.id, entry.link])),
    [sharedFileEntries],
  )

  const filteredDocuments = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase()
    const sourceDocuments = selectedFolder === SHARED_FILES_FOLDER
      ? sharedDocuments
      : visibleDocuments.filter((document) => selectedFolder === ALL_FILES_FOLDER || documentFolder(document) === selectedFolder)

    return sourceDocuments.filter((document) => normalizedQuery.length === 0 || [
      document.file_name,
      document.mime_type,
      document.category,
      document.description,
    ].some((value) => value?.toLowerCase().includes(normalizedQuery)))
  }, [searchQuery, selectedFolder, sharedDocuments, visibleDocuments])

  const selectedDocument = useMemo(
    () => filteredDocuments.find((document) => document.id === selectedId)
      || visibleDocuments.find((document) => document.id === selectedId)
      || filteredDocuments[0]
      || visibleDocuments[0]
      || null,
    [filteredDocuments, visibleDocuments, selectedId],
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
      const targetFolder = uploadForm.category
      const payload = await getUploadUrl({
        filename: file.name,
        mime_type: mimeType,
        size_bytes: file.size,
        category: targetFolder || null,
        description: uploadForm.description || null,
      })
      await uploadFileToSignedUrl(payload.upload_url, file, mimeType)
      return { ...payload, resolvedMimeType: mimeType, targetFolder }
    },
    onSuccess: async (payload, file) => {
      const optimisticDocument = {
        id: payload.document_id,
        file_name: file.name,
        mime_type: payload.expected_mime || payload.resolvedMimeType || file.type,
        category: payload.targetFolder || null,
        description: uploadForm.description || null,
        size_bytes: file.size,
        storage_path: payload.storage_path,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }

      setUploadedFallbackDocuments((current) => [optimisticDocument, ...current.filter((document) => document.id !== optimisticDocument.id)].slice(0, 10))
      queryClient.setQueryData(['documents'], (current = []) => [optimisticDocument, ...current.filter((document) => document.id !== optimisticDocument.id)])
      setSelectedId(payload.document_id)
      setFileNotice({ type: 'success', message: 'Upload complete. Document list refreshed.' })

      if (payload.targetFolder?.trim()) {
        setLocalFolders((current) => {
          if (current.includes(payload.targetFolder.trim())) return current
          const next = [...current, payload.targetFolder.trim()].sort((a, b) => a.localeCompare(b))
          saveLocalFolders(next)
          return next
        })
      }

      setUploadForm({ category: '', description: '' })
      setIsUploadDialogOpen(false)
      await queryClient.invalidateQueries({ queryKey: ['documents'] })
      previewMutation.mutate(payload.document_id)
    },
    onError: (error) => {
      setFileNotice({ type: 'error', message: error.message })
    },
  })

  const createShareMutation = useMutation({
    mutationFn: createShareLink,
    onSuccess: async (link) => {
      const shareUrl = buildShareUrl(link.token)
      setShareNotice({ type: 'success', message: 'Share link ready to copy.' })
      setShareDraft({ expiresAt: '', maxUses: '' })
      await copyTextToClipboard(shareUrl).catch(() => {})
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

    if (!uploadForm.category) {
      event.target.value = ''
      return
    }

    const mimeType = resolveUploadMimeType(file)

    if (!mimeType) {
      return
    }

    if (file.size > MAX_DOCUMENT_BYTES) {
      return
    }

    uploadMutation.mutate(file)
    event.target.value = ''
  }

  function handleCreateShare(event) {
    event.preventDefault()
    if (!shareDialogDocument || !canManageShares) return

    setShareNotice({ type: '', message: '' })
    createShareMutation.mutate({
      documentId: shareDialogDocument.id,
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
    setShareDraft({ expiresAt: '', maxUses: '' })
    setShareDialogDocument(document)
  }

  async function handleCopyShareForDocument(document) {
    const activeShareLink = activeShareByDocumentId.get(document.id)
    if (!activeShareLink) {
      setShareNotice({ type: 'info', message: 'This file does not have an active share link yet.' })
      return
    }

    await handleCopySharedFileLink(activeShareLink)
  }

  function handleRevokeShareForDocument(document) {
    const activeShareLink = activeShareByDocumentId.get(document.id)
    if (!activeShareLink) return

    revokeShareMutation.mutate(activeShareLink.id)
  }

  async function handleCopySharedFileLink(link) {
    const shareUrl = buildShareUrl(link.token)
    try {
      await copyTextToClipboard(shareUrl)
      setShareNotice({ type: 'success', message: 'Share link copied to clipboard.' })
    } catch {
      setShareNotice({ type: 'error', message: 'Could not copy the share link to the clipboard.' })
    }
  }

  function handleDownloadDocument(document) {
    setOpenActionMenuId(null)
    setSelectedId(document.id)
    previewMutation.mutate(document.id, {
      onSuccess: async (payload) => {
        try {
          await downloadSignedFile(payload.signed_url, document.file_name)
          setFileNotice({ type: 'success', message: `Downloading "${document.file_name}".` })
        } catch (error) {
          setFileNotice({ type: 'error', message: error.message || 'Could not start the download.' })
        }
      },
    })
  }

  const folderCounts = useMemo(() => {
    const counts = {
      [ALL_FILES_FOLDER]: visibleDocuments.length,
      [SHARED_FILES_FOLDER]: sharedDocuments.length,
    }
    for (const folder of folders) {
      if (folder === ALL_FILES_FOLDER || folder === SHARED_FILES_FOLDER) continue
      counts[folder] = visibleDocuments.filter((document) => documentFolder(document) === folder).length
    }
    return counts
  }, [folders, sharedDocuments.length, visibleDocuments])

  const folderSelectOptions = folders.filter((folder) => folder !== ALL_FILES_FOLDER && folder !== SHARED_FILES_FOLDER)
  const isSpecialFolderView = selectedFolder === ALL_FILES_FOLDER || selectedFolder === SHARED_FILES_FOLDER

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

  useEffect(() => {
    function handleResize() {
      setIsDesktopLayout(window.innerWidth >= DESKTOP_PANE_BREAKPOINT)
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    if (!activePaneResize) return undefined

    function handlePointerMove(event) {
      const layoutBounds = layoutRef.current?.getBoundingClientRect()
      if (!layoutBounds) return

      if (activePaneResize === 'folders') {
        const nextFoldersWidth = Math.min(
          MAX_FOLDER_PANE,
          Math.max(MIN_FOLDER_PANE, event.clientX - layoutBounds.left),
        )
        setPaneSizes((current) => ({ ...current, folders: nextFoldersWidth }))
        return
      }

      const nextPreviewWidth = Math.min(
        MAX_PREVIEW_PANE,
        Math.max(MIN_PREVIEW_PANE, layoutBounds.right - event.clientX),
      )
      setPaneSizes((current) => ({ ...current, preview: nextPreviewWidth }))
    }

    function handlePointerUp() {
      setActivePaneResize(null)
    }

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)

    return () => {
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [activePaneResize])

  return (
    <div className="portal-page mx-auto max-w-[1640px] space-y-5 md:p-6 xl:p-8">
      <ShareDialog
        document={shareDialogDocument}
        draft={shareDraft}
        activeShareLink={shareDialogDocument ? activeShareByDocumentId.get(shareDialogDocument.id) ?? null : null}
        shareNotice={shareNotice}
        onChange={setShareDraft}
        onClose={() => setShareDialogDocument(null)}
        onSubmit={handleCreateShare}
        onCopy={() => {
          const activeShareLink = shareDialogDocument ? activeShareByDocumentId.get(shareDialogDocument.id) : null
          if (!activeShareLink) return
          handleCopySharedFileLink(activeShareLink)
        }}
        onRevoke={() => {
          if (!shareDialogDocument) return
          handleRevokeShareForDocument(shareDialogDocument)
        }}
        isSubmitting={createShareMutation.isPending}
        isRevoking={revokeShareMutation.isPending}
      />
      <UploadDialog
        isOpen={isUploadDialogOpen}
        draft={uploadForm}
        folders={folderSelectOptions}
        onChange={setUploadForm}
        onClose={() => setIsUploadDialogOpen(false)}
        onSubmit={handleFileChange}
        isSubmitting={uploadMutation.isPending}
      />

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
            onClick={() => {
              setUploadForm((current) => ({
                ...current,
                category: !isSpecialFolderView ? selectedFolder : current.category,
              }))
              setIsUploadDialogOpen(true)
            }}
            className="portal-button-primary inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold"
          >
            <Upload className="h-4 w-4" />
            File Upload
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

      <div
        ref={layoutRef}
        className="space-y-6 xl:grid xl:items-start xl:gap-0"
        style={isDesktopLayout
          ? { gridTemplateColumns: `${paneSizes.folders}px 14px minmax(0,1fr) 14px ${paneSizes.preview}px` }
          : undefined}
      >
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
                      ? folder === SHARED_FILES_FOLDER
                        ? { background: 'linear-gradient(135deg, rgba(31,169,113,0.18), rgba(201, 240, 223, 0.14))', border: '1px solid rgba(31,169,113,0.24)' }
                        : { background: 'linear-gradient(135deg, rgba(201,168,76,0.16), rgba(232,213,160,0.08))', border: '1px solid rgba(201,168,76,0.24)' }
                      : folder === SHARED_FILES_FOLDER
                        ? { background: 'rgba(217, 244, 229, 0.58)', border: '1px solid rgba(31,169,113,0.18)' }
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
        </aside>

        {isDesktopLayout ? (
          <div className="flex items-stretch justify-center px-1">
            <button
              type="button"
              aria-label="Resize folders panel"
              onPointerDown={() => setActivePaneResize('folders')}
              className="group flex w-full cursor-col-resize items-center justify-center"
            >
              <span
                className="h-full min-h-[640px] w-[2px] rounded-full transition-all"
                style={{
                  background: activePaneResize === 'folders' ? 'rgba(201, 168, 76, 0.65)' : 'rgba(201, 168, 76, 0.22)',
                  boxShadow: activePaneResize === 'folders' ? '0 0 0 3px rgba(201, 168, 76, 0.14)' : 'none',
                }}
              />
            </button>
          </div>
        ) : null}

        <section className="portal-panel overflow-visible rounded-[34px]">
          <div className="border-b px-5 py-5 md:px-6" style={{ borderColor: 'var(--portal-border)' }}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold" style={{ color: 'var(--portal-text)' }}>{selectedFolder}</h2>
                <p className="mt-1 text-sm" style={{ color: 'var(--portal-text-muted)' }}>
                  {selectedFolder === ALL_FILES_FOLDER
                    ? 'Tenant-scoped files from the secure library.'
                    : selectedFolder === SHARED_FILES_FOLDER
                      ? 'Files that currently have active share links.'
                      : `Files inside the ${selectedFolder} folder.`}
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
                          key={`${document.id}-${openActionMenuId === document.id ? 'open' : 'closed'}-grid`}
                          document={document}
                          isOpen={openActionMenuId === document.id}
                          canManage={canManageDocuments}
                          availableFolders={folderSelectOptions}
                          currentFolder={documentFolder(document)}
                          activeShareLink={activeShareByDocumentId.get(document.id)}
                          onOpen={() => setOpenActionMenuId((current) => (current === document.id ? null : document.id))}
                          onMove={handleMoveDocument}
                          onRename={handleRenameDocument}
                          onShare={handleCreateShareForDocument}
                          onCopyShare={handleCopyShareForDocument}
                          onRevokeShare={handleRevokeShareForDocument}
                          onDownload={handleDownloadDocument}
                          onDelete={handleDeleteDocument}
                        />
                      </div>
                      <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-[10px]" style={{ background: 'rgba(245, 240, 235, 0.96)' }}>
                        <DocumentIcon mimeType={document.mime_type} className="h-4 w-4" style={{ color: 'var(--portal-primary)' }} />
                      </div>
                      <div className="flex items-center gap-2">
                        <p className="truncate text-[13px] font-semibold" style={{ color: 'var(--portal-text)' }}>{document.file_name}</p>
                        {activeShareByDocumentId.get(document.id) ? (
                          <Share2 className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--portal-success)' }} />
                        ) : null}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="portal-scroll overflow-auto">
                <table className="w-full border-separate border-spacing-0">
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
                          <td className="border-t px-4 py-2.5" style={{ borderColor: 'var(--portal-border)' }}>
                            <div className="flex min-w-0 items-center gap-3">
                              <div className="shrink-0">
                                <DocumentActionMenu
                                  key={`${document.id}-${openActionMenuId === document.id ? 'open' : 'closed'}-list`}
                                  document={document}
                                  isOpen={openActionMenuId === document.id}
                                  canManage={canManageDocuments}
                                  availableFolders={folderSelectOptions}
                                  currentFolder={documentFolder(document)}
                                  activeShareLink={activeShareByDocumentId.get(document.id)}
                                  onOpen={() => setOpenActionMenuId((current) => (current === document.id ? null : document.id))}
                                  onMove={handleMoveDocument}
                                  onRename={handleRenameDocument}
                                  onShare={handleCreateShareForDocument}
                                  onCopyShare={handleCopyShareForDocument}
                                  onRevokeShare={handleRevokeShareForDocument}
                                  onDownload={handleDownloadDocument}
                                  onDelete={handleDeleteDocument}
                                />
                              </div>
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px]" style={{ background: 'rgba(245, 240, 235, 0.96)' }}>
                                <DocumentIcon mimeType={document.mime_type} className="h-4 w-4" style={{ color: 'var(--portal-primary)' }} />
                              </div>
                              <div className="flex min-w-0 items-center gap-2">
                                <p className="truncate text-[12px] font-semibold leading-5" style={{ color: 'var(--portal-text)' }}>{document.file_name}</p>
                                {activeShareByDocumentId.get(document.id) ? (
                                  <Share2 className="h-3 w-3 shrink-0" style={{ color: 'var(--portal-success)' }} />
                                ) : null}
                              </div>
                            </div>
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

        {isDesktopLayout ? (
          <div className="flex items-stretch justify-center px-1">
            <button
              type="button"
              aria-label="Resize preview panel"
              onPointerDown={() => setActivePaneResize('preview')}
              className="group flex w-full cursor-col-resize items-center justify-center"
            >
              <span
                className="h-full min-h-[640px] w-[2px] rounded-full transition-all"
                style={{
                  background: activePaneResize === 'preview' ? 'rgba(201, 168, 76, 0.65)' : 'rgba(201, 168, 76, 0.22)',
                  boxShadow: activePaneResize === 'preview' ? '0 0 0 3px rgba(201, 168, 76, 0.14)' : 'none',
                }}
              />
            </button>
          </div>
        ) : null}

        <aside className="space-y-6">
          <DocumentPreview
            selectedDocument={selectedDocument}
            previewState={previewState}
            onRefreshPreview={() => selectedDocument && handlePreview(selectedDocument.id)}
          />

          <Notice kind={fileNotice.type} message={fileNotice.message} />
          {shareLinksError ? <Notice kind="error" message={shareLinksError.message} /> : null}
          <Notice kind={shareNotice.type} message={shareNotice.message} />
        </aside>
      </div>
    </div>
  )
}
