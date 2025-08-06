import assert from 'assert';
import { KnowledgeUnit } from '../src/knowledge-unit.mjs';
import { generateKeyPair, signMessage, verifySignature } from '../src/crypto.mjs';

describe('Digital Signature Verification', () => {
  let keyPair;
  let ku;

  before(() => {
    // Generate key pair for tests
    keyPair = generateKeyPair();
    
    // Create sample knowledge unit
    ku = KnowledgeUnit.createSample();
    ku.calculateHash(); // Ensure hash is calculated
  });

  it('should generate valid Ed25519 key pair', () => {
    assert.ok(keyPair.publicKey);
    assert.ok(keyPair.privateKey);
    assert(keyPair.publicKey.includes('-----BEGIN PUBLIC KEY-----'));
    assert(keyPair.privateKey.includes('-----BEGIN PRIVATE KEY-----'));
  });

  it('should sign a knowledge unit and verify signature', () => {
    // Sign the KU
    const signature = ku.sign(keyPair.privateKey);
    assert.ok(signature);
    
    // Verify the signature
    const isValid = ku.verify(keyPair.publicKey);
    assert.strictEqual(isValid, true);
  });

  it('should detect invalid signature when KU is tampered', () => {
    // Sign the original KU
    ku.sign(keyPair.privateKey);
    
    // Tamper with the KU content
    const originalTitle = ku.title;
    ku.title = 'Modified Title';
    ku.calculateHash(); // Recalculate hash after modification
    
    // Verify should fail
    const isValid = ku.verify(keyPair.publicKey);
    assert.strictEqual(isValid, false);
    
    // Restore original title
    ku.title = originalTitle;
    ku.calculateHash();
  });

  it('should detect invalid signature with wrong public key', () => {
    // Sign the KU
    ku.sign(keyPair.privateKey);
    
    // Generate a different key pair
    const wrongKeyPair = generateKeyPair();
    
    // Verify with wrong public key
    const isValid = ku.verify(wrongKeyPair.publicKey);
    assert.strictEqual(isValid, false);
  });

  it('should fail verification when no signature exists', () => {
    // Create a new KU without signature
    const unsignedKu = KnowledgeUnit.createSample();
    unsignedKu.calculateHash();
    
    // Attempt verification
    const isValid = unsignedKu.verify(keyPair.publicKey);
    assert.strictEqual(isValid, false);
  });

  it('should correctly sign and verify using direct crypto functions', () => {
    const message = 'Test message';
    const signature = signMessage(message, keyPair.privateKey);
    const isValid = verifySignature(message, signature, keyPair.publicKey);
    assert.strictEqual(isValid, true);
  });
});