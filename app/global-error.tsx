'use client'

// Root error boundary. Renders only if something crashes above the app's normal
// error UI (a root-layout-level failure). Shows a calm on-brand fallback instead
// of a white crash screen. Wire in your own error reporter here if you want one.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  void error
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '20px',
          // The default theme (vellum, app/globals.css), written out: this page
          // replaces the root layout, so the stylesheet may not be there.
          background: '#EEF1F4',
          color: '#16233B',
          fontFamily: 'Inter, system-ui, sans-serif',
          textAlign: 'center',
          padding: '24px',
        }}
      >
        <h2 style={{ fontWeight: 600, fontSize: '20px', margin: 0 }}>Something went wrong on our end.</h2>
        <p style={{ color: '#4F5B6D', fontSize: '14px', maxWidth: '340px', lineHeight: 1.5, margin: 0 }}>
          We have been notified and are on it. Try again in a moment.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px' }}>
          <button
            onClick={() => reset()}
            style={{
              border: '1.5px solid #C2271D',
              background: '#C2271D',
              color: '#FFFFFF',
              padding: '10px 22px',
              minHeight: '44px',
              borderRadius: '3px',
              fontSize: '14px',
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
          {/* Hard navigation (not a router Link): the root tree has crashed, so a
              full page load to the dashboard is the reliable escape hatch. */}
          <a
            href="/app"
            style={{
              color: '#16233B',
              fontSize: '14px',
              textDecoration: 'none',
              borderBottom: '1px solid #16233B',
              paddingBottom: '1px',
            }}
          >
            Back to dashboard
          </a>
        </div>
      </body>
    </html>
  )
}
