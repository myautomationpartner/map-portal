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
