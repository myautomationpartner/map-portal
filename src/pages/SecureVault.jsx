import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useOutletContext } from 'react-router-dom'
import {
  Archive,
  Copy,
  Download,
  Eye,
  FileText,
  Link2,
  Loader2,
  LockKeyhole,
  Plus,
  ShieldCheck,
  UploadCloud,
  X,
} from 'lucide-react'
import {
  createSecureVaultRoom,
  fetchSecureVaultAudit,
  fetchSecureVaultDocuments,
  fetchSecureVaultRooms,
  getSecureVaultDocumentUrl,
  getSecureVaultUploadUrl,
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

function Notice({ kind = 'info', children }) {
  if (!children) return null
  const color = kind === 'error' ? 'var(--portal-danger)' : kind === 'success' ? 'var(--portal-success)' : 'var(--portal-primary)'
  return (
    <div className="rounded-2xl border px-4 py-3 text-sm" style={{ borderColor: color, color, background: 'color-mix(in srgb, var(--portal-surface) 84%, transparent)' }}>
      {children}
    </div>
  )
}

function formatDate(value) {
  if (!value) return 'Not set'
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value))
}

function actionLabel(action) {
  return String(action || '').replace(/_/g, ' ')
}

export default function SecureVault() {
  const queryClient = useQueryClient()
  const { profile, requireWriteAccess } = useOutletContext()
  const clientId = profile?.client_id
  const quotaBytes = Number(profile?.clients?.secure_vault_quota_bytes || SECURE_VAULT_QUOTA_BYTES)
  const [notice, setNotice] = useState(null)
  const [selectedDocumentIds, setSelectedDocumentIds] = useState([])
  const [roomForm, setRoomForm] = useState({
    name: '',
    recipientEmails: '',
    passcode: '',
    expiresAt: defaultRoomExpiryValue(),
    accessMode: 'view_and_download',
  })
  const [createdRoom, setCreatedRoom] = useState(null)

  const { data: documents = [], isLoading: documentsLoading, error: documentsError } = useQuery({
    queryKey: ['secure-vault-documents'],
    queryFn: fetchSecureVaultDocuments,
  })
  const { data: rooms = [], isLoading: roomsLoading } = useQuery({
    queryKey: ['secure-vault-rooms'],
    queryFn: fetchSecureVaultRooms,
  })
  const { data: audit = [] } = useQuery({
    queryKey: ['secure-vault-audit'],
    queryFn: fetchSecureVaultAudit,
  })

  const usedBytes = useMemo(
    () => documents.reduce((sum, document) => sum + Number(document.size_bytes || 0), 0),
    [documents],
  )
  const activeDocuments = documents.filter((document) => !document.is_archived)
  const usagePercent = vaultUsagePercent(usedBytes, quotaBytes)

  const uploadMutation = useMutation({
    mutationFn: async (file) => {
      if (!requireWriteAccess('upload secure vault files')) return null
      const validation = validateSecureVaultFile(file, usedBytes, quotaBytes)
      if (!validation.valid) {
        if (validation.reason === 'file_too_large') throw new Error('Secure Vault files must be 25 MB or smaller.')
        if (validation.reason === 'quota_exceeded') throw new Error('This upload would exceed the 100 MB Secure Vault quota.')
        throw new Error('This file type is not supported in Secure Vault.')
      }

      const upload = await getSecureVaultUploadUrl({
        filename: file.name,
        mime_type: validation.mimeType,
        size_bytes: file.size,
      })
      await uploadSecureVaultFileToSignedUrl(upload.upload_url, file, validation.mimeType)
      return upload
    },
    onSuccess: async (payload) => {
      if (!payload) return
      setNotice({ kind: 'success', message: 'Secure Vault upload complete.' })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['secure-vault-documents'] }),
        queryClient.invalidateQueries({ queryKey: ['secure-vault-audit'] }),
      ])
    },
    onError: (error) => setNotice({ kind: 'error', message: error.message }),
  })

  const archiveMutation = useMutation({
    mutationFn: (documentId) => updateSecureVaultDocument(documentId, { is_archived: true }),
    onSuccess: async () => {
      setNotice({ kind: 'success', message: 'Document archived. It still counts against quota until permanently removed later.' })
      await queryClient.invalidateQueries({ queryKey: ['secure-vault-documents'] })
    },
    onError: (error) => setNotice({ kind: 'error', message: error.message }),
  })

  const linkMutation = useMutation({
    mutationFn: ({ documentId, action }) => getSecureVaultDocumentUrl(documentId, action),
    onSuccess: (payload, variables) => {
      window.open(payload.signed_url, variables.action === 'download' ? '_self' : '_blank', 'noopener,noreferrer')
      queryClient.invalidateQueries({ queryKey: ['secure-vault-audit'] })
    },
    onError: (error) => setNotice({ kind: 'error', message: error.message }),
  })

  const roomMutation = useMutation({
    mutationFn: async () => {
      if (!requireWriteAccess('create secure vault rooms')) return null
      const recipientEmails = roomForm.recipientEmails
        .split(/[\n,;]/)
        .map((email) => email.trim())
        .filter(Boolean)
      return createSecureVaultRoom({
        clientId,
        name: roomForm.name,
        documentIds: selectedDocumentIds,
        recipientEmails,
        expiresAt: roomForm.expiresAt,
        accessMode: roomForm.accessMode,
        passcode: roomForm.passcode,
      })
    },
    onSuccess: async (room) => {
      if (!room) return
      setCreatedRoom(room)
      if (room.invite_delivery?.failed_count > 0) {
        setNotice({ kind: 'error', message: 'Secure room created, but one or more invite emails could not be sent. Use the copied link and passcode as a fallback.' })
      } else {
        setNotice({ kind: 'success', message: 'Secure room created. The link and passcode were emailed separately to each recipient.' })
      }
      setSelectedDocumentIds([])
      setRoomForm({
        name: '',
        recipientEmails: '',
        passcode: '',
        expiresAt: defaultRoomExpiryValue(),
        accessMode: 'view_and_download',
      })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['secure-vault-rooms'] }),
        queryClient.invalidateQueries({ queryKey: ['secure-vault-audit'] }),
      ])
    },
    onError: (error) => setNotice({ kind: 'error', message: error.message }),
  })

  const revokeMutation = useMutation({
    mutationFn: revokeSecureVaultRoom,
    onSuccess: async () => {
      setNotice({ kind: 'success', message: 'Secure room revoked.' })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['secure-vault-rooms'] }),
        queryClient.invalidateQueries({ queryKey: ['secure-vault-audit'] }),
      ])
    },
    onError: (error) => setNotice({ kind: 'error', message: error.message }),
  })

  function toggleDocument(documentId) {
    setSelectedDocumentIds((current) =>
      current.includes(documentId)
        ? current.filter((id) => id !== documentId)
        : [...current, documentId])
  }

  async function copyValue(value, label) {
    await navigator.clipboard?.writeText(value)
    setNotice({ kind: 'success', message: `${label} copied.` })
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em]" style={{ color: 'var(--portal-primary)' }}>
            <ShieldCheck className="h-4 w-4" />
            Secure Vault
          </div>
          <h1 className="portal-page-title mt-2 font-display">Sensitive document storage</h1>
          <p className="mt-2 max-w-3xl text-sm" style={{ color: 'var(--portal-text-muted)' }}>
            Store confidential business files, create expiring share rooms, require passcodes, and track vault access.
          </p>
        </div>
        <label className="portal-button-primary inline-flex cursor-pointer items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold">
          {uploadMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
          Upload file
          <input
            type="file"
            className="sr-only"
            disabled={uploadMutation.isPending}
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (file) uploadMutation.mutate(file)
            }}
          />
        </label>
      </header>

      <Notice kind={notice?.kind}>{notice?.message}</Notice>
      {createdRoom ? (
        <div className="rounded-[24px] border p-4" style={{ borderColor: 'var(--portal-border)', background: 'var(--portal-surface)' }}>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--portal-text)' }}>Secure room ready</p>
              <p className="mt-1 break-all text-sm" style={{ color: 'var(--portal-text-muted)' }}>{createdRoom.share_url}</p>
              {createdRoom.passcode ? <p className="mt-1 text-sm" style={{ color: 'var(--portal-text-muted)' }}>Passcode: {createdRoom.passcode}</p> : null}
              {createdRoom.invite_delivery ? (
                <p className="mt-1 text-sm" style={{ color: 'var(--portal-text-muted)' }}>
                  Email delivery: {createdRoom.invite_delivery.sent_count || 0} sent, {createdRoom.invite_delivery.failed_count || 0} failed.
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="portal-button-secondary inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-sm font-semibold" onClick={() => copyValue(createdRoom.share_url, 'Room link')}>
                <Copy className="h-4 w-4" />
                Copy link
              </button>
              {createdRoom.passcode ? (
                <button type="button" className="portal-button-secondary inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-sm font-semibold" onClick={() => copyValue(createdRoom.passcode, 'Passcode')}>
                  <LockKeyhole className="h-4 w-4" />
                  Copy passcode
                </button>
              ) : null}
              <button type="button" className="portal-button-ghost rounded-2xl px-3 py-2 text-sm font-semibold" onClick={() => setCreatedRoom(null)}>
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
        <div className="rounded-[24px] border p-5" style={{ borderColor: 'var(--portal-border)', background: 'var(--portal-surface)' }}>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--portal-text)' }}>Storage</p>
              <p className="mt-1 text-sm" style={{ color: 'var(--portal-text-muted)' }}>
                {formatVaultBytes(usedBytes)} of {formatVaultBytes(quotaBytes)} used
              </p>
            </div>
            <span className="text-sm font-semibold" style={{ color: 'var(--portal-primary)' }}>{usagePercent}%</span>
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full" style={{ background: 'var(--portal-border)' }}>
            <div className="h-full rounded-full" style={{ width: `${usagePercent}%`, background: 'linear-gradient(90deg, var(--portal-primary), var(--portal-cyan))' }} />
          </div>
        </div>

        <div className="rounded-[24px] border p-5" style={{ borderColor: 'var(--portal-border)', background: 'var(--portal-surface)' }}>
          <p className="text-sm font-semibold" style={{ color: 'var(--portal-text)' }}>Vault controls</p>
          <div className="mt-4 grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-2xl font-semibold" style={{ color: 'var(--portal-text)' }}>{activeDocuments.length}</p>
              <p className="text-xs" style={{ color: 'var(--portal-text-muted)' }}>Files</p>
            </div>
            <div>
              <p className="text-2xl font-semibold" style={{ color: 'var(--portal-text)' }}>{rooms.filter((room) => !room.revoked_at && !isRoomExpired(room)).length}</p>
              <p className="text-xs" style={{ color: 'var(--portal-text-muted)' }}>Active rooms</p>
            </div>
            <div>
              <p className="text-2xl font-semibold" style={{ color: 'var(--portal-text)' }}>{audit.length}</p>
              <p className="text-xs" style={{ color: 'var(--portal-text-muted)' }}>Audit events</p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-[24px] border" style={{ borderColor: 'var(--portal-border)', background: 'var(--portal-surface)' }}>
          <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: 'var(--portal-border)' }}>
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--portal-text)' }}>Vault files</p>
              <p className="text-xs" style={{ color: 'var(--portal-text-muted)' }}>Select files before creating a sharing room.</p>
            </div>
            {documentsLoading ? <Loader2 className="h-4 w-4 animate-spin" style={{ color: 'var(--portal-primary)' }} /> : null}
          </div>
          {documentsError ? <div className="p-5"><Notice kind="error">{documentsError.message}</Notice></div> : null}
          <div className="divide-y" style={{ borderColor: 'var(--portal-border)' }}>
            {activeDocuments.map((document) => (
              <div key={document.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4"
                    checked={selectedDocumentIds.includes(document.id)}
                    onChange={() => toggleDocument(document.id)}
                  />
                  <FileText className="mt-0.5 h-5 w-5 shrink-0" style={{ color: 'var(--portal-primary)' }} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold" style={{ color: 'var(--portal-text)' }}>{document.file_name}</span>
                    <span className="block text-xs" style={{ color: 'var(--portal-text-muted)' }}>
                      {formatVaultBytes(document.size_bytes)} · {document.category || 'Uncategorized'} · {formatDate(document.created_at)}
                    </span>
                  </span>
                </label>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <button type="button" className="portal-button-secondary inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-xs font-semibold" onClick={() => linkMutation.mutate({ documentId: document.id, action: 'view' })}>
                    <Eye className="h-4 w-4" />
                    View
                  </button>
                  <button type="button" className="portal-button-secondary inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-xs font-semibold" onClick={() => linkMutation.mutate({ documentId: document.id, action: 'download' })}>
                    <Download className="h-4 w-4" />
                    Download
                  </button>
                  <button type="button" className="portal-button-ghost inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-xs font-semibold" onClick={() => archiveMutation.mutate(document.id)}>
                    <Archive className="h-4 w-4" />
                    Archive
                  </button>
                </div>
              </div>
            ))}
            {!activeDocuments.length && !documentsLoading ? (
              <div className="px-5 py-10 text-center text-sm" style={{ color: 'var(--portal-text-muted)' }}>
                No Secure Vault files yet.
              </div>
            ) : null}
          </div>
        </div>

        <div className="rounded-[24px] border p-5" style={{ borderColor: 'var(--portal-border)', background: 'var(--portal-surface)' }}>
          <div className="flex items-center gap-2">
            <Plus className="h-4 w-4" style={{ color: 'var(--portal-primary)' }} />
            <p className="text-sm font-semibold" style={{ color: 'var(--portal-text)' }}>Create sharing room</p>
          </div>
          <div className="mt-4 space-y-3">
            <input className="portal-input w-full rounded-2xl px-3 py-2 text-sm" placeholder="Room name, e.g. Bank loan review" value={roomForm.name} onChange={(event) => setRoomForm({ ...roomForm, name: event.target.value })} />
            <textarea className="portal-input min-h-20 w-full rounded-2xl px-3 py-2 text-sm" placeholder="Recipient emails required, separated by commas or lines" value={roomForm.recipientEmails} onChange={(event) => setRoomForm({ ...roomForm, recipientEmails: event.target.value })} />
            <input className="portal-input w-full rounded-2xl px-3 py-2 text-sm" placeholder="Passcode required" value={roomForm.passcode} onChange={(event) => setRoomForm({ ...roomForm, passcode: event.target.value })} />
            <input className="portal-input w-full rounded-2xl px-3 py-2 text-sm" type="datetime-local" value={roomForm.expiresAt} onChange={(event) => setRoomForm({ ...roomForm, expiresAt: event.target.value })} />
            <div className="grid grid-cols-2 gap-2">
              <button type="button" className={`rounded-2xl px-3 py-2 text-sm font-semibold ${roomForm.accessMode === 'view_and_download' ? 'portal-button-primary' : 'portal-button-secondary'}`} onClick={() => setRoomForm({ ...roomForm, accessMode: 'view_and_download' })}>
                View + download
              </button>
              <button type="button" className={`rounded-2xl px-3 py-2 text-sm font-semibold ${roomForm.accessMode === 'view_only' ? 'portal-button-primary' : 'portal-button-secondary'}`} onClick={() => setRoomForm({ ...roomForm, accessMode: 'view_only' })}>
                View only
              </button>
            </div>
            <button type="button" className="portal-button-primary inline-flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold" disabled={roomMutation.isPending} onClick={() => roomMutation.mutate()}>
              {roomMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
              Create secure room
            </button>
            <p className="text-xs" style={{ color: 'var(--portal-text-muted)' }}>
              {selectedDocumentIds.length} file{selectedDocumentIds.length === 1 ? '' : 's'} selected.
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <div className="rounded-[24px] border" style={{ borderColor: 'var(--portal-border)', background: 'var(--portal-surface)' }}>
          <div className="border-b px-5 py-4" style={{ borderColor: 'var(--portal-border)' }}>
            <p className="text-sm font-semibold" style={{ color: 'var(--portal-text)' }}>Sharing rooms</p>
          </div>
          <div className="divide-y" style={{ borderColor: 'var(--portal-border)' }}>
            {rooms.map((room) => (
              <div key={room.id} className="flex items-center justify-between gap-4 px-5 py-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold" style={{ color: 'var(--portal-text)' }}>{room.name}</p>
                  <p className="text-xs" style={{ color: 'var(--portal-text-muted)' }}>
                    {room.access_mode === 'view_only' ? 'View only' : 'View and download'} · Expires {formatDate(room.expires_at)}
                  </p>
                </div>
                {room.revoked_at ? (
                  <span className="text-xs font-semibold" style={{ color: 'var(--portal-text-muted)' }}>Revoked</span>
                ) : (
                  <button type="button" className="portal-button-ghost rounded-2xl px-3 py-2 text-xs font-semibold" disabled={roomsLoading || revokeMutation.isPending} onClick={() => revokeMutation.mutate(room.id)}>
                    Revoke
                  </button>
                )}
              </div>
            ))}
            {!rooms.length ? <div className="px-5 py-8 text-sm" style={{ color: 'var(--portal-text-muted)' }}>No sharing rooms yet.</div> : null}
          </div>
        </div>

        <div className="rounded-[24px] border" style={{ borderColor: 'var(--portal-border)', background: 'var(--portal-surface)' }}>
          <div className="border-b px-5 py-4" style={{ borderColor: 'var(--portal-border)' }}>
            <p className="text-sm font-semibold" style={{ color: 'var(--portal-text)' }}>Audit trail</p>
          </div>
          <div className="divide-y" style={{ borderColor: 'var(--portal-border)' }}>
            {audit.slice(0, 12).map((event) => (
              <div key={event.id} className="px-5 py-3">
                <p className="text-sm font-semibold capitalize" style={{ color: 'var(--portal-text)' }}>{actionLabel(event.action)}</p>
                <p className="text-xs" style={{ color: 'var(--portal-text-muted)' }}>{new Date(event.accessed_at).toLocaleString()}</p>
              </div>
            ))}
            {!audit.length ? <div className="px-5 py-8 text-sm" style={{ color: 'var(--portal-text-muted)' }}>No audit events yet.</div> : null}
          </div>
        </div>
      </section>
    </div>
  )
}
