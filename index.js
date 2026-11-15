'use strict'

const { paths } = require('./lib/fields')
const { InlandError, parseInland } = require('./lib/inland')
const { version } = require('./package.json')
const id = 'signalk-s2k-display'

module.exports = app => {
  let running = false
  let sources = []
  let records = {}
  let unsubscribes = []
  let lastError = null
  let providerRegistered = false
  let inlandMode = false
  let inlandEvent = null
  let inland = null
  const manifest = () => ({
    name: 'S2KAISDisplay', description: 'AIS own-vessel and dynamic data',
    version, apiVersion: '1', requires: ['panels.iframe', 'buttons'],
    buttons: [{ id: 's2k-display-button', title: 'AIS display', slot: 'mapToolbar', icon: 'sensors', action: { type: 'togglePanel', panel: 's2k-display-panel' } }],
    panels: [{ id: 's2k-display-panel', title: 'AIS display', type: 'iframe', url: '/signalk-s2k-display/', lifecycle: 'keepAlive' }]
  })

  function report(error) {
    lastError = error instanceof Error ? error.message : String(error)
    app.error(`S2KAISDisplay: ${lastError}`)
    app.setPluginError(lastError)
  }
  function accept(path, value, source, timestamp) {
    if (!paths.includes(path)) return
    const time = Date.parse(timestamp)
    if (!Number.isFinite(time)) return
    if (records[path] && time < Date.parse(records[path].timestamp)) return
    records[path] = { value, source, timestamp: new Date(time).toISOString() }
  }
  function flatten(value, prefix, source, timestamp) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return
    for (const [key, child] of Object.entries(value)) {
      const path = prefix ? `${prefix}.${key}` : key
      if (paths.includes(path)) accept(path, child, source, timestamp)
      else if (paths.some(item => item.startsWith(`${path}.`))) flatten(child, path, source, timestamp)
    }
  }
  function onDelta(delta) {
    if (!running || !Array.isArray(delta.updates)) return
    for (const update of delta.updates) {
      const source = update.$source || update.source?.label
      if (!sources.includes(source) || !Array.isArray(update.values)) continue
      for (const item of update.values) {
        if (typeof item.path !== 'string') continue
        if (item.path === '') flatten(item.value, '', source, update.timestamp)
        else if (paths.includes(item.path)) accept(item.path, item.value, source, update.timestamp)
        else flatten(item.value, item.path, source, update.timestamp)
      }
    }
  }
  function onSentence(sentence) {
    if (!running) return
    try {
      const personnel = parseInland(sentence)
      if (personnel) inland = { ...personnel, source: inlandEvent, timestamp: new Date().toISOString() }
    } catch (error) {
      if (!(error instanceof InlandError)) throw error
      app.error(`S2KAISDisplay: ${error.message}`)
    }
  }
  const plugin = {
    id, name: 'S2KAISDisplay',
    description: 'Read-only AIS own-vessel and dynamic data display.',
    schema: {
      type: 'object',
      properties: {
        sources: {
          type: 'array', title: 'AIS Signal K sources', default: [],
          description: 'Exact $source identifiers from Signal K Data Browser. Only these sources are shown.',
          items: { type: 'string', title: 'AIS source' }
        },
        inlandMode: {
          type: 'boolean', title: 'Show inland personnel', default: false,
          description: 'Show crew, passengers and other persons from received PIWWIVD reports.'
        },
        inlandInputEvent: {
          type: 'string', title: 'AIS input sentence event', default: 'ais-voyage-in',
          description: 'Route this event from the AIS input connection only, as in SignalK2AIS. Do not use global or output events.',
          pattern: '^ais-voyage-[A-Za-z0-9_-]+$'
        }
      }
    },
    start(options = {}) {
      plugin.stop()
      if (!Array.isArray(options.sources ?? []) || (options.sources ?? []).some(source => typeof source !== 'string' || !source.trim())) {
        const error = new Error('AIS sources must be non-empty source identifiers.')
        report(error)
        throw error
      }
      sources = [...new Set((options.sources ?? []).map(source => source.trim()))]
      if (options.inlandMode !== undefined && typeof options.inlandMode !== 'boolean') {
        const error = new Error('Inland mode must be a boolean.')
        report(error)
        throw error
      }
      const event = options.inlandInputEvent ?? 'ais-voyage-in'
      if (options.inlandMode && (typeof event !== 'string' || !/^ais-voyage-[A-Za-z0-9_-]+$/.test(event) || event.endsWith('-out') || event.endsWith('-toStdout'))) {
        const error = new Error('Inland input event must be an AIS input event starting with ais-voyage-; output events are not allowed.')
        report(error)
        throw error
      }
      inlandMode = options.inlandMode ?? false
      records = {}
      lastError = null
      running = true
      try {
        if (inlandMode) {
          inlandEvent = event
          app.on(inlandEvent, onSentence)
        }
        if (typeof app.registerResourceProvider === 'function' && !providerRegistered) {
          app.registerResourceProvider({
            type: 'plotterExtensions',
            methods: {
              listResources: async () => running ? { [id]: manifest() } : {},
              getResource: async resourceId => {
                if (!running || resourceId !== id) throw new Error(`No such plotterExtensions resource: ${resourceId}`)
                return manifest()
              },
              setResource: async () => { throw new Error('S2KAISDisplay is read-only') },
              deleteResource: async () => { throw new Error('S2KAISDisplay is read-only') }
            }
          })
          providerRegistered = true
        }
        app.subscriptionmanager.subscribe(
          { context: 'vessels.self', sourcePolicy: 'all', subscribe: [{ path: '*' }] },
          unsubscribes, report, onDelta
        )
        app.setPluginStatus(sources.length ? `Listening for ${sources.length} AIS source(s).` : 'Configure at least one AIS source in Plugin Config.')
      } catch (error) {
        plugin.stop()
        report(error)
        throw error
      }
    },
    stop() {
      running = false
      if (inlandEvent) app.removeListener(inlandEvent, onSentence)
      inlandEvent = null
      inlandMode = false
      inland = null
      for (const unsubscribe of unsubscribes.splice(0)) unsubscribe()
      sources = []
      records = {}
    },
    registerWithRouter(router) {
      const readRouter = typeof router.access === 'function' ? router.access('readonly') : router
      readRouter.get('/state', (req, res) => {
        res.set('Cache-Control', 'no-store')
        res.json({ running, version, sources, records, lastError, inlandMode, inland, panelAvailable: providerRegistered })
      })
    }
  }
  return plugin
}
