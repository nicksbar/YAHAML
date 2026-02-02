import { useEffect, useState } from 'react'

export interface DebugLog {
  id: string
  stationId: string
  level: 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS'
  category: string
  message: string
  details?: string | null
  createdAt: string
}

export interface LogSummary {
  total: number
  errors: number
  warnings: number
  success: number
  byCategory: Record<string, number>
  bySource: Record<string, DebugLog[]>
  latestError?: DebugLog
  latestWarning?: DebugLog
}

export function useDebugLogs(stationId?: string) {
  const [logs, setLogs] = useState<DebugLog[]>([])
  const [summary, setSummary] = useState<LogSummary>({
    total: 0,
    errors: 0,
    warnings: 0,
    success: 0,
    byCategory: {},
    bySource: {},
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Function to recalculate summary
  const calculateSummary = (logList: DebugLog[]) => {
    const newSummary: LogSummary = {
      total: logList.length,
      errors: 0,
      warnings: 0,
      success: 0,
      byCategory: {},
      bySource: {},
    }

    let latestError: DebugLog | undefined
    let latestWarning: DebugLog | undefined

    logList.forEach((log: DebugLog) => {
      // Count by level
      if (log.level === 'ERROR') {
        newSummary.errors++
        if (!latestError || new Date(log.createdAt) > new Date(latestError.createdAt)) {
          latestError = log
        }
      } else if (log.level === 'WARN') {
        newSummary.warnings++
        if (!latestWarning || new Date(log.createdAt) > new Date(latestWarning.createdAt)) {
          latestWarning = log
        }
      } else if (log.level === 'SUCCESS') {
        newSummary.success++
      }

      // Count by category
      newSummary.byCategory[log.category] = (newSummary.byCategory[log.category] || 0) + 1

      // Group by station (source)
      if (!newSummary.bySource[log.stationId]) {
        newSummary.bySource[log.stationId] = []
      }
      newSummary.bySource[log.stationId].push(log)
    })

    if (latestError) newSummary.latestError = latestError
    if (latestWarning) newSummary.latestWarning = latestWarning

    return newSummary
  }

  // Initial fetch
  useEffect(() => {
    const fetchLogs = async () => {
      try {
        setLoading(true)
        setError(null)

        const url = stationId
          ? `/api/context-logs/${stationId}`
          : '/api/debug/all-logs'

        const response = await fetch(url)
        if (!response.ok) throw new Error('Failed to fetch logs')

        const data = await response.json()
        const logList = Array.isArray(data) ? data : data.logs || []

        setLogs(logList)
        setSummary(calculateSummary(logList))
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    }

    fetchLogs()
  }, [stationId])

  // WebSocket for real-time updates with auto-reconnect
  useEffect(() => {
    let ws: WebSocket | null = null
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null
    let reconnectAttempts = 0
    const MAX_RECONNECT_ATTEMPTS = 10
    const BASE_RECONNECT_DELAY = 1000 // 1 second

    const connectWebSocket = () => {
      try {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
        ws = new WebSocket(`${protocol}//${window.location.host}/ws`)

        ws.onopen = () => {
          reconnectAttempts = 0
          console.log('Connected to debug log stream')
          // Subscribe to logs channel
          ws?.send(
            JSON.stringify({
              type: 'subscribe',
              channel: 'logs',
              filters: stationId ? { stationId } : {},
            })
          )
        }

        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data)

            if (message.type === 'contextLog' || message.data?.level) {
              // New log entry received
              const newLog = message.data || message
              setLogs((prev) => {
                // Add to front and limit to 500 entries
                const updated = [newLog, ...prev].slice(0, 500)
                setSummary(calculateSummary(updated))
                return updated
              })
            }
          } catch (e) {
            console.error('Failed to parse WebSocket message', e)
          }
        }

        ws.onerror = (err) => {
          console.error('WebSocket error:', err)
        }

        ws.onclose = () => {
          console.log('Disconnected from debug log stream, attempting reconnect...')
          attemptReconnect()
        }
      } catch (err) {
        console.error('Failed to create WebSocket:', err)
        attemptReconnect()
      }
    }

    const attemptReconnect = () => {
      if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        console.error('WebSocket reconnection failed after multiple attempts')
        return
      }

      reconnectAttempts++
      const delay = BASE_RECONNECT_DELAY * Math.pow(1.5, reconnectAttempts - 1)
      console.log(`Scheduling debug log reconnect in ${delay}ms (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`)

      reconnectTimeout = setTimeout(() => {
        connectWebSocket()
      }, delay)
    }

    connectWebSocket()

    return () => {
      if (reconnectTimeout) clearTimeout(reconnectTimeout)
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: 'unsubscribe',
            channel: 'logs',
          })
        )
      }
      ws?.close()
    }
  }, [stationId])

  return { logs, summary, loading, error }
}
