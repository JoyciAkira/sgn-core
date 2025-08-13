#!/usr/bin/env node
/**
 * Seed KUs from GitHub Issues/PRs
 *
 * Usage:
 *   GH_TOKEN=xxxx node scripts/seed-from-github.mjs owner/repo [owner/repo ...] \
 *     --daemon=http://localhost:8787 \
 *     --state=open --per=50 --max=100
 *
 * Env (alternatives):
 *   - GH_REPOS: comma-separated list of owner/repo (overrides CLI if set)
 *   - GH_TOKEN: GitHub Personal Access Token (required for private repos and higher rate limits)
 *   - SGN_DAEMON: Daemon base URL (default http://localhost:8787)
 */

// Load .env file if it exists
try {
  const fs = await import('fs');
  const envFile = fs.readFileSync('.env', 'utf8');
  envFile.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split('=');
    if (key && valueParts.length > 0 && !process.env[key]) {
      let value = valueParts.join('=').trim();
      // Remove quotes if present
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  });
} catch {}

const DAEMON = (process.env.SGN_DAEMON || 'http://localhost:8787').replace(/\/$/, '')
const GH_TOKEN = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || ''

if (!GH_TOKEN) {
  console.error('GH_TOKEN (or GITHUB_TOKEN) is required for seeding. Create one at https://github.com/settings/tokens')
  process.exit(1)
}

const args = process.argv.slice(2)
let repos = []
let state = 'open'
let per = 50
let maxTotal = 100
for (const a of args) {
  if (a.startsWith('--daemon=')) continue // handled by env or default
  else if (a.startsWith('--state=')) state = a.split('=')[1]
  else if (a.startsWith('--per=')) per = parseInt(a.split('=')[1] || '50', 10)
  else if (a.startsWith('--max=')) maxTotal = parseInt(a.split('=')[1] || '100', 10)
  else repos.push(a)
}
if (process.env.GH_REPOS) repos = process.env.GH_REPOS.split(',').map(s => s.trim()).filter(Boolean)
if (!repos.length) {
  console.error('No repositories provided. Pass owner/repo arguments or set GH_REPOS env.')
  process.exit(1)
}

const GITHUB_API = 'https://api.github.com'

async function ghFetch(path, params = {}) {
  const url = new URL(GITHUB_API + path)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const r = await fetch(url, {
    headers: {
      'authorization': `Bearer ${GH_TOKEN}`,
      'accept': 'application/vnd.github+json',
      'user-agent': 'sgn-seeder'
    }
  })
  if (!r.ok) {
    const t = await r.text().catch(() => '')
    throw new Error(`GitHub API ${url} -> ${r.status} ${r.statusText} ${t}`)
  }
  return r.json()
}

function mapIssueToKU(repoFullName, issue) {
  const isPR = !!issue.pull_request
  const typeTag = isPR ? 'github:pr' : 'github:issue'
  const labels = Array.isArray(issue.labels) ? issue.labels.map(l => (typeof l === 'string' ? l : l.name)).filter(Boolean) : []
  const tags = [typeTag, `repo:${repoFullName}`].concat(labels.map(l => `label:${l}`))
  const title = issue.title || '(no title)'
  const body = (issue.body || '').slice(0, 2000)
  const payload = {
    title, description: body,
    url: issue.html_url,
    number: issue.number,
    state: issue.state,
    author: issue.user?.login || null,
    created_at: issue.created_at,
    updated_at: issue.updated_at,
    labels
  }
  return {
    type: 'ku.patch',
    schema_id: 'ku.v1',
    payload,
    parents: [], sources: [{ type: 'github', url: issue.html_url }], tests: [],
    provenance: { agent_pubkey: null },
    tags
  }
}

async function jpostRetry(path, body, tries = 5) {
  const url = DAEMON + path
  let d = 150
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      if (r.status === 200 || r.status === 403) {
        const json = await r.json().catch(() => ({}))
        return { status: r.status, json }
      }
    } catch {}
    if (i < tries - 1) { await new Promise(r => setTimeout(r, d)); d = Math.min(1000, d * 1.6 + Math.random() * 50) }
  }
  throw new Error(`publish retry exhausted for ${url}`)
}

async function seedRepo(repoFullName) {
  const [owner, repo] = repoFullName.split('/')
  if (!owner || !repo) throw new Error(`Invalid repo: ${repoFullName}`)

  let page = 1
  let seeded = 0
  console.log(`📥 Seeding from ${repoFullName} (state=${state}, per=${per}, max=${maxTotal})`)
  while (seeded < maxTotal) {
    const items = await ghFetch(`/repos/${owner}/${repo}/issues`, { state, per_page: String(per), page: String(page) })
    if (!items.length) break
    for (const issue of items) {
      if (seeded >= maxTotal) break
      const ku = mapIssueToKU(repoFullName, issue)
      const res = await jpostRetry('/publish', { ku, verify: false })
      if (res.status === 200) seeded++
      const cid = res.json?.cid || 'n/a'
      console.log(`  • ${repoFullName}#${issue.number} -> ${res.status} cid=${cid}`)
    }
    page++
  }
  console.log(`✅ ${repoFullName}: seeded ${seeded} KUs`)
  return seeded
}

async function main() {
  const totals = []
  const t0 = Date.now()
  for (const r of repos) {
    try { totals.push(await seedRepo(r)) } catch (e) { console.error(`❌ ${r}: ${e.message}`) }
  }
  const sum = totals.reduce((a, b) => a + b, 0)
  const ms = Date.now() - t0
  console.log(`\n🎯 Seeding complete: ${sum} KUs in ${ms}ms (${(sum / (ms / 1000)).toFixed(1)} KU/s)`)
}

main().catch(e => { console.error(e); process.exit(1) })

