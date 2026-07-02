export type BandActivity = {
  id: string
  band: string
  mode: string
  lastSeen: string
  power?: number | null
}

export type NetworkStatus = {
  isConnected: boolean
  ip?: string | null
  lastConnected?: string | null
}

export type Station = {
  id: string
  callsign: string
  name: string
  class?: string | null
  section?: string | null
  grid?: string | null
  currentBand?: string | null
  currentMode?: string | null
  bandActivities: BandActivity[]
  networkStatus?: NetworkStatus | null
  _count: {
    qsoLogs: number
    contextLogs: number
  }
}

export type ContextLog = {
  id: string
  level: string
  category: string
  message: string
  createdAt: string
}

export type QsoLog = {
  id: string
  callsign: string
  band: string
  mode: string
  qsoDate: string
  qsoTime: string
  points: number
}

export type ServiceStatus = {
  api: {
    name: string
    port: number
    status: string
    url: string
  }
  relay: {
    name: string
    port: number
    status: string
    protocol: string
    encoding: string
    url: string
  }
  udp: {
    name: string
    port: number
    status: string
    protocol: string
    url: string
  }
}

export type Contest = {
  id: string
  name: string
  isActive: boolean
  mode: string
  startTime?: string | null
  endTime?: string | null
  duration?: number | null
  scoringMode: string
  pointsPerQso: number
  totalQsos: number
  totalPoints: number
  createdAt: string
}

export type RadioConnection = {
  id: string
  name: string
  host: string
  port: number
  connectionType?: 'hamlib' | 'mock'
  manufacturer?: string | null
  model?: string | null
  isConnected: boolean
  lastSeen?: string | null
  lastError?: string | null
  frequency?: string | null
  mode?: string | null
  bandwidth?: number | null
  power?: number | null
  pollInterval: number
  isEnabled: boolean
  createdAt: string
  audioSourceType?: string | null
  janusRoomId?: string | null
  janusStreamId?: string | null
  httpStreamUrl?: string | null
  remoteSshHost?: string | null
  remoteSshPort?: number | null
  remoteSshUser?: string | null
  remoteSshPublicKey?: string | null
  remoteHasStoredSshKey?: boolean
  remoteProvisionedAt?: string | null
  remoteProvisionStatus?: string | null
  remoteProvisionLastError?: string | null
  assignments?: RadioAssignment[]
}

export type RadioAssignment = {
  id: string
  radioId: string
  stationId: string
  isActive: boolean
  assignedAt: string
  unassignedAt?: string | null
  radio?: RadioConnection
  station?: Station
}

export type RadioOperatorStatus = {
  radioId: string
  radioName: string
  isConnected: boolean
  audioSourceType?: string | null
  janusRoomId?: string | null
  remoteProvisionStatus?: string | null
  remoteProvisionLastError?: string | null
  lastError?: string | null
  assignment: {
    id: string
    stationId: string
    callsign?: string | null
    assignedAt: string
  } | null
  permissions: {
    canControl: boolean
    canListen: boolean
    reason: string
  }
  controlState?: {
    ptt: boolean | null
    frequency: string | null
    mode: string | null
    power: number | null
    vfo: string | null
    stateError: string | null
  }
  voice: {
    roomId: string
    localParticipantCount: number
    janusParticipantCount: number
    localParticipants: Array<{
      id: string
      displayName: string
      audioSourceType: string
      isMuted: boolean
      volume: number
      isSpeaking?: boolean
    }>
    janusParticipants: Array<{
      id: number
      display: string
      publisher: boolean
      talking: boolean
    }>
  }
  janus: {
    configured: boolean
    participantError: string | null
  }
}

export type ViewType =
  | 'dashboard'
  | 'opsmap'
  | 'club'
  | 'contests'
  | 'station'
  | 'logging'
  | 'rig'
  | 'admin'
  | 'debug'

export type N3fjpForwarderConfig = {
  enabled: boolean
  host: string
  port: number
  timeoutMs: number
}

export type JanusClientConfig = {
  browserApiOverride: string | null
  proxyHostOverride: string | null
  allowedHostOverrides: string[]
  janusServerApiUrl: string | null
  globalHostOverride: string | null
  janusHostOverride: string | null
  apiHostOverride: string | null
  wsHostOverride: string | null
  serverLanIp: string | null
  suggestedJanusBrowserApiUrl: string | null
}

export type RigModelOption = {
  modelId: number
  label: string
}
