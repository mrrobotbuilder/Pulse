import type { Metadata } from 'next'
import styles from './landing.module.css'
import board from './app/dashboard.module.css'
import WeightStrip from './app/WeightStrip'
import { OVERALL_GOAL } from '@/lib/tiles/weights'
import { TILE_INFO } from '@/lib/tiles/tileInfo'

export const metadata: Metadata = {
  title: 'Pulse — your life is an equation',
  description:
    'A personal dashboard that turns everything you track into one number. Every habit is an input; the board does the math.',
}

// Flip this when the WHOOP sync actually ships (SETUP.md Stage A), so the page
// can never promise something the board doesn't do yet. `false` renders a
// "soon" mark.
const SHIPPED = { whoop: false }

// The parts list, in board order. Names and copy match the board's tiles.
const PARTS: [id: string, name: string][] = [
  ['train', 'Train'],
  ['fuel', 'Fuel'],
  ['walks', 'Walks'],
  ['vitals', 'Vitals'],
  ['peak', 'Peak'],
  ['brand', 'Brand'],
  ['finance', 'Finance'],
  ['vee', 'Mentor'],
]

// The example equation: the owner's own overall goal and weights.
const EXAMPLE = OVERALL_GOAL
const EXAMPLE_IDS = Object.keys(EXAMPLE.weights).sort((a, b) => EXAMPLE.weights[b] - EXAMPLE.weights[a])
const PREVIEW = EXAMPLE_IDS.slice(0, 3)
const NAME: Record<string, string> = Object.fromEntries(PARTS)

export default function Page() {
  return (
    <main className={styles.page}>
      <nav className={`${styles.nav} ${styles.wrap}`}>
        <a href="/" className={styles.mark}>
          <i className="h3" aria-hidden="true" />
          Pulse
        </a>
        <div className={styles.links}>
          <a href="#equation" className={styles.section}>The math</a>
          <a href="#inputs" className={styles.section}>The board</a>
          <a href="/app" className="btn">Open the board</a>
        </div>
      </nav>

      <header className={`${styles.hero} ${styles.wrap}`}>
        <div>
          <p className="ann">A personal life board</p>
          <h1 className={styles.headline}>Your life is an equation.</h1>
          <p className={styles.lede}>
            Everything you track is an input. Pulse weighs each one against the goal you named, and gives you one
            number that says whether today counted.
          </p>
          <div className={styles.cta}>
            <a href="/app" className="btn">Open the board</a>
            <a href="#equation" className="btn ghost">See the math</a>
          </div>
          <p className="ann">Free to use · no sign-up to look around · your data stays yours</p>
        </div>

        {/* ── the math: Fig. 1 ── */}
        <figure id="equation" className={styles.drawing}>
          <span className={`ann ${styles.corner}`}>Fig. 1</span>
          <p className={styles.eq} aria-label="y equals the sum of w times x">
            <span className={styles.g}>y</span>
            <span className={styles.op}>=</span>
            <span>Σ</span>
            <span>w</span>
            <span className={styles.op}>·</span>
            <span>x</span>
          </p>
          <div style={{ marginTop: 28 }}>
            <WeightStrip ids={EXAMPLE_IDS} weights={EXAMPLE.weights} label="w" />
          </div>
          <figcaption className="ann" style={{ marginTop: 10 }}>
            Example: &ldquo;{EXAMPLE.title}&rdquo;
          </figcaption>
          <ul className={styles.key}>
            <li>
              <b>x</b>
              <span>Each tile is one input: training, fuel, sleep, money, reach. You log it, or a device sends it.</span>
            </li>
            <li>
              <b>w</b>
              <span>How much that input moves your goal. Sleep counts for more when you chase a lift than when you chase reach. The weights add to 100 and move as your data does.</span>
            </li>
            <li>
              <b>y</b>
              <span>One honest number, with the whole trail behind it. No black box: every tile shows what it adds.</span>
            </li>
          </ul>
        </figure>
      </header>

      {/* ── the board: the parts list, then what you get ── */}
      <section id="inputs" className={styles.wrap}>
        <div className={styles.secHead}>
          <h2>Eight tiles, and room for the ones you invent.</h2>
          <p className="ann">Parts list</p>
        </div>
        <p className={styles.body}>
          The board ships whole: you do not assemble it. Then you reshape it: rebuild a tile, wipe one, reorder them,
          or add an input nobody else would think to track.
        </p>
        <table className={styles.parts}>
          <thead>
            <tr>
              <th>Tile</th>
              <th>What it measures</th>
              <th>Fed by</th>
            </tr>
          </thead>
          <tbody>
            {PARTS.map(([id, name]) => (
              <tr key={id}>
                <td>
                  <i className={`sw ${TILE_INFO[id].hatch}`} />
                  {name}
                </td>
                <td>{TILE_INFO[id].measures}</td>
                <td>{TILE_INFO[id].fedBy}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <figure className={styles.preview} aria-label="A preview of the board">
          <span className={`ann ${styles.corner}`}>Fig. 2 · the board</span>
          <div className={board.yrow} style={{ marginTop: 8 }}>
            <div>
              <p className={board.ybig}>
                <small>y =</small>
                {EXAMPLE.progress}
              </p>
              <p className={board.ynote}>
                How far toward <b>{EXAMPLE.title}</b>.
              </p>
            </div>
            <WeightStrip ids={EXAMPLE_IDS} weights={EXAMPLE.weights} label="w" />
          </div>
          <div className={styles.previewTiles}>
            {PREVIEW.map((id) => (
              <div key={id} className={board.tile} style={{ minHeight: 150 }}>
                <div className={board.tileTop}>
                  <i className={`sw ${TILE_INFO[id].hatch}`} />
                  <span className="ann">w {EXAMPLE.weights[id]}</span>
                </div>
                <h3>{NAME[id]}</h3>
                <p className={board.sub}>{TILE_INFO[id].measures}</p>
              </div>
            ))}
          </div>
        </figure>
      </section>

      {/* ── data in ── */}
      <section className={styles.wrap}>
        <div className={styles.split}>
          <div>
            <p className="ann">Data in</p>
            <h2 className={styles.title}>The best input is the one you never have to type.</h2>
            <p className={styles.body}>Typing yesterday into a box is how every tracking habit dies. Where a number can arrive on its own, it should.</p>
          </div>
          <ol className={styles.notes}>
            <li>
              <b>
                Your WHOOP{!SHIPPED.whoop && <span className={styles.soon}>soon</span>}
              </b>
              <p>Connect the band once. Recovery, sleep and strain land in Vitals every morning, and the board reads the real score instead of guessing.</p>
            </li>
            <li>
              <b>Walks, logged on the move</b>
              <p>Distance, steps and route arrive from your phone while you are still out. The tile is already filled when you get home.</p>
            </li>
            <li>
              <b>Reach and money</b>
              <p>TikTok pulls with no key at all. YouTube subscribers and live stock prices use a free key that is yours, never one shared across strangers.</p>
            </li>
          </ol>
        </div>
      </section>

      {/* ── ownership ── */}
      <section className={styles.wrap}>
        <div className={styles.split}>
          <div>
            <p className="ann">Ownership</p>
            <h2 className={styles.title}>It is your board. All the way down.</h2>
            <p className={styles.body}>Most dashboards rent you a view of your own life. This one hands you the keys.</p>
          </div>
          <ol className={styles.notes}>
            <li>
              <b>Yours to break</b>
              <p>Wipe a tile, clear a card, rearrange the board, or detonate the whole thing and start clean.</p>
            </li>
            <li>
              <b>Your data, in your browser</b>
              <p>Everything lives on your device by default. Turn on memory and it follows you across devices, into your own database, locked to your account.</p>
            </li>
            <li>
              <b>Free, and nothing for sale</b>
              <p>This is one person&apos;s own board, opened up for anyone who wants one. No plan, no card, no upsell. Your data is never sold.</p>
            </li>
          </ol>
        </div>

        <footer className={styles.titleBlock}>
          <div>
            <p className="ann">Title</p>
            <p>Pulse — your life is an equation</p>
          </div>
          <div>
            <p className="ann">Owner</p>
            <p>You</p>
          </div>
          <div>
            <p className="ann">Price</p>
            <p>Free</p>
          </div>
          <div>
            <p className="ann">Go to</p>
            <p>
              <a href="/app">The board</a> · <a href="/mentor">The mentor</a>
            </p>
          </div>
        </footer>
      </section>
    </main>
  )
}
