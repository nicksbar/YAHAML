import { useState, useEffect } from 'react'

export interface ContestTemplate {
  name: string
  validationRules?: {
    bands?: string[]
    modes?: string[]
    exchange?: {
      required?: string[]
      validation?: Record<string, string>
    }
  }
}

export interface ActiveContest {
  id: string
  name: string
  template?: ContestTemplate
  isActive: boolean
  startTime?: string
  endTime?: string
  pointsPerQso: number
  totalQsos: number
  totalPoints: number
}

export interface Station {
  id: string
  callsign: string
  name: string
  class?: string | null
}

interface UseLoggingContextOptions {
  pollInterval?: number // ms, 0 to disable polling
}

export function useLoggingContext(options?: UseLoggingContextOptions) {
  const [contest, setContest] = useState<ActiveContest | null>(null)
  const [stations, setStations] = useState<Station[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Fetch active contest
  useEffect(() => {
    const fetchContest = async () => {
      try {
        const response = await fetch('/api/contests/active')
        if (response.ok) {
          const data = await response.json()
          setContest(data || null)
        }
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch contest')
      }
    }

    // Fetch stations
    const fetchStations = async () => {
      try {
        const response = await fetch('/api/stations')
        if (response.ok) {
          const data = await response.json()
          setStations(Array.isArray(data) ? data : [])
        }
      } catch (err) {
        console.error('Failed to fetch stations:', err)
      }
    }

    // Initial fetch
    const load = async () => {
      setLoading(true)
      await Promise.all([fetchContest(), fetchStations()])
      setLoading(false)
    }

    load()

    // Setup polling if enabled
    const interval = options?.pollInterval ?? 5000 // Default 5 seconds
    if (interval > 0) {
      const timer = setInterval(fetchContest, interval)
      return () => clearInterval(timer)
    }
  }, [options?.pollInterval])

  return {
    contest,
    stations,
    loading,
    error,
  }
}
