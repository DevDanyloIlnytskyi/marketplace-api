#!/usr/bin/env node
/**
 * Print SHA-256 keyHash for config/api-keys.json (store hash, not plaintext key).
 * Usage: node api/scripts/hash-api-key.js "your-secret-key"
 */
const { hashApiKey } = require('../shared/auth/api-keys');

const key = process.argv[2];
if (!key) {
  console.error('Usage: node api/scripts/hash-api-key.js "<api-key>"');
  process.exit(1);
}

console.log(hashApiKey(key));
