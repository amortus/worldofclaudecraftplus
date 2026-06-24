// Cloudflare Worker: serves the static web build and proxies API + WebSocket
// traffic to the authoritative game server. The browser talks to this Worker
// same-origin (no CORS), and the Worker forwards to the backend over a VALID
// TLS hostname (the Let's Encrypt cert covers 168.75.110.180.sslip.io, NOT the
// bare IP, so we must use the hostname or TLS validation fails).
const BACKEND = 'https://168.75.110.180.sslip.io';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    const isApi = url.pathname.startsWith('/api/') || url.pathname.startsWith('/admin/api/');
    const isWs  = url.pathname === '/ws' || url.pathname.startsWith('/ws/');

    if (isApi || isWs) {
      const target = BACKEND + url.pathname + url.search;
      // Rebuild the request against the backend URL so the Host header and TLS
      // SNI become 168.75.110.180.sslip.io (matching the cert and the nginx
      // vhost). Passing `request` as init preserves method, headers, body, and
      // the WebSocket Upgrade for /ws.
      return fetch(new Request(target, request));
    }

    // Everything else is a static asset (or SPA fallback via wrangler.toml).
    return env.ASSETS.fetch(request);
  },
};
