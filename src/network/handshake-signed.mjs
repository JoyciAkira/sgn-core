/**
 * Signed handshake with challenge/response (Ed25519)
 */
import { createHash, randomBytes } from 'node:crypto';
import { verifyKU_v1, keyIdFromPubPEM } from '../ku/sign_v1.mjs';

export class SignedHandshake {
  constructor() {
    this.challenges = new Map(); // nonce -> { timestamp, peerId }
    this.challengeTTL = 5 * 60 * 1000; // 5 minutes
  }

  generateChallenge(peerId) {
    const nonce = randomBytes(32).toString('hex');
    const timestamp = Date.now();
    this.challenges.set(nonce, { timestamp, peerId });
    // Cleanup old challenges
    this.cleanupExpiredChallenges();
    return { nonce, timestamp };
  }

  async verifyResponse(nonce, signature, pubKeyPEM, peerId) {
    const challenge = this.challenges.get(nonce);
    if (!challenge) return { ok: false, reason: 'challenge_not_found' };
    if (Date.now() - challenge.timestamp > this.challengeTTL) {
      this.challenges.delete(nonce);
      return { ok: false, reason: 'challenge_expired' };
    }
    if (challenge.peerId !== peerId) {
      return { ok: false, reason: 'peer_mismatch' };
    }

    // Verify signature over nonce
    try {
      const { createPublicKey, verify } = await import('node:crypto');
      const pub = createPublicKey({ key: pubKeyPEM });
      const ok = verify(null, Buffer.from(nonce, 'hex'), pub, Buffer.from(signature, 'base64url'));
      this.challenges.delete(nonce); // consume challenge
      if (ok) {
        const key_id = await keyIdFromPubPEM(pubKeyPEM);
        return { ok: true, key_id };
      }
      return { ok: false, reason: 'invalid_signature' };
    } catch (err) {
      return { ok: false, reason: 'verify_error', error: err.message };
    }
  }

  cleanupExpiredChallenges() {
    const now = Date.now();
    for (const [nonce, challenge] of this.challenges.entries()) {
      if (now - challenge.timestamp > this.challengeTTL) {
        this.challenges.delete(nonce);
      }
    }
  }
}
