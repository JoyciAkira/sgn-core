/**
 * KU Schema v0 (JSON)
 * Minimal schema for PatchGraph & Migrations, JSON-LD ready (future PROV).
 */

export const KU_TYPES = {
  PATCH_MIGRATION: 'ku.patch.migration',
  NOTE: 'ku.note',
  TEST: 'ku.test'
};

// Very light runtime validation
export function validateKU(ku) {
  const errors = [];
  if (!ku) errors.push('KU is null');
  if (!ku.type) errors.push('Missing type');
  if (!ku.payload) errors.push('Missing payload');
  if (!ku.schema_id) errors.push('Missing schema_id');
  if (!ku.provenance) errors.push('Missing provenance');
  if (!ku.signatures) errors.push('Missing signatures array (can be empty before signing)');
  if (!Array.isArray(ku.signatures)) errors.push('signatures must be an array');
  if (!Array.isArray(ku.sources)) errors.push('sources must be an array');
  if (!Array.isArray(ku.tests)) errors.push('tests must be an array');
  return { valid: errors.length === 0, errors };
}

export function canonicalizeKU(ku) {
  // Deterministic JSON string (stable key order):
  // We avoid custom canonicalization libs; serialize select fields in a fixed order.
  const ordered = {
    schema_id: ku.schema_id,
    type: ku.type,
    content_type: ku.content_type || 'application/json',
    payload: ku.payload || {},
    parents: ku.parents || [],
    sources: ku.sources || [],
    tests: ku.tests || [],
    provenance: ku.provenance || {},
    tags: ku.tags || []
  };
  return JSON.stringify(ordered);
}

