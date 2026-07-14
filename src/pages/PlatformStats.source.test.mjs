import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const source = await readFile(new URL('./PlatformStats.jsx', import.meta.url), 'utf8')

test('analytics post thumbnails prefer platform variants before legacy media_url', () => {
  assert.match(source, /function getAnalyticsPostMediaUrl/)
  assert.match(source, /post\.platform_variants_json/)
  assert.match(source, /preferredVariant\?\.image/)
  assert.match(source, /post\.media_url/)
})

test('analytics post thumbnails degrade cleanly when media fails to load', () => {
  assert.match(source, /const \[mediaFailed, setMediaFailed\] = useState\(false\)/)
  assert.match(source, /onError=\{\(\) => setMediaFailed\(true\)\}/)
  assert.match(source, /mediaUrl && !mediaFailed/)
})
