import { NextRequest, NextResponse } from 'next/server'
import { get, put } from '@vercel/blob'
import { constantTimeEquals } from '../mcp/oauth/crypto'

/**
 * The walks log. STEGA (a separate app) POSTs a completed walk here with the
 * WALKS_TOKEN bearer; the dashboard GETs the list to hydrate the Walks tile.
 *
 * Storage is one JSON blob — a single-user log, so read-modify-write races are
 * accepted rather than engineered around.
 */

const BLOB_PATH = 'stega/walks.json'
const MAX_ENTRIES = 500

export interface WalkEntry {
  id: string
  /** YYYY-MM-DD in the walker's local time, supplied by the client. */
  date: string
  steps: number
  distanceM: number
  durationMin: number
  kcal: number
  name: string
  loggedAt: string
}

async function readWalks(): Promise<WalkEntry[]> {
  try {
    // useCache:false — a read-modify-write must not append onto a stale CDN copy.
    const result = await get(BLOB_PATH, { access: 'private', useCache: false })
    if (!result?.stream) return []
    const data = JSON.parse(await new Response(result.stream).text())
    return Array.isArray(data) ? (data as WalkEntry[]) : []
  } catch {
    // No blob yet — an empty log is the correct starting state.
    return []
  }
}

export async function GET() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { error: 'Blob storage is not configured (BLOB_READ_WRITE_TOKEN missing).' },
      { status: 503 },
    )
  }
  try {
    return NextResponse.json({ walks: await readWalks() })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const expected = process.env.WALKS_TOKEN
  if (!expected) {
    return NextResponse.json(
      { error: 'Walk logging is not configured (WALKS_TOKEN missing).' },
      { status: 503 },
    )
  }
  const provided = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!constantTimeEquals(provided, expected)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  }

  let body: Partial<WalkEntry>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const nums = {
    steps: Number(body.steps),
    distanceM: Number(body.distanceM),
    durationMin: Number(body.durationMin),
    kcal: Number(body.kcal),
  }
  if (Object.values(nums).some((n) => !Number.isFinite(n) || n < 0)) {
    return NextResponse.json(
      { error: 'steps, distanceM, durationMin and kcal must be non-negative numbers.' },
      { status: 400 },
    )
  }
  const date = typeof body.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date)
    ? body.date
    : new Date().toISOString().slice(0, 10)

  const entry: WalkEntry = {
    id: crypto.randomUUID(),
    date,
    ...nums,
    name: typeof body.name === 'string' && body.name.trim() ? body.name.trim().slice(0, 120) : 'Promenad',
    loggedAt: new Date().toISOString(),
  }

  try {
    const walks = [entry, ...(await readWalks())].slice(0, MAX_ENTRIES)
    await put(BLOB_PATH, JSON.stringify(walks), {
      access: 'private',
      contentType: 'application/json',
      addRandomSuffix: false,
      allowOverwrite: true,
    })
    return NextResponse.json({ ok: true, entry })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
