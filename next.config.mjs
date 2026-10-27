/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    // The board renders every tile as a sandboxed srcdoc frame with its own
    // network lock (lib/tiles/tileBridge.ts). A CSP inside a document cannot stop
    // that document's FRAME being navigated away (location.href, a meta refresh,
    // a link), which would carry data out in the URL. frame-src on the page that
    // holds the frames does: srcdoc frames still render, nothing else may load in
    // one. Only the board page hosts tiles. Checked by scripts/check-tiles.mjs.
    return [{ source: '/app', headers: [{ key: 'Content-Security-Policy', value: "frame-src 'none'" }] }]
  },
  async rewrites() {
    // MCP OAuth discovery. Clients construct these `.well-known` URLs themselves
    // from the issuer (RFC 8414 / 9728), so they MUST live at the origin root.
    // We serve them from normal API routes via rewrite — robust regardless of
    // Next's dot-folder routing.
    return [
      {
        source: '/.well-known/oauth-authorization-server',
        destination: '/api/mcp/oauth/as-metadata',
      },
      {
        // Path-aware variant some clients probe (issuer + resource path).
        source: '/.well-known/oauth-authorization-server/:path*',
        destination: '/api/mcp/oauth/as-metadata',
      },
      {
        source: '/.well-known/openid-configuration',
        destination: '/api/mcp/oauth/as-metadata',
      },
      {
        source: '/.well-known/oauth-protected-resource',
        destination: '/api/mcp/oauth/protected-resource-metadata',
      },
      {
        source: '/.well-known/oauth-protected-resource/:path*',
        destination: '/api/mcp/oauth/protected-resource-metadata',
      },
    ]
  },
}

export default nextConfig
