// Probe the Google Health API with the stored Fitbit connection and print COUNTS ONLY.
//
//   node --use-system-ca scripts/probe-googlehealth.mjs
//
// Reads .env.local (Supabase service role + Google client), fetches the stored
// token row, refreshes the access token in memory if it is about to expire, then
// lists sleep, steps and heart-rate data points and prints how many came back.
// No token, no value and no health number is ever printed.
//
// Endpoints, filters and page sizes come from Google's reference for
// users.dataTypes.dataPoints.list (read 2026-11-02).

import { existsSync } from 'node:fs'

if (!existsSync('.env.local')) throw new Error('Run this from the pulse folder: .env.local not found.')
process.loadEnvFile('.env.local')

const need = (k) => {
  const v = process.env[k]
  if (!v) throw new Error(`${k} is not set in .env.local`)
  return v
}
const SUPABASE_URL = need('NEXT_PUBLIC_SUPABASE_URL')
const SERVICE_KEY = need('SUPABASE_SERVICE_ROLE_KEY')
const CLIENT_ID = need('GOOGLEHEALTH_CLIENT_ID')
const CLIENT_SECRET = need('GOOGLEHEALTH_CLIENT_SECRET')
const API = 'https://health.googleapis.com/v4/users/me/dataTypes'

// ── token ────────────────────────────────────────────────────────────────────
const rowsRes = await fetch(
  `${SUPABASE_URL}/rest/v1/googlehealth_tokens?select=access_token,refresh_token,expires_at`,
  { headers: { apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}` } },
)
if (!rowsRes.ok) throw new Error(`Supabase answered ${rowsRes.status} reading googlehealth_tokens: ${(await rowsRes.text()).slice(0, 200)}`)
const rows = await rowsRes.json()
if (!rows.length) throw new Error('No Fitbit connection stored yet. Connect it from the board first.')
if (rows.length > 1) console.log(`note: ${rows.length} accounts are connected; probing the first.`)

let { access_token: token, refresh_token: refresh, expires_at: expiresAt } = rows[0]
if (new Date(expiresAt).getTime() - Date.now() < 60_000) {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refresh,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    }).toString(),
  })
  const t = await r.text()
  if (!r.ok) throw new Error(`Refreshing the Google token failed (${r.status}): ${t.slice(0, 300)}. If it says invalid_grant, connect again from the board.`)
  token = JSON.parse(t).access_token
  console.log('token: refreshed in memory (not written back)')
} else {
  console.log('token: still valid')
}

// ── probes ───────────────────────────────────────────────────────────────────
const dayStart = (daysAgo) => {
  const d = new Date(Date.now() - daysAgo * 86_400_000)
  return d.toISOString().slice(0, 10)
}

/** List one data type, following pages (capped). Returns a verdict, never a value. */
async function probe(label, type, filter, { pageSize, maxPages = 5 } = {}) {
  let count = 0
  let pageToken = ''
  for (let page = 0; page < maxPages; page++) {
    const q = new URLSearchParams()
    if (filter) q.set('filter', filter)
    if (pageSize) q.set('pageSize', String(pageSize))
    if (pageToken) q.set('pageToken', pageToken)
    const res = await fetch(`${API}/${type}/dataPoints?${q}`, {
      headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
    })
    const text = await res.text()
    if (!res.ok) {
      // Google's error object holds a status and a message, no health data.
      let msg = text.slice(0, 220).replace(/\s+/g, ' ')
      try { msg = JSON.parse(text).error?.message ?? msg } catch { /* keep raw */ }
      return { label, verdict: 'ERROR', detail: `HTTP ${res.status}: ${msg}` }
    }
    const json = JSON.parse(text)
    count += (json.dataPoints ?? []).length
    pageToken = json.nextPageToken ?? ''
    if (!pageToken) return { label, verdict: count ? 'OK' : 'EMPTY', detail: `${count} data points` }
  }
  return { label, verdict: 'OK', detail: `${count}+ data points (stopped after ${maxPages} pages)` }
}

const results = []

// Sleep: sessions, page size capped at 25 by Google. Filter by civil END time.
results.push(await probe('sleep, last 14 days', 'sleep', `sleep.interval.civil_end_time >= "${dayStart(14)}"`))

// Steps: minute-level interval data. Filter by civil start time. 2 days keeps it small.
results.push(await probe('steps, last 2 days (per-minute points)', 'steps', `steps.interval.civil_start_time >= "${dayStart(2)}"`, { pageSize: 10000 }))

// Heart rate: sample data, filter pattern {sample_data_type}.sample_time.physical_time.
// The type name is snake_case here (heart_rate); camelCase and hyphenated forms were
// rejected with INVALID_DATA_POINT_FILTER_DATA_TYPE_RESTRICTION (tested 2026-11-02).
results.push(await probe('heart rate, last 2 days (samples)', 'heart-rate', `heart_rate.sample_time.physical_time >= "${dayStart(2)}T00:00:00Z"`, { pageSize: 10000 }))

for (const r of results) console.log(`${r.verdict.padEnd(5)}  ${r.label}: ${r.detail}`)
const bad = results.filter((r) => r.verdict === 'ERROR')
const empty = results.filter((r) => r.verdict === 'EMPTY')
console.log(
  bad.length
    ? `\n${bad.length} of ${results.length} could NOT be read. That is a failure, not an empty result.`
    : empty.length
      ? `\nAll ${results.length} readable, but ${empty.length} came back empty. Empty means nothing synced in that window, check the Google Health app.`
      : `\nAll ${results.length} data types read fine.`,
)
process.exitCode = bad.length ? 1 : 0
