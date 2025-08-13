import * as vscode from 'vscode'
import http from 'node:http'
import WebSocket from 'ws'

function postJSON(urlStr: string, body: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr)
    const data = Buffer.from(JSON.stringify(body))
    const req = http.request({ method: 'POST', hostname: u.hostname, port: u.port, path: u.pathname + u.search, headers: { 'content-type': 'application/json', 'content-length': data.length } }, res => {
      const chunks: Buffer[] = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))) } catch (e) { reject(e) }
      })
    })
    req.on('error', reject); req.write(data); req.end()
  })
}

function getJSON(urlStr: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr)
    const req = http.request({ method: 'GET', hostname: u.hostname, port: u.port, path: u.pathname + u.search }, res => {
      const chunks: Buffer[] = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))) } catch (e) { reject(e) }
      })
    }); req.on('error', reject); req.end()
  })
}

export function activate(context: vscode.ExtensionContext) {
  const out = vscode.window.createOutputChannel('SGN')
  const cfg = () => vscode.workspace.getConfiguration().get<string>('sgn.daemonUrl') || 'http://localhost:8787'
  
  // Status bar item
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100)
  statusBar.command = 'sgn.quickActions'
  statusBar.text = '$(broadcast) SGN • connecting…'
  statusBar.tooltip = 'SGN Status - Click for quick actions'
  statusBar.show()
  
  // State tracking
  let isConnected = false
  let wsClients = 0
  let lastKU: { cid: string, timestamp: number } | null = null
  let currentWS: WebSocket | null = null

  // Update status bar
  function updateStatusBar() {
    if (isConnected) {
      statusBar.text = '$(broadcast) SGN • live'
      const endpoint = cfg().replace(/^http/, 'ws') + (vscode.workspace.getConfiguration().get<string>('sgn.eventsPath') || '/events')
      const lastKUText = lastKU ? `Last KU: ${lastKU.cid.slice(0, 12)}... (${new Date(lastKU.timestamp).toLocaleTimeString()})` : 'No KUs received'
      statusBar.tooltip = `SGN Status: Connected\nEndpoint: ${endpoint}\nWS Clients: ${wsClients}\n${lastKUText}\n\nClick for quick actions`
    } else {
      statusBar.text = '$(warning) SGN • off'
      statusBar.tooltip = 'SGN Status: Disconnected\nClick to retry connection'
    }
  }

  async function handleKUAction(action: string | undefined, cid: string, base: string) {
    if (!action) return
    
    switch (action) {
      case 'Open (dag-json)':
        const openInDagJson = vscode.workspace.getConfiguration().get<boolean>('sgn.openInDagJson') ?? true
        const url = openInDagJson ? `${base}/ku/${cid}?view=dag-json` : `${base}/ku/${cid}`
        vscode.env.openExternal(vscode.Uri.parse(url))
        break
      case 'Verify':
        try {
          const res = await postJSON(`${base}/verify`, { ku: { cid }, pub_pem: '' })
          const trusted = res.trusted ? ' (trusted)' : ''
          const reason = res.reason ? ` - ${res.reason}` : ''
          vscode.window.showInformationMessage(`Verify: ${res.ok ? 'OK' : 'FAIL'}${trusted}${reason}`)
        } catch (e: any) {
          vscode.window.showErrorMessage('Verify error: ' + (e?.message || e))
        }
        break
      case 'Copy CID':
        vscode.env.clipboard.writeText(cid)
        vscode.window.showInformationMessage(`Copied CID: ${cid}`)
        break
    }
  }

  // Subscribe to /events WS with backoff and jitter
  let reconnectAttempts = 0
  
  function connectEvents() {
    const base = cfg()
    const path = vscode.workspace.getConfiguration().get<string>('sgn.eventsPath') || '/events'
    const bearer = vscode.workspace.getConfiguration().get<string>('sgn.eventsBearer')
    const url = base.replace(/^http/, 'ws') + path
    
    const headers: any = {}
    if (bearer) {
      headers.Authorization = `Bearer ${bearer}`
    }
    
    const ws = new WebSocket(url, { headers })
    currentWS = ws
    
    ws.on('open', async () => {
      isConnected = true
      reconnectAttempts = 0
      updateStatusBar()
      out.appendLine(`[events] connected ${url}`)
      
      // Get current WS client count
      try {
        const health = await getJSON(`${base}/health`)
        wsClients = health.ws_clients || 0
        updateStatusBar()
      } catch {}
    })
    
    ws.on('message', async (data) => {
      try {
        const msg = JSON.parse(String(data))
        if (msg.type === 'ku' && msg.cid) {
          lastKU = { cid: msg.cid, timestamp: Date.now() }
          updateStatusBar()
          
          try { ws.send(JSON.stringify({ type: 'ack', cid: msg.cid })) } catch {}
          
          const showToasts = vscode.workspace.getConfiguration().get<boolean>('sgn.showToasts') ?? true
          if (showToasts) {
            const pick = await vscode.window.showInformationMessage(
              `KU ricevuta ${msg.cid}`, 
              'Open (dag-json)', 
              'Verify', 
              'Copy CID'
            )
            await handleKUAction(pick, msg.cid, base)
          }
          
          out.appendLine(`[ku] received ${msg.cid}`)
        }
      } catch (e) {
        out.appendLine(`[events] message error: ${e}`)
      }
    })
    
    ws.on('close', () => {
      isConnected = false
      currentWS = null
      updateStatusBar()
      out.appendLine(`[events] disconnected`)
      scheduleReconnect()
    })
    
    ws.on('error', (err) => {
      isConnected = false
      currentWS = null
      updateStatusBar()
      out.appendLine(`[events] error: ${err.message}`)
      scheduleReconnect()
    })
  }
  
  function scheduleReconnect() {
    reconnectAttempts++
    // Backoff with jitter: 1.0-2.5s base, exponential up to 30s
    const baseDelay = Math.min(1000 * Math.pow(1.5, reconnectAttempts - 1), 30000)
    const jitter = Math.random() * 1500 + 1000 // 1.0-2.5s jitter
    const delay = Math.min(baseDelay + jitter, 30000)
    
    setTimeout(connectEvents, delay)
  }

  context.subscriptions.push(
    statusBar,
    
    vscode.commands.registerCommand('sgn.quickActions', async () => {
      if (!lastKU) {
        vscode.window.showInformationMessage('No KU received yet')
        return
      }
      
      const choice = await vscode.window.showQuickPick([
        { label: 'Open (dag-json)', id: 'open', description: `Open ${lastKU.cid.slice(0, 12)}... in browser` },
        { label: 'Verify', id: 'verify', description: `Verify ${lastKU.cid.slice(0, 12)}... with daemon` },
        { label: 'Copy CID', id: 'copy', description: `Copy ${lastKU.cid} to clipboard` }
      ], { placeHolder: 'Choose action for latest KU' })
      
      if (!choice) return
      
      switch (choice.id) {
        case 'open':
          vscode.env.openExternal(vscode.Uri.parse(`${cfg()}/ku/${lastKU.cid}?view=dag-json`))
          break
        case 'verify':
          try {
            const res = await postJSON(`${cfg()}/verify`, { ku: { cid: lastKU.cid }, pub_pem: '' })
            const trusted = res.trusted ? ' (trusted)' : ''
            const reason = res.reason ? ` - ${res.reason}` : ''
            vscode.window.showInformationMessage(`Verify: ${res.ok ? 'OK' : 'FAIL'}${trusted}${reason}`)
          } catch (e: any) {
            vscode.window.showErrorMessage('Verify error: ' + (e?.message || e))
          }
          break
        case 'copy':
          vscode.env.clipboard.writeText(lastKU.cid)
          vscode.window.showInformationMessage(`Copied CID: ${lastKU.cid}`)
          break
      }
    }),
    
    vscode.commands.registerCommand('sgn.publishActiveFileAsKU', async () => {
      const ed = vscode.window.activeTextEditor
      if (!ed) return
      let ku: any
      try { ku = JSON.parse(ed.document.getText()) } catch { vscode.window.showErrorMessage('Active file is not valid JSON'); return }
      const url = cfg() + '/publish'
      const res = await postJSON(url, { ku, verify: true, pub_pem: '' })
      if ((res as any).error) { vscode.window.showErrorMessage('Publish failed: ' + (res as any).error) }
      else { vscode.window.showInformationMessage('Published CID ' + (res as any).cid); out.appendLine('[publish] ' + JSON.stringify(res)) }
    }),

    vscode.commands.registerCommand('sgn.verifyActiveFileKU', async () => {
      const ed = vscode.window.activeTextEditor
      if (!ed) return
      let ku: any
      try { ku = JSON.parse(ed.document.getText()) } catch { vscode.window.showErrorMessage('Active file is not valid JSON'); return }
      const url = cfg() + '/verify'
      const res = await postJSON(url, { ku, pub_pem: '' })
      if (!(res as any).ok) vscode.window.showErrorMessage('Verify FAIL: ' + ((res as any).reason || 'unknown'))
      else vscode.window.showInformationMessage('Verify OK' + ((res as any).trusted ? ' (trusted)' : ''))
      out.appendLine('[verify] ' + JSON.stringify(res))
    }),

    vscode.commands.registerCommand('sgn.openDaemonHealth', async () => {
      const res = await getJSON(cfg() + '/health')
      vscode.window.showInformationMessage(`SGN health: KUs=${(res as any).ku_count}, outbox=${(res as any).outbox_ready}`)
      out.appendLine('[health] ' + JSON.stringify(res))
    }),
    
    // Quick commands (7.4)
    vscode.commands.registerCommand('sgn.copyLatestKUCID', async () => {
      if (!lastKU) {
        vscode.window.showInformationMessage('No KU received yet')
        return
      }
      vscode.env.clipboard.writeText(lastKU.cid)
      vscode.window.showInformationMessage(`Copied CID: ${lastKU.cid}`)
    }),
    
    vscode.commands.registerCommand('sgn.verifyLatestKU', async () => {
      if (!lastKU) {
        vscode.window.showInformationMessage('No KU received yet')
        return
      }
      try {
        const res = await postJSON(`${cfg()}/verify`, { ku: { cid: lastKU.cid }, pub_pem: '' })
        const trusted = res.trusted ? ' (trusted)' : ''
        const reason = res.reason ? ` - ${res.reason}` : ''
        vscode.window.showInformationMessage(`Verify: ${res.ok ? 'OK' : 'FAIL'}${trusted}${reason}`)
      } catch (e: any) {
        vscode.window.showErrorMessage('Verify error: ' + (e?.message || e))
      }
    }),
    
    vscode.commands.registerCommand('sgn.openLatestKU', async () => {
      if (!lastKU) {
        vscode.window.showInformationMessage('No KU received yet')
        return
      }
      const openInDagJson = vscode.workspace.getConfiguration().get<boolean>('sgn.openInDagJson') ?? true
      const url = openInDagJson ? `${cfg()}/ku/${lastKU.cid}?view=dag-json` : `${cfg()}/ku/${lastKU.cid}`
      vscode.env.openExternal(vscode.Uri.parse(url))
    })
  )

  // Start WebSocket connection
  connectEvents()
}

export function deactivate() {}
