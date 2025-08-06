import crypto from 'crypto';

/**
 * Generate Ed25519 key pair
 * @returns {Object} { publicKey, privateKey } in PEM format
 */
export function generateKeyPair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  return {
    publicKey: publicKey.export({ type: 'spki', format: 'pem' }),
    privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' })
  };
}

/**
 * Sign message with Ed25519 private key
 * @param {string|Buffer} message 
 * @param {string} privateKeyPem 
 * @returns {string} signature in hex format
 */
export function signMessage(message, privateKeyPem) {
  const privateKey = crypto.createPrivateKey({
    key: privateKeyPem,
    format: 'pem',
    type: 'pkcs8'
  });
  
  const signature = crypto.sign(null, Buffer.from(message), privateKey);
  return signature.toString('hex');
}

/**
 * Verify signature with Ed25519 public key
 * @param {string|Buffer} message 
 * @param {string} signatureHex 
 * @param {string} publicKeyPem 
 * @returns {boolean}
 */
export function verifySignature(message, signatureHex, publicKeyPem) {
  const publicKey = crypto.createPublicKey({
    key: publicKeyPem,
    format: 'pem',
    type: 'spki'
  });
  
  return crypto.verify(
    null, 
    Buffer.from(message), 
    publicKey, 
    Buffer.from(signatureHex, 'hex')
  );
}