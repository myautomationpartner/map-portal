import test from 'node:test'
import assert from 'node:assert/strict'
import {
  SECURE_VAULT_MAX_FILE_BYTES,
  SECURE_VAULT_QUOTA_BYTES,
  defaultRoomExpiryValue,
  formatVaultBytes,
  resolveSecureVaultMimeType,
  roomCanDownload,
  vaultUsagePercent,
} from './secureVault.js'

test('formats vault usage bytes for the usage meter', () => {
  assert.equal(formatVaultBytes(0), '0 B')
  assert.equal(formatVaultBytes(1024), '1 KB')
  assert.equal(formatVaultBytes(18.4 * 1024 * 1024), '18.4 MB')
})

test('calculates usage percentage against the 100 MB quota', () => {
  assert.equal(SECURE_VAULT_QUOTA_BYTES, 100 * 1024 * 1024)
  assert.equal(SECURE_VAULT_MAX_FILE_BYTES, 25 * 1024 * 1024)
  assert.equal(vaultUsagePercent(25 * 1024 * 1024), 25)
  assert.equal(vaultUsagePercent(120 * 1024 * 1024), 100)
})

test('infers supported secure vault MIME types from extension', () => {
  assert.equal(resolveSecureVaultMimeType({ name: 'terms.pdf', type: '' }), 'application/pdf')
  assert.equal(resolveSecureVaultMimeType({ name: 'taxes.xlsx', type: '' }), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  assert.equal(resolveSecureVaultMimeType({ name: 'photo.HEIC', type: '' }), 'image/heic')
  assert.equal(resolveSecureVaultMimeType({ name: 'unknown.exe', type: '' }), '')
})

test('honors room download mode', () => {
  assert.equal(roomCanDownload({ access_mode: 'view_and_download' }), true)
  assert.equal(roomCanDownload({ access_mode: 'view_only' }), false)
  assert.equal(roomCanDownload({}), true)
})

test('uses a seven day default room expiry value', () => {
  const base = new Date('2026-05-04T12:00:00.000Z')
  assert.equal(defaultRoomExpiryValue(base), '2026-05-11T12:00')
})
