import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const settingsSource = fs.readFileSync(new URL('./Settings.jsx', import.meta.url), 'utf8')
const appCss = fs.readFileSync(new URL('../App.css', import.meta.url), 'utf8')

test('mobile Settings always offers a back action and a direct return to My Partner', () => {
  assert.match(settingsSource, /className="settings-mobile-return"/)
  assert.match(settingsSource, /navigate\(-1\)/)
  assert.match(settingsSource, /navigate\('\/'\)/)
  assert.match(appCss, /\.settings-mobile-return/)
  assert.match(appCss, /position: sticky/)
})

test('Settings keeps Campaign Partner, Opportunity Radar, and Boost Ads off the phone tab path', () => {
  assert.match(settingsSource, /More in MAP/)
  assert.match(settingsSource, /to: '\/campaigns'/)
  assert.match(settingsSource, /Opportunity Radar/)
  assert.match(settingsSource, /to: '\/ads'/)
  assert.match(settingsSource, /Boost Ads/)
})

test('phone Settings source shows social-accounts, Connect/Reconnect, and same-window connect', () => {
  assert.match(settingsSource, /id="social-accounts"/)
  assert.match(settingsSource, /settings-social-priority/)
  assert.match(settingsSource, /Reconnect/)
  assert.match(settingsSource, /settings-social-connect/)
  assert.match(settingsSource, /function shouldUseSameWindowConnect/)
  assert.match(settingsSource, /const useSameWindow = shouldUseSameWindowConnect\(\)/)
  assert.match(settingsSource, /const connectPopup = !useSameWindow/)
  assert.match(settingsSource, /window\.location\.assign\(data\.authUrl\)/)
  assert.match(settingsSource, /Connected \$\{connectedOn\}/)
  assert.equal(settingsSource.includes('Last synced'), false)
  assert.match(appCss, /\.settings-social-priority/)
  assert.match(appCss, /\.settings-page\.settings-mobile-partner/)
  assert.match(appCss, /--mobile-partner-topbar-space/)
})
