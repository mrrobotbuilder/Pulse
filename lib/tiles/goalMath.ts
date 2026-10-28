/**
 * The goal editor's arithmetic, kept pure so `node --test` can run it.
 * A goal's weights are whole numbers that sum to exactly 100.
 */

/** Scale weights to sum to 100 (largest remainder), dropping zeros. {} when nothing is weighted. */
export function normalizeWeights(w: Record<string, number>): Record<string, number> {
  const entries = Object.entries(w).filter(([, v]) => Number.isFinite(v) && v > 0)
  const total = entries.reduce((s, [, v]) => s + v, 0)
  if (!total) return {}
  const exact = entries.map(([k, v]) => [k, (v / total) * 100] as const)
  const out: Record<string, number> = {}
  for (const [k, v] of exact) out[k] = Math.floor(v)
  let left = 100 - Object.values(out).reduce((s, v) => s + v, 0)
  // Hand the leftover points to the largest remainders, ties by id so the result is stable.
  const byRemainder = [...exact].sort((a, b) => b[1] - Math.floor(b[1]) - (a[1] - Math.floor(a[1])) || (a[0] < b[0] ? -1 : 1))
  for (let i = 0; left > 0; i = (i + 1) % byRemainder.length, left--) out[byRemainder[i][0]]++
  for (const k of Object.keys(out)) if (out[k] === 0) delete out[k]
  return out
}

/** The same share for every tile, summing to 100. */
export function evenWeights(ids: string[]): Record<string, number> {
  return normalizeWeights(Object.fromEntries(ids.map((id) => [id, 1])))
}

/** A goal id for this title, unique among `taken`. */
export function goalId(title: string, taken: readonly string[]): string {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24).replace(/-+$/, '') || 'goal'
  let id = `g-${slug}`
  for (let n = 2; taken.includes(id) || id === 'g-overall'; n++) id = `g-${slug}-${n}`
  return id
}
