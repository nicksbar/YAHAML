import { describe, expect, it } from 'vitest'
import { formatDecodedTranscript, isCallsignToken } from './decode-transcript'

describe('isCallsignToken', () => {
  it('recognizes common amateur callsigns', () => {
    expect(isCallsignToken('K1ABC')).toBe(true)
    expect(isCallsignToken('UR6DEA')).toBe(true)
    expect(isCallsignToken('DL1XYZ')).toBe(true)
  })

  it('rejects non-callsign words', () => {
    expect(isCallsignToken('CQ')).toBe(false)
    expect(isCallsignToken('HELLO')).toBe(false)
    expect(isCallsignToken('ABCDEF')).toBe(false)
  })
})

describe('formatDecodedTranscript', () => {
  it('splits logical lines on control words', () => {
    const lines = formatDecodedTranscript('cq cq de k1abc tu ur6dea')
    expect(lines.length).toBeGreaterThanOrEqual(2)
    const firstTokens = lines.map((line) => line[0]?.token)
    expect(firstTokens).toContain('DE')
    expect(firstTokens).toContain('TU')
  })

  it('breaks adjacent stations into separate lines', () => {
    const lines = formatDecodedTranscript('K1ABC UR6DEA EEI3T TU')
    const serialized = lines.map((line) => line.map((p) => p.token).join(' '))
    expect(serialized.some((line) => line === 'K1ABC')).toBe(true)
    expect(serialized.some((line) => line.startsWith('UR6DEA'))).toBe(true)
  })

  it('tags parts with callsign/control/text types', () => {
    const lines = formatDecodedTranscript('CQ DE K1ABC 599 TU')
    const flat = lines.flat()
    const cq = flat.find((p) => p.token === 'CQ')
    const call = flat.find((p) => p.token === 'K1ABC')
    const exchange = flat.find((p) => p.token === '599')

    expect(cq?.type).toBe('control')
    expect(call?.type).toBe('callsign')
    expect(exchange?.type).toBe('text')
  })

  it('caps transcript to latest 10 lines', () => {
    const tokens = Array.from({ length: 30 }, (_, i) => `CQ K1A${i} DE`).join(' ')
    const lines = formatDecodedTranscript(tokens)
    expect(lines.length).toBeLessThanOrEqual(10)
  })
})
