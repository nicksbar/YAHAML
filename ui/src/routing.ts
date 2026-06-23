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

  if (raw.startsWith('ws://') || raw.startsWith('wss://')) {
    return raw.replace(/\/$/, '')
  }

  if (raw.startsWith('http://')) {
    return `ws://${raw.replace(/^http:\/\//, '').replace(/\/$/, '')}`
  }

  if (raw.startsWith('https://')) {
    return `wss://${raw.replace(/^https:\/\//, '').replace(/\/$/, '')}`
  }

  const pageProtocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://'
  return `${pageProtocol}${raw.replace(/\/$/, '')}`
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
    preferredJanusHost ? `http://${preferredJanusHost}:8088/janus` : '',
    preferredJanusHost ? `https://${preferredJanusHost}:8089/janus` : '',
    janusProxyHostOverride ? `http://${janusProxyHostOverride}:8088/janus` : '',
    janusProxyHostOverride ? `https://${janusProxyHostOverride}:8089/janus` : '',
    includeRadioHostFallback && radioHost ? `http://${radioHost}:8088/janus` : '',
    includeBrowserFallback && browserHost && !browserHostIsLoopback ? `http://${browserHost}:8088/janus` : '',
    includeBrowserFallback && browserHost && !browserHostIsLoopback ? `https://${browserHost}:8089/janus` : '',
  ].filter(Boolean)

  return Array.from(new Set(candidates))
}
