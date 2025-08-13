import KnowledgeUnit, { KU_TYPES, SEVERITY_LEVELS } from '../src/knowledge-unit.mjs';

// Test persistence functionality
async function testPersistence() {
  console.log('Starting persistence tests...');
  
  try {
    // Create a sample KU
    const sampleKU = KnowledgeUnit.createSample(KU_TYPES.SECURITY_VULNERABILITY);
    
    // Save to database
    console.log(`Saving KU: ${sampleKU.id}`);
    const saveResult = sampleKU.save();
    if (!saveResult) throw new Error('Save failed');
    
    // Load from database
    console.log(`Loading KU: ${sampleKU.id}`);
    const loadedKU = KnowledgeUnit.load(sampleKU.id);
    if (!loadedKU) throw new Error('Load failed');
    
    // Verify loaded data matches original
    console.log('Verifying loaded data...');
    const originalJSON = JSON.stringify(sampleKU.toJSON(), null, 2);
    const loadedJSON = JSON.stringify(loadedKU.toJSON(), null, 2);
    
    if (originalJSON !== loadedJSON) {
      console.error('Loaded KU does not match original!');
      console.log('Original:', originalJSON);
      console.log('Loaded:', loadedJSON);
      throw new Error('Data mismatch');
    }
    
    console.log('Persistence test passed!');
    return true;
  } catch (error) {
    console.error('Persistence test failed:', error.message);
    return false;
  }
}

// Run the test
testPersistence();