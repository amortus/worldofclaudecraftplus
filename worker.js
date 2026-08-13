// Cloudflare Worker: serves the static web build and proxies API + WebSocket
// traffic to the authoritative game server. The browser talks to this Worker
// same-origin (no CORS), and the Worker forwards to the backend over a VALID
// TLS hostname (the Let's Encrypt cert covers 168.75.110.180.sslip.io, NOT the
// bare IP, so we must use the hostname or TLS validation fails).
//
// Shape note: upstream runs Caddy in front of the game server and proxies
// EVERYTHING to it, so the game server also serves their static build. We serve
// the static build from Cloudflare instead and proxy only the paths the game
// server actually owns. That means every server-owned dynamic route has to be
// listed here: one that is missing does not 502, it silently falls through to
// the SPA fallback and answers 200 with index.html, which looks like the page
// simply not working.
const BACKEND = 'https://168.75.110.180.sslip.io';

// Server-owned path prefixes. Keep in lockstep with the dispatch ladder in
// server/main.ts (routeHttpRequest).
const PROXY_PREFIXES = [
  '/api/',
  '/admin/api/',
  // Companion app OAuth: authorization code + PKCE and device grants.
  '/oauth/',
  // MediaWiki lives behind nginx on the backend at /wiki, matching the
  // `route /wiki* { reverse_proxy localhost:8080 }` block in upstream's DEPLOY.md.
  // The in-repo guide SPA (guide.html) is a separate surface.
  '/wiki/',
  // Player card Open Graph pages (/p/<name>), public SEO profile pages
  // (/c/<realm>/<name>) and the deterministic generated avatars.
  '/p/',
  '/c/',
  '/avatar/',
  '/ws/',
];

// Exact server-owned paths (no trailing segment).
const PROXY_PATHS = new Set(['/ws', '/wiki', '/sitemap-characters.xml']);

// Deliberately NOT proxied, mirroring the `@ops path /livez /readyz /metrics
// /internal/*` + `respond @ops 404` block upstream puts in its Caddyfile. The
// ops endpoints are for the local watchdog and the loopback Prometheus scrape;
// /internal/* is gated only by a shared secret, so it must never be exposed at
// the public edge. These fall through to the static handler below and answer
// with the SPA fallback rather than reaching the game server.
const OPS_PREFIXES = ['/internal/'];
const OPS_PATHS = new Set(['/livez', '/readyz', '/metrics']);

function isProxied(pathname) {
  if (OPS_PATHS.has(pathname)) return false;
  if (OPS_PREFIXES.some((p) => pathname.startsWith(p))) return false;
  if (PROXY_PATHS.has(pathname)) return true;
  return PROXY_PREFIXES.some((p) => pathname.startsWith(p));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (isProxied(url.pathname)) {
      const target = BACKEND + url.pathname + url.search;
      // Rebuild the request against the backend URL so the Host header and TLS
      // SNI become 168.75.110.180.sslip.io (matching the cert and the nginx
      // vhost). Passing `request` as init preserves method, headers, body, and
      // the WebSocket Upgrade for /ws.
      //
      // This rewrite is also exactly why the server needs REALMS set: the
      // browser's Origin stays https://worldofclaudecraft.com.br while Host
      // becomes the sslip.io name, so isWebClientRequest's same-host fallback
      // can never fire and the production login gate needs the explicit
      // allowlist. See docker-compose.yml and .env.example.
      return fetch(new Request(target, request));
    }

    // Everything else is a static asset. Cloudflare's own html_handling serves
    // /terms from terms.html, /play from play.html and so on, and
    // not_found_handling = "single-page-application" (wrangler.toml) backstops
    // the rest with index.html.
    return env.ASSETS.fetch(request);
  },
};
