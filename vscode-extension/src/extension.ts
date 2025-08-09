import * as vscode from 'vscode'
import http from 'node:http'

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

  context.subscriptions.push(
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
    })
  )
}

export function deactivate() {}

