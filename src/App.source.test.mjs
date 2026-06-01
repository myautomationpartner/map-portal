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
  assert.match(appSource, /Recommended next step/)
  assert.match(appSource, /Need help creating social accounts\?/)
  assert.match(appSource, /Use the business owner's personal login only to grant access/)
  assert.match(appSource, /I have accounts to connect/)
  assert.match(appSource, /Help me set them up/)
  assert.match(appSource, /Business profile setup/)
  assert.match(appSource, /Set up later/)
  assert.match(appSource, /onConnectAccounts=\{\(\) => handleSetupNavigate\('\/settings#social-accounts'\)\}/)
  assert.match(appSource, /onOpenPublisher=\{\(\) => handleSetupNavigate\('\/calendar\?setup=partner'\)\}/)
  assert.match(css, /\.portal-first-login-overlay/)
  assert.match(css, /\.portal-first-login-next/)
  assert.match(css, /\.portal-first-login-social-help/)
  assert.match(css, /html\[data-portal-theme="map-dark"\] \.portal-first-login-dialog/)
})
