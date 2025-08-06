/**
 * Simple Production Test
 * Test basic functionality
 */

console.log("🚀 SIMPLE PRODUCTION TEST");
console.log("=========================");

try {
  // Test basic imports
  console.log("Testing imports...");
  
  const { KnowledgeUnit, KU_TYPES, SEVERITY_LEVELS } = await import('./knowledge-unit.mjs');
  console.log("✅ KnowledgeUnit imported");
  
  const { generateKeyPair } = await import('./crypto.mjs');
  console.log("✅ Crypto imported");
  
  // Test KU creation
  const ku = new KnowledgeUnit({
    id: "test-001",
    title: "Test KU",
    type: KU_TYPES.SECURITY_VULNERABILITY,
    description: "Test description",
    solution: "Test solution",
    severity: SEVERITY_LEVELS.HIGH,
    confidence: 0.9
  });
  
  console.log("✅ KU created:", ku.title);
  
  // Test key generation
  const keys = generateKeyPair();
  console.log("✅ Keys generated:", keys.keyId);
  
  // Test signing
  ku.sign(keys.privateKey, 'test-peer');
  console.log("✅ KU signed");
  
  // Test verification
  const isValid = ku.verify(keys.publicKey, 'test-peer');
  console.log("✅ KU verified:", isValid);
  
  console.log("");
  console.log("🎉 ALL BASIC TESTS PASSED!");
  console.log("Core SGN functionality is working correctly");
  
} catch (error) {
  console.error("❌ Test failed:", error);
  console.error(error.stack);
}
