export function formatFrequencyMHz(freq?: string | number | null): string {
  if (freq === null || freq === undefined || freq === '') return '---.---'
  const value = typeof freq === 'number' ? freq : Number.parseFloat(String(freq))
  if (!Number.isFinite(value)) return '---.---'
  return (value / 1_000_000).toFixed(3)
}

export function toFrequencyHz(input: string): number | null {
  const normalized = input.trim()
  if (!normalized) return null
  const mhz = Number(normalized)
  if (Number.isNaN(mhz)) return null
  return Math.round(mhz * 1_000_000)
}

export function formatFrequencyInputMHz(hz: number): string {
  const mhz = hz / 1_000_000
  return mhz.toFixed(6).replace(/0+$/, '').replace(/\.$/, '')
}

export function frequencyToBand(freq?: string | number | null): string {
  if (freq === null || freq === undefined) return ''
  const value = typeof freq === 'number' ? freq : Number.parseInt(String(freq), 10)
  if (!Number.isFinite(value) || value <= 0) return ''
  if (value >= 1800000 && value <= 2000000) return '160m'
  if (value >= 3500000 && value <= 4000000) return '80m'
  if (value >= 7000000 && value <= 7300000) return '40m'
  if (value >= 14000000 && value <= 14350000) return '20m'
  if (value >= 21000000 && value <= 21450000) return '15m'
  if (value >= 28000000 && value <= 29700000) return '10m'
  if (value >= 50000000 && value <= 54000000) return '6m'
  if (value >= 144000000 && value <= 148000000) return '2m'
  if (value >= 420000000 && value <= 450000000) return '70cm'
  return ''
}

export function bandToFrequencyHz(bandValue?: string | null): number | null {
  if (!bandValue) return null
  const normalized = bandValue.trim().toLowerCase()
  if (!normalized) return null

  const compact = normalized.replace(/\s+/g, '')
  const mhzBand = compact.endsWith('m') ? compact.slice(0, -1) : compact

  if (compact.endsWith('cm')) {
    if (compact === '70cm') return 433500000
    return null
  }

  switch (mhzBand) {
    case '160': return 1900000
    case '80': return 3750000
    case '40': return 7150000
    case '20': return 14250000
    case '15': return 21250000
    case '10': return 28400000
    case '6': return 50300000
    case '2': return 146520000
    default: return null
  }
}

export function normalizeBandForOccupancy(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  const lower = trimmed.toLowerCase()

  if (lower.endsWith('cm')) {
    return trimmed.toUpperCase()
  }

  if (lower.endsWith('m')) {
    return trimmed.slice(0, -1).toUpperCase()
  }

  return trimmed.toUpperCase()
}
