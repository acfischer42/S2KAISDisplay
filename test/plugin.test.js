'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const createPlugin = require('../index')

function fixture() {
  let handler
  let subscription
  let provider
  let unsubscribed = 0
  let errorHandler
  const errors = []
  const app = {
    error: message => errors.push(message),
    setPluginError: message => errors.push(message),
    setPluginStatus() {},
    registerResourceProvider: value => { provider = value },
    subscriptionmanager: { subscribe(spec, unsubscribes, onError, callback) {
      subscription = spec
      handler = callback
      errorHandler = onError
      unsubscribes.push(() => { unsubscribed++ })
    } }
  }
  const plugin = createPlugin(app)
  let route
  const router = { access: () => router, get: (path, fn) => { route = fn } }
  plugin.registerWithRouter(router)
  const state = () => {
    let result
    route({}, { set() {}, json(value) { result = value } })
    return result
  }
  const emit = (source, values, timestamp = '2026-11-15T10:00:00Z') => handler({ updates: [{ $source: source, timestamp, values }] })
  return { plugin, state, emit, get provider() { return provider }, get subscription() { return subscription }, get unsubscribed() { return unsubscribed }, errors, fail: error => errorHandler(error) }
}

test('only configured source deltas populate known own-vessel fields including nested root and parent values', () => {
  const f = fixture()
  f.plugin.start({ sources: [' ais.AIVDO '] })
  assert.equal(f.subscription.context, 'vessels.self')
  assert.equal(f.subscription.sourcePolicy, 'all')
  f.emit('gps.GPGGA', [{ path: 'navigation.position', value: { latitude: 1, longitude: 2 } }])
  assert.deepEqual(f.state().records, {})
  f.emit('ais.AIVDO', [
    { path: '', value: { mmsi: '123456789', name: 'Demo', communication: { callsignVhf: 'ABC' } } },
    { path: 'design.length', value: { overall: 12 } },
    { path: 'design.draft', value: { current: 1.5 } },
    { path: 'navigation.position', value: { latitude: 1, longitude: 2 } },
    { path: 'unrelated', value: 'ignored' }
  ])
  const records = f.state().records
  assert.equal(records.name.value, 'Demo')
  assert.equal(records['communication.callsignVhf'].value, 'ABC')
  assert.equal(records['design.length.overall'].value, 12)
  assert.equal(records['design.draft.current'].value, 1.5)
  assert.deepEqual(records['navigation.position'].value, { latitude: 1, longitude: 2 })
  assert.equal(records.unrelated, undefined)
  f.emit('ais.AIVDO', [{ path: 'name', value: 'old' }], '2026-11-14T10:00:00Z')
  assert.equal(f.state().records.name.value, 'Demo')
  f.plugin.stop()
  assert.equal(f.unsubscribed, 1)
  assert.deepEqual(f.state().records, {})
})

test('source must be configured, startup errors and subscription errors are visible', () => {
  const f = fixture()
  f.plugin.start()
  f.emit('ais', [{ path: 'name', value: 'not selected' }])
  assert.deepEqual(f.state().records, {})
  f.fail(new Error('subscription failed'))
  assert.equal(f.state().lastError, 'subscription failed')
  assert.throws(() => f.plugin.start({ sources: [''] }), /non-empty/)
  assert.ok(f.errors.length)
})

test('Freeboard provider is read-only and follows plugin lifecycle', async () => {
  const f = fixture()
  f.plugin.start({ sources: ['ais'] })
  const methods = f.provider.methods
  const manifest = (await methods.listResources())['signalk-s2k-display']
  assert.equal(manifest.apiVersion, '1')
  assert.equal(manifest.buttons[0].action.panel, manifest.panels[0].id)
  assert.equal(manifest.panels[0].url, '/signalk-s2k-display/')
  await assert.rejects(methods.setResource(), /read-only/)
  f.plugin.stop()
  assert.deepEqual(await methods.listResources(), {})
  await assert.rejects(methods.getResource('signalk-s2k-display'), /No such/)
  f.plugin.start({ sources: ['ais'] })
  assert.ok((await methods.listResources())['signalk-s2k-display'])
})
