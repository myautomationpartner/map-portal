import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const pageSource = await readFile(new URL('./BoostAds.jsx', import.meta.url), 'utf8').catch(() => '')
const apiSource = await readFile(new URL('../lib/portalApi.js', import.meta.url), 'utf8')
const appSource = await readFile(new URL('../App.jsx', import.meta.url), 'utf8')
const sidebarSource = await readFile(new URL('../components/Sidebar.jsx', import.meta.url), 'utf8')
const workerSource = await readFile(new URL('../../worker.js', import.meta.url), 'utf8')
const css = await readFile(new URL('../App.css', import.meta.url), 'utf8')

test('portal exposes read-only boosted ads reporting from Zernio', () => {
  assert.match(appSource, /import BoostAds from '\.\/pages\/BoostAds'/)
  assert.match(appSource, /<Route path="\/ads" element=\{<BoostAds \/>\} \/>/)
  assert.match(sidebarSource, /label: 'Ads'/)
  assert.match(sidebarSource, /to: '\/ads'/)

  assert.match(apiSource, /export async function fetchBoostCampaigns/)
  assert.match(apiSource, /\/api\/boost-campaigns/)
  assert.match(workerSource, /async function handleBoostCampaigns/)
  assert.match(workerSource, /listZernioBoostCampaigns/)
  assert.match(workerSource, /url\.pathname === '\/api\/boost-campaigns'/)

  assert.match(pageSource, /function BoostAds/)
  assert.match(pageSource, /fetchBoostCampaigns/)
  assert.match(pageSource, /Spend/)
  assert.match(pageSource, /Impressions/)
  assert.match(pageSource, /Reach/)
  assert.match(pageSource, /Clicks/)
  assert.match(pageSource, /CTR/)
  assert.match(pageSource, /CPC/)
  assert.match(pageSource, /CPM/)
  assert.match(pageSource, /Engagement/)
  assert.match(pageSource, /Daily performance/)
  assert.match(pageSource, /read-only/)
  assert.match(pageSource, /Open in Zernio/)
  assert.match(pageSource, /View comments/)
  assert.match(pageSource, /if \(getCampaignStatus\(campaign\)\.key === 'active'\) totals\.active \+= 1/)
  assert.match(pageSource, /if \(!selectedId\) return campaigns\[0\]/)
  assert.match(pageSource, /return campaigns\.find\(\(campaign\) => firstText\(campaign\.id, campaign\._id, campaign\.platformCampaignId, campaign\.platform_campaign_id\) === selectedId\) \|\| null/)

  assert.match(css, /\.boost-ads-page/)
  assert.match(css, /\.boost-ads-metric-grid/)
  assert.match(css, /\.boost-ads-drawer/)
})
