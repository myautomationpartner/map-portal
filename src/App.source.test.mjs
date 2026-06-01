import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const appSource = await readFile(new URL('./App.jsx', import.meta.url), 'utf8')
const css = await readFile(new URL('./App.css', import.meta.url), 'utf8')

test('portal shell shows first-login setup walkthrough before customers find Publisher', () => {
  assert.match(appSource, /function FirstLoginSetupWalkthrough/)
  assert.match(appSource, /FIRST_LOGIN_SETUP_DISMISS_PREFIX = 'map:first-login-setup-dismissed:'/)
  assert.match(appSource, /fetchSocialConnections\(clientId\)/)
  assert.match(appSource, /fetchResearchProfile\(clientId\)/)
  assert.match(appSource, /Set up .* in a few steps\./)
  assert.match(appSource, /Connect accounts/)
  assert.match(appSource, /Open Publisher setup/)
  assert.match(appSource, /Set up later/)
  assert.match(appSource, /onConnectAccounts=\{\(\) => handleSetupNavigate\('\/settings'\)\}/)
  assert.match(appSource, /onOpenPublisher=\{\(\) => handleSetupNavigate\('\/calendar'\)\}/)
  assert.match(css, /\.portal-first-login-overlay/)
  assert.match(css, /html\[data-portal-theme="map-dark"\] \.portal-first-login-dialog/)
})
