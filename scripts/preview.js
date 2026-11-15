'use strict'

const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')
const createPlugin = require('../index')
const port = Number(process.env.PORT || 18747)
const routes = new Map()
let callback
const app = {
  error: console.error,
  setPluginError: console.error,
  setPluginStatus: console.log,
  registerResourceProvider() {},
  subscriptionmanager: {
    subscribe(spec, unsubscribes, error, onDelta) {
      callback = onDelta
      unsubscribes.push(() => { callback = null })
    }
  }
}
const plugin = createPlugin(app)
const router = {
  access() { return this },
  get(route, handler) { routes.set(route, handler) }
}
plugin.registerWithRouter(router)
plugin.start({ sources: ['demo-ais.AIVDO'] })
const sample = [
  { path: '', value: { mmsi: '123456789', name: 'DEMO VESSEL', communication: { callsignVhf: 'DEMO1' }, registrations: { imo: 'IMO 1234567' } } },
  { path: 'navigation.destination.commonName', value: 'SAMPLE HARBOUR' },
  { path: 'navigation.destination.eta', value: '2026-11-16T14:00:00Z' },
  { path: 'design.draft', value: { current: 1.8 } },
  { path: 'design.length', value: { overall: 14.5 } },
  { path: 'design.beam', value: 4.2 },
  { path: 'sensors.ais.fromBow', value: 8.1 },
  { path: 'sensors.ais.fromCenter', value: 0.3 },
  { path: 'navigation.state', value: 'under way sailing' },
  { path: 'design.aisShipType', value: { id: 36, name: 'Sailing' } },
  { path: 'navigation.datetime', value: '2026-11-15T10:00:00Z' },
  { path: 'navigation.position', value: { latitude: 50.7865, longitude: -1.2374 } },
  { path: 'navigation.speedOverGround', value: 2.42 },
  { path: 'navigation.courseOverGroundTrue', value: 2.3387 },
  { path: 'navigation.headingTrue', value: 2.3 },
  { path: 'navigation.rateOfTurn', value: 0.001 }
]
function emit() {
  callback?.({ updates: [{ $source: 'demo-ais.AIVDO', timestamp: new Date().toISOString(), values: sample }] })
}
emit()
const timer = setInterval(emit, 5000)
const files = new Map([
  ['/', ['index.html', 'text/html']], ['/index.html', ['index.html', 'text/html']],
  ['/app.mjs', ['app.mjs', 'text/javascript']], ['/style.css', ['style.css', 'text/css']],
  ['/icon.svg', ['icon.svg', 'image/svg+xml']]
])
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname
  if (req.method === 'GET' && files.has(pathname)) {
    const [file, type] = files.get(pathname)
    res.writeHead(200, { 'Content-Type': type })
    fs.createReadStream(path.join(__dirname, '../public', file)).pipe(res)
    return
  }
  const route = pathname.replace(/^\/plugins\/signalk-s2k-display/, '')
  if (req.method !== 'GET' || !routes.has(route)) { res.writeHead(404); res.end('Not found'); return }
  res.set = (name, value) => { res.setHeader(name, value); return res }
  res.json = value => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(value)); return res }
  routes.get(route)(req, res)
})
server.on('error', error => { console.error(error); process.exitCode = 1; clearInterval(timer) })
server.listen(port, '127.0.0.1', () => console.log(`Mock preview: http://127.0.0.1:${port}/ (not connected to a vessel)`))
function stop() { clearInterval(timer); plugin.stop(); server.close() }
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
