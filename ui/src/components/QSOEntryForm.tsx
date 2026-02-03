import { useState, useEffect } from 'react'
import '../styles/QSOEntryForm.css'

export interface Station {
  id: string
  callsign: string
  name: string
  class?: string | null
}

export interface Contest {
  id: string
  name: string
  template?: {
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
}

export interface QSOEntry {
  stationId: string
  contactCallsign: string
  band: string
  mode: string
  frequency?: number
  rst?: string
  power?: number
  exchange?: Record<string, string>
  notes?: string
}

interface QSOEntryFormProps {
  stations: Station[]
  stationId: string
  activeContest?: Contest | null
  onSubmit: (qso: QSOEntry) => Promise<void>
  loading?: boolean
}

const QUICK_BANDS = ['160m', '80m', '40m', '20m', '15m', '10m', '6m', '2m', '70cm']
const QUICK_MODES = ['CW', 'SSB', 'Digital', 'AM']

export function QSOEntryForm({ stations, stationId, activeContest, onSubmit, loading }: QSOEntryFormProps) {
  const [contactCallsign, setContactCallsign] = useState('')
  const [band, setBand] = useState('')
  const [mode, setMode] = useState('')
  const [frequency, setFrequency] = useState('')
  const [rst, setRst] = useState('')
  const [power, setPower] = useState('')
  const [exchange, setExchange] = useState<Record<string, string>>({})
  const [notes, setNotes] = useState('')
  const [errors, setErrors] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)

  const selectedStation = stations.find((s) => s.id === stationId)
  const validationRules = activeContest?.template?.validationRules
  const allowedBands = validationRules?.bands || QUICK_BANDS
  const allowedModes = validationRules?.modes || QUICK_MODES
  const requiredExchange = validationRules?.exchange?.required || []

  const validateForm = (): boolean => {
    const newErrors: string[] = []

    if (!stationId) newErrors.push('No station selected')
    if (!contactCallsign.trim()) newErrors.push('Contact callsign is required')
    if (!band) newErrors.push('Band is required')
    if (!mode) newErrors.push('Mode is required')

    // Validate exchange fields
    for (const field of requiredExchange) {
      if (!exchange[field]?.trim()) {
        newErrors.push(`Exchange field '${field}' is required`)
      }
    }

    setErrors(newErrors)
    return newErrors.length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateForm()) return

    setSubmitting(true)
    try {
      const qsoData: QSOEntry = {
        stationId,
        contactCallsign: contactCallsign.toUpperCase(),
        band,
        mode,
        frequency: frequency ? parseInt(frequency) : undefined,
        rst: rst || undefined,
        power: power ? parseInt(power) : undefined,
        exchange: Object.keys(exchange).length > 0 ? exchange : undefined,
        notes: notes || undefined,
      }

      await onSubmit(qsoData)

      // Clear form after successful submission
      setContactCallsign('')
      setFrequency('')
      setRst('')
      setPower('')
      setExchange({})
      setNotes('')
      setErrors([])
    } finally {
      setSubmitting(false)
    }
  }

  const handleExchangeChange = (field: string, value: string) => {
    setExchange((prev) => ({
      ...prev,
      [field]: value,
    }))
  }

  return (
    <form className="qso-entry-form" onSubmit={handleSubmit}>
      <div className="qso-form-header">
        <h2>Log QSO</h2>
        {activeContest && <span className="contest-badge">{activeContest.name}</span>}
      </div>

      {errors.length > 0 && (
        <div className="form-errors">
          {errors.map((error) => (
            <div key={error} className="error-message">
              ⚠️ {error}
            </div>
          ))}
        </div>
      )}

      {/* Contact Information */}
      <div className="form-row">
        <div className="form-group flex-1">
          <label htmlFor="contact">Contact Callsign</label>
          <input
            id="contact"
            type="text"
            value={contactCallsign}
            onChange={(e) => setContactCallsign(e.target.value)}
            placeholder="e.g., K5ABC"
            autoFocus
            disabled={submitting}
            required
          />
        </div>
      </div>

      {/* Band & Mode Selection */}
      <div className="form-row">
        <div className="form-group">
          <label>Band</label>
          <div className="quick-select">
            {allowedBands.map((b) => (
              <button
                key={b}
                type="button"
                className={`quick-btn ${band === b ? 'active' : ''}`}
                onClick={() => setBand(b)}
                disabled={submitting}
              >
                {b}
              </button>
            ))}
          </div>
        </div>

        <div className="form-group">
          <label>Mode</label>
          <div className="quick-select">
            {allowedModes.map((m) => (
              <button
                key={m}
                type="button"
                className={`quick-btn ${mode === m ? 'active' : ''}`}
                onClick={() => setMode(m)}
                disabled={submitting}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Frequency & RST */}
      <div className="form-row">
        <div className="form-group">
          <label htmlFor="freq">Frequency (MHz)</label>
          <input
            id="freq"
            type="number"
            step="0.001"
            value={frequency}
            onChange={(e) => setFrequency(e.target.value)}
            placeholder="e.g., 7.101"
            disabled={submitting}
          />
        </div>

        <div className="form-group">
          <label htmlFor="rst">RST</label>
          <input
            id="rst"
            type="text"
            value={rst}
            onChange={(e) => setRst(e.target.value)}
            placeholder="e.g., 5/9"
            disabled={submitting}
          />
        </div>

        <div className="form-group">
          <label htmlFor="power">Power (W)</label>
          <input
            id="power"
            type="number"
            value={power}
            onChange={(e) => setPower(e.target.value)}
            placeholder="e.g., 100"
            disabled={submitting}
          />
        </div>
      </div>

      {/* Contest-Specific Exchange Fields */}
      {requiredExchange.length > 0 && (
        <div className="exchange-section">
          <h3>Exchange</h3>
          <div className="form-row">
            {requiredExchange.map((field) => (
              <div key={field} className="form-group">
                <label htmlFor={field}>{field}</label>
                <input
                  id={field}
                  type="text"
                  value={exchange[field] || ''}
                  onChange={(e) => handleExchangeChange(field, e.target.value)}
                  disabled={submitting}
                  required
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Notes */}
      <div className="form-row">
        <div className="form-group full-width">
          <label htmlFor="notes">Notes (Optional)</label>
          <textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Additional info..."
            rows={2}
            disabled={submitting}
          />
        </div>
      </div>

      {/* Submit Button */}
      <div className="form-actions">
        <button
          type="submit"
          className="btn primary submit-btn"
          disabled={submitting || loading || !contactCallsign || !band || !mode}
        >
          {submitting ? 'Logging...' : 'Log QSO'} (Enter)
        </button>
      </div>
    </form>
  )
}
