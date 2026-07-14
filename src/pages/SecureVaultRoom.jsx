import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { Download, Eye, FileText, Loader2, LockKeyhole, ShieldCheck } from 'lucide-react'
import { resolveSecureVaultRoom } from '../lib/portalApi'
import { formatVaultBytes, roomCanDownload } from '../lib/secureVault'

function roomErrorMessage(error) {
  const code = error?.payload?.error || error?.message
  if (code === 'passcode_required') return 'Enter the room passcode to continue.'
  if (code === 'invalid_passcode') return 'That passcode did not match this secure room.'
  if (code === 'room_expired') return 'This secure room has expired.'
  if (code === 'invalid_token') return 'This secure room link is no longer available.'
  return error?.message || 'Secure room could not be opened.'
}

export default function SecureVaultRoom() {
  const { token = '' } = useParams()
  const [form, setForm] = useState({ passcode: '', recipientEmail: '' })
  const [roomPayload, setRoomPayload] = useState(null)

  const resolveMutation = useMutation({
    mutationFn: () => resolveSecureVaultRoom({
      token,
      passcode: form.passcode,
      recipient_email: form.recipientEmail,
    }),
    onSuccess: setRoomPayload,
  })

  return (
    <div className="portal-shell min-h-screen px-4 py-8">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
        <header className="rounded-[28px] border p-6" style={{ borderColor: 'var(--portal-border)', background: 'var(--portal-surface)' }}>
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em]" style={{ color: 'var(--portal-primary)' }}>
            <ShieldCheck className="h-4 w-4" />
            Secure Vault Room
          </div>
          <h1 className="portal-page-title mt-2 font-display">{roomPayload?.room?.name || 'Open secure room'}</h1>
          <p className="mt-2 max-w-2xl text-sm" style={{ color: 'var(--portal-text-muted)' }}>
            Access is time-limited and recorded for the business that shared these documents.
          </p>
        </header>

        {!roomPayload ? (
          <form
            className="rounded-[28px] border p-6" style={{ borderColor: 'var(--portal-border)', background: 'var(--portal-surface)' }}
            onSubmit={(event) => {
              event.preventDefault()
              resolveMutation.mutate()
            }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--portal-text-muted)' }}>Email</span>
                <input
                  className="portal-input w-full rounded-2xl px-3 py-2 text-sm"
                  type="email"
                  placeholder="you@example.com"
                  value={form.recipientEmail}
                  onChange={(event) => setForm({ ...form, recipientEmail: event.target.value })}
                />
              </label>
              <label className="block">
                <span className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--portal-text-muted)' }}>
                  <LockKeyhole className="h-3.5 w-3.5" />
                  Passcode
                </span>
                <input
                  className="portal-input w-full rounded-2xl px-3 py-2 text-sm"
                  type="password"
                  placeholder="Room passcode"
                  value={form.passcode}
                  onChange={(event) => setForm({ ...form, passcode: event.target.value })}
                />
              </label>
            </div>
            {resolveMutation.error ? (
              <p className="mt-4 rounded-2xl border px-4 py-3 text-sm" style={{ borderColor: 'var(--portal-danger)', color: 'var(--portal-danger)' }}>
                {roomErrorMessage(resolveMutation.error)}
              </p>
            ) : null}
            <button type="submit" className="portal-button-primary mt-5 inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold" disabled={resolveMutation.isPending}>
              {resolveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              Open room
            </button>
          </form>
        ) : (
          <section className="rounded-[28px] border" style={{ borderColor: 'var(--portal-border)', background: 'var(--portal-surface)' }}>
            <div className="border-b px-5 py-4" style={{ borderColor: 'var(--portal-border)' }}>
              <p className="text-sm font-semibold" style={{ color: 'var(--portal-text)' }}>
                {roomPayload.documents.length} document{roomPayload.documents.length === 1 ? '' : 's'}
              </p>
              <p className="mt-1 text-xs" style={{ color: 'var(--portal-text-muted)' }}>
                Room expires {new Date(roomPayload.room.expires_at).toLocaleString()}.
              </p>
            </div>
            <div className="divide-y" style={{ borderColor: 'var(--portal-border)' }}>
              {roomPayload.documents.map((document) => (
                <div key={document.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <FileText className="mt-0.5 h-5 w-5 shrink-0" style={{ color: 'var(--portal-primary)' }} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold" style={{ color: 'var(--portal-text)' }}>{document.file_name}</p>
                      <p className="text-xs" style={{ color: 'var(--portal-text-muted)' }}>{formatVaultBytes(document.size_bytes)}</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <a className="portal-button-secondary inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-xs font-semibold" href={document.view_url} target="_blank" rel="noreferrer">
                      <Eye className="h-4 w-4" />
                      View
                    </a>
                    {roomCanDownload(roomPayload.room) && document.download_url ? (
                      <a className="portal-button-primary inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-xs font-semibold" href={document.download_url} download>
                        <Download className="h-4 w-4" />
                        Download
                      </a>
                    ) : null}
                  </div>
                </div>
              ))}
              {!roomPayload.documents.length ? (
                <div className="px-5 py-10 text-center text-sm" style={{ color: 'var(--portal-text-muted)' }}>
                  No active documents are available in this room.
                </div>
              ) : null}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
