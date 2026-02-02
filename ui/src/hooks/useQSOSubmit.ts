import { useState, useCallback } from 'react'

export interface QSOSubmitData {
  stationId: string
  contactCallsign: string
  band: string
  mode: string
  frequency?: number
  rst?: string
  power?: number
  exchange?: Record<string, string>
  notes?: string
  contestId?: string
}

export interface ValidationError {
  field?: string
  message: string
}

export interface SubmitResult {
  success: boolean
  id?: string
  errors?: ValidationError[]
}

interface UseQSOSubmitOptions {
  contestId?: string
}

export function useQSOSubmit(options?: UseQSOSubmitOptions) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastSubmittedId, setLastSubmittedId] = useState<string | null>(null)

  const submit = useCallback(
    async (data: QSOSubmitData): Promise<SubmitResult> => {
      setLoading(true)
      setError(null)

      try {
        const payload = {
          ...data,
          contestId: options?.contestId,
        }

        const response = await fetch('/api/qso-logs', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))

          // Handle validation errors
          if (response.status === 400 && errorData.errors) {
            return {
              success: false,
              errors: Array.isArray(errorData.errors)
                ? errorData.errors.map((msg: string | { message: string }) =>
                    typeof msg === 'string' ? { message: msg } : msg,
                  )
                : [{ message: errorData.message || 'Validation failed' }],
            }
          }

          throw new Error(
            errorData.message ||
              errorData.error ||
              `HTTP ${response.status}: Failed to log QSO`,
          )
        }

        const result = await response.json()
        setLastSubmittedId(result.id)

        return {
          success: true,
          id: result.id,
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        setError(message)

        return {
          success: false,
          errors: [{ message }],
        }
      } finally {
        setLoading(false)
      }
    },
    [options?.contestId],
  )

  return {
    submit,
    loading,
    error,
    lastSubmittedId,
  }
}
