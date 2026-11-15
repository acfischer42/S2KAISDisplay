'use strict'

class InlandError extends Error {}

function parseInland(value) {
  const sentence = Buffer.isBuffer(value) ? value.toString('ascii').trim() : typeof value === 'string' ? value.trim() : ''
  if (!sentence.startsWith('$PIWWIVD,')) return null
  const match = /^\$PIWWIVD,([^*\r\n]*)\*([0-9A-Fa-f]{2})$/.exec(sentence)
  if (!match) throw new InlandError('Invalid PIWWIVD sentence format.')
  let checksum = 0
  for (const char of sentence.slice(1, -3)) checksum ^= char.charCodeAt(0)
  if (checksum !== parseInt(match[2], 16)) throw new InlandError('PIWWIVD checksum mismatch.')
  const fields = match[1].split(',')
  if (fields.length !== 13) throw new InlandError('PIWWIVD must contain 13 fields.')
  const count = (index, max, label) => {
    const raw = fields[index]
    if (raw === '') return null
    if (!/^\d+$/.test(raw) || Number(raw) > max) throw new InlandError(`Invalid PIWWIVD ${label} count.`)
    return Number(raw) === max ? null : Number(raw)
  }
  const crew = count(6, 255, 'crew')
  const passengers = count(7, 8191, 'passengers')
  const other = count(8, 255, 'other personnel')
  if ([fields[6], fields[7], fields[8]].every(value => value === '')) return null
  return { crew, passengers, other }
}

module.exports = { InlandError, parseInland }
