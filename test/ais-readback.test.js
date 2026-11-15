'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const { AisReadback } = require('../lib/ais-readback')
const { report, dynamicReport } = require('./helpers/ais')

test('decodes an independently sourced position payload', () => {
  const data = new AisReadback().receive('!AIVDO,1,1,,A,13aEOK?P00PD2wVMdLDRhgvL289?,0*24')
  assert.equal(data.mmsi, '244670316')
  assert.equal(data['navigation.speedOverGround'], 0)
})

test('decodes Class A and B dynamic reports with signed coordinates and SI units', () => {
  for (const type of [1, 2, 3, 18, 19]) {
    const parser = new AisReadback()
    const data = parser.receive(dynamicReport({ type }))
    assert.equal(parser.messageType, type)
    assert.deepEqual(data['navigation.position'], { latitude: 50.7865, longitude: -1.2374 })
    assert.ok(Math.abs(data['navigation.speedOverGround'] - 4.7 * 1852 / 3600) < 1e-10)
    assert.ok(Math.abs(data['navigation.courseOverGroundTrue'] - 134 * Math.PI / 180) < 1e-10)
    assert.equal(data['navigation.headingTrue'], 132 * Math.PI / 180)
    assert.equal(data['navigation.state'], type <= 3 ? 'moored' : null)
    assert.equal(data['sensors.ais.utcSecond'], '37')
    assert.equal(data['sensors.ais.raim'], 'In use')
    assert.equal(data['sensors.ais.positionAccuracy'], 'High (10 m or better)')
    assert.equal(data['navigation.rateOfTurn'], type <= 3 ? -((20 / 4.733) ** 2) * Math.PI / 180 / 60 : null)
    assert.equal(data['navigation.datetime'], undefined)
  }
})

test('dynamic unavailable values, bounds and UTC status are not invented measurements', () => {
  const parser = new AisReadback()
  for (const type of [1, 2, 3, 18, 19]) {
    const data = parser.receive(dynamicReport({ type, longitude: 181 * 600000, latitude: 91 * 600000, speed: 1023, course: 3600, heading: 511, turn: -128, second: 60, state: 15, accuracy: 0, raim: 0 }))
    for (const field of ['position', 'speedOverGround', 'courseOverGroundTrue', 'headingTrue', 'rateOfTurn', 'state']) assert.equal(data[`navigation.${field}`], null)
    assert.equal(data['sensors.ais.utcSecond'], 'Not available')
    assert.equal(data['sensors.ais.raim'], 'Not in use')
  }
  for (const [second, status] of [[61, 'Manual input'], [62, 'Dead reckoning'], [63, 'Positioning system inoperative']]) {
    assert.equal(parser.receive(dynamicReport({ second }))['sensors.ais.utcSecond'], status)
  }
  for (const turn of [-127, 127]) {
    assert.deepEqual(parser.receive(dynamicReport({ turn }))['navigation.rateOfTurn'], { direction: turn < 0 ? 'port' : 'starboard' })
  }
  assert.deepEqual(parser.receive(dynamicReport({ speed: 1022 }))['navigation.speedOverGround'], { minimum: 102.2 * 1852 / 3600 })
  const zero = parser.receive(dynamicReport({ speed: 0, course: 0, heading: 0, turn: 0, latitude: 0, longitude: 0 }))
  assert.equal(zero['navigation.speedOverGround'], 0)
  assert.equal(zero['navigation.rateOfTurn'], 0)
  assert.deepEqual(zero['navigation.position'], { latitude: 0, longitude: 0 })
})

test('single-fragment dynamic reports can arrive during multipart voyage assembly', () => {
  const parser = new AisReadback()
  const [first, second] = report()
  parser.receive(first)
  assert.ok(parser.receive(dynamicReport()))
  assert.equal(parser.receive(second).name, 'DEMO VESSEL')
  assert.equal(parser.receive(dynamicReport().replace('AIVDO', 'AIVDM')), null)
})

test('decodes complete own-vessel type 5 reports and preserves yearless ETA', () => {
  const parser = new AisReadback()
  const [first, second] = report()
  assert.equal(parser.receive(first, 1000), null)
  const decoded = parser.receive(Buffer.from(second), 1001)
  assert.equal(decoded.mmsi, '211123456')
  assert.equal(decoded.name, 'DEMO VESSEL')
  assert.equal(decoded['communication.callsignVhf'], 'DEMO')
  assert.equal(decoded['registrations.imo'], '7654321')
  assert.equal(decoded['design.draft.current'], 1.2)
  assert.equal(decoded['design.length.overall'], 30)
  assert.equal(decoded['design.beam'], 7)
  assert.equal(decoded['sensors.ais.fromCenter'], -1.5)
  assert.equal(decoded['design.aisShipType'].id, 37)
  assert.deepEqual(decoded['navigation.destination.eta'], { month: 11, day: 6, hour: 18, minute: 0 })
})

test('unknown type 5 values do not become plausible values', () => {
  const parser = new AisReadback()
  const [first, second] = report({ mmsi: 0, imo: 0, name: '', callSign: '', shipType: 0, draft: 0, month: 0, day: 0, hour: 24, minute: 60, destination: '' })
  parser.receive(first, 1000)
  const decoded = parser.receive(second, 1001)
  for (const path of ['mmsi', 'name', 'communication.callsignVhf', 'registrations.imo', 'design.aisShipType', 'design.draft.current', 'navigation.destination.eta', 'navigation.destination.commonName']) {
    assert.equal(decoded[path], null)
  }
})

test('rejects invalid checksums, ambiguous and expired fragments and ignores VDM', () => {
  const [first, second] = report()
  const parser = new AisReadback()
  assert.equal(parser.receive(first.replace('AIVDO', 'AIVDM'), 1000), null)
  assert.throws(() => parser.receive(first.slice(0, -2) + 'XX', 1000), /format/)
  parser.receive(first, 1000)
  assert.throws(() => parser.receive(first, 1001), /Ambiguous/)
  parser.receive(first, 1000)
  assert.throws(() => parser.receive(second, 31001), /without/)
})
