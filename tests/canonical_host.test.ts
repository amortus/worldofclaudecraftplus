import { describe, expect, it } from 'vitest';
import { isRedirectableRequest, planCanonicalRedirect } from '../server/canonical_host';

const APEX = 'https://worldofclaudecraft.com.br';

describe('planCanonicalRedirect', () => {
  it('redirects the www host to the apex, preserving path and query', () => {
    expect(planCanonicalRedirect('www.worldofclaudecraft.com.br', '/play?lang=en', APEX)).toBe(
      'https://worldofclaudecraft.com.br/play?lang=en',
    );
  });

  it('leaves the apex itself alone', () => {
    expect(planCanonicalRedirect('worldofclaudecraft.com.br', '/', APEX)).toBeNull();
  });

  it('is case-insensitive on the Host header', () => {
    expect(planCanonicalRedirect('WWW.WorldOfClaudecraft.com.br', '/', APEX)).toBe(
      'https://worldofclaudecraft.com.br/',
    );
  });

  // The narrowness is the point: anything that is not exactly the www twin of the
  // configured origin must be served as-is, or the native shells and any sibling realm
  // vhost would be bounced to the wrong host.
  it.each([
    ['capacitor://localhost', 'native app'],
    ['localhost:5173', 'dev server'],
    ['168.75.110.180', 'direct IP'],
    ['app://worldofclaudecraft', 'desktop shell'],
    ['claudemoon.example.com', 'another realm vhost'],
    ['www.evil.test', 'unrelated www host'],
  ])('does not redirect %s (%s)', (host) => {
    expect(planCanonicalRedirect(host, '/', APEX)).toBeNull();
  });

  it('does nothing when no public origin is configured', () => {
    expect(planCanonicalRedirect('www.worldofclaudecraft.com.br', '/', '')).toBeNull();
  });

  it('does nothing when the configured origin is unparseable', () => {
    expect(planCanonicalRedirect('www.worldofclaudecraft.com.br', '/', 'not a url')).toBeNull();
  });

  // A deployment that deliberately canonicalizes ON www must not be bounced in a loop.
  it('does not redirect when the canonical origin is itself a www host', () => {
    expect(
      planCanonicalRedirect('www.example.com', '/', 'https://www.example.com'),
    ).toBeNull();
  });

  it('handles a missing Host header', () => {
    expect(planCanonicalRedirect(undefined, '/', APEX)).toBeNull();
  });
});

describe('isRedirectableRequest', () => {
  it('redirects document navigations', () => {
    expect(isRedirectableRequest('GET', '/')).toBe(true);
    expect(isRedirectableRequest('HEAD', '/play')).toBe(true);
  });

  // A preflight is an OPTIONS the browser will not follow across a redirect, and the
  // WS upgrade must not be bounced either; both are excluded on purpose.
  it.each([
    ['GET', '/api/characters'],
    ['GET', '/admin/api/overview'],
    ['GET', '/ws'],
  ])('leaves %s %s to the normal pipeline', (method, path) => {
    expect(isRedirectableRequest(method, path)).toBe(false);
  });

  it.each(['POST', 'PUT', 'DELETE', 'OPTIONS'])('does not redirect %s', (method) => {
    expect(isRedirectableRequest(method, '/')).toBe(false);
  });
});
