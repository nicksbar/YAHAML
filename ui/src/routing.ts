type RoutingOverrides = {
  globalHostOverride?: string | null
  apiHostOverride?: string | null
  wsHostOverride?: string | null
  janusHostOverride?: string | null
  janusApiUrlOverride?: string | null
  janusProxyHostOverride?: string | null
  serverLanIp?: string | null
}

const trimOrNull = (value: string | null | undefined) => {
  const trimmed = String(value || '').trim()
  return trimmed || null
}

function hasExplicitPort(hostOrUrl: string): boolean {
  const raw = hostOrUrl.trim()
  if (!raw) return false

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
    try {
      return Boolean(new URL(raw).port)
    } catch {
      return false
    }
  }

  const hostOnly = raw.split('/')[0]
  if (hostOnly.startsWith('[')) {
    return /\]:\d+$/.test(hostOnly)
  }

  const colonIndex = hostOnly.lastIndexOf(':')
  if (colonIndex === -1) return false
  return /^\d+$/.test(hostOnly.slice(colonIndex + 1))
}

export function getRoutingOverridesFromStorage(): RoutingOverrides {
  return {
    globalHostOverride: trimOrNull(localStorage.getItem('yahaml:globalHostOverride')),
    apiHostOverride: trimOrNull(localStorage.getItem('yahaml:apiHostOverride')),
    wsHostOverride: trimOrNull(localStorage.getItem('yahaml:wsHostOverride')),
    janusHostOverride: trimOrNull(localStorage.getItem('yahaml:janusHostOverride')),
    janusApiUrlOverride: trimOrNull(localStorage.getItem('yahaml:janusApiUrl')),
    janusProxyHostOverride: trimOrNull(localStorage.getItem('yahaml:janusProxyHostOverride')),
    serverLanIp: trimOrNull(localStorage.getItem('yahaml:serverLanIp')),
  }
}

function withWsScheme(hostOrUrl: string): string {
  const raw = hostOrUrl.trim()
  if (!raw) return ''

  const fallbackPort = window.location.port

  if (raw.startsWith('ws://') || raw.startsWith('wss://')) {
    return raw.replace(/\/$/, '')
  }

  if (raw.startsWith('http://')) {
    try {
      const parsed = new URL(raw)
      const hasPort = Boolean(parsed.port)
      const host = parsed.hostname.includes(':') ? `[${parsed.hostname}]` : parsed.hostname
      const portSuffix = hasPort ? `:${parsed.port}` : (fallbackPort ? `:${fallbackPort}` : '')
      return `ws://${host}${portSuffix}`
    } catch {
      return `ws://${raw.replace(/^http:\/\//, '').replace(/\/$/, '')}`
    }
  }

  if (raw.startsWith('https://')) {
    try {
      const parsed = new URL(raw)
      const hasPort = Boolean(parsed.port)
      const host = parsed.hostname.includes(':') ? `[${parsed.hostname}]` : parsed.hostname
      const portSuffix = hasPort ? `:${parsed.port}` : (fallbackPort ? `:${fallbackPort}` : '')
      return `wss://${host}${portSuffix}`
    } catch {
      return `wss://${raw.replace(/^https:\/\//, '').replace(/\/$/, '')}`
    }
  }

  const pageProtocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://'
  const normalized = raw.replace(/\/$/, '')
  const withPort = hasExplicitPort(normalized)
    ? normalized
    : `${normalized}${fallbackPort ? `:${fallbackPort}` : ''}`
  return `${pageProtocol}${withPort}`
}

function normalizeJanusApiFromHost(hostOrUrl: string, secure: boolean): string {
  const raw = hostOrUrl.trim()
  if (!raw) return ''
  const defaultPort = secure ? '8089' : '8088'
  const protocol = secure ? 'https' : 'http'

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
    try {
      const parsed = new URL(raw)
      const host = parsed.hostname.includes(':') ? `[${parsed.hostname}]` : parsed.hostname
      const port = parsed.port || defaultPort
      return `${protocol}://${host}:${port}/janus`
    } catch {
      return ''
    }
  }

  const host = raw.split('/')[0]
  const hostWithPort = hasExplicitPort(host) ? host : `${host}:${defaultPort}`
  return `${protocol}://${hostWithPort}/janus`
}

export function resolveWebSocketUrl(path = '/ws'): string {
  const { wsHostOverride, apiHostOverride, globalHostOverride } = getRoutingOverridesFromStorage()
  const wsTarget = wsHostOverride || apiHostOverride || globalHostOverride

  if (wsTarget) {
    const base = withWsScheme(wsTarget)
    if (base.endsWith(path)) return base
    return `${base}${path.startsWith('/') ? path : `/${path}`}`
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}${path.startsWith('/') ? path : `/${path}`}`
}

export function buildJanusApiCandidates(options?: {
  includeBrowserFallback?: boolean
  includeRadioHostFallback?: boolean
  radioHost?: string | null
}): string[] {
  const {
    includeBrowserFallback = true,
    includeRadioHostFallback = false,
    radioHost = null,
  } = options || {}

  const {
    janusApiUrlOverride,
    janusProxyHostOverride,
    janusHostOverride,
    globalHostOverride,
    serverLanIp,
  } = getRoutingOverridesFromStorage()

  const preferredJanusHost = janusHostOverride || globalHostOverride || serverLanIp
  const browserHost = window.location.hostname
  const browserHostIsLoopback = ['localhost', '127.0.0.1', '::1'].includes(browserHost)

  const candidates = [
    janusApiUrlOverride || '',
    preferredJanusHost ? normalizeJanusApiFromHost(preferredJanusHost, false) : '',
    preferredJanusHost ? normalizeJanusApiFromHost(preferredJanusHost, true) : '',
    janusProxyHostOverride ? normalizeJanusApiFromHost(janusProxyHostOverride, false) : '',
    janusProxyHostOverride ? normalizeJanusApiFromHost(janusProxyHostOverride, true) : '',
    includeRadioHostFallback && radioHost ? normalizeJanusApiFromHost(radioHost, false) : '',
    includeBrowserFallback && browserHost && !browserHostIsLoopback ? normalizeJanusApiFromHost(browserHost, false) : '',
    includeBrowserFallback && browserHost && !browserHostIsLoopback ? normalizeJanusApiFromHost(browserHost, true) : '',
  ].filter(Boolean)

  return Array.from(new Set(candidates))
}
