import styles from './dashboard.module.css'
import { CORE_TILES, VEE_TILE } from '@/lib/tiles/coreTiles'
import { tileInfo } from '@/lib/tiles/tileInfo'

const labelFor = (id: string) => (id === 'vee' ? VEE_TILE.label : CORE_TILES[id as keyof typeof CORE_TILES]?.label ?? id)

/* ── the dimensioned weight strip ── */
export default function WeightStrip({ ids, weights, label }: { ids: string[]; weights: Record<string, number>; label: string }) {
  const parts = ids.filter((id) => (weights[id] ?? 0) > 0)
  const total = parts.reduce((s, id) => s + (weights[id] ?? 0), 0)
  const desc = parts.map((id) => `${labelFor(id)} ${weights[id]}`).join(', ')
  return (
    <div className={styles.strip} role="img" aria-label={`Weights: ${desc || 'none yet'}`}>
      <div className={styles.dim}>
        <span>{label} · {total}</span>
      </div>
      <div className={styles.segs}>
        {parts.map((id, i) => (
          <i key={id} className={`${styles.seg} ${tileInfo(id).hatch}`} style={{ ['--w' as string]: weights[id], ['--i' as string]: i }} />
        ))}
      </div>
      <div className={styles.segLabels} aria-hidden="true">
        {parts.map((id) => (
          <span key={id} style={{ ['--w' as string]: weights[id] }}>
            {(weights[id] ?? 0) >= 10 ? `${labelFor(id).toLowerCase()} ${weights[id]}` : weights[id]}
          </span>
        ))}
      </div>
      <ul className={styles.legend} aria-hidden="true">
        {parts.map((id) => (
          <li key={id}>
            <i className={`sw ${tileInfo(id).hatch}`} />
            {labelFor(id).toLowerCase()} {weights[id]}
          </li>
        ))}
      </ul>
    </div>
  )
}
