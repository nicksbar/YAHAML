export type DecodePart = {
  token: string
  type: 'callsign' | 'control' | 'text'
}

const CONTROL_WORDS = new Set(['CQ', 'DE', 'TU', 'TNX', 'BK', 'KN', 'QRZ', '73', 'QSL'])

export const isCallsignToken = (token: string): boolean => {
  const t = token.trim().toUpperCase()
  if (!t || t.length < 3 || t.length > 10) return false
  if (!/[0-9]/.test(t)) return false
  return /^(?:[A-Z]{1,3}[0-9][A-Z0-9]{1,6}|[0-9][A-Z]{1,3}[A-Z0-9]{1,6})$/.test(t)
}

export const formatDecodedTranscript = (text: string): DecodePart[][] => {
  const normalized = text
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim()

  if (!normalized) return []

  const tokens = normalized.split(' ').filter(Boolean)
  const lines: DecodePart[][] = []
  let current: DecodePart[] = []
  let previousWasCallsign = false

  const pushCurrent = () => {
    if (current.length) {
      lines.push(current)
      current = []
    }
  }

  for (const token of tokens) {
    const callsign = isCallsignToken(token)
    const control = CONTROL_WORDS.has(token)

    if (control && current.length > 0) {
      pushCurrent()
    }

    if (callsign && previousWasCallsign && current.length > 0) {
      pushCurrent()
    }

    current.push({
      token,
      type: callsign ? 'callsign' : control ? 'control' : 'text',
    })

    previousWasCallsign = callsign
  }

  pushCurrent()
  return lines.slice(-10)
}
