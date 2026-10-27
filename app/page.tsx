import type { Metadata } from 'next'
import styles from './landing.module.css'

export const metadata: Metadata = {
  title: 'Pulse — your life is an equation',
  description:
    'A personal dashboard that turns everything you track into one number. Every habit is an input; the board does the math.',
}

// Flip this when the WHOOP sync actually ships (SETUP.md Stage A), so the page
// can never promise something the board doesn't do yet. `false` renders a
// "soon" chip.
const SHIPPED = { whoop: false }

const TILES = [
  { i: '01', name: 'Train', body: 'Every session, every PR, every kilo. The logger that started the whole board.' },
  { i: '02', name: 'Fuel', body: 'What you ate and what you needed. Targets that come from your body, not a chart.' },
  { i: '03', name: 'Vitals', body: 'Sleep and recovery. Estimated by hand — or read straight off your WHOOP.' },
  { i: '04', name: 'Peak', body: 'The curve you are actually on. Where the work is compounding and where it stalled.' },
  { i: '05', name: 'Brand', body: 'Views, subs, followers. TikTok needs no key at all; YouTube uses your own.' },
  { i: '06', name: 'Finance', body: 'What comes in, what leaves, what it costs you. Live prices if you want them.' },
  { i: '07', name: 'Walks', body: 'Distance, steps, where you went — logged on the move and filed here on its own.' },
  { i: '08', name: 'Mentor', body: 'The overseer. Reads every tile, notices the patterns, and retunes the weights.' },
]

export default function Page() {
  return (
    <main className={styles.page}>
      <div className={styles.inner}>
        <nav className={styles.nav}>
          <a href="/" className={styles.wordmark}>
            <span className={styles.mark} aria-hidden="true">V</span>
            Pulse
          </a>
          <div className={styles.navLinks}>
            <a href="#equation" className={`${styles.navLink} ${styles.navSection}`}>The math</a>
            <a href="#inputs" className={`${styles.navLink} ${styles.navSection}`}>The board</a>
            <a href="/app" className={styles.navLink}>Open&nbsp;→</a>
          </div>
        </nav>

        {/* ───────── hero ───────── */}
        <header className={styles.hero}>
          <p className={styles.eyebrow}>A personal life dashboard</p>
          <h1 className={styles.headline}>
            Your life is an <em>equation</em>.
          </h1>
          <p className={styles.sub}>
            Everything you track is an input. Most tools stop there and hand you
            eight charts to interpret. Pulse does the part that actually matters —
            it weighs each input against the goal you named, and gives you one
            number that tells you whether today counted.
          </p>
          <div className={styles.ctaRow}>
            <a href="/app" className={styles.ctaPrimary}>Open the board →</a>
            <a href="#equation" className={styles.ctaSecondary}>See how it works</a>
          </div>
          <p className={styles.ctaNote}>
            Free to use · no sign-up to look around · your data stays yours
          </p>
        </header>

        {/* ───────── the equation ───────── */}
        <section id="equation" className={styles.section}>
          <p className={styles.sectionLabel}>The math</p>
          <h2 className={styles.sectionTitle}>One number, and you can see where it came from.</h2>

          <p className={styles.formula} aria-label="y equals the sum of w times x">
            <span className={styles.y}>y</span>
            <span className={styles.op}>=</span>
            <span aria-hidden="true">Σ</span>
            <span className={styles.op}>&nbsp;</span>
            <span className={styles.x}>w</span>
            <span className={styles.op}>·</span>
            <span className={styles.x}>x</span>
          </p>

          <div className={styles.terms}>
            <div className={styles.term}>
              <div className={styles.termSymbol}>x</div>
              <div className={styles.termTitle}>The inputs</div>
              <p className={styles.termBody}>
                Each tile is one input — training, fuel, recovery, money, reach.
                You log it, or a device does it for you.
              </p>
            </div>
            <div className={styles.term}>
              <div className={styles.termSymbol}>w</div>
              <div className={styles.termTitle}>The weights</div>
              <p className={styles.termBody}>
                Not every input matters equally to your goal. Sleep counts for
                more when you are chasing a lift than when you are chasing reach.
                The weights are set to <em>your</em> goal, and they move as your
                data does.
              </p>
            </div>
            <div className={styles.term}>
              <div className={`${styles.termSymbol} ${styles.termSymbolY}`}>y</div>
              <div className={styles.termTitle}>The answer</div>
              <p className={styles.termBody}>
                One honest number, with the whole trail behind it. No black box —
                every tile shows exactly what it contributed.
              </p>
            </div>
          </div>
        </section>

        {/* ───────── inputs ───────── */}
        <section id="inputs" className={styles.section}>
          <p className={styles.sectionLabel}>The inputs</p>
          <h2 className={styles.sectionTitle}>Eight tiles, and room for the ones you invent.</h2>
          <p className={styles.sectionBody}>
            The board ships whole — you do not assemble it. Then you reshape it:
            rebuild a tile, wipe one, reorder them, or add a new input that
            nobody else would have thought to track.
          </p>

          <div className={styles.tileGrid}>
            {TILES.map((t) => (
              <article key={t.i} className={styles.tile}>
                <div className={styles.tileIndex}>{t.i}</div>
                <h3 className={styles.tileName}>{t.name}</h3>
                <p className={styles.tileBody}>{t.body}</p>
              </article>
            ))}
          </div>
        </section>

        {/* ───────── data in ───────── */}
        <section className={styles.section}>
          <div className={styles.split}>
            <div>
              <p className={styles.sectionLabel}>Data in</p>
              <h2 className={styles.sectionTitle}>The best input is the one you never have to type.</h2>
              <p className={styles.sectionBody}>
                Typing yesterday into a box is how every tracking habit dies.
                Where a number can arrive on its own, it should.
              </p>
            </div>
            <ul className={styles.pointList}>
              <li className={styles.point}>
                <div className={styles.pointTitle}>
                  Your WHOOP
                  {!SHIPPED.whoop && <span className={styles.soon}>soon</span>}
                </div>
                <p className={styles.pointBody}>
                  Connect the band once. Recovery, sleep and strain land in
                  Vitals every morning, and the board reads the real score
                  instead of guessing from how you said you felt.
                </p>
              </li>
              <li className={styles.point}>
                <div className={styles.pointTitle}>Walks, logged on the move</div>
                <p className={styles.pointBody}>
                  Distance, steps and route arrive from your phone while you are
                  still out. The tile is already filled when you get home.
                </p>
              </li>
              <li className={styles.point}>
                <div className={styles.pointTitle}>Reach and money</div>
                <p className={styles.pointBody}>
                  TikTok pulls with no key at all. YouTube subscribers and live
                  stock prices use a free key that is yours — your quota, your
                  key, never one shared across strangers.
                </p>
              </li>
            </ul>
          </div>
        </section>

        {/* ───────── ownership ───────── */}
        <section className={styles.section}>
          <div className={styles.split}>
            <div>
              <p className={styles.sectionLabel}>Ownership</p>
              <h2 className={styles.sectionTitle}>It is your board. All the way down.</h2>
              <p className={styles.sectionBody}>
                Most dashboards rent you a view of your own life. This one hands
                you the keys and the wrecking ball.
              </p>
            </div>
            <ul className={styles.pointList}>
              <li className={styles.point}>
                <div className={styles.pointTitle}>Yours to break</div>
                <p className={styles.pointBody}>
                  Wipe a tile, clear a card, rearrange the row, or detonate the
                  whole board and start clean. Nothing is load-bearing but you.
                </p>
              </li>
              <li className={styles.point}>
                <div className={styles.pointTitle}>Your data, in your browser</div>
                <p className={styles.pointBody}>
                  Everything lives on your device by default. Turn on memory and
                  it follows you across devices — into your own database, locked
                  to your account, row by row.
                </p>
              </li>
              <li className={styles.point}>
                <div className={styles.pointTitle}>Free, and nothing for sale</div>
                <p className={styles.pointBody}>
                  This is one person&apos;s own board, opened up for anyone who
                  wants one. No plan, no card, no upsell. Bring your own data;
                  it stays yours, and it is never sold.
                </p>
              </li>
            </ul>
          </div>
        </section>

        <footer className={styles.footer}>
          <span>Pulse — your life is an equation</span>
          <div className={styles.footerLinks}>
            <a href="/app">The board</a>
            <a href="/mentor">The mentor</a>
          </div>
        </footer>
      </div>
    </main>
  )
}
