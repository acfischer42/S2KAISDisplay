'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')

test('formats AIS SI units, positions and missing data without inventing values', async () => {
  const { format } = await import('../public/app.mjs')
  assert.equal(format(1, 'knots'), '1.9 kn')
  assert.equal(format(Math.PI / 2, 'angle'), '90.0°')
  assert.equal(format(2 * Math.PI - 0.00001, 'angle'), '0.0°')
  assert.equal(format(Math.PI / 180 / 60, 'turn'), '1.0°/min')
  assert.equal(format(1.5, 'metres'), '1.5 m')
  assert.equal(format({ latitude: 51.5, longitude: -2.25 }, 'position'), '51° 30.000′ N / 2° 15.000′ W')
  assert.equal(format({ latitude: 51.9999999, longitude: 0 }, 'position'), '52° 0.000′ N / 0° 0.000′ E')
  assert.equal(format({ latitude: 91, longitude: 0 }, 'position'), null)
  assert.equal(format(null, 'text'), null)
  assert.equal(format(NaN, 'angle'), null)
  assert.equal(format({ name: 'Sailing', id: 36 }, 'shipType'), 'Sailing · 36')
})
