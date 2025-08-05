#!/usr/bin/env node

// SGN-POC Launcher
import { spawn } from 'child_process'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

console.log('🚀 SGN-POC - Secure Gossip Network')
console.log('📡 Starting demonstration...')
console.log('')

// Launch the main SGN demo
const sgnProcess = spawn('node', [join(__dirname, 'src', 'sgn-poc.mjs')], {
  stdio: 'inherit',
  cwd: __dirname
})

sgnProcess.on('error', (error) => {
  console.error('❌ Failed to start SGN-POC:', error.message)
  process.exit(1)
})

sgnProcess.on('close', (code) => {
  console.log(`\n🔚 SGN-POC exited with code ${code}`)
  process.exit(code)
})

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down SGN-POC...')
  sgnProcess.kill('SIGINT')
})
