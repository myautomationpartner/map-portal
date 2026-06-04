import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('./OpportunityRadar.jsx', import.meta.url), 'utf8')

test('Opportunity Radar review page exposes owner-ready value fields', () => {
  assert.match(source, /function getOwnerReadyBrief\(suggestion\)/)
  assert.match(source, /business_goal/)
  assert.match(source, /value_label/)
  assert.match(source, /boost_recommendation/)
  assert.match(source, /suggested_image/)
  assert.match(source, /approval_ready_summary/)
  assert.match(source, /Business goal/)
  assert.match(source, /Value label/)
  assert.match(source, /Boost guidance/)
  assert.match(source, /Suggested image/)
  assert.match(source, /Why approve/)
  assert.match(source, /brief\.approvalReadySummary/)
})
