import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useOutletContext } from 'react-router-dom'
import {
  Archive,
  AlertCircle,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  Eye,
  FileCode2,
  FileImage,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  FolderPlus,
  Grid2X2,
  History,
  Link2,
  List,
  Loader2,
  LockKeyhole,
  Mail,
  MoreHorizontal,
  Search,
  Share2,
  ShieldCheck,
  Upload,
  Users,
  X,
} from 'lucide-react'
import PdfDocumentViewer from '../components/PdfDocumentViewer'
import TextDocumentViewer from '../components/TextDocumentViewer'
import {
  createSecureVaultFolder,
  createSecureVaultRoom,
  createSecureVaultShareLink,
  fetchSecureVaultAudit,
  fetchSecureVaultDocuments,
  fetchSecureVaultFolders,
  fetchSecureVaultRooms,
  fetchSecureVaultShareLinks,
  getSecureVaultDocumentUrl,
  getSecureVaultUploadUrl,
  revokeSecureVaultShareLink,
  revokeSecureVaultRoom,
  updateSecureVaultDocument,
  uploadSecureVaultFileToSignedUrl,
} from '../lib/portalApi'
import {
  SECURE_VAULT_QUOTA_BYTES,
  defaultRoomExpiryValue,
  formatVaultBytes,
  isRoomExpired,
  validateSecureVaultFile,
  vaultUsagePercent,
} from '../lib/secureVault'

const ALL_FILES_FOLDER = 'All Files'
const SHARED_ROOMS_FOLDER = 'In secure rooms'
const ARCHIVED_FOLDER = 'Archived'
const DEFAULT_UPLOAD_FOLDER = 'General'
const DOCUMENTS_FILE_COLUMN_STORAGE_KEY = 'mapDocumentsFileColumnWidth'
const DEFAULT_DOCUMENTS_FILE_COLUMN_WIDTH = 560
const MIN_DOCUMENTS_FILE_COLUMN_WIDTH = 380
const MAX_DOCUMENTS_FILE_COLUMN_WIDTH = 900
const MIN_DOCUMENTS_PREVIEW_WIDTH = 440

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

function formatDate(value) {
  if (!value) return 'Not set'
  return new Date(value).toLocaleString()
}

function documentFolder(document) {
  return (document.secure_folders?.name || document.category || DEFAULT_UPLOAD_FOLDER).trim()
}

function buildFolderTree(folders) {
  const byId = new Map(folders.map((folder) => [folder.id, folder]))
  const childrenByParent = new Map()
  for (const folder of folders) {
    const parentKey = folder.parent_folder_id || 'root'
    const siblings = childrenByParent.get(parentKey) || []
    siblings.push(folder)
    childrenByParent.set(parentKey, siblings)
  }

  for (const siblings of childrenByParent.values()) {
    siblings.sort((a, b) => a.name.localeCompare(b.name))
  }

  const rows = []
  function visit(folder, depth, parentPath) {
    const path = parentPath ? `${parentPath} / ${folder.name}` : folder.name
    rows.push({ ...folder, depth, path })
    for (const child of childrenByParent.get(folder.id) || []) {
      visit(child, depth + 1, path)
    }
  }

  for (const root of childrenByParent.get('root') || []) {
    visit(root, 0, '')
  }

  return { rows, byId }
}

function folderPath(folderId, foldersById) {
  const parts = []
  let current = foldersById.get(folderId)
  const seen = new Set()
  while (current && !seen.has(current.id)) {
    seen.add(current.id)
    parts.unshift(current.name)
    current = current.parent_folder_id ? foldersById.get(current.parent_folder_id) : null
  }
  return parts.join(' / ')
}

function descendantFolderIds(folderId, folders) {
  const ids = new Set([folderId])
  let changed = true
  while (changed) {
    changed = false
    for (const folder of folders) {
      if (folder.parent_folder_id && ids.has(folder.parent_folder_id) && !ids.has(folder.id)) {
        ids.add(folder.id)
        changed = true
      }
    }
  }
  return ids
}

function DocumentFileIcon({ mimeType, className, style }) {
  if (mimeType?.startsWith('image/')) return <FileImage className={className} style={style} />
  if (TEXT_PREVIEW_MIME.has(mimeType)) return <FileCode2 className={className} style={style} />
  if (mimeType?.includes('sheet') || mimeType?.includes('excel')) return <FileSpreadsheet className={className} style={style} />
  return <FileText className={className} style={style} />
}

function actionLabel(action) {
  const labels = {
    room_open: 'Shared room opened',
    room_view: 'Shared room document viewed',
    room_download: 'Shared room document downloaded',
    room_created: 'Shared room created',
    room_invite_created: 'Shared room invite created',
    room_revoked: 'Shared room revoked',
    portal_view: 'Portal document viewed',
    portal_download: 'Portal document downloaded',
    upload_requested: 'Upload requested',
  }
  return labels[action] || String(action || '').replace(/_/g, ' ')
}

function auditRecipientLabel(event) {
  return event.secure_share_room_recipients?.email || event.metadata?.recipient_email || event.metadata?.email || '-'
}

function roomStatus(room) {
  if (room.revoked_at) return 'Revoked'
  if (isRoomExpired(room)) return 'Expired'
  return 'Active'
}

function getRoomDocumentCount(room) {
  return room.secure_share_room_documents?.length || 0
}

function getRoomRecipientEmails(room) {
  return (room.secure_share_room_recipients || []).map((recipient) => recipient.email).filter(Boolean)
}

async function copyText(value) {
  if (!value) return
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value)
    return
  }
  const textarea = window.document.createElement('textarea')
  textarea.value = value
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'absolute'
  textarea.style.left = '-9999px'
  window.document.body.appendChild(textarea)
  textarea.select()
  try {
    window.document.execCommand('copy')
  } finally {
    window.document.body.removeChild(textarea)
  }
}

async function downloadSignedFile(signedUrl, fileName) {
  const response = await fetch(signedUrl)
  if (!response.ok) throw new Error('Could not download this file right now.')
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

function Notice({ kind = 'info', message }) {
  if (!message) return null
  const className = kind === 'success' ? 'portal-status-success' : kind === 'info' ? 'portal-status-info' : 'portal-status-danger'
  const Icon = kind === 'success' ? CheckCircle2 : AlertCircle

  return (
    <div className={`${className} flex items-start gap-3 rounded-2xl p-4 text-sm`}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <p className="break-words">{message}</p>
    </div>
  )
}

function DocumentActionMenu({
  document,
  isOpen,
  canManage,
  availableFolders,
  currentFolder,
  onOpen,
  onClose,
  onMove,
  onRename,
  onRoom,
  onShareLink,
  onDownload,
  onArchive,
}) {
  const [showFolderChooser, setShowFolderChooser] = useState(false)
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 })
  const buttonRef = useRef(null)
  const menuRef = useRef(null)

  useEffect(() => {
    if (!isOpen) {
      const timeoutId = window.setTimeout(() => setShowFolderChooser(false), 0)
      return () => window.clearTimeout(timeoutId)
    }

    function updateMenuPosition() {
      const buttonRect = buttonRef.current?.getBoundingClientRect()
      const menuRect = menuRef.current?.getBoundingClientRect()
      if (!buttonRect) return

      const estimatedMenuWidth = menuRect?.width || 220
      const estimatedMenuHeight = menuRect?.height || (showFolderChooser ? 280 : 300)
      const edgePadding = 12
      const gap = 8
      const spaceBelow = window.innerHeight - buttonRect.bottom
      const spaceAbove = buttonRect.top
      const openUp = spaceBelow < estimatedMenuHeight + 20 && spaceAbove > spaceBelow
      const left = Math.min(
        Math.max(edgePadding, buttonRect.right - estimatedMenuWidth),
        window.innerWidth - estimatedMenuWidth - edgePadding,
      )
      const top = openUp
        ? Math.max(edgePadding, buttonRect.top - estimatedMenuHeight - gap)
        : Math.min(window.innerHeight - estimatedMenuHeight - edgePadding, buttonRect.bottom + gap)

      setMenuPosition({ top, left })
    }

    function handlePointerDown(event) {
      if (event.target instanceof Element && event.target.closest('[data-document-action-menu="true"]')) return
      onClose()
    }

    const frameId = window.requestAnimationFrame(updateMenuPosition)
    window.addEventListener('resize', updateMenuPosition)
    window.addEventListener('scroll', updateMenuPosition, true)
    window.document.addEventListener('pointerdown', handlePointerDown)

    return () => {
      window.cancelAnimationFrame(frameId)
      window.removeEventListener('resize', updateMenuPosition)
      window.removeEventListener('scroll', updateMenuPosition, true)
      window.document.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [isOpen, onClose, showFolderChooser])

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
          data-document-action-menu="true"
          className="fixed z-[120] min-w-[210px] rounded-[20px] border p-2 shadow-lg"
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
          {showFolderChooser ? (
            <div className="space-y-1">
              <button
                type="button"
                onClick={() => setShowFolderChooser(false)}
                className="flex w-full items-center gap-2 rounded-2xl px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-[0.18em] transition-all"
                style={{ color: 'var(--portal-text-soft)' }}
              >
                Back
              </button>
              {availableFolders.map((folder) => (
                <button
                  key={folder.id}
                  type="button"
                  onClick={() => onMove(document, folder)}
                  className="flex w-full items-center justify-between gap-3 rounded-2xl px-3 py-2.5 text-left text-sm font-medium transition-all"
                  style={folder.id === currentFolder
                    ? { background: 'rgba(201, 168, 76, 0.12)', color: 'var(--portal-primary)' }
                    : { color: 'var(--portal-text)' }}
                >
                  <span className="truncate" style={{ paddingLeft: `${folder.depth * 10}px` }}>{folder.path}</span>
                  {folder.id === currentFolder ? <span className="text-[11px] font-semibold">Current</span> : null}
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-1">
              {canManage ? (
                <>
                  <button
                    type="button"
                    onClick={() => setShowFolderChooser(true)}
                    className="flex w-full items-center gap-2 rounded-2xl px-3 py-2.5 text-left text-sm font-medium transition-all"
                    style={{ color: 'var(--portal-text)' }}
                  >
                    <FolderOpen className="h-4 w-4" />
                    Move to folder
                  </button>
                  <button
                    type="button"
                    onClick={() => onRoom(document)}
                    className="flex w-full items-center gap-2 rounded-2xl px-3 py-2.5 text-left text-sm font-medium transition-all"
                    style={{ color: 'var(--portal-text)' }}
                  >
                    <Link2 className="h-4 w-4" />
                    Create secure room
                  </button>
                  <button
                    type="button"
                    onClick={() => onShareLink(document)}
                    className="flex w-full items-center gap-2 rounded-2xl px-3 py-2.5 text-left text-sm font-medium transition-all"
                    style={{ color: 'var(--portal-text)' }}
                  >
                    <Share2 className="h-4 w-4" />
                    Share link
                  </button>
                  <button
                    type="button"
                    onClick={() => onRename(document)}
                    className="flex w-full items-center gap-2 rounded-2xl px-3 py-2.5 text-left text-sm font-medium transition-all"
                    style={{ color: 'var(--portal-text)' }}
                  >
                    <FileText className="h-4 w-4" />
                    Rename
                  </button>
                </>
              ) : null}
              <button
                type="button"
                onClick={() => onDownload(document)}
                className="flex w-full items-center gap-2 rounded-2xl px-3 py-2.5 text-left text-sm font-medium transition-all"
                style={{ color: 'var(--portal-text)' }}
              >
                <Download className="h-4 w-4" />
                Download
              </button>
              {canManage ? (
                <button
                  type="button"
                  onClick={() => onArchive(document)}
                  className="flex w-full items-center gap-2 rounded-2xl px-3 py-2.5 text-left text-sm font-medium transition-all"
                  style={{ color: 'var(--portal-danger)', background: 'rgba(223, 95, 143, 0.06)' }}
                >
                  <Archive className="h-4 w-4" />
                  {document.is_archived ? 'Restore' : 'Archive'}
                </button>
              ) : null}
            </div>
          )}
        </div>,
        window.document.body,
      ) : null}
    </div>
  )
}

function UploadDialog({ isOpen, draft, folders, onChange, onClose, onSubmit, isSubmitting }) {
  if (!isOpen) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(26,24,20,0.34)] p-4">
      <div className="document-upload-dialog w-full max-w-lg rounded-[32px] border bg-white shadow-2xl" style={{ borderColor: 'var(--portal-border)' }}>
        <div className="flex items-center justify-between border-b px-6 py-5" style={{ borderColor: 'var(--portal-border)' }}>
          <div>
            <h3 className="text-lg font-semibold" style={{ color: 'var(--portal-text)' }}>Upload document</h3>
            <p className="mt-1 text-sm" style={{ color: 'var(--portal-text-muted)' }}>Files are stored in the secure document library.</p>
          </div>
          <button type="button" onClick={onClose} className="inline-flex h-10 w-10 items-center justify-center rounded-full border" style={{ borderColor: 'var(--portal-border)', color: 'var(--portal-text-muted)' }}>
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-6 py-6">
          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.22em]" style={{ color: 'var(--portal-text-soft)' }}>Folder</label>
            <select
              value={draft.folderId || ''}
              onChange={(event) => {
                const folder = folders.find((item) => item.id === event.target.value)
                onChange((current) => ({ ...current, folderId: event.target.value, category: folder?.name || DEFAULT_UPLOAD_FOLDER }))
              }}
              className="portal-input px-4 py-3 text-sm"
            >
              <option value="">No folder</option>
              {folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.path}</option>)}
            </select>
          </div>

          <input
            type="text"
            value={draft.description}
            onChange={(event) => onChange((current) => ({ ...current, description: event.target.value }))}
            placeholder="Optional internal note"
            className="portal-input px-4 py-3 text-sm"
          />

          <label className="document-upload-dropzone flex cursor-pointer items-center gap-3 rounded-[24px] border border-dashed px-4 py-4 transition-all" style={{ borderColor: 'rgba(201, 168, 76, 0.28)', background: 'linear-gradient(145deg, rgba(201, 168, 76, 0.08), rgba(232, 213, 160, 0.06))' }}>
            <div className="document-upload-icon flex h-11 w-11 shrink-0 items-center justify-center rounded-[16px] bg-white shadow-sm">
              {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" style={{ color: 'var(--portal-primary)' }} /> : <Upload className="h-5 w-5" style={{ color: 'var(--portal-primary)' }} />}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold" style={{ color: 'var(--portal-text)' }}>Choose document</p>
              <p className="mt-1 text-xs" style={{ color: 'var(--portal-text-muted)' }}>
                25 MB max file size. Counts against the 100 MB document quota.
              </p>
            </div>
            <input type="file" className="hidden" onChange={onSubmit} disabled={isSubmitting} />
          </label>

          <div className="flex justify-end">
            <button type="button" onClick={onClose} className="portal-button-secondary rounded-2xl px-4 py-3 text-sm font-semibold">
              Close
            </button>
          </div>
        </div>
      </div>
    </div>,
    window.document.body,
  )
}

function ShareLinkDialog({
  document,
  activeShareLink,
  createdShareLink,
  draft,
  notice,
  onChange,
  onClose,
  onSubmit,
  onCopy,
  onRevoke,
  isSubmitting,
  isRevoking,
}) {
  if (!document) return null

  const shareUrl = createdShareLink?.share_url || activeShareLink?.share_url || ''
  const visibleLink = createdShareLink || activeShareLink

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(26,24,20,0.34)] p-4">
      <div className="w-full max-w-lg rounded-[32px] border bg-white shadow-2xl" style={{ borderColor: 'var(--portal-border)' }}>
        <div className="flex items-center justify-between border-b px-6 py-5" style={{ borderColor: 'var(--portal-border)' }}>
          <div className="min-w-0">
            <h3 className="text-lg font-semibold" style={{ color: 'var(--portal-text)' }}>Share link</h3>
            <p className="mt-1 truncate text-sm" style={{ color: 'var(--portal-text-muted)' }}>{document.file_name}</p>
          </div>
          <button type="button" onClick={onClose} className="inline-flex h-10 w-10 items-center justify-center rounded-full border" style={{ borderColor: 'var(--portal-border)', color: 'var(--portal-text-muted)' }}>
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-4 px-6 py-6">
          {visibleLink ? (
            <div className="space-y-3 rounded-[24px] border p-4" style={{ borderColor: 'var(--portal-border)', background: 'rgba(247, 244, 236, 0.72)' }}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--portal-text)' }}>Share link ready</p>
                  <p className="mt-1 text-xs" style={{ color: 'var(--portal-text-muted)' }}>Copy this link from the portal and send it manually.</p>
                </div>
                {activeShareLink ? (
                  <button type="button" onClick={onRevoke} disabled={isRevoking} className="inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-xs font-semibold transition-all disabled:opacity-60" style={{ color: 'var(--portal-danger)', background: 'rgba(223, 95, 143, 0.08)' }}>
                    <Archive className="h-3.5 w-3.5" />
                    Revoke
                  </button>
                ) : null}
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                {shareUrl ? (
                  <>
                    <input type="text" readOnly value={shareUrl} onFocus={(event) => event.target.select()} className="portal-input min-w-0 flex-1 px-4 py-3 text-sm" />
                    <button type="button" onClick={onCopy} className="portal-button-primary inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold">
                      <Copy className="h-4 w-4" />
                      Copy
                    </button>
                  </>
                ) : (
                  <p className="rounded-2xl border px-4 py-3 text-sm" style={{ borderColor: 'var(--portal-border)', color: 'var(--portal-text-muted)' }}>
                    An active link exists, but the original URL is only shown when it is first created. Create a replacement link to copy a fresh URL.
                  </p>
                )}
              </div>

              <div className="flex flex-wrap gap-3 text-xs" style={{ color: 'var(--portal-text-muted)' }}>
                <span>Created {formatDate(visibleLink.created_at)}</span>
                <span>Expires {visibleLink.expires_at ? formatDate(visibleLink.expires_at) : 'Never'}</span>
                <span>Uses {visibleLink.max_uses !== null ? `${visibleLink.use_count}/${visibleLink.max_uses}` : `${visibleLink.use_count || 0} / Unlimited`}</span>
              </div>
            </div>
          ) : null}

          {notice?.message ? <Notice kind={notice.type} message={notice.message} /> : null}

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
            <button type="button" onClick={onClose} className="portal-button-secondary rounded-2xl px-4 py-3 text-sm font-semibold">
              Cancel
            </button>
            <button type="submit" disabled={isSubmitting} className="portal-button-primary inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold disabled:opacity-60">
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
              {activeShareLink ? 'Create new link' : 'Create link'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    window.document.body,
  )
}

function SecureRoomDialog({
  isOpen,
  documents,
  selectedIds,
  draft,
  onChange,
  onClose,
  onSubmit,
  isSubmitting,
}) {
  if (!isOpen) return null

  const selectedDocuments = documents.filter((document) => selectedIds.includes(document.id))

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(26,24,20,0.34)] p-4">
      <div className="w-full max-w-2xl rounded-[32px] border bg-white shadow-2xl" style={{ borderColor: 'var(--portal-border)' }}>
        <div className="flex items-center justify-between border-b px-6 py-5" style={{ borderColor: 'var(--portal-border)' }}>
          <div>
            <h3 className="text-lg font-semibold" style={{ color: 'var(--portal-text)' }}>Create secure access room</h3>
            <p className="mt-1 text-sm" style={{ color: 'var(--portal-text-muted)' }}>
              Email recipients a secure link and a separate passcode.
            </p>
          </div>
          <button type="button" onClick={onClose} className="inline-flex h-10 w-10 items-center justify-center rounded-full border" style={{ borderColor: 'var(--portal-border)', color: 'var(--portal-text-muted)' }}>
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="grid gap-5 px-6 py-6 lg:grid-cols-[1fr_0.9fr]">
          <div className="space-y-4">
            <input
              className="portal-input px-4 py-3 text-sm"
              placeholder="Room name, e.g. Bank loan review"
              value={draft.name}
              onChange={(event) => onChange((current) => ({ ...current, name: event.target.value }))}
            />
            <textarea
              className="portal-input min-h-24 px-4 py-3 text-sm"
              placeholder="Recipient emails required, separated by commas or lines"
              value={draft.recipientEmails}
              onChange={(event) => onChange((current) => ({ ...current, recipientEmails: event.target.value }))}
            />
            <input
              className="portal-input px-4 py-3 text-sm"
              placeholder="Passcode required"
              value={draft.passcode}
              onChange={(event) => onChange((current) => ({ ...current, passcode: event.target.value }))}
            />
            <input
              className="portal-input px-4 py-3 text-sm"
              type="datetime-local"
              value={draft.expiresAt}
              onChange={(event) => onChange((current) => ({ ...current, expiresAt: event.target.value }))}
            />
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                className={`rounded-2xl px-3 py-2 text-sm font-semibold ${draft.accessMode === 'view_and_download' ? 'portal-button-primary' : 'portal-button-secondary'}`}
                onClick={() => onChange((current) => ({ ...current, accessMode: 'view_and_download' }))}
              >
                View + download
              </button>
              <button
                type="button"
                className={`rounded-2xl px-3 py-2 text-sm font-semibold ${draft.accessMode === 'view_only' ? 'portal-button-primary' : 'portal-button-secondary'}`}
                onClick={() => onChange((current) => ({ ...current, accessMode: 'view_only' }))}
              >
                View only
              </button>
            </div>
          </div>

          <div className="rounded-[24px] border p-4" style={{ borderColor: 'var(--portal-border)', background: 'rgba(247, 244, 236, 0.72)' }}>
            <p className="text-sm font-semibold" style={{ color: 'var(--portal-text)' }}>Included documents</p>
            <p className="mt-1 text-xs" style={{ color: 'var(--portal-text-muted)' }}>{selectedDocuments.length} selected</p>
            <div className="mt-4 max-h-72 space-y-2 overflow-auto pr-1">
              {selectedDocuments.map((document) => (
                <div key={document.id} className="rounded-2xl border bg-white px-3 py-2" style={{ borderColor: 'var(--portal-border)' }}>
                  <p className="truncate text-xs font-semibold" style={{ color: 'var(--portal-text)' }}>{document.file_name}</p>
                  <p className="text-[11px]" style={{ color: 'var(--portal-text-muted)' }}>{formatVaultBytes(document.size_bytes)}</p>
                </div>
              ))}
              {!selectedDocuments.length ? (
                <p className="text-sm" style={{ color: 'var(--portal-text-muted)' }}>Select one or more documents before creating a room.</p>
              ) : null}
            </div>
          </div>

          <div className="flex justify-end gap-3 lg:col-span-2">
            <button type="button" onClick={onClose} className="portal-button-secondary rounded-2xl px-4 py-3 text-sm font-semibold">
              Cancel
            </button>
            <button type="submit" disabled={isSubmitting || selectedDocuments.length === 0} className="portal-button-primary inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold disabled:opacity-60">
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
              Send secure access
            </button>
          </div>
        </form>
      </div>
    </div>,
    window.document.body,
  )
}

function DocumentPreview({ selectedDocument, previewState, onRefreshPreview, onDownload }) {
  if (!selectedDocument) {
    return (
      <div className="portal-panel flex min-h-[360px] flex-col items-center justify-center rounded-[28px] p-6 text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-[22px]" style={{ background: 'linear-gradient(135deg, rgba(201, 168, 76, 0.18), rgba(232, 213, 160, 0.12))' }}>
          <FileText className="h-8 w-8" style={{ color: 'var(--portal-primary)' }} />
        </div>
        <h3 className="font-display text-2xl font-semibold" style={{ color: 'var(--portal-text)' }}>Choose a document</h3>
        <p className="mt-3 max-w-md text-sm leading-relaxed" style={{ color: 'var(--portal-text-muted)' }}>
          Select a file to preview, download, or include in a secure access room.
        </p>
      </div>
    )
  }

  return (
    <div className="portal-panel space-y-4 rounded-[28px] p-4 md:p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[16px]" style={{ background: 'linear-gradient(135deg, rgba(201, 168, 76, 0.18), rgba(232, 213, 160, 0.12))' }}>
          <DocumentFileIcon mimeType={selectedDocument.mime_type} className="h-5 w-5" style={{ color: 'var(--portal-primary)' }} />
        </div>
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold" style={{ color: 'var(--portal-text)' }}>{selectedDocument.file_name}</h3>
          <p className="text-xs" style={{ color: 'var(--portal-text-muted)' }}>
            {documentFolder(selectedDocument)} - {formatVaultBytes(selectedDocument.size_bytes)} - {formatDate(selectedDocument.updated_at || selectedDocument.created_at)}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onRefreshPreview} className="portal-button-secondary inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-xs font-semibold">
          <Eye className="h-3.5 w-3.5" />
          Preview
        </button>
        <button type="button" onClick={onDownload} className="portal-button-primary inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-xs font-semibold">
          <Download className="h-3.5 w-3.5" />
          Download
        </button>
        {previewState.url ? (
          <a href={previewState.url} target="_blank" rel="noopener noreferrer" className="portal-button-secondary inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-xs font-semibold">
            <ExternalLink className="h-3.5 w-3.5" />
            Open
          </a>
        ) : null}
      </div>

      {previewState.loading ? (
        <div className="portal-surface-strong flex items-center justify-center gap-3 rounded-[26px] p-8">
          <Loader2 className="h-5 w-5 animate-spin" style={{ color: 'var(--portal-primary)' }} />
          <span className="text-sm" style={{ color: 'var(--portal-text-muted)' }}>Requesting signed document URL...</span>
        </div>
      ) : null}

      {previewState.error ? <Notice kind="error" message={previewState.error} /> : null}

      {previewState.url && !previewState.loading && !previewState.error ? (
        <div className="rounded-[24px] bg-[var(--portal-surface)]">
          {selectedDocument.mime_type === 'application/pdf' ? (
            <PdfDocumentViewer url={previewState.url} fileName={selectedDocument.file_name} />
          ) : TEXT_PREVIEW_MIME.has(selectedDocument.mime_type) ? (
            <TextDocumentViewer url={previewState.url} fileName={selectedDocument.file_name} mimeType={selectedDocument.mime_type === 'application/csv' ? 'text/csv' : selectedDocument.mime_type} />
          ) : NATIVE_IMAGE_PREVIEW_MIME.has(selectedDocument.mime_type) ? (
            <img src={previewState.url} alt={selectedDocument.file_name} className="max-h-[72vh] w-full rounded-[22px] border bg-white object-contain" style={{ borderColor: 'var(--portal-border)' }} />
          ) : (
            <div className="portal-surface-strong rounded-[26px] p-5">
              <p className="text-sm font-semibold" style={{ color: 'var(--portal-text)' }}>Preview not available inline</p>
              <p className="mt-1 text-xs" style={{ color: 'var(--portal-text-muted)' }}>Open or download the signed file to view it.</p>
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}

export default function Documents() {
  const queryClient = useQueryClient()
  const { profile, billingAccess, requireWriteAccess } = useOutletContext()
  const clientId = profile?.client_id
  const quotaBytes = Number(profile?.clients?.secure_vault_quota_bytes || SECURE_VAULT_QUOTA_BYTES)

  const [activeView, setActiveView] = useState('files')
  const [selectedId, setSelectedId] = useState(null)
  const [selectedDocumentIds, setSelectedDocumentIds] = useState([])
  const [previewState, setPreviewState] = useState({ loading: false, error: '', url: '' })
  const [notice, setNotice] = useState({ type: '', message: '' })
  const [uploadForm, setUploadForm] = useState({ folderId: '', category: DEFAULT_UPLOAD_FOLDER, description: '' })
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false)
  const [isRoomDialogOpen, setIsRoomDialogOpen] = useState(false)
  const [roomFolderIds, setRoomFolderIds] = useState([])
  const [shareDialogDocument, setShareDialogDocument] = useState(null)
  const [shareDraft, setShareDraft] = useState({ expiresAt: '', maxUses: '' })
  const [shareNotice, setShareNotice] = useState({ type: '', message: '' })
  const [createdShareLink, setCreatedShareLink] = useState(null)
  const [createdRoom, setCreatedRoom] = useState(null)
  const [roomForm, setRoomForm] = useState({
    name: '',
    recipientEmails: '',
    passcode: '',
    expiresAt: defaultRoomExpiryValue(),
    accessMode: 'view_and_download',
  })
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedFolder, setSelectedFolder] = useState(ALL_FILES_FOLDER)
  const [libraryView, setLibraryView] = useState('list')
  const [folderDraft, setFolderDraft] = useState('')
  const [openActionMenuId, setOpenActionMenuId] = useState(null)
  const [auditQuery, setAuditQuery] = useState('')
  const [auditSort, setAuditSort] = useState({ field: 'accessed_at', direction: 'desc' })
  const [fileColumnWidth, setFileColumnWidth] = useState(() => {
    if (typeof window === 'undefined') return DEFAULT_DOCUMENTS_FILE_COLUMN_WIDTH
    const storedWidth = Number(window.localStorage.getItem(DOCUMENTS_FILE_COLUMN_STORAGE_KEY))
    return Number.isFinite(storedWidth) && storedWidth >= MIN_DOCUMENTS_FILE_COLUMN_WIDTH
      ? Math.min(storedWidth, MAX_DOCUMENTS_FILE_COLUMN_WIDTH)
      : DEFAULT_DOCUMENTS_FILE_COLUMN_WIDTH
  })
  const [isFileColumnResizing, setIsFileColumnResizing] = useState(false)
  const documentsLayoutRef = useRef(null)

  const { data: documents = [], isLoading: documentsLoading, error: documentsError } = useQuery({
    queryKey: ['secure-vault-documents'],
    queryFn: fetchSecureVaultDocuments,
  })
  const { data: secureFolders = [], isLoading: foldersLoading, error: foldersError } = useQuery({
    queryKey: ['secure-vault-folders'],
    queryFn: fetchSecureVaultFolders,
  })
  const { data: rooms = [], isLoading: roomsLoading, error: roomsError } = useQuery({
    queryKey: ['secure-vault-rooms'],
    queryFn: fetchSecureVaultRooms,
  })
  const { data: shareLinks = [] } = useQuery({
    queryKey: ['secure-vault-share-links'],
    queryFn: fetchSecureVaultShareLinks,
  })
  const { data: audit = [], isLoading: auditLoading, error: auditError } = useQuery({
    queryKey: ['secure-vault-audit'],
    queryFn: fetchSecureVaultAudit,
  })

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(DOCUMENTS_FILE_COLUMN_STORAGE_KEY, String(fileColumnWidth))
    }
  }, [fileColumnWidth])

  useEffect(() => {
    if (!isFileColumnResizing) return undefined

    const handlePointerMove = (event) => {
      const layout = documentsLayoutRef.current
      if (!layout) return

      const rect = layout.getBoundingClientRect()
      const styles = window.getComputedStyle(layout)
      const columns = styles.gridTemplateColumns.split(' ').map((value) => Number.parseFloat(value)).filter(Number.isFinite)
      const folderWidth = columns[0] || 260
      const handleWidth = columns[2] || 14
      const columnGap = Number.parseFloat(styles.columnGap) || 0
      const availableWidth = rect.width - folderWidth - handleWidth - (columnGap * 3)
      const maxFileWidth = Math.min(MAX_DOCUMENTS_FILE_COLUMN_WIDTH, Math.max(MIN_DOCUMENTS_FILE_COLUMN_WIDTH, availableWidth - MIN_DOCUMENTS_PREVIEW_WIDTH))
      const pointerFileWidth = event.clientX - rect.left - folderWidth - columnGap
      const nextWidth = Math.min(Math.max(pointerFileWidth, MIN_DOCUMENTS_FILE_COLUMN_WIDTH), maxFileWidth)

      setFileColumnWidth(Math.round(nextWidth))
    }

    const stopResize = () => setIsFileColumnResizing(false)

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', stopResize)
    window.addEventListener('pointercancel', stopResize)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', stopResize)
      window.removeEventListener('pointercancel', stopResize)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [isFileColumnResizing])

  const usedBytes = useMemo(() => documents.reduce((sum, document) => sum + Number(document.size_bytes || 0), 0), [documents])
  const activeDocuments = useMemo(() => documents.filter((document) => !document.is_archived), [documents])
  const archivedDocuments = useMemo(() => documents.filter((document) => document.is_archived), [documents])
  const activeRooms = useMemo(() => rooms.filter((room) => !room.revoked_at && !isRoomExpired(room)), [rooms])
  const roomDocumentIds = useMemo(() => new Set(rooms.flatMap((room) => (room.secure_share_room_documents || []).map((entry) => entry.document_id))), [rooms])
  const usagePercent = vaultUsagePercent(usedBytes, quotaBytes)
  const folderTree = useMemo(() => buildFolderTree(secureFolders), [secureFolders])
  const folderRows = folderTree.rows
  const foldersById = folderTree.byId

  const folders = useMemo(() => [
    { id: SHARED_ROOMS_FOLDER, name: SHARED_ROOMS_FOLDER, path: SHARED_ROOMS_FOLDER, depth: 0, special: true },
    { id: ALL_FILES_FOLDER, name: ALL_FILES_FOLDER, path: ALL_FILES_FOLDER, depth: 0, special: true },
    ...folderRows,
    { id: ARCHIVED_FOLDER, name: ARCHIVED_FOLDER, path: ARCHIVED_FOLDER, depth: 0, special: true },
  ], [folderRows])

  const selectedFolderRecord = useMemo(() => folders.find((folder) => folder.id === selectedFolder) || folders[1], [folders, selectedFolder])

  const filteredDocuments = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase()
    const folderSource = selectedFolder === ARCHIVED_FOLDER
      ? archivedDocuments
      : selectedFolder === SHARED_ROOMS_FOLDER
        ? activeDocuments.filter((document) => roomDocumentIds.has(document.id))
        : activeDocuments.filter((document) => selectedFolder === ALL_FILES_FOLDER || document.folder_id === selectedFolder)

    return folderSource.filter((document) => normalizedQuery.length === 0 || [
      document.file_name,
      document.mime_type,
      document.category,
      documentFolder(document),
      folderPath(document.folder_id, foldersById),
      document.description,
    ].some((value) => value?.toLowerCase().includes(normalizedQuery)))
  }, [activeDocuments, archivedDocuments, foldersById, roomDocumentIds, searchQuery, selectedFolder])

  const selectedDocument = useMemo(
    () => filteredDocuments.find((document) => document.id === selectedId)
      || activeDocuments.find((document) => document.id === selectedId)
      || filteredDocuments[0]
      || activeDocuments[0]
      || null,
    [activeDocuments, filteredDocuments, selectedId],
  )

  const folderCounts = useMemo(() => {
    const counts = {
      [ALL_FILES_FOLDER]: activeDocuments.length,
      [SHARED_ROOMS_FOLDER]: activeDocuments.filter((document) => roomDocumentIds.has(document.id)).length,
      [ARCHIVED_FOLDER]: archivedDocuments.length,
    }
    for (const folder of folderRows) {
      counts[folder.id] = activeDocuments.filter((document) => document.folder_id === folder.id).length
    }
    return counts
  }, [activeDocuments, archivedDocuments.length, folderRows, roomDocumentIds])

  const folderOptions = folderRows

  const filteredAudit = useMemo(() => {
    const query = auditQuery.trim().toLowerCase()
    const rows = audit.filter((event) => {
      if (!query) return true
      return [
        event.action,
        event.secure_documents?.file_name,
        event.secure_share_rooms?.name,
        event.secure_share_room_recipients?.email,
        event.ip_address,
        event.user_agent,
      ].some((value) => String(value || '').toLowerCase().includes(query))
    })

    return [...rows].sort((a, b) => {
      const direction = auditSort.direction === 'asc' ? 1 : -1
      const aValue = auditSort.field === 'document'
        ? a.secure_documents?.file_name || ''
        : auditSort.field === 'room'
          ? a.secure_share_rooms?.name || ''
          : auditSort.field === 'recipient'
            ? a.secure_share_room_recipients?.email || ''
            : auditSort.field === 'action'
              ? a.action || ''
              : a.accessed_at || ''
      const bValue = auditSort.field === 'document'
        ? b.secure_documents?.file_name || ''
        : auditSort.field === 'room'
          ? b.secure_share_rooms?.name || ''
          : auditSort.field === 'recipient'
            ? b.secure_share_room_recipients?.email || ''
            : auditSort.field === 'action'
              ? b.action || ''
              : b.accessed_at || ''
      return String(aValue).localeCompare(String(bValue)) * direction
    })
  }, [audit, auditQuery, auditSort])

  const uploadMutation = useMutation({
    mutationFn: async ({ file, folderId, category, description }) => {
      if (!requireWriteAccess('upload documents')) return null
      const validation = validateSecureVaultFile(file, usedBytes, quotaBytes)
      if (!validation.valid) {
        if (validation.reason === 'file_too_large') throw new Error('Documents must be 25 MB or smaller.')
        if (validation.reason === 'quota_exceeded') throw new Error('This upload would exceed the 100 MB document quota.')
        throw new Error('This file type is not supported.')
      }

      const upload = await getSecureVaultUploadUrl({
        filename: file.name,
        mime_type: validation.mimeType,
        size_bytes: file.size,
        folder_id: folderId || null,
        category: category || DEFAULT_UPLOAD_FOLDER,
        description: description || null,
      })
      await uploadSecureVaultFileToSignedUrl(upload.upload_url, file, validation.mimeType)
      return upload
    },
    onSuccess: async (payload) => {
      if (!payload) return
      setNotice({ type: 'success', message: 'Document uploaded securely.' })
      setIsUploadDialogOpen(false)
      setUploadForm({ folderId: '', category: DEFAULT_UPLOAD_FOLDER, description: '' })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['secure-vault-documents'] }),
        queryClient.invalidateQueries({ queryKey: ['secure-vault-folders'] }),
        queryClient.invalidateQueries({ queryKey: ['secure-vault-audit'] }),
      ])
      setSelectedId(payload.document_id)
      previewMutation.mutate({ documentId: payload.document_id, action: 'view' })
    },
    onError: (error) => setNotice({ type: 'error', message: error.message }),
  })

  const previewMutation = useMutation({
    mutationFn: ({ documentId, action }) => getSecureVaultDocumentUrl(documentId, action),
    onMutate: (_variables) => {
      if (_variables.action === 'view') setPreviewState({ loading: true, error: '', url: '' })
    },
    onSuccess: async (payload, variables) => {
      if (variables.action === 'download') {
        const document = documents.find((item) => item.id === variables.documentId)
        await downloadSignedFile(payload.signed_url, document?.file_name)
        setNotice({ type: 'success', message: 'Download started.' })
      } else {
        setPreviewState({ loading: false, error: '', url: payload.signed_url })
      }
      queryClient.invalidateQueries({ queryKey: ['secure-vault-audit'] })
    },
    onError: (error, variables) => {
      if (variables?.action === 'view') setPreviewState({ loading: false, error: error.message, url: '' })
      setNotice({ type: 'error', message: error.message })
    },
  })

  const updateDocumentMutation = useMutation({
    mutationFn: ({ documentId, changes }) => updateSecureVaultDocument(documentId, changes),
    onSuccess: async (updatedDocument) => {
      setNotice({ type: 'success', message: updatedDocument.is_archived ? 'Document archived.' : 'Document saved.' })
      await queryClient.invalidateQueries({ queryKey: ['secure-vault-documents'] })
    },
    onError: (error) => setNotice({ type: 'error', message: error.message }),
  })

  const folderMutation = useMutation({
    mutationFn: createSecureVaultFolder,
    onSuccess: async (folder) => {
      setFolderDraft('')
      setSelectedFolder(folder.id)
      setNotice({ type: 'success', message: `Folder "${folder.name}" created.` })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['secure-vault-folders'] }),
        queryClient.invalidateQueries({ queryKey: ['secure-vault-audit'] }),
      ])
    },
    onError: (error) => setNotice({ type: 'error', message: error.message }),
  })

  const shareLinkMutation = useMutation({
    mutationFn: createSecureVaultShareLink,
    onSuccess: async (link) => {
      setCreatedShareLink(link)
      setShareNotice({ type: 'success', message: 'Share link created.' })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['secure-vault-share-links'] }),
        queryClient.invalidateQueries({ queryKey: ['secure-vault-audit'] }),
      ])
    },
    onError: (error) => setShareNotice({ type: 'error', message: error.message }),
  })

  const revokeShareLinkMutation = useMutation({
    mutationFn: revokeSecureVaultShareLink,
    onSuccess: async () => {
      setCreatedShareLink(null)
      setShareNotice({ type: 'success', message: 'Share link revoked.' })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['secure-vault-share-links'] }),
        queryClient.invalidateQueries({ queryKey: ['secure-vault-audit'] }),
      ])
    },
    onError: (error) => setShareNotice({ type: 'error', message: error.message }),
  })

  const roomMutation = useMutation({
    mutationFn: async () => {
      if (!requireWriteAccess('create secure access rooms')) return null
      const recipientEmails = roomForm.recipientEmails
        .split(/[\n,;]/)
        .map((email) => email.trim())
        .filter(Boolean)
      return createSecureVaultRoom({
        clientId,
        name: roomForm.name,
        documentIds: selectedDocumentIds,
        folderIds: roomFolderIds,
        recipientEmails,
        expiresAt: roomForm.expiresAt,
        accessMode: roomForm.accessMode,
        passcode: roomForm.passcode,
      })
    },
    onSuccess: async (room) => {
      if (!room) return
      setCreatedRoom(room)
      setIsRoomDialogOpen(false)
      setSelectedDocumentIds([])
      setRoomFolderIds([])
      setRoomForm({
        name: '',
        recipientEmails: '',
        passcode: '',
        expiresAt: defaultRoomExpiryValue(),
        accessMode: 'view_and_download',
      })
      setNotice({
        type: room.invite_delivery?.failed_count > 0 ? 'error' : 'success',
        message: room.invite_delivery?.failed_count > 0
          ? 'Room created, but one or more emails failed. Use the fallback link and passcode below.'
          : 'Secure access room created. The link and passcode were emailed separately.',
      })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['secure-vault-rooms'] }),
        queryClient.invalidateQueries({ queryKey: ['secure-vault-audit'] }),
      ])
    },
    onError: (error) => setNotice({ type: 'error', message: error.message }),
  })

  const revokeRoomMutation = useMutation({
    mutationFn: revokeSecureVaultRoom,
    onSuccess: async () => {
      setNotice({ type: 'success', message: 'Secure access room revoked.' })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['secure-vault-rooms'] }),
        queryClient.invalidateQueries({ queryKey: ['secure-vault-audit'] }),
      ])
    },
    onError: (error) => setNotice({ type: 'error', message: error.message }),
  })

  function toggleSelectedDocument(documentId) {
    setSelectedDocumentIds((current) =>
      current.includes(documentId) ? current.filter((id) => id !== documentId) : [...current, documentId])
  }

  function openUploadDialog() {
    if (!requireWriteAccess('upload documents')) return
    const activeFolder = folderRows.find((folder) => folder.id === selectedFolder)
    setUploadForm({ folderId: activeFolder?.id || '', category: activeFolder?.name || DEFAULT_UPLOAD_FOLDER, description: '' })
    setIsUploadDialogOpen(true)
  }

  function handleUploadFile(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    uploadMutation.mutate({
      file,
      folderId: uploadForm.folderId || null,
      category: uploadForm.category || DEFAULT_UPLOAD_FOLDER,
      description: uploadForm.description?.trim() || '',
    })
  }

  function handleCreateFolder(event) {
    event.preventDefault()
    if (!requireWriteAccess('create folders')) return
    const nextFolder = folderDraft.trim()
    if (!nextFolder) return
    const parentFolderId = folderRows.some((folder) => folder.id === selectedFolder) ? selectedFolder : null
    folderMutation.mutate({ clientId, name: nextFolder, parentFolderId })
  }

  function handleRenameDocument(document) {
    if (!requireWriteAccess('rename documents')) return
    setOpenActionMenuId(null)
    const nextName = window.prompt('Rename file', document.file_name)?.trim()
    if (!nextName || nextName === document.file_name) return
    updateDocumentMutation.mutate({ documentId: document.id, changes: { file_name: nextName } })
  }

  function handleMoveDocument(document, nextFolder) {
    if (!requireWriteAccess('move documents')) return
    setOpenActionMenuId(null)
    if (!nextFolder?.id || nextFolder.id === document.folder_id) return
    updateDocumentMutation.mutate({ documentId: document.id, changes: { folder_id: nextFolder.id, category: nextFolder.name } })
  }

  function handleArchiveDocument(document) {
    if (!requireWriteAccess(document.is_archived ? 'restore documents' : 'archive documents')) return
    setOpenActionMenuId(null)
    updateDocumentMutation.mutate({ documentId: document.id, changes: { is_archived: !document.is_archived } })
  }

  function openRoomDialogForDocuments(documentIds) {
    if (!requireWriteAccess('create secure access rooms')) return
    setOpenActionMenuId(null)
    setSelectedDocumentIds(Array.from(new Set(documentIds)))
    setRoomFolderIds([])
    setIsRoomDialogOpen(true)
  }

  function openRoomDialogForFolder(folderId) {
    if (!requireWriteAccess('create secure access rooms')) return
    const folderIds = descendantFolderIds(folderId, folderRows)
    const documentIds = activeDocuments
      .filter((document) => document.folder_id && folderIds.has(document.folder_id))
      .map((document) => document.id)
    if (!documentIds.length) {
      setNotice({ type: 'error', message: 'This folder does not have documents to share yet.' })
      return
    }
    setSelectedDocumentIds(Array.from(new Set(documentIds)))
    setRoomFolderIds([folderId])
    setIsRoomDialogOpen(true)
  }

  function openShareLinkDialog(document) {
    if (!requireWriteAccess('create share links')) return
    setOpenActionMenuId(null)
    setCreatedShareLink(null)
    setShareNotice({ type: '', message: '' })
    setShareDraft({ expiresAt: defaultRoomExpiryValue(), maxUses: '' })
    setShareDialogDocument(document)
  }

  function activeShareLinkForDocument(documentId) {
    return shareLinks.find((link) =>
      link.document_id === documentId &&
      !link.revoked_at &&
      (link.max_uses === null || Number(link.use_count || 0) < Number(link.max_uses)))
  }

  function setAuditSortField(field) {
    setAuditSort((current) => ({
      field,
      direction: current.field === field && current.direction === 'asc' ? 'desc' : 'asc',
    }))
  }

  return (
    <div className="portal-page w-full max-w-none space-y-5 md:p-5 xl:p-6">
      <UploadDialog
        isOpen={isUploadDialogOpen}
        draft={uploadForm}
        folders={folderOptions}
        onChange={setUploadForm}
        onClose={() => setIsUploadDialogOpen(false)}
        onSubmit={handleUploadFile}
        isSubmitting={uploadMutation.isPending}
      />

      <ShareLinkDialog
        document={shareDialogDocument}
        activeShareLink={shareDialogDocument ? activeShareLinkForDocument(shareDialogDocument.id) : null}
        createdShareLink={createdShareLink}
        draft={shareDraft}
        notice={shareNotice}
        onChange={setShareDraft}
        onClose={() => {
          setShareDialogDocument(null)
          setCreatedShareLink(null)
          setShareNotice({ type: '', message: '' })
        }}
        onSubmit={(event) => {
          event.preventDefault()
          if (!shareDialogDocument) return
          shareLinkMutation.mutate({
            clientId,
            documentId: shareDialogDocument.id,
            expiresAt: shareDraft.expiresAt,
            maxUses: shareDraft.maxUses,
          })
        }}
        onCopy={() => copyText(createdShareLink?.share_url)}
        onRevoke={() => {
          const activeLink = shareDialogDocument ? activeShareLinkForDocument(shareDialogDocument.id) : null
          if (activeLink) revokeShareLinkMutation.mutate(activeLink.id)
        }}
        isSubmitting={shareLinkMutation.isPending}
        isRevoking={revokeShareLinkMutation.isPending}
      />

      <SecureRoomDialog
        isOpen={isRoomDialogOpen}
        documents={activeDocuments}
        selectedIds={selectedDocumentIds}
        draft={roomForm}
        onChange={setRoomForm}
        onClose={() => setIsRoomDialogOpen(false)}
        onSubmit={(event) => {
          event.preventDefault()
          roomMutation.mutate()
        }}
        isSubmitting={roomMutation.isPending}
      />

      <section className="portal-command-bar rounded-[22px] px-3 py-2 md:px-4">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h1 className="font-display text-xl font-semibold leading-none" style={{ color: 'var(--portal-text)' }}>Documents</h1>
          <span className="portal-chip inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em]">
            <ShieldCheck className="h-3 w-3" />
            Secure sharing
          </span>
        </div>

        <div className="portal-command-bar-group">
          <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold" style={{ borderColor: 'var(--portal-border)', color: 'var(--portal-text)' }}>
            <span className="uppercase tracking-[0.14em]" style={{ color: 'var(--portal-text-soft)' }}>Storage</span>
            {usagePercent}%
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold" style={{ borderColor: 'var(--portal-border)', color: 'var(--portal-text)' }}>
            <FileText className="h-3 w-3" style={{ color: 'var(--portal-primary)' }} />
            {activeDocuments.length} files
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold" style={{ borderColor: 'var(--portal-border)', color: 'var(--portal-text)' }}>
            <Users className="h-3 w-3" style={{ color: 'var(--portal-primary)' }} />
            {activeRooms.length} rooms
          </span>
        </div>
      </section>

      <section className="portal-command-bar rounded-[30px]">
        <div className="portal-command-bar-group">
          <button type="button" onClick={openUploadDialog} disabled={billingAccess?.readOnly} className="portal-button-primary inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60">
            <Upload className="h-4 w-4" />
            Upload document
          </button>
          <button type="button" onClick={() => setIsRoomDialogOpen(true)} disabled={selectedDocumentIds.length === 0 || billingAccess?.readOnly} className="portal-button-secondary inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60">
            <Link2 className="h-4 w-4" />
            Create secure access room
          </button>
          <button type="button" onClick={() => setActiveView('rooms')} className="portal-button-secondary inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold">
            <Users className="h-4 w-4" />
            View rooms
          </button>
          <button type="button" onClick={() => setActiveView('log')} className="portal-button-secondary inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold">
            <History className="h-4 w-4" />
            Access log
          </button>
          {activeView !== 'files' ? (
            <button type="button" onClick={() => setActiveView('files')} className="portal-button-ghost rounded-2xl px-4 py-3 text-sm font-semibold">
              Back to files
            </button>
          ) : null}
        </div>

        <div className="portal-command-bar-group">
          <div className="relative min-w-[240px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'var(--portal-text-soft)' }} />
            <input
              type="text"
              value={activeView === 'log' ? auditQuery : searchQuery}
              onChange={(event) => activeView === 'log' ? setAuditQuery(event.target.value) : setSearchQuery(event.target.value)}
              placeholder={activeView === 'log' ? 'Search log by file, room, recipient, action' : 'Search by file name or note'}
              className="portal-input py-3 pl-10 pr-4 text-sm"
            />
          </div>
          {activeView === 'files' ? (
            <div className="portal-chip inline-flex items-center gap-1 rounded-full p-1">
              <button type="button" onClick={() => setLibraryView('list')} className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold transition-all" style={libraryView === 'list' ? { background: 'white', color: 'var(--portal-primary)' } : { color: 'var(--portal-text-soft)' }}>
                <List className="h-4 w-4" />
                <span>List</span>
              </button>
              <button type="button" onClick={() => setLibraryView('grid')} className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold transition-all" style={libraryView === 'grid' ? { background: 'white', color: 'var(--portal-primary)' } : { color: 'var(--portal-text-soft)' }}>
                <Grid2X2 className="h-4 w-4" />
                <span>Grid</span>
              </button>
            </div>
          ) : null}
        </div>
      </section>

      <Notice kind={notice.type} message={notice.message} />

      {createdRoom ? (
        <section className="rounded-[24px] border p-4" style={{ borderColor: 'var(--portal-border)', background: 'var(--portal-surface)' }}>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold" style={{ color: 'var(--portal-text)' }}>Secure access room ready</p>
              <label className="mt-3 block text-[11px] font-semibold uppercase tracking-[0.22em]" style={{ color: 'var(--portal-text-soft)' }}>
                Share link
              </label>
              {createdRoom.share_url ? (
                <input
                  className="portal-input mt-2 w-full rounded-2xl px-3 py-2 text-sm"
                  readOnly
                  value={createdRoom.share_url}
                  onFocus={(event) => event.target.select()}
                />
              ) : (
                <p className="mt-2 rounded-2xl border px-3 py-2 text-sm" style={{ borderColor: 'var(--portal-danger)', color: 'var(--portal-danger)' }}>
                  Share link was not returned. Recreate the room before sending access.
                </p>
              )}
              <p className="mt-2 text-sm" style={{ color: 'var(--portal-text-muted)' }}>Passcode: {createdRoom.passcode || 'Not returned'}</p>
              {createdRoom.invite_delivery ? (
                <p className="mt-1 text-sm" style={{ color: 'var(--portal-text-muted)' }}>
                  Email delivery: {createdRoom.invite_delivery.sent_count || 0} sent, {createdRoom.invite_delivery.failed_count || 0} failed.
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="portal-button-secondary inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60" disabled={!createdRoom.share_url} onClick={() => copyText(createdRoom.share_url)}>
                <Copy className="h-4 w-4" />
                Copy share link
              </button>
              <button type="button" className="portal-button-secondary inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60" disabled={!createdRoom.passcode} onClick={() => copyText(createdRoom.passcode)}>
                <LockKeyhole className="h-4 w-4" />
                Copy passcode
              </button>
              <button type="button" className="portal-button-ghost rounded-2xl px-3 py-2 text-sm font-semibold" onClick={() => setCreatedRoom(null)}>
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {activeView === 'rooms' ? (
        <section className="portal-panel overflow-hidden rounded-[34px]">
          <div className="border-b px-5 py-5" style={{ borderColor: 'var(--portal-border)' }}>
            <h2 className="text-base font-semibold" style={{ color: 'var(--portal-text)' }}>Secure access rooms</h2>
            <p className="mt-1 text-sm" style={{ color: 'var(--portal-text-muted)' }}>Review active, expired, and revoked external access.</p>
          </div>
          {roomsError ? <div className="p-5"><Notice kind="error" message={roomsError.message} /></div> : null}
          {roomsLoading ? (
            <div className="flex items-center gap-3 px-6 py-10" style={{ color: 'var(--portal-text-muted)' }}>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Loading rooms...</span>
            </div>
          ) : (
            <div className="divide-y" style={{ borderColor: 'var(--portal-border)' }}>
              {rooms.map((room) => {
                const status = roomStatus(room)
                return (
                  <div key={room.id} className="grid gap-4 px-5 py-4 lg:grid-cols-[1fr_auto] lg:items-center">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-semibold" style={{ color: 'var(--portal-text)' }}>{room.name}</p>
                        <span className="portal-chip rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em]">{status}</span>
                      </div>
                      <p className="mt-1 text-xs" style={{ color: 'var(--portal-text-muted)' }}>
                        {room.access_mode === 'view_only' ? 'View only' : 'View and download'} - {getRoomDocumentCount(room)} document{getRoomDocumentCount(room) === 1 ? '' : 's'} - Expires {formatDate(room.expires_at)}
                      </p>
                      <p className="mt-1 truncate text-xs" style={{ color: 'var(--portal-text-muted)' }}>
                        {getRoomRecipientEmails(room).join(', ') || 'No recipients'}
                      </p>
                    </div>
                    {!room.revoked_at ? (
                      <button type="button" className="portal-button-ghost inline-flex items-center justify-center gap-2 rounded-2xl px-3 py-2 text-xs font-semibold" disabled={revokeRoomMutation.isPending} onClick={() => revokeRoomMutation.mutate(room.id)}>
                        <Archive className="h-4 w-4" />
                        Revoke
                      </button>
                    ) : null}
                  </div>
                )
              })}
              {!rooms.length ? <div className="px-5 py-10 text-sm" style={{ color: 'var(--portal-text-muted)' }}>No secure access rooms yet.</div> : null}
            </div>
          )}
        </section>
      ) : activeView === 'log' ? (
        <section className="portal-panel overflow-hidden rounded-[34px]">
          <div className="border-b px-5 py-5" style={{ borderColor: 'var(--portal-border)' }}>
            <h2 className="text-base font-semibold" style={{ color: 'var(--portal-text)' }}>Access log</h2>
            <p className="mt-1 text-sm" style={{ color: 'var(--portal-text-muted)' }}>Search and sort document, room, recipient, and access events.</p>
          </div>
          {auditError ? <div className="p-5"><Notice kind="error" message={auditError.message} /></div> : null}
          {auditLoading ? (
            <div className="flex items-center gap-3 px-6 py-10" style={{ color: 'var(--portal-text-muted)' }}>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Loading access log...</span>
            </div>
          ) : (
            <div className="portal-scroll overflow-auto">
              <table className="w-full min-w-[860px] border-separate border-spacing-0 text-sm">
                <thead>
                  <tr>
                    {[
                      ['accessed_at', 'Date'],
                      ['action', 'Action'],
                      ['document', 'Document'],
                      ['room', 'Room'],
                      ['recipient', 'Recipient'],
                    ].map(([field, label]) => (
                      <th key={field} className="border-b px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em]" style={{ borderColor: 'var(--portal-border)', color: 'var(--portal-text-soft)' }}>
                        <button type="button" onClick={() => setAuditSortField(field)} className="inline-flex items-center gap-1">
                          {label}
                          {auditSort.field === field ? <span>{auditSort.direction === 'asc' ? 'up' : 'down'}</span> : null}
                        </button>
                      </th>
                    ))}
                    <th className="border-b px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em]" style={{ borderColor: 'var(--portal-border)', color: 'var(--portal-text-soft)' }}>IP</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAudit.map((event) => (
                    <tr key={event.id} className="portal-table-row">
                      <td className="border-b px-4 py-3" style={{ borderColor: 'var(--portal-border)', color: 'var(--portal-text-muted)' }}>{formatDate(event.accessed_at)}</td>
                      <td className="border-b px-4 py-3 capitalize" style={{ borderColor: 'var(--portal-border)', color: 'var(--portal-text)' }}>{actionLabel(event.action)}</td>
                      <td className="border-b px-4 py-3" style={{ borderColor: 'var(--portal-border)', color: 'var(--portal-text-muted)' }}>{event.secure_documents?.file_name || '-'}</td>
                      <td className="border-b px-4 py-3" style={{ borderColor: 'var(--portal-border)', color: 'var(--portal-text-muted)' }}>{event.secure_share_rooms?.name || '-'}</td>
                      <td className="border-b px-4 py-3" style={{ borderColor: 'var(--portal-border)', color: 'var(--portal-text-muted)' }}>{auditRecipientLabel(event)}</td>
                      <td className="border-b px-4 py-3" style={{ borderColor: 'var(--portal-border)', color: 'var(--portal-text-muted)' }}>{event.ip_address || '-'}</td>
                    </tr>
                  ))}
                  {!filteredAudit.length ? (
                    <tr>
                      <td colSpan="6" className="px-5 py-10 text-center text-sm" style={{ color: 'var(--portal-text-muted)' }}>No access log events match this search.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : (
        <div
          ref={documentsLayoutRef}
          className="space-y-4 xl:grid xl:grid-cols-[260px_minmax(380px,var(--documents-file-column-width))_14px_minmax(440px,1fr)] xl:items-start xl:gap-4 xl:space-y-0"
          style={{ '--documents-file-column-width': `${fileColumnWidth}px` }}
        >
          <aside className="space-y-4">
            <section className="portal-panel overflow-hidden rounded-[28px]">
              <div className="border-b px-4 py-4" style={{ borderColor: 'var(--portal-border)' }}>
                <h2 className="text-base font-semibold" style={{ color: 'var(--portal-text)' }}>Folders</h2>
              </div>
              <div className="space-y-3 p-4">
                <form onSubmit={handleCreateFolder} className="flex gap-2">
                  <input type="text" value={folderDraft} onChange={(event) => setFolderDraft(event.target.value)} placeholder={folderRows.some((folder) => folder.id === selectedFolder) ? 'New subfolder' : 'New folder'} className="portal-input px-3 py-2.5 text-sm" disabled={billingAccess?.readOnly} />
                  <button type="submit" disabled={billingAccess?.readOnly || folderMutation.isPending} className="portal-button-secondary inline-flex items-center gap-2 rounded-2xl px-3 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60">
                    <FolderPlus className="h-4 w-4" />
                  </button>
                </form>

                <div className="space-y-2">
                  {folders.map((folder) => (
                    <button
                      key={folder.id}
                      type="button"
                      onClick={() => setSelectedFolder(folder.id)}
                      className="flex w-full items-center justify-between rounded-2xl px-3 py-2.5 text-left transition-all"
                      style={selectedFolder === folder.id
                        ? folder.id === SHARED_ROOMS_FOLDER
                          ? { background: 'linear-gradient(135deg, rgba(31,169,113,0.18), rgba(201, 240, 223, 0.14))', border: '1px solid rgba(31,169,113,0.24)' }
                          : { background: 'linear-gradient(135deg, rgba(201,168,76,0.16), rgba(232,213,160,0.08))', border: '1px solid rgba(201,168,76,0.24)' }
                        : folder.id === SHARED_ROOMS_FOLDER
                          ? { background: 'rgba(217, 244, 229, 0.58)', border: '1px solid rgba(31,169,113,0.18)' }
                          : { background: 'rgba(255,255,255,0.78)', border: '1px solid var(--portal-border)' }}
                    >
                      <div className="min-w-0" style={{ paddingLeft: `${folder.depth * 12}px` }}>
                        <p className="truncate text-sm font-semibold" style={{ color: 'var(--portal-text)' }}>{folder.name}</p>
                        <p className="text-[11px]" style={{ color: 'var(--portal-text-soft)' }}>{folderCounts[folder.id] || 0} file{(folderCounts[folder.id] || 0) === 1 ? '' : 's'}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </section>
          </aside>

          <section className="portal-panel overflow-hidden rounded-[28px]">
            <div className="border-b px-4 py-4 md:px-5" style={{ borderColor: 'var(--portal-border)' }}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold" style={{ color: 'var(--portal-text)' }}>{selectedFolderRecord?.path || selectedFolder}</h2>
                  <p className="mt-1 text-sm" style={{ color: 'var(--portal-text-muted)' }}>
                    {selectedFolder === SHARED_ROOMS_FOLDER ? 'Files included in secure access rooms.' : selectedFolder === ARCHIVED_FOLDER ? 'Archived files still count against quota.' : 'Tenant-scoped secure document library.'}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {folderRows.some((folder) => folder.id === selectedFolder) ? (
                    <button type="button" onClick={() => openRoomDialogForFolder(selectedFolder)} disabled={billingAccess?.readOnly} className="portal-button-secondary inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-xs font-semibold disabled:opacity-60">
                      <Users className="h-3.5 w-3.5" />
                      Share folder
                    </button>
                  ) : null}
                  <span className="portal-chip rounded-full px-3 py-1 text-[11px] font-semibold">{filteredDocuments.length} shown</span>
                </div>
              </div>
            </div>

            {documentsError ? <div className="p-4"><Notice kind="error" message={documentsError.message} /></div> : null}
            {foldersError ? <div className="p-4"><Notice kind="error" message={foldersError.message} /></div> : null}
            {documentsLoading || foldersLoading ? (
              <div className="flex items-center gap-3 px-5 py-8" style={{ color: 'var(--portal-text-muted)' }}>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">Loading documents...</span>
              </div>
            ) : filteredDocuments.length > 0 ? (
              libraryView === 'grid' ? (
                <div className="grid gap-2.5 p-4 sm:grid-cols-2 2xl:grid-cols-3">
                  {filteredDocuments.map((document) => {
                    const isSelected = selectedDocument?.id === document.id
                    const isChecked = selectedDocumentIds.includes(document.id)

                    return (
                      <div key={document.id} className="relative rounded-[20px] p-3.5 text-left transition-all" style={isSelected ? { background: 'linear-gradient(145deg, rgba(201,168,76,0.14), rgba(232,213,160,0.08))', border: '1px solid rgba(201,168,76,0.24)', boxShadow: '0 14px 28px rgba(26,24,20,0.06)' } : { background: 'rgba(255,255,255,0.84)', border: '1px solid var(--portal-border)' }}>
                        <label className="absolute left-3 top-3" onClick={(event) => event.stopPropagation()}>
                          <input type="checkbox" checked={isChecked} onChange={() => toggleSelectedDocument(document.id)} />
                        </label>
                        <div className="absolute right-3 top-3">
                          <DocumentActionMenu
                            document={document}
                            isOpen={openActionMenuId === document.id}
                            canManage={!billingAccess?.readOnly}
                            availableFolders={folderOptions}
                            currentFolder={document.folder_id}
                            onOpen={() => setOpenActionMenuId((current) => current === document.id ? null : document.id)}
                            onClose={() => setOpenActionMenuId(null)}
                            onMove={handleMoveDocument}
                            onRename={handleRenameDocument}
                            onRoom={(item) => openRoomDialogForDocuments([item.id])}
                            onShareLink={openShareLinkDialog}
                            onDownload={(item) => {
                              setOpenActionMenuId(null)
                              previewMutation.mutate({ documentId: item.id, action: 'download' })
                            }}
                            onArchive={handleArchiveDocument}
                          />
                        </div>
                        <button type="button" onClick={() => { setSelectedId(document.id); previewMutation.mutate({ documentId: document.id, action: 'view' }) }} className="block w-full text-left">
                          <div className="mb-3 ml-6 flex h-8 w-8 items-center justify-center rounded-[10px]" style={{ background: 'rgba(245, 240, 235, 0.96)' }}>
                            <DocumentFileIcon mimeType={document.mime_type} className="h-4 w-4" style={{ color: 'var(--portal-primary)' }} />
                          </div>
                          <div className="flex items-center gap-2 pr-7">
                            <p className="truncate text-[13px] font-semibold" style={{ color: 'var(--portal-text)' }}>{document.file_name}</p>
                            {roomDocumentIds.has(document.id) ? <Users className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--portal-success)' }} /> : null}
                          </div>
                          <p className="mt-1 text-[11px]" style={{ color: 'var(--portal-text-muted)' }}>{folderPath(document.folder_id, foldersById) || documentFolder(document)} - {formatVaultBytes(document.size_bytes)}</p>
                        </button>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button type="button" onClick={() => previewMutation.mutate({ documentId: document.id, action: 'view' })} className="portal-button-ghost inline-flex h-8 w-8 items-center justify-center rounded-full" aria-label={`Preview ${document.file_name}`}>
                            <Eye className="h-3.5 w-3.5" />
                          </button>
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
                        const isChecked = selectedDocumentIds.includes(document.id)
                        return (
                          <tr
                            key={document.id}
                            className="portal-table-row cursor-pointer transition-all"
                            onClick={() => { setSelectedId(document.id); previewMutation.mutate({ documentId: document.id, action: 'view' }) }}
                            style={isSelected ? { background: 'rgba(201, 168, 76, 0.1)' } : undefined}
                          >
                            <td className="border-t px-4 py-2" style={{ borderColor: 'var(--portal-border)' }}>
                              <div className="flex min-w-0 items-center gap-3">
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onClick={(event) => event.stopPropagation()}
                                  onChange={() => toggleSelectedDocument(document.id)}
                                />
                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px]" style={{ background: 'rgba(245, 240, 235, 0.96)' }}>
                                  <DocumentFileIcon mimeType={document.mime_type} className="h-4 w-4" style={{ color: 'var(--portal-primary)' }} />
                                </div>
                                <div className="flex min-w-0 flex-1 items-center gap-3">
                                  <div className="min-w-0">
                                    <div className="flex min-w-0 items-center gap-2">
                                      <p className="truncate text-[12px] font-semibold leading-5" style={{ color: 'var(--portal-text)' }}>{document.file_name}</p>
                                      {roomDocumentIds.has(document.id) ? <Users className="h-3 w-3 shrink-0" style={{ color: 'var(--portal-success)' }} /> : null}
                                    </div>
                                    <p className="text-[11px]" style={{ color: 'var(--portal-text-muted)' }}>{folderPath(document.folder_id, foldersById) || documentFolder(document)} - {formatVaultBytes(document.size_bytes)}</p>
                                  </div>
                                  <span className="hidden shrink-0 rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] lg:inline-flex" style={{ borderColor: 'var(--portal-border)', color: 'var(--portal-text-soft)' }}>
                                    {folderPath(document.folder_id, foldersById) || documentFolder(document)}
                                  </span>
                                </div>
                                <div className="ml-auto flex shrink-0 items-center gap-1" onClick={(event) => event.stopPropagation()}>
                                  <DocumentActionMenu
                                    document={document}
                                    isOpen={openActionMenuId === document.id}
                                    canManage={!billingAccess?.readOnly}
                                    availableFolders={folderOptions}
                                    currentFolder={document.folder_id}
                                    onOpen={() => setOpenActionMenuId((current) => current === document.id ? null : document.id)}
                                    onClose={() => setOpenActionMenuId(null)}
                                    onMove={handleMoveDocument}
                                    onRename={handleRenameDocument}
                                    onRoom={(item) => openRoomDialogForDocuments([item.id])}
                                    onShareLink={openShareLinkDialog}
                                    onDownload={(item) => {
                                      setOpenActionMenuId(null)
                                      previewMutation.mutate({ documentId: item.id, action: 'download' })
                                    }}
                                    onArchive={handleArchiveDocument}
                                  />
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
              <div className="px-4 py-10 text-center">
                <div className="mx-auto max-w-md rounded-[28px] border border-dashed px-6 py-10" style={{ borderColor: 'var(--portal-border-strong)', color: 'var(--portal-text-muted)' }}>
                  <p className="text-sm font-semibold" style={{ color: 'var(--portal-text)' }}>No documents match this view</p>
                  <p className="mt-2 text-xs">Try another folder, clear your search, or upload the first file for this workspace.</p>
                </div>
              </div>
            )}
          </section>

          <div
            className="hidden h-full min-h-[320px] cursor-col-resize items-stretch justify-center rounded-full transition-colors xl:flex"
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize document preview panel"
            tabIndex={0}
            onPointerDown={(event) => {
              event.preventDefault()
              setIsFileColumnResizing(true)
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowLeft') {
                event.preventDefault()
                setFileColumnWidth((current) => Math.max(MIN_DOCUMENTS_FILE_COLUMN_WIDTH, current - 32))
              }
              if (event.key === 'ArrowRight') {
                event.preventDefault()
                setFileColumnWidth((current) => Math.min(MAX_DOCUMENTS_FILE_COLUMN_WIDTH, current + 32))
              }
            }}
            style={{ background: isFileColumnResizing ? 'rgba(29, 155, 240, 0.18)' : 'transparent' }}
          >
            <div className="my-4 w-1 rounded-full" style={{ background: isFileColumnResizing ? 'var(--portal-primary)' : 'var(--portal-border-strong)' }} />
          </div>

          <aside className="space-y-4">
            <DocumentPreview
              selectedDocument={selectedDocument}
              previewState={previewState}
              onRefreshPreview={() => selectedDocument && previewMutation.mutate({ documentId: selectedDocument.id, action: 'view' })}
              onDownload={() => selectedDocument && previewMutation.mutate({ documentId: selectedDocument.id, action: 'download' })}
            />

            <section className="portal-panel rounded-[24px] p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--portal-text)' }}>Selected for room</p>
                  <p className="mt-1 text-xs" style={{ color: 'var(--portal-text-muted)' }}>{selectedDocumentIds.length} document{selectedDocumentIds.length === 1 ? '' : 's'} selected</p>
                </div>
                <button type="button" onClick={() => setIsRoomDialogOpen(true)} disabled={selectedDocumentIds.length === 0 || billingAccess?.readOnly} className="portal-button-primary inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-xs font-semibold disabled:opacity-60">
                  <Mail className="h-3.5 w-3.5" />
                  Share
                </button>
              </div>
            </section>
          </aside>
        </div>
      )}
    </div>
  )
}
