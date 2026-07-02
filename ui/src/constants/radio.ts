import type { RigModelOption } from '../types/app'

export const PHONE_MODE_OPTIONS = ['LSB', 'USB', 'AM', 'FM', 'WFM', 'DSB']
export const CW_MODE_OPTIONS = ['CW', 'CWR']
export const DIGITAL_MODE_OPTIONS = ['PKTLSB', 'PKTUSB', 'PKTFM', 'RTTY', 'RTTYR', 'FAX']
export const ADVANCED_MODE_OPTIONS = ['ECSSLSB', 'ECSSUSB', 'SAM', 'SAH', 'SAL', 'AMS']
export const TUNE_STEP_OPTIONS = [10, 50, 100, 500, 1000]

export const COMMON_RIG_MODEL_OPTIONS: RigModelOption[] = [
  { modelId: 3073, label: 'Icom IC-7300' },
  { modelId: 3077, label: 'Icom IC-7610' },
  { modelId: 1045, label: 'Yaesu FTDX101MP' },
  { modelId: 1035, label: 'Yaesu FT-991A' },
  { modelId: 2014, label: 'Kenwood TS-590SG' },
  { modelId: 2027, label: 'Elecraft K3' },
]

export const MODE_DESCRIPTIONS: Record<string, string> = {
  // Phone modes
  LSB: 'Lower Sideband - Standard voice mode below 10 MHz',
  USB: 'Upper Sideband - Standard voice mode above 10 MHz',
  AM: 'Amplitude Modulation - Broadcast-style modulation',
  FM: 'Frequency Modulation - High-fidelity VHF/UHF voice',
  WFM: 'Wideband FM - Broadcast-style VHF reception',
  DSB: 'Double Sideband - Full bandwidth voice transmission',
  // CW modes
  CW: 'Continuous Wave - Morse code transmission',
  CWR: 'Continuous Wave Reverse - For receiving reversed signals',
  // Digital modes
  PKTLSB: 'Packet Lower Sideband - Digital data on LSB',
  PKTUSB: 'Packet Upper Sideband - Digital data on USB',
  PKTFM: 'Packet FM - Digital data on FM',
  RTTY: 'Radio Teleprinter - Shift keying digital mode',
  RTTYR: 'RTTY Reverse - For receiving reversed RTTY',
  FAX: 'Facsimile - Weather/chart transmission',
  // Advanced modes
  ECSSLSB: 'Exalted Carrier Single Sideband Lower - Specialized analytical reception',
  ECSSUSB: 'Exalted Carrier Single Sideband Upper - Specialized analytical reception',
  SAM: 'Synchronous AM Detection - Coherent AM demodulation',
  SAH: 'Sideband AM High - High-frequency sideband extraction',
  SAL: 'Sideband AM Low - Low-frequency sideband extraction',
  AMS: 'Amplitude Modulation Suppressed - DSB without carrier',
}

export const OPERATOR_MODE_OPTIONS = ['LSB', 'USB', 'CW', 'CWR', 'AM', 'FM', 'PKTUSB', 'RTTY']

export const BAND_PRESETS = [
  { label: '160m', frequencyHz: 1900000 },
  { label: '80m', frequencyHz: 3750000 },
  { label: '60m', frequencyHz: 5367000 },
  { label: '40m', frequencyHz: 7150000 },
  { label: '30m', frequencyHz: 10125000 },
  { label: '20m', frequencyHz: 14250000 },
  { label: '17m', frequencyHz: 18100000 },
  { label: '15m', frequencyHz: 21250000 },
  { label: '12m', frequencyHz: 24920000 },
  { label: '10m', frequencyHz: 28400000 },
  { label: '6m', frequencyHz: 50300000 },
  { label: '2m', frequencyHz: 146520000 },
]
