export interface LoggingPageProps {
  stationId: string
  isActive?: boolean
}

export type LoggingTab = 'standard' | 'gota'

export type RadioInfo = {
  id?: string
  name?: string
  host?: string
  port?: number
  isConnected?: boolean
  audioSourceType?: string
  janusRoomId?: string | number
  janusStreamId?: string | number
  httpStreamUrl?: string
  frequency?: string | number | null
  mode?: string | null
  bandwidth?: number | null
  power?: number | null
  ptt?: boolean | null
}

export type AssignedRadioInfo = {
  id?: string
  isActive?: boolean
  radio?: RadioInfo
}

export type RadioStateInfo = {
  frequency?: string | number | null
  mode?: string | null
  bandwidth?: number | null
  power?: number | null
  ptt?: boolean | null
  vfo?: string | null
  isConnected?: boolean
  lastError?: string | null
}

export type JanusConnection = {
  sessionId?: number
  audio?: HTMLAudioElement
  cleanup?: () => Promise<void>
  [key: string]: unknown
}
