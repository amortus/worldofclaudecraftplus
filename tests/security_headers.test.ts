import type * as http from 'node:http';
import { describe, expect, it } from 'vitest';
import { withSecurityHeaders } from '../server/security_headers';

// Minimal fake ServerResponse: records setHeader/removeHeader so we can assert
// the exact header contract without a live socket.
function fakeRes() {
  const headers = new Map<string, string>();
  const res = {
    setHeader(name: string, value: string) {
      headers.set(name.toLowerCase(), value);
    },
    removeHeader(name: string) {
      headers.delete(name.toLowerCase());
    },
    get(name: string) {
      return headers.get(name.toLowerCase());
    },
    has(name: string) {
      return headers.has(name.toLowerCase());
    },
  };
  return res;
}

function fakeReq(url: string): http.IncomingMessage {
  return { url } as unknown as http.IncomingMessage;
}

describe('withSecurityHeaders', () => {
  it('sets the universal hardening headers on any response', () => {
    const res = fakeRes();
    withSecurityHeaders(fakeReq('/api/characters'), res as unknown as http.ServerResponse, {
      env: {},
    });
    expect(res.get('x-content-type-options')).toBe('nosniff');
    expect(res.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
    expect(res.get('cross-origin-opener-policy')).toBe('same-origin');
    expect(res.get('cross-origin-resource-policy')).toBe('same-origin');
    const perms = res.get('permissions-policy') ?? '';
    expect(perms).toContain('camera=()');
    expect(perms).toContain('geolocation=()');
    // Fullscreen + gamepad are intentionally NOT denied (the game uses them).
    expect(perms).not.toContain('fullscreen');
    expect(perms).not.toContain('gamepad');
  });

  it('strips Server and X-Powered-By defensively', () => {
    const res = fakeRes();
    res.setHeader('Server', 'nginx');
    res.setHeader('X-Powered-By', 'Express');
    withSecurityHeaders(fakeReq('/'), res as unknown as http.ServerResponse, { env: {} });
    expect(res.has('server')).toBe(false);
    expect(res.has('x-powered-by')).toBe(false);
  });

  it('adds HSTS only in production', () => {
    const dev = fakeRes();
    withSecurityHeaders(fakeReq('/'), dev as unknown as http.ServerResponse, { env: {} });
    expect(dev.has('strict-transport-security')).toBe(false);

    const prod = fakeRes();
    withSecurityHeaders(fakeReq('/'), prod as unknown as http.ServerResponse, {
      env: { NODE_ENV: 'production' },
    });
    expect(prod.get('strict-transport-security')).toBe('max-age=31536000; includeSubDomains');
  });

  it('hardens the /oauth/ family with frame-deny + no-store, but not other paths', () => {
    const oauth = fakeRes();
    withSecurityHeaders(
      fakeReq('/oauth/token'),
      oauth as unknown as http.ServerResponse,
      { env: {} },
    );
    expect(oauth.get('x-frame-options')).toBe('DENY');
    expect(oauth.get('cache-control')).toBe('no-store');

    const other = fakeRes();
    withSecurityHeaders(fakeReq('/api/login'), other as unknown as http.ServerResponse, {
      env: {},
    });
    expect(other.has('x-frame-options')).toBe(false);
    expect(other.has('cache-control')).toBe(false);
  });

  it('uses cross-origin CORP for the CORS-open public surfaces', () => {
    const res = fakeRes();
    withSecurityHeaders(fakeReq('/avatar/123'), res as unknown as http.ServerResponse, {
      env: {},
      corpCrossOrigin: true,
    });
    expect(res.get('cross-origin-resource-policy')).toBe('cross-origin');
  });

  it('ignores the query string when matching the /oauth/ prefix', () => {
    const res = fakeRes();
    withSecurityHeaders(
      fakeReq('/oauth/authorize?client_id=x'),
      res as unknown as http.ServerResponse,
      { env: {} },
    );
    expect(res.get('x-frame-options')).toBe('DENY');
  });
});
