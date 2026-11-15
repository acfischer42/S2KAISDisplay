'use strict'

function sentence(body) {
  const checksum = [...body].reduce((sum, char) => sum ^ char.charCodeAt(0), 0).toString(16).padStart(2, '0')
  return `!${body}*${checksum}`
}

function report(options = {}) {
  const bits = Array(424).fill('0')
  function number(offset, size, value) {
    bits.splice(offset, size, ...value.toString(2).padStart(size, '0'))
  }
  function text(offset, size, value) {
    for (const [index, char] of [...value.padEnd(size, '@')].entries()) number(offset + index * 6, 6, char.charCodeAt(0) & 63)
  }
  number(0, 6, 5)
  number(8, 30, options.mmsi ?? 211123456)
  number(40, 30, options.imo ?? 7654321)
  text(70, 7, options.callSign ?? 'DEMO')
  text(112, 20, options.name ?? 'DEMO VESSEL')
  number(232, 8, options.shipType ?? 37)
  number(240, 9, 18)
  number(249, 9, 12)
  number(258, 6, 2)
  number(264, 6, 5)
  number(274, 4, options.month ?? 11)
  number(278, 5, options.day ?? 6)
  number(283, 5, options.hour ?? 18)
  number(288, 6, options.minute ?? 0)
  number(294, 8, options.draft ?? 12)
  text(302, 20, options.destination ?? 'BRYC')
  const padded = bits.join('') + '00'
  let payload = ''
  for (let offset = 0; offset < padded.length; offset += 6) {
    const n = parseInt(padded.slice(offset, offset + 6), 2)
    payload += String.fromCharCode(n < 40 ? n + 48 : n + 56)
  }
  return [
    sentence(`AIVDO,2,1,1,A,${payload.slice(0, 60)},0`),
    sentence(`AIVDO,2,2,1,A,${payload.slice(60)},2`)
  ]
}

function dynamicReport(options = {}) {
  const type = options.type ?? 1
  const classA = type <= 3
  const bits = Array(type === 19 ? 312 : 168).fill('0')
  function number(offset, size, value) {
    bits.splice(offset, size, ...(value < 0 ? 2 ** size + value : value).toString(2).padStart(size, '0'))
  }
  number(0, 6, type)
  number(8, 30, options.mmsi ?? 211123456)
  if (classA) {
    number(38, 4, options.state ?? 5)
    number(42, 8, options.turn ?? -20)
  }
  number(classA ? 50 : 46, 10, options.speed ?? 47)
  number(classA ? 60 : 56, 1, options.accuracy ?? 1)
  number(classA ? 61 : 57, 28, options.longitude ?? -742440)
  number(classA ? 89 : 85, 27, options.latitude ?? 30471900)
  number(classA ? 116 : 112, 12, options.course ?? 1340)
  number(classA ? 128 : 124, 9, options.heading ?? 132)
  number(classA ? 137 : 133, 6, options.second ?? 37)
  number(classA ? 148 : type === 19 ? 305 : 147, 1, options.raim ?? 1)
  let payload = ''
  for (let offset = 0; offset < bits.length; offset += 6) {
    const n = parseInt(bits.slice(offset, offset + 6).join(''), 2)
    payload += String.fromCharCode(n < 40 ? n + 48 : n + 56)
  }
  return sentence(`AIVDO,1,1,,A,${payload},0`)
}

module.exports = { report, dynamicReport }
