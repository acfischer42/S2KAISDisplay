export function format(value, kind) {
  if (value === null || value === undefined) return null
  if (kind === 'knots' && typeof value === 'object' && Number.isFinite(value.minimum)) return `≥ ${(value.minimum * 1.943844492).toFixed(1)} kn`
  if (kind === 'turn' && typeof value === 'object' && ['port', 'starboard'].includes(value.direction)) return `Over 5°/30 s to ${value.direction} (no turn indicator)`
  if (kind === 'eta' && typeof value === 'object') {
    const { month, day, hour, minute } = value
    if (![month, day, hour, minute].every(Number.isInteger)) return null
    const pad = number => String(number).padStart(2, '0')
    return `${pad(month)}-${pad(day)} ${pad(hour)}:${pad(minute)} UTC (year not sent)`
  }
  if (kind === 'eta') kind = 'date'
  if (kind === 'position') {
    if (!value || !Number.isFinite(value.latitude) || !Number.isFinite(value.longitude) || Math.abs(value.latitude) > 90 || Math.abs(value.longitude) > 180) return null
    const coordinate = (n, lat) => {
      const totalMinutes = Math.round(Math.abs(n) * 60000) / 1000
      const degrees = Math.floor(totalMinutes / 60)
      const minutes = (totalMinutes - degrees * 60).toFixed(3)
      return `${degrees}° ${minutes}′ ${lat ? (n < 0 ? 'S' : 'N') : (n < 0 ? 'W' : 'E')}`
    }
    return `${coordinate(value.latitude, true)} / ${coordinate(value.longitude, false)}`
  }
  if (kind === 'date') {
    if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) return null
    return `${new Date(value).toISOString().replace('T', ' ').slice(0, 19)} UTC`
  }
  if (kind === 'shipType') {
    if (typeof value !== 'object' || value === null) return null
    return [value.name, value.id].filter(item => item !== undefined && item !== null).join(' · ') || null
  }
  if (kind === 'text') return typeof value === 'string' || typeof value === 'number' ? String(value) : null
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  if (kind === 'knots') return `${(value * 1.943844492).toFixed(1)} kn`
  if (kind === 'angle') return `${(Math.round((((value * 180 / Math.PI) % 360 + 360) % 360) * 10) % 3600 / 10).toFixed(1)}°`
  if (kind === 'turn') return `${(value * 180 / Math.PI * 60).toFixed(1)}°/min`
  if (kind === 'metres') return `${value.toFixed(1)} m`
  return null
}

const vessel = [
  ['Destination', 'navigation.destination.commonName', 'text'], ['ETA', 'navigation.destination.eta', 'eta'],
  ['Passengers', 'passengers', 'count', 'inland'], ['Crew', 'crew', 'count', 'inland'],
  ['Other personnel', 'other', 'count', 'inland'], ['Navigation status', 'navigation.state', 'text'],
  ['Draught', 'design.draft.current', 'metres'],
  ['MMSI', 'mmsi', 'text'], ['Vessel name', 'name', 'text'],
  ['Call sign', 'communication.callsignVhf', 'text'], ['IMO number', 'registrations.imo', 'text'],
  ['Length', 'design.length.overall', 'metres'], ['Beam', 'design.beam', 'metres'],
  ['AIS antenna from bow', 'sensors.ais.fromBow', 'metres'], ['AIS antenna from centre', 'sensors.ais.fromCenter', 'metres'],
  ['Ship / cargo type', 'design.aisShipType', 'shipType']
]
const dynamic = [
  ['Date / time', 'navigation.datetime', 'date'], ['AIS UTC second / status', 'sensors.ais.utcSecond', 'text'],
  ['Position', 'navigation.position', 'position'],
  ['Speed over ground', 'navigation.speedOverGround', 'knots'], ['Course over ground', 'navigation.courseOverGroundTrue', 'angle'],
  ['Heading', 'navigation.headingTrue', 'angle'], ['Rate of turn', 'navigation.rateOfTurn', 'turn'],
  ['Position accuracy', 'sensors.ais.positionAccuracy', 'text'], ['RAIM status', 'sensors.ais.raim', 'text'], ['GNSS in use', null, 'text']
]

export function mount(document, { fetch: fetcher = globalThis.fetch, interval = globalThis.setInterval, clear = globalThis.clearInterval } = {}) {
  const byId = id => document.getElementById(id)
  let stopped = false
  let busy = false
  const containers = [[vessel, byId('vessel-fields')], [dynamic, byId('dynamic-fields')]]
  const elements = new Map()
  for (const [fields, container] of containers) {
    for (const [label, path, kind, category] of fields) {
      const box = document.createElement('div')
      box.className = 'field'
      const title = document.createElement('dt')
      title.textContent = label
      const value = document.createElement('dd')
      value.textContent = 'Not available'
      value.className = 'missing'
      box.append(title, value)
      container.append(box)
      elements.set(label, { value, path, kind, category, box })
    }
  }
  function show(page) {
    for (const name of ['vessel', 'dynamic']) {
      byId(`${name}-page`).hidden = name !== page
      byId(`${name}-tab`).setAttribute('aria-pressed', String(name === page))
    }
  }
  byId('vessel-tab').addEventListener('click', () => show('vessel'))
  byId('dynamic-tab').addEventListener('click', () => show('dynamic'))
  function render(state) {
    byId('version').textContent = `v${state.version}`
    byId('connection').textContent = state.running ? 'Server connected' : 'Plugin stopped'
    byId('indicator').classList.toggle('online', state.running)
    const warning = state.demo ? 'MOCK PREVIEW: sample data, not connected to a vessel.' : state.lastError || (!state.running ? 'Enable the plugin in Signal K Plugin Config.' : !state.aisReadback && !state.sources.length ? 'Configure the exact AIS source identifier in Signal K Plugin Config.' : '')
    byId('warning').textContent = warning
    byId('warning').hidden = !warning
    byId('source').textContent = state.aisReadback ? 'Direct own-vessel AIS input (AIVDO)' : state.sources.length ? `AIS sources: ${state.sources.join(', ')}` : 'AIS source not configured'
    let newest = 0
    for (const [label, { value, path, kind, category, box }] of elements) {
      box.hidden = category === 'inland' && !state.inlandMode
      const record = category === 'inland'
        ? state.inland && { value: state.inland[path], source: state.inland.source, timestamp: state.inland.timestamp }
        : state.records[path]
      const text = record ? format(record.value, kind === 'count' ? 'text' : kind) : null
      const age = record ? Date.now() - Date.parse(record.timestamp) : 0
      const old = ((dynamic.some(([name]) => name === label) || (path === 'navigation.state' && state.aisReadback)) && age > 180000) ||
        ((category === 'inland' || record?.source.endsWith('(AIVDO type 5)')) && age > 1800000)
      value.textContent = text === null ? 'Not available' : `${text}${old ? ' · outdated' : ''}`
      value.className = text === null ? 'missing' : ''
      value.title = record ? `${record.source} · ${record.timestamp}` : ''
      if (record && Number.isFinite(Date.parse(record.timestamp))) newest = Math.max(newest, Date.parse(record.timestamp))
    }
    byId('updated').textContent = newest ? `Last AIS update: ${new Date(newest).toISOString().replace('T', ' ').slice(0, 19)} UTC` : 'Waiting for AIS data'
  }
  async function refresh() {
    if (busy || stopped) return
    busy = true
    try {
      const base = new URL('../plugins/signalk-s2k-display/', document.location.href)
      const response = await fetcher(new URL('state', base), { credentials: 'same-origin', cache: 'no-store' })
      if (!response.ok) throw new Error(`HTTP ${response.status}: check Signal K login and permissions.`)
      if (!(response.headers.get('content-type') || '').includes('application/json')) throw new Error('Expected JSON; log in to Signal K and refresh.')
      const state = await response.json()
      if (!stopped) render(state)
    } catch (error) {
      if (!stopped) {
        byId('connection').textContent = 'Disconnected'
        byId('indicator').classList.remove('online')
        byId('warning').textContent = `Unable to refresh: ${error.message}`
        byId('warning').hidden = false
      }
    } finally { busy = false }
  }
  const ready = refresh()
  const timer = interval(refresh, 3000)
  return { ready, refresh, stop() { stopped = true; clear(timer) } }
}
if (typeof document !== 'undefined') mount(document)
