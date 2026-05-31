/**
 * Hook for integrating CW decoder into logging forms
 */

import { useState, useCallback } from 'react'

interface DecoderAssistant {
  detectedCallsign: string | null
  detectedExchange: string | null
  decoderConfidence: number
  clearDetections: () => void
}

export const useDecoderAssistant = (): DecoderAssistant => {
  const [detectedCallsign, setDetectedCallsign] = useState<string | null>(null)
  const [detectedExchange, setDetectedExchange] = useState<string | null>(null)
  const [decoderConfidence, setDecoderConfidence] = useState<number>(0)

  const clearDetections = useCallback(() => {
    setDetectedCallsign(null)
    setDetectedExchange(null)
    setDecoderConfidence(0)
  }, [])

  return {
    detectedCallsign,
    detectedExchange,
    decoderConfidence,
    clearDetections
  }
}

/**
 * Format contest exchange from decoded text
 * Supports ARRL Field Day, IARU, etc.
 */
export const parseContestExchange = (
  decodedText: string,
  contestType: string
): { callsign: string; exchange: string } | null => {
  const normalizedContestType = contestType.trim().toUpperCase()
  if (!normalizedContestType) return null

  // Simple parser - extend based on specific contest rules
  // Example: "W5A 559 AR" -> { callsign: "W5A", exchange: "559 AR" }

  const parts = decodedText.trim().split(/\s+/)
  if (parts.length < 2) return null

  const [callsign, ...exchangeParts] = parts
  const exchange = exchangeParts.join(' ')

  return { callsign, exchange }
}

/**
 * Validate callsign format
 */
export const isValidCallsign = (callsign: string): boolean => {
  // Basic validation: 2-7 alphanumeric characters
  // Can be enhanced for regional patterns
  return /^[A-Z0-9]{2,7}$/i.test(callsign)
}
