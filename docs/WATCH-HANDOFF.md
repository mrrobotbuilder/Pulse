# Watch connection (Fitbit via Google Health API) — handoff

State on 2026-11-02. Legacy Fitbit Web API is off; this uses the Google Health API
(`https://health.googleapis.com/v4`, docs: developers.google.com/health).

## Built (committed, typechecks, nonce check tested)
- `lib/googlehealth.ts` — config (`GOOGLEHEALTH_*` env), token exchange/refresh, `accessTokenFor(userId)`, nonce helpers.
  Reuses `signState`, `verifyState`, `adminClient`, `userFromBearer` from `lib/whoop.ts`.
- `app/api/googlehealth/{start,callback,status}` — sign-in is bound to the browser by a one-time cookie nonce
  (6 HTTP checks passed against a real dev server). `start` setting the cookie is NOT yet exercised with a real user.
- `supabase/googlehealth.sql` — server-only `googlehealth_tokens` table (RLS on, no policies).
- `app/app/AuthPanel.tsx` — `WatchConnect` section in the signed-in "Cloud backup" panel.
- `scripts/set-googlehealth-keys.ps1` — hidden-typing key entry; keys are in `.env.local` (client ID 71 chars, secret 35).

## Google Cloud (done by the owner)
Project `pulse`, Web OAuth client `pulse web`, redirect URIs
`http://localhost:3005/api/googlehealth/callback` and `https://pulse-ochre-zeta-49.vercel.app/api/googlehealth/callback`,
3 scopes added (activity_and_fitness, sleep, health_metrics_and_measurements, all `.readonly`),
audience External + Testing, owner's email is the test user.
OPEN: "Google Health API" was NOT in Enabled APIs on 2026-11-02 (needs enabling in Library for data calls).

## Verified 2026-11-02 (real account)
- SQL run; real local sign-in done; panel says "Fitbit is connected".
- `node --use-system-ca scripts/probe-googlehealth.mjs` (counts only): sleep 5 sessions / 14 days, steps 154 per-minute points / 2 days,
  heart rate 2172 samples / 2 days. So the data flows; the API works without a separate "enable" being visible in Enabled APIs.
- List filters that WORK (snake_case type names): `sleep.interval.civil_end_time >= "YYYY-MM-DD"`,
  `steps.interval.civil_start_time >= "YYYY-MM-DD"`, `heart_rate.sample_time.physical_time >= "...Z"`.
  `heartRate...` and `heart-rate...` are rejected (INVALID_DATA_POINT_FILTER_DATA_TYPE_RESTRICTION).
- Paging: default 1440 points, max 10000; sleep and exercise max 25 per page. Results come newest first.
- NOT yet looked at: the fields INSIDE a data point (sleep stages, step counts, bpm). Read the DataPoint reference before mapping.
- Local board (localhost:3005) shows the DEMO goals: goals/name live only in localStorage per origin, never in the cloud.
  Do not edit tiles there: a save upserts that tile's cloud row.

## Field names (checked against Google's reference AND a real data point, key paths only)
int64 values arrive as STRINGS: parse them. Times are RFC-3339 strings with a separate `...UtcOffset` like "-18000s".
- sleep: `sleep.interval.{startTime,endTime,startUtcOffset,endUtcOffset}`, `sleep.metadata.mainSleep` (bool), `sleep.type` (STAGES),
  `sleep.summary.{minutesAsleep,minutesAwake,minutesToFallAsleep,minutesInSleepPeriod}` (minutes, strings),
  `sleep.summary.stagesSummary[].{type,minutes,count}`, `sleep.stages[].{type,startTime,endTime}`; stage types seen: AWAKE LIGHT DEEP REM ASLEEP.
- steps (per minute): `steps.interval.{startTime,endTime,civilStartTime.date.{year,month,day}}`, `steps.count` (string).
- heart-rate (samples): `heartRate.sampleTime.{physicalTime,utcOffset,civilTime...}`, `heartRate.beatsPerMinute` (string).
- exercise: `exercise.{exerciseType (e.g. WALKING), displayName, activeDuration ("900s"), interval.{startTime,endTime,startUtcOffset}}`,
  `exercise.metricsSummary.{distanceMillimeters (number), steps (string), caloriesKcal (number), averagePaceSecondsPerMeter,
  averageHeartRateBeatsPerMinute (string), activeZoneMinutes (string)}`. Page size is 25 max.
- daily-resting-heart-rate: `dailyRestingHeartRate.{date.{year,month,day}, beatsPerMinute (string)}`; filter `daily_resting_heart_rate.date >= "YYYY-MM-DD"` works.
- NOT yet read: the `dailyRollUp` method (per-day step totals; summing per-minute points for 8 weeks is too heavy). Read its reference first.

## Tile data shapes (existing)
- Walks tile: `{ walks: [{ name, date:'YYYY-MM-DD', steps, distanceM, durationMin }], syncedAt }`. Read-only tile; `Dashboard.tsx` (~line 392) fetches `/api/walks` (STEGA)
  and WHOLE-REPLACES the 'walks' lane with `tileStore.saveData`. Its steps-by-day bars only count steps inside logged walks.
- Vitals tile: `{ 'YYYY-MM-DD': { sleepHours, feel, bed?:'HH:MM', wake?:'HH:MM', rhr?, hrv?, note?, whoopRecovery? }, need: 8 }`,
  keyed by the WAKE date (today's key holds last night). `feel` and `note` are the owner's own input: a sync must never wipe them.

## Not done yet
4. Feed the tiles (sleep, steps, heart rate, workouts) through the tile-data lane, like Walks (`Dashboard.tsx` fetch -> `tileStore.saveData`).
5. Brand picker (Whoop, Fitbit, others) in `WatchConnect`; WHOOP routes exist but have no button and the same state-binding gap.
6. Production: add `GOOGLEHEALTH_*` env vars on Vercel; while the OAuth app is in Testing mode refresh tokens last about 7 days
   (re-connect weekly) — test whether publishing for personal use avoids that.
