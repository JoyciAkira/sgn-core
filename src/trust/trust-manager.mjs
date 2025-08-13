import { readFileSync, existsSync, writeFileSync } from 'node:fs'
import { verifyKU_v1 } from '../ku/sign_v1.mjs'

export class TrustManager {
  constructor(trustPath = './trust.json') {
    this.trustPath = trustPath
    this.config = null
    this.lastModified = 0
  }

  async load() {
    try {
      if (!existsSync(this.trustPath)) {
        this.config = { mode: 'warn', allow: [], revoke: [], keys: {} }
        return this.config
      }
      
      const { statSync } = await import('node:fs')
      const stat = statSync(this.trustPath)
      if (stat.mtime.getTime() === this.lastModified) {
        return this.config // cached
      }
      
      const content = readFileSync(this.trustPath, 'utf8')
      this.config = JSON.parse(content)
      this.lastModified = stat.mtime.getTime()
      
      // Ensure required fields
      this.config.mode = this.config.mode || 'warn'
      this.config.allow = this.config.allow || []
      this.config.revoke = this.config.revoke || []
      this.config.keys = this.config.keys || {}
      
      return this.config
    } catch (error) {
      console.warn(`Failed to load trust config: ${error.message}`)
      return { mode: 'warn', allow: [], revoke: [], keys: {} }
    }
  }

  save() {
    try {
      writeFileSync(this.trustPath, JSON.stringify(this.config, null, 2))
      this.lastModified = Date.now()
    } catch (error) {
      throw new Error(`Failed to save trust config: ${error.message}`)
    }
  }

  async addKey(keyId, options = {}) {
    const config = await this.load()
    if (!config.allow.includes(keyId)) {
      config.allow.push(keyId)
    }
    if (options.expires_at) {
      config.keys[keyId] = { expires_at: options.expires_at }
    }
    this.config = config
    this.save()
  }

  async revokeKey(keyId, reason = 'revoked') {
    const config = await this.load()
    if (!config.revoke.includes(keyId)) {
      config.revoke.push(keyId)
    }
    // Remove from allow list
    config.allow = config.allow.filter(k => k !== keyId)
    // Add revocation reason
    config.keys[keyId] = { ...config.keys[keyId], revoked: true, reason }
    this.config = config
    this.save()
  }

  async setExpiry(keyId, expiresAt) {
    const config = await this.load()
    config.keys[keyId] = { ...config.keys[keyId], expires_at: expiresAt }
    this.config = config
    this.save()
  }

  async isKeyTrusted(keyId) {
    const config = await this.load()
    
    // Check revocation
    if (config.revoke.includes(keyId)) {
      return { trusted: false, reason: 'revoked' }
    }
    
    // Check expiry
    const keyInfo = config.keys[keyId]
    if (keyInfo?.expires_at) {
      const expiryTime = new Date(keyInfo.expires_at).getTime()
      if (Date.now() > expiryTime) {
        return { trusted: false, reason: 'expired' }
      }
    }
    
    // Check allowlist (only in enforce mode)
    if (config.mode === 'enforce') {
      if (!config.allow.includes(keyId)) {
        return { trusted: false, reason: 'not_in_allowlist' }
      }
    }
    
    return { trusted: true }
  }

  async processAttestationKU(ku, pubPem) {
    // Verify this is an attestation KU
    if (ku.type !== 'ku.attestation.rotate_key') {
      throw new Error('Not an attestation KU')
    }
    
    const { prev_key_id, new_key_id, reason, ts, prev_sig } = ku.payload
    if (!prev_key_id || !new_key_id || !prev_sig) {
      throw new Error('Invalid attestation payload')
    }
    
    // Verify the attestation is signed by the previous key
    const attestationData = { prev_key_id, new_key_id, reason, ts }
    const attestationKU = {
      ...ku,
      payload: attestationData,
      sig: prev_sig
    }
    
    const verification = await verifyKU_v1(attestationKU, pubPem)
    if (!verification.ok) {
      throw new Error('Invalid attestation signature')
    }
    
    // Check if prev_key is trusted
    const prevTrust = await this.isKeyTrusted(prev_key_id)
    if (!prevTrust.trusted) {
      throw new Error(`Previous key not trusted: ${prevTrust.reason}`)
    }

    // Add new key to allowlist
    await this.addKey(new_key_id)

    // Optionally revoke old key (if reason indicates compromise)
    if (reason === 'compromised') {
      await this.revokeKey(prev_key_id, 'rotated_due_to_compromise')
    }
    
    return { success: true, new_key_id, prev_key_id }
  }

  async getConfig() {
    return await this.load()
  }

  async reload() {
    this.lastModified = 0 // Force reload
    return await this.load()
  }
}
