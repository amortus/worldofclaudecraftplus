import { afterEach, describe, expect, it } from 'vitest';
import type { IncomingMessage } from 'node:http';
import { createNativeAttestationChallenge, nativeAttestationRequired, verifyNativeAttestation } from '../server/native_attestation';

const originalEnv = { ...process.env };

function req(headers: Record<string, string> = {}): IncomingMessage {
  return {
    headers,
    socket: { remoteAddress: '203.0.113.10' },
  } as unknown as IncomingMessage;
}

describe('native attestation', () => {
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('is opt-in: only NATIVE_ATTESTATION_REQUIRED=1 enforces, never production alone', () => {
    delete process.env.NATIVE_ATTESTATION_REQUIRED;
    process.env.NODE_ENV = 'development';
    expect(nativeAttestationRequired()).toBe(false);
    process.env.NODE_ENV = 'production';
    expect(nativeAttestationRequired()).toBe(false);
    process.env.NATIVE_ATTESTATION_REQUIRED = '0';
    expect(nativeAttestationRequired()).toBe(false);
    process.env.NATIVE_ATTESTATION_REQUIRED = '1';
    expect(nativeAttestationRequired()).toBe(true);
  });

  it('allows recognised native origins while enforcement is disabled', async () => {
    process.env.NATIVE_ATTESTATION_REQUIRED = '0';
    await expect(verifyNativeAttestation(req({ origin: 'capacitor://localhost' }), undefined)).resolves.toBe(true);
    await expect(verifyNativeAttestation(req({ origin: 'http://localhost' }), undefined)).resolves.toBe(true);
  });

  it('does not allow non-native origins through the native path', async () => {
    process.env.NATIVE_ATTESTATION_REQUIRED = '0';
    await expect(verifyNativeAttestation(req({ origin: 'https://worldofclaudecraft.com' }), undefined)).resolves.toBe(false);
  });

  it('rejects missing or invalid proofs when enforcement is enabled and configured', async () => {
    process.env.NATIVE_ATTESTATION_REQUIRED = '1';
    // A configured backend makes enforcement real (otherwise it fails open).
    process.env.GOOGLE_PLAY_INTEGRITY_CLIENT_EMAIL = 'svc@example.iam.gserviceaccount.com';
    process.env.GOOGLE_PLAY_INTEGRITY_SIGNING_PEM =
      '-----BEGIN PRIVATE KEY-----\nx\n-----END PRIVATE KEY-----\n';
    const request = req({ origin: 'capacitor://localhost' });
    await expect(verifyNativeAttestation(request, undefined)).resolves.toBe(false);
    const challenge = createNativeAttestationChallenge(request, 'login');
    await expect(verifyNativeAttestation(request, {
      platform: 'unknown',
      challengeId: challenge.challengeId,
      token: 'token',
    })).resolves.toBe(false);
  });

  it('fails open (allows) when enforcement is enabled but no backend is configured', async () => {
    process.env.NATIVE_ATTESTATION_REQUIRED = '1';
    delete process.env.GOOGLE_PLAY_INTEGRITY_SERVICE_ACCOUNT_JSON;
    delete process.env.GOOGLE_PLAY_INTEGRITY_CLIENT_EMAIL;
    delete process.env.GOOGLE_PLAY_INTEGRITY_SIGNING_PEM;
    delete process.env.APPLE_TEAM_ID;
    delete process.env.APPLE_DEVICECHECK_KEY_ID;
    delete process.env.APPLE_DEVICECHECK_SIGNING_PEM;
    // Required + recognised native origin + no verification backend -> allow, so a
    // misconfigured Play Integrity / DeviceCheck setup never locks native users out.
    await expect(
      verifyNativeAttestation(req({ origin: 'http://localhost' }), undefined),
    ).resolves.toBe(true);
  });
});
