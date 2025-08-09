#!/usr/bin/env node
import fs from 'node:fs'
import crypto from 'node:crypto'

const args = Object.fromEntries(process.argv.slice(2).reduce((a,cur,i,arr)=>{
  if(cur.startsWith('--')) a.push([cur.slice(2), arr[i+1]]); return a
},[]))

const log = fs.readFileSync(args.log,'utf8')
const logHash = crypto.createHash('sha256').update(log).digest('hex')

const ku = {
  type: 'ku.receipt',
  schema_id: 'ku.v1',
  content_type: 'application/json',
  payload: {
    title: args.title || 'CI failure',
    description: `branch=${args.branch} commit=${args.commit}`,
    artifacts: [{ type:'test.log', sha256: logHash, path:'test.log' }],
    severity: 'MEDIUM',
    confidence: 0.95
  },
  sources: [{ type:'git', repo: process.env.GITHUB_REPOSITORY, commit: args.commit, branch: args.branch }],
  tests: [],
  parents: [],
  provenance: { agent_pubkey: null, created_at: new Date().toISOString() },
  tags: ['ci','receipt','test-fail']
}

fs.writeFileSync(args.out || './ku-receipt.json', JSON.stringify(ku,null,2))

