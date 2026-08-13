// Canonical-host redirect: send `www.<apex>` to `<apex>`.
//
// Why this exists. The CORS allowlist is exactly the realm URLs (REALM_ORIGINS,
// server/realm.ts), so a visitor who lands on https://www.<apex> loads the page from
// www while the client calls the API at the apex, and every /api fetch dies in the
// preflight with no Access-Control-Allow-Origin. Widening the allowlist would silence
// that error while leaving a worse one behind: the auth token lives in localStorage,
// which is per ORIGIN, so www and the apex would hold two independent sessions and a
// visitor who drifts between them appears randomly logged out.
//
// One canonical origin fixes both. The rule is deliberately narrow: ONLY the exact
// `www.` prefix of the configured public origin redirects, so the native app origins,
// the Electron desktop shell, direct-IP and localhost access, and any other realm vhost
// are untouched.

/**
 * Decide the Location for a canonical-host redirect, or null to serve normally.
 *
 * Pure so tests/canonical_host.test.ts can pin every arm without an HTTP server.
 *
 * @param host        the request's Host header (may carry a port, may be undefined)
 * @param url         the request target, path plus query
 * @param publicOrigin the configured canonical origin (PUBLIC_ORIGIN); '' disables
 */
export function planCanonicalRedirect(
  host: string | undefined,
  url: string,
  publicOrigin: string,
): string | null {
  if (!publicOrigin) return null; // unconfigured: never guess a canonical host
  let canonicalHost: string;
  try {
    canonicalHost = new URL(publicOrigin).host;
  } catch {
    return null;
  }
  if (!canonicalHost || canonicalHost.startsWith('www.')) return null;
  const requestHost = (host ?? '').trim().toLowerCase();
  if (requestHost !== `www.${canonicalHost.toLowerCase()}`) return null;
  // Preserve the full target so a deep link survives the hop.
  return `${publicOrigin.replace(/\/$/, '')}${url.startsWith('/') ? url : `/${url}`}`;
}

/**
 * True for the requests worth redirecting: document navigations.
 *
 * API calls are deliberately EXCLUDED. A CORS preflight is an OPTIONS that the browser
 * will not follow across a redirect, so redirecting /api would turn a clear CORS error
 * into an opaque one; the document hop is what stops the wrong-origin page from ever
 * being loaded in the first place. WebSocket upgrades are excluded for the same reason.
 */
export function isRedirectableRequest(method: string | undefined, path: string): boolean {
  if (method !== 'GET' && method !== 'HEAD') return false;
  return !path.startsWith('/api/') && !path.startsWith('/admin/api/') && path !== '/ws';
}
