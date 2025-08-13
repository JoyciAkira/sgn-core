#!/usr/bin/env node
import { TrustManager } from '../trust/trust-manager.mjs'

const trustManager = new TrustManager('./trust.json')

async function main() {
  const args = process.argv.slice(2)
  const command = args[0]
  
  try {
    switch (command) {
      case 'add': {
        const keyId = args[1]
        const expiresAt = args.find(arg => arg.startsWith('--expires='))?.split('=')[1]
        if (!keyId) {
          console.error('Usage: trust-cli add <key_id> [--expires=2025-12-31T23:59:59Z]')
          process.exit(1)
        }
        await trustManager.addKey(keyId, expiresAt ? { expires_at: expiresAt } : {})
        console.log(`✅ Added key ${keyId} to allowlist`)
        if (expiresAt) console.log(`   Expires: ${expiresAt}`)
        break
      }
      
      case 'revoke': {
        const keyId = args[1]
        const reason = args.find(arg => arg.startsWith('--reason='))?.split('=')[1] || 'revoked'
        if (!keyId) {
          console.error('Usage: trust-cli revoke <key_id> [--reason=compromised]')
          process.exit(1)
        }
        await trustManager.revokeKey(keyId, reason)
        console.log(`❌ Revoked key ${keyId} (reason: ${reason})`)
        break
      }
      
      case 'expire': {
        const keyId = args[1]
        const expiresAt = args[2]
        if (!keyId || !expiresAt) {
          console.error('Usage: trust-cli expire <key_id> <expires_at>')
          console.error('Example: trust-cli expire bafkrei... 2025-12-31T23:59:59Z')
          process.exit(1)
        }
        await trustManager.setExpiry(keyId, expiresAt)
        console.log(`⏰ Set expiry for key ${keyId}: ${expiresAt}`)
        break
      }
      
      case 'status': {
        const keyId = args[1]
        if (!keyId) {
          console.error('Usage: trust-cli status <key_id>')
          process.exit(1)
        }
        const result = await trustManager.isKeyTrusted(keyId)
        console.log(`Key ${keyId}:`)
        console.log(`  Trusted: ${result.trusted}`)
        if (!result.trusted) console.log(`  Reason: ${result.reason}`)
        break
      }
      
      case 'list': {
        const config = await trustManager.getConfig()
        console.log('Trust Configuration:')
        console.log(`  Mode: ${config.mode}`)
        console.log(`  Allowed keys: ${config.allow.length}`)
        config.allow.forEach(keyId => {
          const keyInfo = config.keys[keyId]
          let status = '✅ active'
          if (keyInfo?.expires_at) {
            const expired = new Date(keyInfo.expires_at).getTime() < Date.now()
            status = expired ? '⏰ expired' : `⏰ expires ${keyInfo.expires_at}`
          }
          console.log(`    ${keyId} - ${status}`)
        })
        console.log(`  Revoked keys: ${config.revoke.length}`)
        config.revoke.forEach(keyId => {
          const reason = config.keys[keyId]?.reason || 'revoked'
          console.log(`    ${keyId} - ❌ ${reason}`)
        })
        break
      }
      
      case 'reload': {
        await trustManager.reload()
        console.log('🔄 Trust configuration reloaded')
        break
      }
      
      default:
        console.log('SGN Trust CLI')
        console.log('Commands:')
        console.log('  add <key_id> [--expires=ISO_DATE]  - Add key to allowlist')
        console.log('  revoke <key_id> [--reason=TEXT]    - Revoke key')
        console.log('  expire <key_id> <expires_at>       - Set key expiry')
        console.log('  status <key_id>                    - Check key trust status')
        console.log('  list                               - List all keys')
        console.log('  reload                             - Reload configuration')
        process.exit(command ? 1 : 0)
    }
  } catch (error) {
    console.error(`❌ Error: ${error.message}`)
    process.exit(1)
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}
