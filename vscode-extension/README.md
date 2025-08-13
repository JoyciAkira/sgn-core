# SGN VSCode Extension — Realtime via /events

## Cosa fa
- Si connette al daemon SGN via WebSocket `ws://…/events`.
- Riceve notifiche KU in tempo reale.
- Invia ACK immediato (per aggiornare i KPI di delivery/acked).
- Mostra un toast con pulsanti Open (vista dag-json) e Verify.
- ⚠️ L’estensione non gestisce chiavi private; non firma nulla (pilot-safe).

## Requisiti
Daemon SGN in esecuzione:

```bash
npm run daemon:start
curl -s http://localhost:8787/health
```

VSCode ≥ 1.84

## Configurazione
Impostazioni (Settings → Extensions → SGN):
- `sgn.daemonUrl` (default: `http://localhost:8787`)
- `sgn.eventsPath` (default: `/events`)
- `sgn.eventsBearer` (optional: Bearer token for WebSocket auth)
- `sgn.showToasts` (default: `true` - Show toast notifications for KUs)
- `sgn.openInDagJson` (default: `true` - Open KUs in DAG-JSON view)
- `sgn.verifyOnOpen` (default: `false` - Auto-verify KUs when opening)

## Uso

### Status Bar
- **$(broadcast) SGN • live**: Connesso, click per quick actions
- **$(warning) SGN • off**: Disconnesso, click per riconnettere
- Tooltip mostra endpoint, WS clients, ultimo KU ricevuto

### Toast Notifications
1. Apri VSCode con l’estensione attiva.
2. Sottoscrizione automatica a `ws://<daemon>/events`.
3. Quando arriva una KU:
   - L’estensione ACKa subito: `{ "type":"ack", "cid": ... }`
   - Appare un toast (se `sgn.showToasts` = true):
     - **Open (dag-json)** → apre `GET /ku/:cid?view=dag-json`
     - **Verify** → chiama `POST /verify` e mostra risultato
     - **Copy CID** → copia CID negli appunti

### Quick Commands
- **SGN: Copy Latest KU CID** - Copia CID dell'ultimo KU ricevuto
- **SGN: Verify Latest KU** - Verifica l'ultimo KU ricevuto
- **SGN: Open Latest KU (dag-json)** - Apre l'ultimo KU nel browser

Per testare rapidamente:

```bash
# in un terminale
npm run daemon:start

# in un altro terminale
node -e "const fs=require('fs');const ku={type:'ku.patch',schema_id:'ku.v1',payload:{title:'hello'},parents:[],sources:[],tests:[],provenance:{agent_pubkey:null},tags:[]}; \
fetch('http://localhost:8787/publish',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({ku,verify:false})}).then(r=>r.json()).then(console.log)"
```

## Screenshot
Aggiungi uno screenshot o una GIF qui (consigliato 800×450).
Percorsi suggeriti:
- `vscode-extension/assets/events-toast.png`
- `vscode-extension/assets/events-open-verify.gif`

Esempio nel markdown:

```md
![Realtime toast](./assets/events-toast.png)
```

## Troubleshooting
- Toast non arriva / nessuna KU in tempo reale
  - Verifica: `curl -s http://localhost:8787/metrics?format=prom | awk '/sgn_ws_clients|sgn_net_delivered|sgn_net_acked/'`
  - Controlla “SGN” nell’Output panel (View → Output → SGN).
- ECONNREFUSED: il daemon non è su quella porta/host. Prova `npm run daemon:health`.
- Lag o “perdita” health: è normale sotto backpressure (token bucket 10/s, burst 20). Le KU non vengono droppate, solo gli health.
- Self-signed cert (WSS): usa http://… in locale o configura `NODE_TLS_REJECT_UNAUTHORIZED=0` solo in dev.

## Comandi inclusi

### Comandi base
- **SGN: Publish Active KU** → `POST /publish`
- **SGN: Verify Active KU** → `POST /verify`
- **SGN: Open Daemon Health** → `GET /health`

### Quick Actions (nuovi)
- **SGN: Quick Actions** → Menu rapido per ultimo KU ricevuto
- **SGN: Copy Latest KU CID** → Copia CID negli appunti
- **SGN: Verify Latest KU** → Verifica ultimo KU
- **SGN: Open Latest KU (dag-json)** → Apre ultimo KU nel browser

## Sicurezza (pilot)
- Nessuna private key nel plugin.
- Verify usa soltanto `POST /verify` del daemon.
- Gestione trust via `trust.json` sul daemon (allowlist, enforce/warn).

## Sviluppo
```bash
cd sgn-poc/vscode-extension
npm i
npm run compile
# F5 per avviare una window Extension Development Host
```

