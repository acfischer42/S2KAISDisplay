'use strict'

class AisReadbackError extends Error {}

const states = [
  'under way using engine', 'at anchor', 'not under command',
  'restricted manoeuverability', 'constrained by her draught', 'moored',
  'aground', 'engaged in fishing', 'under way sailing',
  'reserved (HSC)', 'reserved (WIG)', 'towing astern', 'pushing ahead or towing alongside',
  'reserved', 'AIS-SART active', null
]

function decodeDynamic(bits, type) {
  const expected = type === 19 ? 312 : 168
  if (bits.length !== expected) throw new AisReadbackError(`AIS type ${type} report has an invalid bit length.`)
  const num = (start, width) => parseInt(bits.slice(start, start + width), 2)
  const signed = (start, width) => {
    const value = num(start, width)
    return value >= 2 ** (width - 1) ? value - 2 ** width : value
  }
  const classA = type <= 3
  const speed = num(classA ? 50 : 46, 10)
  const longitude = signed(classA ? 61 : 57, 28) / 600000
  const latitude = signed(classA ? 89 : 85, 27) / 600000
  const course = num(classA ? 116 : 112, 12)
  const heading = num(classA ? 128 : 124, 9)
  const second = num(classA ? 137 : 133, 6)
  const turn = classA ? signed(42, 8) : -128
  const mmsi = num(8, 30)
  return {
    mmsi: mmsi > 0 && mmsi <= 999999999 ? String(mmsi).padStart(9, '0') : null,
    'navigation.position': Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180 ? { latitude, longitude } : null,
    'navigation.speedOverGround': speed === 1023 ? null : speed === 1022 ? { minimum: 102.2 * 1852 / 3600 } : speed / 10 * 1852 / 3600,
    'navigation.courseOverGroundTrue': course < 3600 ? course / 10 * Math.PI / 180 : null,
    'navigation.headingTrue': heading < 360 ? heading * Math.PI / 180 : null,
    'navigation.rateOfTurn': turn === -128 ? null : Math.abs(turn) === 127
      ? { direction: turn < 0 ? 'port' : 'starboard' }
      : Math.sign(turn) * (Math.abs(turn) / 4.733) ** 2 * Math.PI / 180 / 60,
    'navigation.state': classA ? states[num(38, 4)] : null,
    'sensors.ais.positionAccuracy': num(classA ? 60 : 56, 1) ? 'High (10 m or better)' : 'Low (over 10 m)',
    'sensors.ais.raim': num(classA ? 148 : type === 19 ? 305 : 147, 1) ? 'In use' : 'Not in use',
    'sensors.ais.utcSecond': second < 60 ? String(second).padStart(2, '0')
      : ['Not available', 'Manual input', 'Dead reckoning', 'Positioning system inoperative'][second - 60]
  }
}

function decodeType5(bits) {
  if (bits.length !== 424) throw new AisReadbackError('AIS type 5 report has an invalid bit length.')
  const num = (start, width) => parseInt(bits.slice(start, start + width), 2)
  const text = (start, length) => {
    let result = ''
    for (let offset = start; offset < start + length * 6; offset += 6) {
      const value = num(offset, 6)
      result += String.fromCharCode(value < 32 ? value + 64 : value)
    }
    return result.replace(/[@ ]+$/, '').trim() || null
  }
  const mmsi = num(8, 30)
  const imo = num(40, 30)
  const bow = num(240, 9)
  const stern = num(249, 9)
  const port = num(258, 6)
  const starboard = num(264, 6)
  const month = num(274, 4)
  const day = num(278, 5)
  const hour = num(283, 5)
  const minute = num(288, 6)
  const maxDay = month >= 1 && month <= 12 ? new Date(Date.UTC(2000, month, 0)).getUTCDate() : 0
  const eta = day >= 1 && day <= maxDay && hour < 24 && minute < 60
    ? { month, day, hour, minute } : null
  const type = num(232, 8)
  const draft = num(294, 8)
  return {
    mmsi: mmsi > 0 && mmsi <= 999999999 ? String(mmsi).padStart(9, '0') : null,
    name: text(112, 20),
    'communication.callsignVhf': text(70, 7),
    'registrations.imo': imo ? String(imo) : null,
    'navigation.destination.commonName': text(302, 20),
    'navigation.destination.eta': eta,
    'design.draft.current': draft ? draft / 10 : null,
    'design.length.overall': bow && stern ? bow + stern : null,
    'design.beam': port && starboard ? port + starboard : null,
    'sensors.ais.fromBow': bow || null,
    'sensors.ais.fromCenter': port && starboard ? (port - starboard) / 2 : null,
    'design.aisShipType': type ? { id: type } : null
  }
}

class AisReadback {
  constructor() { this.pending = new Map() }

  receive(value, now = Date.now()) {
    const sentence = Buffer.isBuffer(value) ? value.toString('ascii').trim() : typeof value === 'string' ? value.trim() : ''
    if (!sentence.startsWith('!AIVDO,')) return null
    const match = /^!AIVDO,([1-9]),([1-9]),([0-9]?),([AB]?),([0-W`-w]{1,80}),([0-5])\*([0-9A-Fa-f]{2})$/.exec(sentence)
    if (!match) throw new AisReadbackError('Invalid AIVDO sentence format.')
    let checksum = 0
    for (const char of sentence.slice(1, -3)) checksum ^= char.charCodeAt(0)
    if (checksum !== parseInt(match[7], 16)) throw new AisReadbackError('AIVDO checksum mismatch.')
    const total = Number(match[1])
    const fragment = Number(match[2])
    const fill = Number(match[6])
    if (fragment > total || (fragment < total && fill !== 0)) throw new AisReadbackError('Invalid AIVDO fragment numbering or fill bits.')
    for (const [key, pending] of this.pending) if (now - pending.time > 30000) this.pending.delete(key)
    const key = `${match[3]}:${match[4]}`
    let pending = total === 1 ? undefined : this.pending.get(key)
    if (fragment === 1) {
      if (pending) { this.pending.delete(key); throw new AisReadbackError('Ambiguous AIVDO fragments.') }
      pending = { total, next: 1, payload: '', time: now }
      if (total > 1) {
        if (this.pending.size >= 16) throw new AisReadbackError('Too many incomplete AIVDO reports.')
        this.pending.set(key, pending)
      }
    } else if (!pending) {
      throw new AisReadbackError('AIVDO continuation without a recent first fragment.')
    }
    if (pending.total !== total || pending.next !== fragment) {
      if (total > 1) this.pending.delete(key)
      throw new AisReadbackError('AIVDO fragments are out of order or inconsistent.')
    }
    pending.next++
    pending.payload += match[5]
    if (fragment < total) return null
    this.pending.delete(key)
    let bits = [...pending.payload].map(character => {
      let n = character.charCodeAt(0) - 48
      if (n > 40) n -= 8
      return n.toString(2).padStart(6, '0')
    }).join('')
    if (fill) {
      if (bits.slice(-fill).includes('1')) throw new AisReadbackError('Non-zero AIVDO padding.')
      bits = bits.slice(0, -fill)
    }
    if (bits.length < 6) return null
    const type = parseInt(bits.slice(0, 6), 2)
    if (type !== 5 && ![1, 2, 3, 18, 19].includes(type)) return null
    this.messageType = type
    return type === 5 ? decodeType5(bits) : decodeDynamic(bits, type)
  }
}

module.exports = { AisReadback, AisReadbackError }
