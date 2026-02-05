import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { ThemeProvider } from './context/ThemeContext'
import { BandOccupancy } from './components/BandOccupancy'
import { MessageCenter } from './components/MessageCenter'
import { QSOMap } from './components/QSOMap'
import { StatsPanel } from './components/StatsPanel'
import { DebugPanel } from './components/DebugPanel'
import { LoggingPage } from './components/LoggingPage'
import { VoiceRoomPanel } from './components/VoiceRoomPanel'
type BandActivity = {
  id: string
  band: string
  mode: string
  lastSeen: string
  power?: number | null
}

type NetworkStatus = {
  isConnected: boolean
  ip?: string | null
  lastConnected?: string | null
}

type Station = {
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

type ContextLog = {
  id: string
  level: string
  category: string
  message: string
  createdAt: string
}

type QsoLog = {
  id: string
  callsign: string
  band: string
  mode: string
  qsoDate: string
  qsoTime: string
  points: number
}

type ServiceStatus = {
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

type Contest = {
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

type RadioConnection = {
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
  assignments?: RadioAssignment[]
}

type RadioAssignment = {
  id: string
  radioId: string
  stationId: string
  isActive: boolean
  assignedAt: string
  unassignedAt?: string | null
  radio?: RadioConnection
  station?: Station
}

const storageKey = 'yahaml:callsign'
const sessionTokenKey = 'yahaml:sessionToken'
const browserIdKey = 'yahaml:browserId'

type ViewType = 'dashboard' | 'club' | 'contests' | 'station' | 'logging' | 'rig' | 'admin' | 'debug'

function App() {
  const [stations, setStations] = useState<Station[]>([])
  const [selectedStationId, setSelectedStationId] = useState<string | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [contextLogs, setContextLogs] = useState<ContextLog[]>([])
  const [qsoLogs, setQsoLogs] = useState<QsoLog[]>([])
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [loading, setLoading] = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [error, setError] = useState<string | null>(null)
  const [globalMessages, setGlobalMessages] = useState<Array<{ text: string; type: 'error' | 'success' }>>([])
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [callsignInput, setCallsignInput] = useState(
    localStorage.getItem(storageKey) || '',
  )
  const [sessionToken, setSessionToken] = useState(
    localStorage.getItem(sessionTokenKey) || '',
  )
  const [services, setServices] = useState<ServiceStatus | null>(null)
  const [contest, setContest] = useState<Contest | null>(null)
  const [adminCallsigns, setAdminCallsigns] = useState<string[]>([])
  const [isAdmin, setIsAdmin] = useState(true) // Default true, checked after loading admin list
  const [currentView, setCurrentView] = useState<ViewType>('dashboard')
  const [showCallsignPicker, setShowCallsignPicker] = useState(false)
  const [allowCallsignSetup, setAllowCallsignSetup] = useState(false)
  const [clubs, setClubs] = useState<any[]>([])
  
  // Contest templates state
  const [contestTemplates, setContestTemplates] = useState<any[]>([])
  const [upcomingContests, setUpcomingContests] = useState<any[]>([])
  const [templateFilter, setTemplateFilter] = useState('')
  const [templateOrgFilter, setTemplateOrgFilter] = useState('all')
  const [templateSeeding, setTemplateSeeding] = useState(false)
  const [templateSeedStatus, setTemplateSeedStatus] = useState<string | null>(null)
  const [templateEditor, setTemplateEditor] = useState({
    id: '',
    type: '',
    name: '',
    description: '',
    organization: '',
    scoringRules: '',
    requiredFields: '',
    validationRules: '',
    uiConfig: '',
    isActive: true,
    isPublic: true,
  })
  const [templateEditorStatus, setTemplateEditorStatus] = useState<string | null>(null)
  const [templateEditorError, setTemplateEditorError] = useState<string | null>(null)
  // const [selectedTemplate, setSelectedTemplate] = useState<any | null>(null)
  
  // Club form state
  const [clubCallsign, setClubCallsign] = useState('')
  const [clubName, setClubName] = useState('')
  const [clubSection, setClubSection] = useState('')
  const [clubGrid, setClubGrid] = useState('')
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [clubSaveError, setClubSaveError] = useState<string | null>(null)
  const [clubContestId, setClubContestId] = useState('')
  
  // Station form state
  const [stationName, setStationName] = useState('')
  const [stationLicenseClass, setStationLicenseClass] = useState('')
  const [stationAddress, setStationAddress] = useState('')
  const [stationCity, setStationCity] = useState('')
  const [stationState, setStationState] = useState('')
  const [stationZip, setStationZip] = useState('')
  const [stationCountry, setStationCountry] = useState('')
  const [stationClubId, setStationClubId] = useState('')
  const [stationContestId, setStationContestId] = useState('')
  const [stationLookupLoading, setStationLookupLoading] = useState(false)
  const [expandedStationId, setExpandedStationId] = useState<string | null>(null)
  const [stationFormErrors, setStationFormErrors] = useState<{
    callsign?: string
    clubId?: string
    locationId?: string
    name?: string
    licenseClass?: string
  }>({})
  
  // Special callsign form state
  const [specialCallsigns, setSpecialCallsigns] = useState<any[]>([])
  const [specialCallsign, setSpecialCallsign] = useState('')
  const [specialEventName, setSpecialEventName] = useState('')
  const [specialDescription, setSpecialDescription] = useState('')
  const [specialStartDate, setSpecialStartDate] = useState('')
  const [specialEndDate, setSpecialEndDate] = useState('')
  
  // Radio management state
  const [radios, setRadios] = useState<RadioConnection[]>([])
  // const [radioAssignments, setRadioAssignments] = useState<RadioAssignment[]>([])
  const [radioName, setRadioName] = useState('')
  const [radioConnectionType, setRadioConnectionType] = useState<'hamlib' | 'mock'>('hamlib')
  const [radioHost, setRadioHost] = useState('')
  const [radioPort, setRadioPort] = useState('4532')
  const [radioPollInterval, setRadioPollInterval] = useState('1000')
  const [radioTestResult, setRadioTestResult] = useState<{
    success: boolean
    message?: string
    state?: any
    info?: string
    error?: string
  } | null>(null)
  const [radioTesting, setRadioTesting] = useState(false)
  const [radioCardTestResults, setRadioCardTestResults] = useState<Record<string, {
    success: boolean
    message: string
    state?: any
    info?: string
    error?: string
  }>>({})
  const [radioLiveState, setRadioLiveState] = useState<Record<string, any>>({})
  const [radioControlInputs, setRadioControlInputs] = useState<Record<string, { frequency: string; power: string; mode: string; bandwidth: string; raw: string }>>({})
  const [specialClubId, setSpecialClubId] = useState('')
  
  // Saved locations state
  const [savedLocations, setSavedLocations] = useState<any[]>([])
  const [selectedLocationId, setSelectedLocationId] = useState('')
  const [locationName, setLocationName] = useState('')
  
  // Current location state (for editing)
  const [stationLatitude, setStationLatitude] = useState('')
  const [stationLongitude, setStationLongitude] = useState('')
  const [stationGrid, setStationGrid] = useState('')
  const [stationSection, setStationSection] = useState('')
  const [stationCounty, setStationCounty] = useState('')
  const [stationCqZone, setStationCqZone] = useState('')
  const [stationItuZone, setStationItuZone] = useState('')
  const [stationElevation, setStationElevation] = useState('')
  const [locationDetecting, setLocationDetecting] = useState(false)
  
  const [theme, setTheme] = useState<'light' | 'dark' | 'auto'>(() => {
    const saved = localStorage.getItem('yahaml-theme')
    return (saved as any) || 'auto'
  })
  
  // Delete confirmation states
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [deleteConfirmType, setDeleteConfirmType] = useState<'special' | 'club' | 'radio' | null>(null)
  
  // Admin form state
  const [adminListInput, setAdminListInput] = useState('')
  const [availableContests, setAvailableContests] = useState<any[]>([])
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [loadingContests, setLoadingContests] = useState(false)
  
  // Station management state
  const [allStations, setAllStations] = useState<any[]>([])
  const [stationsLoading, setStationsLoading] = useState(false)
  
  // Scenario loading state
  const [scenarios, setScenarios] = useState<any[]>([])
  const [scenarioLoading, setScenarioLoading] = useState(false)
  const [scenarioLoadingId, setScenarioLoadingId] = useState<string | null>(null)
  const [scenarioLoadConfirm, setScenarioLoadConfirm] = useState<string | null>(null)
  
  // Apply theme
  useEffect(() => {
    localStorage.setItem('yahaml-theme', theme)
    const root = document.documentElement
    if (theme === 'auto') {
      root.classList.remove('theme-light', 'theme-dark')
    } else {
      root.classList.remove('theme-light', 'theme-dark')
      root.classList.add(`theme-${theme}`)
    }
  }, [theme])

  const selectedStation = useMemo(
    () => stations.find((station) => station.id === selectedStationId) || null,
    [stations, selectedStationId],
  )

  const sortedStations = useMemo(
    () => [...stations].sort((a, b) => a.callsign.localeCompare(b.callsign)),
    [stations],
  )

  const getAuthHeaders = (): Record<string, string> =>
    sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}

  const formatFrequencyMHz = (frequency?: string | null) => {
    if (!frequency) return '---.---'
    const hz = parseInt(frequency, 10)
    if (Number.isNaN(hz)) return '---.---'
    return (hz / 1_000_000).toFixed(3)
  }

  const toFrequencyHz = (input: string) => {
    const normalized = input.trim()
    if (!normalized) return null
    const mhz = Number(normalized)
    if (Number.isNaN(mhz)) return null
    return Math.round(mhz * 1_000_000)
  }

  const getRadioState = (radio: RadioConnection) => {
    const live = radioLiveState[radio.id]
    return {
      frequency: live?.frequency || radio.frequency || null,
      mode: live?.mode || radio.mode || null,
      bandwidth: live?.bandwidth ?? radio.bandwidth ?? null,
      power: live?.power ?? radio.power ?? null,
      ptt: live?.ptt ?? null,
      vfo: live?.vfo ?? null,
    }
  }

  const getControlInputs = (radio: RadioConnection) => {
    if (radioControlInputs[radio.id]) return radioControlInputs[radio.id]
    const state = getRadioState(radio)
    return {
      frequency: formatFrequencyMHz(state.frequency),
      power: state.power !== null && state.power !== undefined ? String(state.power) : '50',
      mode: state.mode || 'USB',
      bandwidth: state.bandwidth !== null && state.bandwidth !== undefined ? String(state.bandwidth) : '3000',
      raw: '',
    }
  }

  const setControlInput = (radioId: string, patch: Partial<{ frequency: string; power: string; mode: string; bandwidth: string; raw: string }>) => {
    setRadioControlInputs(prev => ({
      ...prev,
      [radioId]: {
        ...prev[radioId],
        ...patch,
      },
    }))
  }

  const refreshRadioState = async (radioId: string) => {
    try {
      const response = await fetch(`/api/radios/${radioId}/state`, {
        headers: { ...getAuthHeaders() },
      })
      if (!response.ok) return
      const data = await response.json()
      if (data?.state) {
        setRadioLiveState(prev => ({ ...prev, [radioId]: data.state }))
      }
    } catch {
      // silent
    }
  }

  const getBrowserId = () => {
    let id = localStorage.getItem(browserIdKey)
    if (!id) {
      id = crypto.randomUUID()
      localStorage.setItem(browserIdKey, id)
    }
    return id
  }

  const clearSession = () => {
    localStorage.removeItem(sessionTokenKey)
    setSessionToken('')
  }

  const establishSession = async (station: Station) => {
    try {
      const response = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          callsign: station.callsign,
          stationId: station.id,
          browserId: getBrowserId(),
        }),
      })

      if (!response.ok) {
        clearSession()
        return
      }

      const data = await response.json()
      localStorage.setItem(sessionTokenKey, data.token)
      setSessionToken(data.token)
    } catch (error) {
      console.error('Failed to create session:', error)
      clearSession()
    }
  }

  const activateCallsign = async (callsign: string) => {
    localStorage.setItem(storageKey, callsign)
    setCallsignInput(callsign)

    const station = stations.find((s) => s.callsign === callsign)
    if (station) {
      setSelectedStationId(station.id)
      await establishSession(station)
    }
    await fetchAdminList()
  }

  const clearCallsign = () => {
    localStorage.removeItem(storageKey)
    clearSession()
    setCallsignInput('')
    setSelectedStationId(null)
    setCurrentView('dashboard')
    setAllowCallsignSetup(false)
  }
  
  async function fetchContestTemplates() {
    try {
      const response = await fetch('/api/contest-templates')
      if (response.ok) {
        const data = await response.json()
        setContestTemplates(data)
      }
    } catch (err) {
      console.error('Failed to fetch contest templates:', err)
    }
  }

  async function fetchUpcomingContests() {
    try {
      const response = await fetch('/api/contests/upcoming?limit=10&showRecentDays=10')
      if (response.ok) {
        const data = await response.json()
        setUpcomingContests(data)
      }
    } catch (err) {
      console.error('Failed to fetch upcoming contests:', err)
    }
  }

  async function seedContestTemplates() {
    setTemplateSeeding(true)
    setTemplateSeedStatus(null)
    try {
      const response = await fetch('/api/contest-templates/seed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })

      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to seed templates')
      }

      setTemplateSeedStatus(payload.message || 'Templates seeded')
      await fetchContestTemplates()
    } catch (error) {
      setTemplateSeedStatus(
        error instanceof Error ? error.message : 'Failed to seed templates',
      )
    } finally {
      setTemplateSeeding(false)
    }
  }

  function formatTemplateJson(value: any) {
    if (!value) return ''
    try {
      const parsed = typeof value === 'string' ? JSON.parse(value) : value
      return JSON.stringify(parsed, null, 2)
    } catch {
      return typeof value === 'string' ? value : JSON.stringify(value, null, 2)
    }
  }

  function loadTemplateIntoEditor(template: any) {
    setTemplateEditor({
      id: template.id || '',
      type: template.type || '',
      name: template.name || '',
      description: template.description || '',
      organization: template.organization || '',
      scoringRules: formatTemplateJson(template.scoringRules),
      requiredFields: formatTemplateJson(template.requiredFields),
      validationRules: formatTemplateJson(template.validationRules),
      uiConfig: formatTemplateJson(template.uiConfig),
      isActive: template.isActive ?? true,
      isPublic: template.isPublic ?? true,
    })
    setTemplateEditorStatus(null)
    setTemplateEditorError(null)
  }

  function resetTemplateEditor() {
    setTemplateEditor({
      id: '',
      type: '',
      name: '',
      description: '',
      organization: '',
      scoringRules: '',
      requiredFields: '',
      validationRules: '',
      uiConfig: '',
      isActive: true,
      isPublic: true,
    })
    setTemplateEditorStatus(null)
    setTemplateEditorError(null)
  }

  async function submitTemplate(action: 'create' | 'update') {
    setTemplateEditorStatus(null)
    setTemplateEditorError(null)

    if (!templateEditor.type || !templateEditor.name) {
      setTemplateEditorError('Type and name are required')
      return
    }

    const parseJson = (value: string, label: string) => {
      if (!value.trim()) {
        throw new Error(`${label} JSON is required`)
      }
      try {
        return JSON.parse(value)
      } catch {
        throw new Error(`${label} JSON is invalid`)
      }
    }

    let scoringRules: any
    let requiredFields: any
    let validationRules: any
    let uiConfig: any = undefined

    try {
      scoringRules = parseJson(templateEditor.scoringRules, 'Scoring rules')
      requiredFields = parseJson(templateEditor.requiredFields, 'Required fields')
      validationRules = parseJson(templateEditor.validationRules, 'Validation rules')
      if (templateEditor.uiConfig.trim()) {
        uiConfig = JSON.parse(templateEditor.uiConfig)
      }
    } catch (error) {
      setTemplateEditorError(error instanceof Error ? error.message : 'Invalid JSON')
      return
    }

    const payload = {
      type: templateEditor.type.trim(),
      name: templateEditor.name.trim(),
      description: templateEditor.description.trim() || null,
      organization: templateEditor.organization.trim() || null,
      scoringRules,
      requiredFields,
      validationRules,
      uiConfig,
      isActive: templateEditor.isActive,
      isPublic: templateEditor.isPublic,
    }

    try {
      const response = await fetch(
        action === 'create'
          ? '/api/contest-templates'
          : `/api/contest-templates/${templateEditor.id}`,
        {
          method: action === 'create' ? 'POST' : 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      )

      const result = await response.json()
      if (!response.ok) {
        throw new Error(result?.error || 'Failed to save template')
      }

      setTemplateEditorStatus(
        action === 'create'
          ? 'Template created successfully'
          : 'Template updated successfully',
      )
      await fetchContestTemplates()

      if (action === 'create') {
        loadTemplateIntoEditor(result)
      }
    } catch (error) {
      setTemplateEditorError(
        error instanceof Error ? error.message : 'Failed to save template',
      )
    }
  }

  async function fetchStations() {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/stations')
      if (!response.ok) throw new Error('Failed to load stations')
      const data = (await response.json()) as Station[]
      setStations(data)
      const storedCallsign = localStorage.getItem(storageKey)
      const storedToken = localStorage.getItem(sessionTokenKey)
      
      // Restore session if we have both callsign and token (and haven't already selected a station)
      if (!selectedStationId && storedCallsign && storedToken && !sessionToken) {
        const matched = data.find((station) => station.callsign === storedCallsign)
        if (matched) {
          console.log('[SESSION] Restoring session for', storedCallsign)
          // Validate the token is still valid
          try {
            const validateResponse = await fetch('/api/sessions/me', {
              headers: { 'Authorization': `Bearer ${storedToken}` }
            })
            if (validateResponse.ok) {
              console.log('[SESSION] Session restored successfully')
              // Use the existing valid token instead of creating a new session
              setSessionToken(storedToken)
              setCallsignInput(storedCallsign)
              setSelectedStationId(matched.id)
            } else {
              console.log('[SESSION] Stored token invalid, clearing')
              localStorage.removeItem(sessionTokenKey)
              localStorage.removeItem(storageKey)
              setSessionToken('')
            }
          } catch (err) {
            console.warn('[SESSION] Failed to validate token:', err)
            localStorage.removeItem(sessionTokenKey)
            localStorage.removeItem(storageKey)
            setSessionToken('')
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  async function fetchStationDetails(stationId: string) {
    try {
      const stationResponse = await fetch(`/api/stations/${stationId}`)
      
      if (stationResponse.ok) {
        const station = await stationResponse.json()
        console.log('Loaded station:', station)
        // Populate form with station details
        setStationName(station.name || '')
        setStationLicenseClass(station.class || '')
        setStationAddress(station.address || '')
        setStationCity(station.city || '')
        setStationState(station.state || '')
        setStationZip(station.zip || '')
        setStationCountry(station.country || '')
        if (station.clubId) setStationClubId(station.clubId)
        if (station.locationId) setSelectedLocationId(station.locationId)
        if (station.contestId) setStationContestId(station.contestId)
        
        // Only load context/QSO logs if we have the station ID
        if (station.id) {
          const [contextResponse, qsoResponse] = await Promise.all([
            fetch(`/api/context-logs/${station.id}`),
            fetch(`/api/qso-logs/${station.id}`),
          ])
          if (contextResponse.ok) {
            setContextLogs((await contextResponse.json()) as ContextLog[])
          }
          if (qsoResponse.ok) {
            setQsoLogs((await qsoResponse.json()) as QsoLog[])
          }
        }
      } else if (stationResponse.status === 404) {
        console.log('Station not found (new station):', stationId)
        // Station doesn't exist yet - form stays empty for HamDB lookup
      } else {
        const err = await stationResponse.json().catch(() => ({}))
        console.error('Error loading station:', err)
      }
    } catch (err) {
      console.error('Error fetching station details:', err)
    }
  }

  async function fetchServices() {
    try {
      const response = await fetch('/api/services')
      if (response.ok) {
        setServices((await response.json()) as ServiceStatus)
      }
    } catch {
      // silent
    }
  }

  async function fetchContest() {
    try {
      const response = await fetch('/api/contests/active/current')
      if (response.ok) {
        setContest((await response.json()) as Contest)
      }
    } catch {
      // silent
    }
  }

  async function fetchAdminList() {
    try {
      if (!sessionToken) {
        setIsAdmin(false)
        return
      }
      const response = await fetch('/api/admin/callsigns', {
        headers: getAuthHeaders(),
      })
      if (response.ok) {
        const data = await response.json()
        setAdminCallsigns(data.callsigns || [])
        // Check if current callsign is admin
        const currentCall = localStorage.getItem(storageKey) || ''
        if (data.callsigns.length === 0) {
          setIsAdmin(true) // No list = everyone is admin
        } else {
          setIsAdmin(data.callsigns.includes(currentCall))
        }
      }
    } catch {
      setIsAdmin(false)
    }
  }

  async function fetchScenarios() {
    try {
      if (!isAdmin) return
      const response = await fetch('/api/admin/scenarios', {
        headers: getAuthHeaders(),
      })
      if (response.ok) {
        const data = await response.json()
        setScenarios(data.scenarios || [])
      }
    } catch (error) {
      console.error('Failed to fetch scenarios:', error)
    }
  }

  async function fetchAllStations() {
    try {
      setStationsLoading(true)
      const response = await fetch('/api/admin/stations', {
        headers: getAuthHeaders(),
      })
      if (response.ok) {
        const data = await response.json()
        setAllStations(Array.isArray(data) ? data : [])
      }
    } catch (error) {
      console.error('Failed to fetch stations:', error)
    } finally {
      setStationsLoading(false)
    }
  }

  async function deleteStation(stationId: string) {
    try {
      const response = await fetch(`/api/admin/stations/${stationId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      })
      if (response.ok) {
        addSuccess('Station deleted')
        await fetchAllStations()
      } else {
        const data = await response.json().catch(() => ({}))
        addError(data.error || 'Failed to delete station')
      }
    } catch (error) {
      addError(error instanceof Error ? error.message : 'Failed to delete station')
    }
  }

  async function clearStationSessions(stationId: string) {
    try {
      const response = await fetch(`/api/admin/stations/${stationId}/clear-sessions`, {
        method: 'POST',
        headers: getAuthHeaders(),
      })
      if (response.ok) {
        addSuccess('Sessions cleared')
        await fetchAllStations()
      } else {
        const data = await response.json().catch(() => ({}))
        addError(data.error || 'Failed to clear sessions')
      }
    } catch (error) {
      addError(error instanceof Error ? error.message : 'Failed to clear sessions')
    }
  }

  async function loadScenario(scenarioId: string) {
    try {
      setScenarioLoading(true)
      setScenarioLoadingId(scenarioId)
      const response = await fetch(`/api/admin/scenarios/${scenarioId}/load`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      })
      if (response.ok) {
        const data = await response.json()
        addSuccess(`Loaded: ${data.scenario.name}`)
        setScenarioLoadConfirm(null)
        // Refresh all data
        await Promise.all([fetchStations(), fetchClubs(), fetchAvailableContests(), fetchAllStations()])
      } else {
        const error = await response.json()
        addError(error.error || 'Failed to load scenario')
      }
    } catch (error: any) {
      addError(error.message || 'Failed to load scenario')
    } finally {
      setScenarioLoading(false)
      setScenarioLoadingId(null)
    }
  }

  async function fetchAvailableContests() {
    try {
      setLoadingContests(true)
      const response = await fetch('/api/contests')
      if (response.ok) {
        const data = await response.json()
        setAvailableContests(data)
      }
    } catch (error) {
      console.error('Failed to fetch contests:', error)
    } finally {
      setLoadingContests(false)
    }
  }

  async function activateContest(contestId: string) {
    try {
      const response = await fetch(`/api/admin/activate-contest/${contestId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({}),
      })
      if (response.ok) {
        await fetchContest()
        await fetchAvailableContests()
      }
    } catch (error) {
      console.error('Failed to activate contest:', error)
    }
  }

  async function deactivateContest() {
    if (!contest) return
    try {
      const response = await fetch('/api/admin/deactivate-contest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ contestId: contest.id }),
      })
      if (response.ok) {
        await fetchContest()
        await fetchAvailableContests()
      }
    } catch (error) {
      console.error('Failed to deactivate contest:', error)
    }
  }

  async function fetchClubs() {
    try {
      const response = await fetch('/api/clubs')
      if (response.ok) {
        const data = await response.json()
        setClubs(data)
      }
    } catch {
      // silent
    }
  }

  async function fetchSpecialCallsigns() {
    try {
      const response = await fetch('/api/special-callsigns')
      if (response.ok) {
        const data = await response.json()
        setSpecialCallsigns(data)
      }
    } catch {
      // silent
    }
  }

  async function fetchRadios() {
    try {
      const response = await fetch('/api/radios')
      if (response.ok) {
        const data = await response.json()
        setRadios(data)
      }
    } catch {
      // silent
    }
  }

  /*async function fetchRadioAssignments() {
    try {
      const response = await fetch('/api/radio-assignments/active')
      if (response.ok) {
        const data = await response.json()
        setRadioAssignments(data)
      }
    } catch {
      // silent
    }
  }*/

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async function activateFieldDay() {
    try {
      const response = await fetch('/api/admin/activate-field-day', {
        method: 'POST',
        headers: { ...getAuthHeaders() },
      })
      if (response.ok) {
        const data = await response.json()
        setContest(data.contest)
        await fetchContest()
      }
    } catch (err) {
      console.error('Failed to activate Field Day:', err)
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async function stopContest() {
    try {
      const response = await fetch('/api/admin/stop-contest', {
        method: 'POST',
        headers: { ...getAuthHeaders() },
      })
      if (response.ok) {
        setContest(null)
        await fetchContest()
      }
    } catch (err) {
      console.error('Failed to stop contest:', err)
    }
  }

  async function saveCallsign() {
    const callsign = callsignInput.trim().toUpperCase()
    if (!callsign) {
      addError('Callsign is required')
      setStationFormErrors((prev) => ({ ...prev, callsign: 'Callsign is required' }))
      return
    }
    setStationFormErrors((prev) => ({ ...prev, callsign: undefined }))

    try {
      let stationRecord: Station | null = null
      // Check if station exists
      let response = await fetch(`/api/stations?callsign=${encodeURIComponent(callsign)}`)
      let stationsList = await response.json()
      
      if (!Array.isArray(stationsList)) {
        stationsList = []
      }

      if (stationsList.length === 0) {
        // Create new station
        response = await fetch('/api/stations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ callsign, name: callsign }),
        })
        if (response.ok) {
          const newStation = await response.json()
          stationRecord = newStation
          // Add to local state without triggering fetchStationDetails
          setStations((prev) => [...prev, newStation])
        } else {
          const data = await response.json().catch(() => ({}))
          if (response.status === 409) {
            addError('Callsign already exists. Select it from the station list.')
            setStationFormErrors((prev) => ({
              ...prev,
              callsign: 'Callsign already exists. Select it from the station list.',
            }))
            return
          }
          if (data.details) {
            addError(`${data.error || 'Failed to save callsign'}: ${data.details}`)
            if ((data.details as string).toLowerCase().includes('callsign')) {
              setStationFormErrors((prev) => ({
                ...prev,
                callsign: data.details,
              }))
            }
            return
          }
          addError(data.error || 'Failed to save callsign')
          return
        }
      } else {
        // Station already exists, load its profile
        stationRecord = stationsList[0] || null
      }
      
      localStorage.setItem(storageKey, callsign)
      setCallsignInput(callsign)
      if (stationRecord?.id) {
        setSelectedStationId(stationRecord.id)
        await fetchStationDetails(stationRecord.id)
        await establishSession(stationRecord)
        setAllowCallsignSetup(false)
      }
      setStationFormErrors((prev) => ({ ...prev, callsign: undefined }))
      await fetchAdminList() // Recheck admin status
      // Don't load station details here - let user keep their HamDB lookup results
      // They'll be saved when they click "Save Operator Information"
    } catch (error) {
      console.error('Failed to save callsign:', error)
      addError('Failed to save callsign')
    }
  }

  const handleCallsignSelect = async (value: string) => {
    if (value === '__new__') {
      setCallsignInput('')
      setAllowCallsignSetup(true)
      setCurrentView('station')
      setShowCallsignPicker(false)
      return
    }
    if (value === '__unset__') {
      clearCallsign()
      setAllowCallsignSetup(false)
      setShowCallsignPicker(false)
      return
    }
    if (!value) {
      return
    }
    await activateCallsign(value)
    setAllowCallsignSetup(false)
    setShowCallsignPicker(false)
  }

  async function lookupCallsignInHamDB(callsign: string) {
    setStationLookupLoading(true)
    try {
      const response = await fetch(`/api/callsign/lookup/${callsign}`)
      if (response.ok) {
        const data = await response.json()
        setStationName(data.name || '')
        setStationAddress(data.address || '')
        setStationCity(data.city || '')
        setStationState(data.state || '')
        setStationZip(data.zip || '')
        setStationCountry(data.country || '')
        setStationLicenseClass(data.class || '')
      } else {
        addError(`Callsign ${callsign} not found in HamDB`)
      }
    } catch (error) {
      addError('Failed to lookup callsign')
    } finally {
      setStationLookupLoading(false)
    }
  }

  async function saveStationDetails() {
    const callsign = localStorage.getItem(storageKey)
    if (!callsign) {
      addError('No active callsign selected')
      setStationFormErrors((prev) => ({
        ...prev,
        callsign: 'Save your callsign first before adding operator details.',
      }))
      return
    }
    setStationFormErrors((prev) => ({ ...prev, callsign: undefined, clubId: undefined }))

    try {
      const response = await fetch(`/api/stations/${callsign}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          name: stationName,
          class: stationLicenseClass,
          address: stationAddress,
          city: stationCity,
          state: stationState,
          zip: stationZip,
          country: stationCountry,
          clubId: stationClubId || null,
        }),
      })
      if (response.ok) {
        await fetchStations()
        addSuccess('Station details saved')
      } else {
        const data = await response.json().catch(() => ({}))
        if (response.status === 404) {
          // Auto-create station on first save, then retry update once
          const createResponse = await fetch('/api/stations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ callsign, name: stationName || callsign }),
          })
          if (!createResponse.ok) {
            const createData = await createResponse.json().catch(() => ({}))
            if (createData.details) {
              addError(`${createData.error || 'Failed to create station'}: ${createData.details}`)
              if ((createData.details as string).toLowerCase().includes('callsign')) {
                setStationFormErrors((prev) => ({
                  ...prev,
                  callsign: createData.details,
                }))
              }
              return
            }
            addError(createData.error || 'Failed to create station')
            return
          }
          const retryResponse = await fetch(`/api/stations/${callsign}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
            body: JSON.stringify({
              name: stationName,
              class: stationLicenseClass,
              address: stationAddress,
              city: stationCity,
              state: stationState,
              zip: stationZip,
              country: stationCountry,
              clubId: stationClubId || null,
            }),
          })
          if (retryResponse.ok) {
            await fetchStations()
            addSuccess('Station created and details saved')
            return
          }
          const retryData = await retryResponse.json().catch(() => ({}))
          if (retryData.details) {
            addError(`${retryData.error || 'Failed to save station details'}: ${retryData.details}`)
            if ((retryData.details as string).toLowerCase().includes('club')) {
              setStationFormErrors((prev) => ({
                ...prev,
                clubId: retryData.details,
              }))
            }
            return
          }
          addError(retryData.error || 'Failed to save station details')
          return
        }
        if (data.details) {
          addError(`${data.error || 'Failed to save station details'}: ${data.details}`)
          if ((data.details as string).toLowerCase().includes('club')) {
            setStationFormErrors((prev) => ({
              ...prev,
              clubId: data.details,
            }))
          }
          return
        }
        addError(data.error || 'Failed to save station details')
      }
    } catch (error) {
      addError('Failed to save station details')
    }
  }

  async function updateStationClub(clubId: string) {
    const callsign = localStorage.getItem(storageKey)
    if (!callsign) return

    try {
      const response = await fetch(`/api/stations/${callsign}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ clubId: clubId || null }),
      })
      if (response.ok) {
        setStationClubId(clubId)
        await fetchStations()
        addSuccess('Club association updated')
      } else {
        addError('Failed to update club association')
      }
    } catch (error) {
      addError('Failed to update club association')
    }
  }

  async function updateStationContest(contestId: string) {
    const callsign = localStorage.getItem(storageKey)
    if (!callsign) return

    try {
      const response = await fetch(`/api/stations/${callsign}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ contestId: contestId || null }),
      })
      if (response.ok) {
        setStationContestId(contestId)
        await fetchStations()
        addSuccess('Contest participation updated')
      } else {
        addError('Failed to update contest')
      }
    } catch (error) {
      addError('Failed to update contest')
    }
  }

  useEffect(() => {
    // Connect to WebSocket for real-time updates
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`)
    
    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data)
        
        // Handle band/mode change updates from relay
        if (message.type === 'bandModeChange') {
          console.log('Band/mode change:', message.data)
          // Update the station in our state
          setStations(prev => prev.map(station => 
            station.id === message.data.stationId
              ? { ...station, currentBand: message.data.band, currentMode: message.data.mode }
              : station
          ))
        }
      } catch (error) {
        console.error('WebSocket message parse error:', error)
      }
    }
    
    ws.onerror = (error) => {
      console.error('WebSocket error:', error)
    }
    
    return () => {
      ws.close()
    }
  }, [])

  useEffect(() => {
    fetchStations()
    fetchServices()
    fetchContest()
    fetchAdminList()
    fetchScenarios()
    fetchClubs()
    fetchSpecialCallsigns()
    fetchContestTemplates()
    fetchRadios()
    fetchLocations()
    fetchAllStations()
    // fetchRadioAssignments()
  }, [])

  useEffect(() => {
    // Update admin list input when admin callsigns change
    setAdminListInput(adminCallsigns.join(', '))
  }, [adminCallsigns])

  useEffect(() => {
    // Recheck admin status when callsign changes
    const currentCall = localStorage.getItem(storageKey) || ''
    if (adminCallsigns.length === 0) {
      setIsAdmin(true)
    } else {
      setIsAdmin(adminCallsigns.includes(currentCall))
    }
  }, [callsignInput, adminCallsigns])

  useEffect(() => {
    if (selectedStationId) {
      fetchStationDetails(selectedStationId)
    }
  }, [selectedStationId])

  useEffect(() => {
    const storedCall = localStorage.getItem(storageKey)
    if (!storedCall) return
    const station = stations.find((s) => s.callsign === storedCall)
    if (station) {
      if (selectedStationId !== station.id) {
        setSelectedStationId(station.id)
      }
      if (!sessionToken) {
        establishSession(station)
      }
    }
  }, [stations, selectedStationId, sessionToken])

  useEffect(() => {
    if (!autoRefresh) return
    const interval = setInterval(() => {
      fetchStations()
      // Don't fetch station details on auto-refresh - it resets the form
    }, 5000)
    return () => clearInterval(interval)
  }, [autoRefresh])

  useEffect(() => {
    if (currentView === 'admin') {
      fetchAvailableContests()
      fetchScenarios()
    }
  }, [currentView])

  useEffect(() => {
    if (currentView === 'club') {
      fetchAvailableContests()
    }
  }, [currentView])

  useEffect(() => {
    // Refetch scenarios when admin status changes
    if (isAdmin) {
      fetchScenarios()
    }
  }, [isAdmin])

  useEffect(() => {
    if (clubContestId) return
    if (contest?.isActive) {
      setClubContestId(contest.id)
      return
    }
    if (availableContests.length > 0) {
      setClubContestId(availableContests[0].id)
    }
  }, [clubContestId, contest, availableContests])

  const addMessage = (msg: string, type: 'error' | 'success' = 'error') => {
    setGlobalMessages(prev => [...prev, { text: msg, type }])
    setTimeout(() => {
      setGlobalMessages(prev => prev.slice(1))
    }, 3000)
  }
  
  // Backwards compatibility
  const addError = (msg: string) => addMessage(msg, 'error')
  const addSuccess = (msg: string) => addMessage(msg, 'success')

  const currentCallsign = localStorage.getItem(storageKey) || ''
  const callsignDisplay = currentCallsign || 'Not set'
  const hasActiveCallsign = currentCallsign.trim().length > 0
  const effectiveView = hasActiveCallsign
    ? currentView
    : allowCallsignSetup
      ? 'station'
      : 'dashboard'

  useEffect(() => {
    if (effectiveView === 'logging') return
    const callsign = localStorage.getItem(storageKey) || 'Not set'
    const station = stations.find((s) => s.id === selectedStationId)
    const band = station?.currentBand ? `${station.currentBand}m` : '---m'
    const mode = station?.currentMode ? station.currentMode.toUpperCase() : '---'
    document.title = `YAHAML — ${callsign} — ${band} ${mode}`
  }, [stations, selectedStationId, callsignInput, effectiveView])

  const handleViewChange = (view: ViewType) => {
    if (!hasActiveCallsign && view !== 'dashboard' && !(view === 'station' && allowCallsignSetup)) {
      addError('Select a callsign to continue.')
      return
    }
    setCurrentView(view)
  }

  function renderDashboard() {
    return (
      <div className="dashboard-grid dashboard-v2">
        {/* Row 1: System Status + Active Stations */}
        <section className="panel system-panel">
          <h2>System Status</h2>
          <div className="toggle-row">
            <label>
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(event) => setAutoRefresh(event.target.checked)}
              />
              Auto refresh (5s)
            </label>
          </div>
          
          <div className="services-grid">
            {services && (
              <>
                <div className="service-card">
                  <div className="service-label">API Server</div>
                  <div className="service-port">{services.api.port}</div>
                  <div className="service-status running">Running</div>
                </div>
                <div className="service-card">
                  <div className="service-label">Relay (TCP)</div>
                  <div className="service-port">{services.relay.port}</div>
                  <div className="service-status running">Running</div>
                </div>
                <div className="service-card">
                  <div className="service-label">UDP Log</div>
                  <div className="service-port">{services.udp.port}</div>
                  <div className="service-status running">Running</div>
                </div>
              </>
            )}
          </div>

          <div className="stats">
            <div>
              <span className="label">Stations</span>
              <strong>{stations.length}</strong>
            </div>
            <div>
              <span className="label">Total QSOs</span>
              <strong>
                {stations.reduce((sum, s) => sum + s._count.qsoLogs, 0)}
              </strong>
            </div>
            <div>
              <span className="label">Events</span>
              <strong>
                {stations.reduce((sum, s) => sum + s._count.contextLogs, 0)}
              </strong>
            </div>
          </div>
        </section>

        {/* Row 2: Band Occupancy + Messages */}
        <div className="dashboard-row">
          <BandOccupancy contestId={contest?.id} className="flex-1" />
          <MessageCenter contestId={contest?.id} className="flex-1" maxMessages={10} />
        </div>

        {/* Row 3: QSO Map + Stats */}
        <div className="dashboard-row">
          <QSOMap contestId={contest?.id} className="flex-1" height="500px" />
          <StatsPanel contestId={contest?.id} className="flex-1" />
        </div>
      </div>
    )
  }

  function renderClubView() {
    const saveClub = async () => {
      if (!clubCallsign || !clubName) {
        addError('Club callsign and name are required.')
        return
      }

      try {
        const response = await fetch('/api/clubs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            callsign: clubCallsign.toUpperCase(),
            name: clubName,
            section: clubSection || undefined,
            grid: clubGrid || undefined,
          }),
        })
        if (response.ok) {
          setClubSaveError(null)
          await fetchClubs()
          setClubCallsign('')
          setClubName('')
          setClubSection('')
          setClubGrid('')
        } else {
          const errData = await response.json()
          addError(`Failed to save club: ${errData.error || 'Unknown error'}`)
        }
      } catch (error: any) {
        addError(`Club save failed: ${error.message}`)
      }
    }
    
    const validateSpecialCallsignForm = () => {
      if (!specialCallsign) return 'Callsign is required'
      if (!specialEventName) return 'Event name is required'
      if (!specialStartDate) return 'Start date/time is required'
      if (!specialEndDate) return 'End date/time is required'
      
      const start = new Date(specialStartDate)
      const end = new Date(specialEndDate)
      if (end <= start) return 'End date must be after start date'
      
      return null
    }

    const saveSpecialCallsign = async () => {
      const error = validateSpecialCallsignForm()
      if (error) {
        addError(error)
        return
      }
      
      try {
        const response = await fetch('/api/special-callsigns', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            callsign: specialCallsign.toUpperCase(),
            eventName: specialEventName,
            description: specialDescription || undefined,
            startDate: specialStartDate,
            endDate: specialEndDate,
            clubId: specialClubId || undefined,
          }),
        })
        if (response.ok) {
          await fetchSpecialCallsigns()
          setSpecialCallsign('')
          setSpecialEventName('')
          setSpecialDescription('')
          setSpecialStartDate('')
          setSpecialEndDate('')
          setSpecialClubId('')
        } else {
          const data = await response.json()
          addError(data.error || 'Failed to save special callsign')
        }
      } catch (error) {
        addError('Failed to save special callsign')
      }
    }
    
    const deleteSpecialCallsign = async (id: string) => {
      try {
        const response = await fetch(`/api/special-callsigns/${id}`, {
          method: 'DELETE',
        })
        if (response.ok) {
          await fetchSpecialCallsigns()
          setDeleteConfirmId(null)
          setDeleteConfirmType(null)
        } else {
          const data = await response.json()
          addError(data.error || 'Failed to delete special callsign')
        }
      } catch (error) {
        addError('Failed to delete special callsign')
      }
    }
    
    const toggleClubActive = async (clubId: string, currentStatus: boolean) => {
      try {
        const response = await fetch(`/api/clubs/${clubId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isActive: !currentStatus }),
        })
        if (response.ok) {
          await fetchClubs()
        }
      } catch (error) {
        console.error('Failed to toggle club status:', error)
      }
    }
    
    const deleteClub = async (clubId: string) => {
      try {
        const response = await fetch(`/api/clubs/${clubId}`, {
          method: 'DELETE',
        })
        if (response.ok) {
          await fetchClubs()
          setDeleteConfirmId(null)
          setDeleteConfirmType(null)
        }
      } catch (error) {
        console.error('Failed to delete club:', error)
      }
    }
    
    return (
      <div className="view-container">
        <div className="view-header">
          <h1>Club & Event Setup</h1>
          <p className="view-description">
            Configure club callsigns, special event calls, and contest details
          </p>
        </div>
        <div className="view-content">
          {clubs.length > 0 && (
            <section className="panel">
              <h2>Existing Clubs</h2>
              {clubs.map((club: any) => {
                const hasLogs = club.stations?.some((s: any) => s.qsoLogs?.length > 0) || false
                const stationCount = club.stations?.length || 0
                const qsoCount = club.stations?.reduce((sum: number, s: any) => sum + (s.qsoLogs?.length || 0), 0) || 0
                
                return (
                  <div 
                    key={club.id} 
                    style={{ 
                      padding: '1rem', 
                      background: club.isActive ? 'var(--surface-muted)' : 'var(--surface)', 
                      borderRadius: '6px', 
                      marginBottom: '0.5rem',
                      opacity: club.isActive ? 1 : 0.6,
                      border: club.isActive ? 'none' : '1px dashed var(--border)'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                          <strong style={{ fontSize: '1.1rem' }}>{club.callsign}</strong>
                          {!club.isActive && (
                            <span style={{ 
                              fontSize: '0.75rem', 
                              padding: '0.25rem 0.5rem', 
                              background: 'var(--text-muted)', 
                              borderRadius: '4px' 
                            }}>
                              DISABLED
                            </span>
                          )}
                        </div>
                        <div style={{ marginTop: '0.25rem' }}>{club.name}</div>
                        {club.section && <div style={{ fontSize: '0.9rem', opacity: 0.7, marginTop: '0.25rem' }}>Section: {club.section}</div>}
                        {club.grid && <div style={{ fontSize: '0.9rem', opacity: 0.7 }}>Grid: {club.grid}</div>}
                        <div style={{ fontSize: '0.85rem', opacity: 0.8, marginTop: '0.5rem' }}>
                          {stationCount} station{stationCount !== 1 ? 's' : ''} • {qsoCount} QSO{qsoCount !== 1 ? 's' : ''}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button 
                          className={`btn ${club.isActive ? 'secondary' : 'primary'}`}
                          style={{ fontSize: '0.85rem', padding: '0.4rem 0.8rem' }}
                          onClick={() => toggleClubActive(club.id, club.isActive)}
                        >
                          {club.isActive ? '⏸ Disable' : '▶️ Enable'}
                        </button>
                        {!hasLogs && (
                          deleteConfirmId === club.id && deleteConfirmType === 'club' ? (
                            <>
                              <span style={{ fontSize: '0.85rem', opacity: 0.8, alignSelf: 'center' }}>Sure?</span>
                              <button 
                                className="btn danger" 
                                style={{ fontSize: '0.85rem', padding: '0.4rem 0.8rem' }}
                                onClick={() => deleteClub(club.id)}
                              >
                                Yes
                              </button>
                              <button 
                                className="btn secondary" 
                                style={{ fontSize: '0.85rem', padding: '0.4rem 0.8rem' }}
                                onClick={() => { setDeleteConfirmId(null); setDeleteConfirmType(null); }}
                              >
                                No
                              </button>
                            </>
                          ) : (
                            <button 
                              className="btn danger" 
                              style={{ fontSize: '0.85rem', padding: '0.4rem 0.8rem' }}
                              onClick={() => { setDeleteConfirmId(club.id); setDeleteConfirmType('club'); }}
                            >
                              🗑 Delete
                            </button>
                          )
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </section>
          )}
          
          <section className="panel">
            <h2>Add New Club</h2>
            <div className="form-grid">
              <div className="field">
                <label>Club Callsign *</label>
                <input 
                  type="text" 
                  placeholder="W1AW" 
                  value={clubCallsign}
                  onChange={(e) => setClubCallsign(e.target.value)}
                />
              </div>
              <div className="field">
                <label>Club Name *</label>
                <input 
                  type="text" 
                  placeholder="ARRL HQ" 
                  value={clubName}
                  onChange={(e) => setClubName(e.target.value)}
                />
              </div>
              <div className="field">
                <label>ARRL Section</label>
                <input 
                  type="text" 
                  placeholder="CT" 
                  value={clubSection}
                  onChange={(e) => setClubSection(e.target.value)}
                />
              </div>
              <div className="field">
                <label>Grid Square</label>
                <input 
                  type="text" 
                  placeholder="FN31pr" 
                  value={clubGrid}
                  onChange={(e) => setClubGrid(e.target.value)}
                />
              </div>
            </div>
            <div className="action-buttons" style={{ marginTop: '0' }}>
              <button
                className="btn primary"
                onClick={saveClub}
                disabled={!clubCallsign || !clubName}
              >
                💾 Save Club
              </button>
            </div>
          </section>

          <section className="panel">
            <h2>Special Event Callsigns</h2>
            <p className="hint">Manage special event callsigns with specific date ranges</p>
            
            {specialCallsigns.length > 0 && (
              <div style={{ marginBottom: '1.5rem' }}>
                <h3 style={{ fontSize: '0.9rem', marginBottom: '0.5rem', opacity: 0.8 }}>Active & Scheduled</h3>
                {specialCallsigns.map((sc: any) => {
                  const now = new Date()
                  const start = new Date(sc.startDate)
                  const end = new Date(sc.endDate)
                  const isActive = sc.isActive && now >= start && now <= end
                  const isPending = now < start
                  const isExpired = now > end
                  
                  return (
                    <div key={sc.id} style={{ 
                      padding: '1rem', 
                      background: isActive ? 'var(--accent-muted)' : 'var(--surface-muted)', 
                      borderRadius: '6px', 
                      marginBottom: '0.5rem',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}>
                      <div>
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                          <strong>{sc.callsign}</strong>
                          {isActive && <span style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem', background: 'var(--accent)', borderRadius: '4px' }}>ACTIVE</span>}
                          {isPending && <span style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem', background: 'var(--border)', borderRadius: '4px' }}>PENDING</span>}
                          {isExpired && <span style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem', background: 'var(--text-muted)', borderRadius: '4px' }}>EXPIRED</span>}
                        </div>
                        <div style={{ fontSize: '0.9rem', marginTop: '0.25rem' }}>{sc.eventName}</div>
                        <div style={{ fontSize: '0.8rem', opacity: 0.7, marginTop: '0.25rem' }}>
                          {new Date(sc.startDate).toLocaleDateString()} - {new Date(sc.endDate).toLocaleDateString()}
                        </div>
                        {sc.description && <div style={{ fontSize: '0.85rem', marginTop: '0.25rem', opacity: 0.8 }}>{sc.description}</div>}
                      </div>
                      {deleteConfirmId === sc.id && deleteConfirmType === 'special' ? (
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.85rem', opacity: 0.8 }}>Sure?</span>
                          <button 
                            className="btn danger" 
                            style={{ fontSize: '0.85rem', padding: '0.4rem 0.8rem' }}
                            onClick={() => deleteSpecialCallsign(sc.id)}
                          >
                            Yes
                          </button>
                          <button 
                            className="btn secondary" 
                            style={{ fontSize: '0.85rem', padding: '0.4rem 0.8rem' }}
                            onClick={() => { setDeleteConfirmId(null); setDeleteConfirmType(null); }}
                          >
                            No
                          </button>
                        </div>
                      ) : (
                        <button 
                          className="btn danger" 
                          style={{ fontSize: '0.85rem', padding: '0.4rem 0.8rem' }}
                          onClick={() => { setDeleteConfirmId(sc.id); setDeleteConfirmType('special'); }}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
            
            <h3 style={{ fontSize: '0.9rem', marginBottom: '0.5rem', opacity: 0.8 }}>Add New Special Event Callsign</h3>
            <div className="form-grid">
              <div className="field">
                <label>Callsign *</label>
                <input
                  type="text"
                  placeholder="W1AW"
                  value={specialCallsign}
                  onChange={(e) => setSpecialCallsign(e.target.value)}
                />
              </div>
              <div className="field">
                <label>Event Name *</label>
                <input
                  type="text"
                  placeholder="Field Day 2026"
                  value={specialEventName}
                  onChange={(e) => setSpecialEventName(e.target.value)}
                />
              </div>
              <div className="field">
                <label>Start Date/Time *</label>
                <input
                  type="datetime-local"
                  value={specialStartDate}
                  onChange={(e) => setSpecialStartDate(e.target.value)}
                />
              </div>
              <div className="field">
                <label>End Date/Time *</label>
                <input
                  type="datetime-local"
                  value={specialEndDate}
                  onChange={(e) => setSpecialEndDate(e.target.value)}
                />
              </div>
              <div className="field" style={{ gridColumn: '1 / -1' }}>
                <label>Description</label>
                <input
                  type="text"
                  placeholder="Annual Field Day operation"
                  value={specialDescription}
                  onChange={(e) => setSpecialDescription(e.target.value)}
                />
              </div>
              <div className="field">
                <label>Associated Club (Optional)</label>
                <div className="quick-select">
                  <button
                    type="button"
                    className={`quick-btn ${specialClubId === '' ? 'active' : ''}`}
                    onClick={() => setSpecialClubId('')}
                  >
                    None
                  </button>
                  {clubs.map((club: any) => (
                    <button
                      key={club.id}
                      type="button"
                      className={`quick-btn ${specialClubId === club.id ? 'active' : ''}`}
                      onClick={() => setSpecialClubId(club.id)}
                    >
                      {club.callsign}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="action-buttons" style={{ marginTop: '0' }}>
              <button 
                className="btn primary" 
                onClick={saveSpecialCallsign}
                disabled={Boolean(validateSpecialCallsignForm())}
              >
                💾 Save Special Callsign
              </button>
            </div>
          </section>


        </div>
      </div>
    )
  }

  function renderContestsView() {
    return (
      <div className="view-container">
        <div className="view-header">
          <h1>Contest Management</h1>
          <p className="view-description">
            Upcoming contests, rules, templates, and contest-specific configurations
          </p>
        </div>
        <div className="view-content">
          <section className="panel">
            <h2>Active Contest</h2>
            {contest && contest.isActive ? (
              <div className="contest-card active-contest">
                <h3>{contest.name}</h3>
                <div className="contest-stats">
                  <div>
                    <span>Mode:</span>
                    <strong>{contest.mode}</strong>
                  </div>
                  <div>
                    <span>QSOs:</span>
                    <strong>{contest.totalQsos}</strong>
                  </div>
                  <div>
                    <span>Points:</span>
                    <strong>{contest.totalPoints}</strong>
                  </div>
                </div>
                {isAdmin && (
                  <div className="action-buttons" style={{ marginTop: '1rem' }}>
                    <button className="btn danger" onClick={() => deactivateContest()}>
                      ⏹️ Stop Contest
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div>
                <p className="empty">No active contest</p>
                {isAdmin && (
                  <div style={{ marginTop: '1rem' }}>
                    <p className="hint" style={{ marginBottom: '1rem' }}>Admin: Activate a contest from the list below</p>
                    <button className="btn secondary" onClick={fetchAvailableContests}>
                      🔄 Refresh Contests
                    </button>
                    {availableContests.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '1rem' }}>
                        {availableContests
                          .filter(c => !c.isActive)
                          .map(c => (
                            <div
                              key={c.id}
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                padding: '0.75rem',
                                border: '1px solid var(--border-color)',
                                borderRadius: '4px',
                                backgroundColor: 'var(--bg-secondary)',
                              }}
                            >
                              <div>
                                <strong>{c.name}</strong>
                                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                  {c.template?.type || 'Unknown'} • {c.totalQsos} QSOs
                                </div>
                              </div>
                              <button
                                className="btn primary"
                                onClick={() => activateContest(c.id)}
                                style={{ whiteSpace: 'nowrap' }}
                              >
                                ⚡ Activate
                              </button>
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </section>

          <section className="panel">
            <h2>Upcoming Contests</h2>
            <p className="hint">Calculated from template rules - shows recent and upcoming events</p>
            {(!upcomingContests || upcomingContests.length === 0) && (
              <div className="empty-state">
                <p className="empty">No upcoming contests scheduled.</p>
              </div>
            )}
            {upcomingContests && upcomingContests.length > 0 && (
              <div className="contest-list">
                {upcomingContests.map((contest: any, idx: number) => {
                const ui = contest.template.uiConfig || {}
                const schedule = contest.template.schedule || null
                const startDate = new Date(contest.startDate)
                const endDate = new Date(contest.endDate)
                const daysUntil = contest.daysUntil

                const formatDate = () => {
                  if (contest.status === 'active') {
                    return `🔴 ACTIVE NOW - Ends ${endDate.toLocaleDateString()}`
                  }
                  if (contest.status === 'recent') {
                    return `✓ Recently Ended - ${endDate.toLocaleDateString()}`
                  }
                  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
                  const month = monthNames[startDate.getMonth()]
                  const startDay = startDate.getDate()
                  
                  if (schedule?.duration?.hours > 24) {
                    const endDay = endDate.getDate()
                    return `${month} ${startDay}-${endDay}, ${startDate.getFullYear()}`
                  }
                  return `${month} ${startDay}, ${startDate.getFullYear()}`
                }

                const getDaysText = () => {
                  if (contest.status === 'active') return 'In Progress'
                  if (contest.status === 'recent') {
                    const daysAgo = Math.abs(daysUntil)
                    if (daysAgo === 0) return 'Ended today'
                    if (daysAgo === 1) return 'Ended yesterday'
                    return `Ended ${daysAgo} days ago`
                  }
                  if (daysUntil === 0) return 'Today!'
                  if (daysUntil === 1) return 'Tomorrow'
                  if (daysUntil < 7) return `In ${daysUntil} days`
                  if (daysUntil < 30) return `In ${Math.floor(daysUntil / 7)} weeks`
                  if (daysUntil < 365) return `In ${Math.floor(daysUntil / 30)} months`
                  return `In ${Math.floor(daysUntil / 365)} years`
                }

                return (
                  <div 
                    key={idx} 
                    className={`contest-list-item ${contest.status === 'active' ? 'active' : ''} ${contest.status === 'recent' ? 'recent' : ''}`}
                    style={{ 
                      borderLeft: contest.status === 'active' ? '4px solid var(--success)' : 
                                 contest.status === 'recent' ? '4px solid var(--text-muted)' : undefined 
                    }}
                  >
                    <div className="contest-icon">{ui.icon || '📅'}</div>
                    <div className="contest-info">
                      <h4>{contest.template.name}</h4>
                      <p className="contest-date">{formatDate()}</p>
                      <p className="contest-countdown">{getDaysText()}</p>
                    </div>
                    {ui.helpUrl && (
                      <a
                        href={ui.helpUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn secondary"
                        style={{ fontSize: '0.85rem', padding: '0.4rem 0.8rem' }}
                      >
                        Rules
                      </a>
                    )}
                  </div>
                )
              })}
              </div>
            )}
          </section>

          <section className="panel">
            <h2>Contest Templates</h2>
            <p className="hint">
              Select a template to create a new contest with predefined rules and scoring
            </p>
            {contestTemplates.length === 0 && (
              <div className="empty-state">
                <p className="empty">No contest templates found.</p>
                <button
                  className="btn btn-primary"
                  onClick={seedContestTemplates}
                  disabled={templateSeeding}
                >
                  {templateSeeding ? 'Seeding Templates…' : 'Seed Standard Templates'}
                </button>
                {templateSeedStatus && (
                  <p className="hint" style={{ marginTop: '0.75rem' }}>
                    {templateSeedStatus}
                  </p>
                )}
              </div>
            )}

            {contestTemplates.length > 0 && (
              <div className="template-filters" style={{ 
                display: 'flex', 
                gap: '1rem', 
                marginBottom: '1.5rem',
                flexWrap: 'wrap'
              }}>
                <div className="field" style={{ flex: '1 1 300px', minWidth: '200px' }}>
                  <label htmlFor="template-search">🔍 Search</label>
                  <input
                    id="template-search"
                    type="text"
                    placeholder="Search by name, type, or description..."
                    value={templateFilter}
                    onChange={(e) => setTemplateFilter(e.target.value)}
                  />
                </div>
                <div className="field" style={{ flex: '0 1 200px', minWidth: '150px' }}>
                  <label htmlFor="org-filter">Organization</label>
                  <select
                    id="org-filter"
                    value={templateOrgFilter}
                    onChange={(e) => setTemplateOrgFilter(e.target.value)}
                  >
                    <option value="all">All Organizations</option>
                    {Array.from(new Set(contestTemplates.map(t => t.organization))).sort().map(org => (
                      <option key={org} value={org}>{org}</option>
                    ))}
                  </select>
                </div>
                {(templateFilter || templateOrgFilter !== 'all') && (
                  <button 
                    className="btn secondary"
                    style={{ alignSelf: 'flex-end', padding: '0.6rem 1rem' }}
                    onClick={() => {
                      setTemplateFilter('')
                      setTemplateOrgFilter('all')
                    }}
                  >
                    Clear Filters
                  </button>
                )}
              </div>
            )}

            <div className="contest-templates">
              {contestTemplates
                .filter((template) => {
                  // Apply text search filter
                  if (templateFilter) {
                    const searchLower = templateFilter.toLowerCase()
                    const matchesName = template.name.toLowerCase().includes(searchLower)
                    const matchesType = template.type.toLowerCase().includes(searchLower)
                    const matchesDesc = template.description.toLowerCase().includes(searchLower)
                    const matchesOrg = template.organization.toLowerCase().includes(searchLower)
                    
                    if (!matchesName && !matchesType && !matchesDesc && !matchesOrg) {
                      return false
                    }
                  }
                  
                  // Apply organization filter
                  if (templateOrgFilter !== 'all' && template.organization !== templateOrgFilter) {
                    return false
                  }
                  
                  return true
                })
                .map((template) => {
                const ui = template.uiConfig ? JSON.parse(template.uiConfig) : {}
                const scoring = JSON.parse(template.scoringRules)
                const required = JSON.parse(template.requiredFields)
                
                return (
                  <div key={template.id} className="contest-template-card">
                    <div className="template-header">
                      <span className="template-icon">{ui.icon || '📋'}</span>
                      <div>
                        <h3>{template.name}</h3>
                        <p className="template-org">{template.organization}</p>
                      </div>
                    </div>
                    <p className="template-description">{template.description}</p>
                    
                    <div className="template-details">
                      <div className="template-detail">
                        <strong>Scoring:</strong>
                        <span>{scoring.formula || 'Points per QSO'}</span>
                      </div>
                      {scoring.bonuses && (
                        <div className="template-detail">
                          <strong>Bonuses:</strong>
                          <span>{scoring.bonuses.length} available</span>
                        </div>
                      )}
                      {required.class && (
                        <div className="template-detail">
                          <strong>Classes:</strong>
                          <span>{required.class.options ? required.class.options.join(', ') : 'Multiple'}</span>
                        </div>
                      )}
                    </div>
                    
                    <button 
                      className="btn btn-primary"
                      onClick={async () => {
                        try {
                          const response = await fetch('/api/contests/from-template', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              templateId: template.id,
                              name: template.name + ' ' + new Date().getFullYear(),
                            }),
                          })
                          if (response.ok) {
                            await fetchContest()
                          }
                        } catch (error) {
                          console.error('Failed to create contest:', error)
                        }
                      }}
                    >
                      Create Contest from Template
                    </button>
                    <button
                      className="btn secondary"
                      onClick={() => loadTemplateIntoEditor(template)}
                    >
                      Edit Template
                    </button>
                    
                    {ui.helpUrl && (
                      <a 
                        href={ui.helpUrl} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="template-link"
                      >
                        📖 Official Rules
                      </a>
                    )}
                  </div>
                )
              })}
            </div>
            
            {/* No results message */}
            {contestTemplates.length > 0 && contestTemplates.filter((template) => {
              if (templateFilter) {
                const searchLower = templateFilter.toLowerCase()
                const matchesName = template.name.toLowerCase().includes(searchLower)
                const matchesType = template.type.toLowerCase().includes(searchLower)
                const matchesDesc = template.description.toLowerCase().includes(searchLower)
                const matchesOrg = template.organization.toLowerCase().includes(searchLower)
                
                if (!matchesName && !matchesType && !matchesDesc && !matchesOrg) {
                  return false
                }
              }
              
              if (templateOrgFilter !== 'all' && template.organization !== templateOrgFilter) {
                return false
              }
              
              return true
            }).length === 0 && (
              <div className="empty-state" style={{ marginTop: '2rem' }}>
                <p className="empty">No templates match your filters.</p>
                <button 
                  className="btn secondary"
                  onClick={() => {
                    setTemplateFilter('')
                    setTemplateOrgFilter('all')
                  }}
                >
                  Clear Filters
                </button>
              </div>
            )}
          </section>

          <section className="panel template-editor">
            <div className="template-editor-header">
              <h2>Template Editor</h2>
              <div className="template-editor-actions">
                <button className="btn secondary" onClick={resetTemplateEditor}>
                  New Template
                </button>
                <button
                  className="btn btn-primary"
                  onClick={() => submitTemplate('create')}
                >
                  Save as New
                </button>
                <button
                  className="btn"
                  disabled={!templateEditor.id}
                  onClick={() => submitTemplate('update')}
                >
                  Update Template
                </button>
              </div>
            </div>

            <p className="hint">
              Define rules, exchanges, and scoring as JSON. This editor supports custom
              contests from sources like contestcalendar.com.
            </p>

            {templateEditorError && (
              <div className="notice error">{templateEditorError}</div>
            )}
            {templateEditorStatus && (
              <div className="notice success">{templateEditorStatus}</div>
            )}

            <div className="form-grid full">
              <div className="field">
                <label>Existing Templates</label>
                <select
                  value={templateEditor.id}
                  onChange={(event) => {
                    const selected = contestTemplates.find(
                      (template) => template.id === event.target.value,
                    )
                    if (selected) {
                      loadTemplateIntoEditor(selected)
                    } else {
                      resetTemplateEditor()
                    }
                  }}
                >
                  <option value="">-- Select template to edit --</option>
                  {contestTemplates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name} ({template.type})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-grid two">
              <div className="field">
                <label>Template Type *</label>
                <input
                  value={templateEditor.type}
                  onChange={(event) =>
                    setTemplateEditor((current) => ({
                      ...current,
                      type: event.target.value,
                    }))
                  }
                  placeholder="CQ_WW_RTTY"
                />
                <div className="field-hint">Must be unique (used for lookups)</div>
              </div>
              <div className="field">
                <label>Name *</label>
                <input
                  value={templateEditor.name}
                  onChange={(event) =>
                    setTemplateEditor((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  placeholder="CQ WW RTTY"
                />
              </div>
              <div className="field">
                <label>Organization</label>
                <input
                  value={templateEditor.organization}
                  onChange={(event) =>
                    setTemplateEditor((current) => ({
                      ...current,
                      organization: event.target.value,
                    }))
                  }
                  placeholder="CQ Magazine"
                />
              </div>
              <div className="field">
                <label>Description</label>
                <input
                  value={templateEditor.description}
                  onChange={(event) =>
                    setTemplateEditor((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                  placeholder="Annual worldwide RTTY contest"
                />
              </div>
            </div>

            <div className="form-grid full">
              <div className="field">
                <label>Scoring Rules (JSON) *</label>
                <textarea
                  value={templateEditor.scoringRules}
                  onChange={(event) =>
                    setTemplateEditor((current) => ({
                      ...current,
                      scoringRules: event.target.value,
                    }))
                  }
                  placeholder='{"pointsPerQso": 1, "multipliers": []}'
                  rows={8}
                />
              </div>
              <div className="field">
                <label>Required Fields (JSON) *</label>
                <textarea
                  value={templateEditor.requiredFields}
                  onChange={(event) =>
                    setTemplateEditor((current) => ({
                      ...current,
                      requiredFields: event.target.value,
                    }))
                  }
                  placeholder='{"exchange": {"required": true, "format": "RST"}}'
                  rows={6}
                />
              </div>
              <div className="field">
                <label>Validation Rules (JSON) *</label>
                <textarea
                  value={templateEditor.validationRules}
                  onChange={(event) =>
                    setTemplateEditor((current) => ({
                      ...current,
                      validationRules: event.target.value,
                    }))
                  }
                  placeholder='{"bands": ["20", "40"], "modes": ["CW", "SSB"]}'
                  rows={6}
                />
              </div>
              <div className="field">
                <label>UI Config (JSON)</label>
                <textarea
                  value={templateEditor.uiConfig}
                  onChange={(event) =>
                    setTemplateEditor((current) => ({
                      ...current,
                      uiConfig: event.target.value,
                    }))
                  }
                  placeholder='{"icon": "📋", "primaryColor": "#4F46E5"}'
                  rows={5}
                />
              </div>
            </div>

            <div className="form-grid two">
              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={templateEditor.isActive}
                  onChange={(event) =>
                    setTemplateEditor((current) => ({
                      ...current,
                      isActive: event.target.checked,
                    }))
                  }
                />
                Active
              </label>
              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={templateEditor.isPublic}
                  onChange={(event) =>
                    setTemplateEditor((current) => ({
                      ...current,
                      isPublic: event.target.checked,
                    }))
                  }
                />
                Public
              </label>
            </div>
          </section>
        </div>
      </div>
    )
  }

  function renderRigView() {
    return (
      <div className="view-container">
        <div className="view-header">
          <h1>📻 Radio Control (Hamlib)</h1>
          <p className="view-description">
            Manage radio connections via rigctld and assign radios to stations
          </p>
        </div>
        <div className="view-content">
          {/* Add Radio Form */}
          <section className="panel">
            <h2>Add Radio Connection</h2>
            <div className="form-grid">
              <div className="field" style={{ gridColumn: '1 / -1' }}>
                <label>Radio Name *</label>
                <input
                  value={radioName}
                  onChange={(e) => {
                    setRadioName(e.target.value)
                    setRadioTestResult(null)
                  }}
                  placeholder="IC-7300 Station 1"
                />
              </div>
              <div className="field">
                <label>Connection Type</label>
                <select
                  value={radioConnectionType}
                  onChange={(e) => {
                    const nextType = e.target.value as 'hamlib' | 'mock'
                    setRadioConnectionType(nextType)
                    if (nextType === 'mock') {
                      setRadioHost('')
                      setRadioPort('0')
                      setRadioTestResult({
                        success: true,
                        message: 'Mock radio ready',
                        info: 'Simulated Hamlib connection',
                      })
                    } else {
                      setRadioPort('4532')
                      setRadioTestResult(null)
                    }
                  }}
                >
                  <option value="hamlib">Hamlib (rigctld)</option>
                  <option value="mock">Mock (Simulated)</option>
                </select>
              </div>
              <div className="field">
                <label>Host *</label>
                <input
                  value={radioHost}
                  onChange={(e) => {
                    setRadioHost(e.target.value)
                    setRadioTestResult(null)
                  }}
                  placeholder="192.168.1.100"
                  disabled={radioConnectionType === 'mock'}
                />
              </div>
              <div className="field">
                <label>Port *</label>
                <input
                  value={radioPort}
                  onChange={(e) => {
                    setRadioPort(e.target.value)
                    setRadioTestResult(null)
                  }}
                  placeholder="4532"
                  disabled={radioConnectionType === 'mock'}
                />
              </div>
              <div className="field">
                <label>Poll Interval (ms)</label>
                <input
                  value={radioPollInterval}
                  onChange={(e) => setRadioPollInterval(e.target.value)}
                  placeholder="1000"
                />
              </div>
            </div>
            
            {/* Test Result Display */}
            {radioTestResult && (
              <div className={`test-result ${radioTestResult.success ? 'success' : 'error'}`}>
                {radioTestResult.success ? (
                  <>
                    <div className="test-result-header">✅ {radioTestResult.message}</div>
                    {radioTestResult.info && (
                      <div className="test-result-detail">Radio: {radioTestResult.info}</div>
                    )}
                    {radioTestResult.state?.frequency && (
                      <div className="test-result-detail">
                        Frequency: {(parseInt(radioTestResult.state.frequency) / 1000000).toFixed(3)} MHz
                      </div>
                    )}
                    {radioTestResult.state?.mode && (
                      <div className="test-result-detail">Mode: {radioTestResult.state.mode}</div>
                    )}
                    {radioTestResult.state?.power !== null && radioTestResult.state?.power !== undefined && (
                      <div className="test-result-detail">Power: {radioTestResult.state.power}W</div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="test-result-header">❌ Connection Failed</div>
                    <div className="test-result-detail">{radioTestResult.error}</div>
                  </>
                )}
              </div>
            )}
            
            <div className="action-buttons">
              <button 
                className="btn secondary"
                disabled={radioTesting || (radioConnectionType === 'hamlib' && !radioHost)}
                onClick={async () => {
                  if (radioConnectionType === 'hamlib' && !radioHost) {
                    return
                  }
                  setRadioTesting(true)
                  setRadioTestResult(null)
                  try {
                    const response = await fetch('/api/radios/test-connection', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        connectionType: radioConnectionType,
                        host: radioHost,
                        port: parseInt(radioPort),
                      }),
                    })
                    const data = await response.json()
                    setRadioTestResult(data)
                  } catch (error) {
                    setRadioTestResult({
                      success: false,
                      error: 'Network error: ' + error,
                    })
                  } finally {
                    setRadioTesting(false)
                  }
                }}
              >
                {radioTesting ? '⏳ Testing...' : '🔌 Test Connection'}
              </button>
              <button 
                className="btn primary"
                disabled={radioConnectionType === 'hamlib'
                  ? (!radioName || !radioHost || !radioTestResult?.success)
                  : !radioName}
                onClick={async () => {
                  if (!radioName || (radioConnectionType === 'hamlib' && !radioHost)) {
                    alert('Name and host are required')
                    return
                  }
                try {
                  const response = await fetch('/api/radios', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      name: radioName,
                      host: radioHost,
                      port: parseInt(radioPort),
                      pollInterval: parseInt(radioPollInterval),
                      connectionType: radioConnectionType,
                    }),
                  })
                  if (response.ok) {
                    setRadioName('')
                    setRadioHost('')
                    setRadioPort('4532')
                    setRadioConnectionType('hamlib')
                    setRadioPollInterval('1000')
                    setRadioTestResult(null)
                    await fetchRadios()
                  }
                } catch (error) {
                  console.error('Failed to create radio:', error)
                }
              }}
            >
              {radioTestResult?.success ? '✅ Add Radio' : 'Add Radio'}
            </button>
            </div>
          </section>

          {/* Radio List */}
          <section className="panel">
            <h2>Radio Connections</h2>
            <div className="radios-list">
              {radios.length === 0 && (
                <p style={{ color: '#666' }}>No radios configured. Add one above.</p>
              )}
              {radios.map((radio) => {
                const assignment = radio.assignments?.find(a => a.isActive)
                const state = getRadioState(radio)
                const inputs = getControlInputs(radio)
                return (
                  <div key={radio.id} className="radio-card">
                    <div className="radio-header">
                      <h3>{radio.name}</h3>
                      <span className={`status-badge ${radio.isConnected ? 'connected' : 'disconnected'}`}>
                        {radio.isConnected ? '🟢 Connected' : '🔴 Disconnected'}
                      </span>
                    </div>
                    <div className="radio-details">
                      {radioCardTestResults[radio.id] && (
                        <div className={`test-result ${radioCardTestResults[radio.id].success ? 'success' : 'error'}`}>
                          <div className="test-result-header">
                            {radioCardTestResults[radio.id].success ? '✅ Test OK' : '❌ Test Failed'}
                          </div>
                          <div className="test-result-detail">
                            {radioCardTestResults[radio.id].message || radioCardTestResults[radio.id].error}
                          </div>
                          {radioCardTestResults[radio.id].state?.frequency && (
                            <div className="test-result-detail">
                              Frequency: {(parseInt(radioCardTestResults[radio.id].state.frequency) / 1000000).toFixed(3)} MHz
                            </div>
                          )}
                          {radioCardTestResults[radio.id].state?.mode && (
                            <div className="test-result-detail">Mode: {radioCardTestResults[radio.id].state.mode}</div>
                          )}
                        </div>
                      )}
                      <div className="radio-info">
                        <strong>Type:</strong> {radio.connectionType === 'mock' ? 'Mock (Simulated)' : 'Hamlib (rigctld)'}
                      </div>
                      {radio.connectionType !== 'mock' && (
                        <div className="radio-info">
                          <strong>Host:</strong> {radio.host}:{radio.port}
                        </div>
                      )}
                      {radio.frequency && (
                        <div className="radio-info">
                          <strong>Frequency:</strong> {(parseInt(radio.frequency) / 1000000).toFixed(3)} MHz
                        </div>
                      )}
                      {radio.mode && (
                        <div className="radio-info">
                          <strong>Mode:</strong> {radio.mode}
                        </div>
                      )}
                      {radio.power !== null && radio.power !== undefined && (
                        <div className="radio-info">
                          <strong>Power:</strong> {radio.power}W
                        </div>
                      )}
                      {assignment && (
                        <div className="radio-info">
                          <strong>Assigned to:</strong> {assignment.station?.callsign}
                        </div>
                      )}
                      {radio.lastError && (
                        <div className="radio-info error">
                          <strong>Error:</strong> {radio.lastError}
                        </div>
                      )}
                    </div>
                    {radio.isConnected && (
                      <div className="radio-control-panel">
                        <div className="rig-display">
                          <div className="rig-display-label">Frequency</div>
                          <div className="rig-display-value">
                            {formatFrequencyMHz(state.frequency)}
                            <span className="rig-display-unit">MHz</span>
                          </div>
                          <div className="rig-display-meta">
                            <span>{state.mode || '---'}</span>
                            <span>{state.vfo || 'VFO?'}</span>
                            <span>{state.ptt ? 'PTT' : 'RX'}</span>
                            <button
                              className="btn secondary"
                              onClick={() => refreshRadioState(radio.id)}
                            >
                              Refresh
                            </button>
                          </div>
                        </div>

                        <div className="rig-controls-grid">
                          <div className="rig-control">
                            <label>Frequency (MHz)</label>
                            <div className="rig-frequency-input">
                              <input
                                value={inputs.frequency}
                                onChange={(e) => setControlInput(radio.id, { frequency: e.target.value })}
                                placeholder="14.074"
                              />
                              <button
                                className="btn secondary"
                                onClick={async () => {
                                  const hz = toFrequencyHz(inputs.frequency)
                                  if (!hz) return
                                  await fetch(`/api/radios/${radio.id}/frequency`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                                    body: JSON.stringify({ frequencyHz: hz }),
                                  })
                                  await refreshRadioState(radio.id)
                                }}
                              >
                                Set
                              </button>
                            </div>
                            <div className="rig-step-row">
                              {[0.1, 0.5, 1].map((step) => (
                                <button
                                  key={step}
                                  className="btn secondary"
                                  onClick={async () => {
                                    const current = toFrequencyHz(formatFrequencyMHz(state.frequency))
                                    if (!current) return
                                    const next = current + step * 1_000
                                    await fetch(`/api/radios/${radio.id}/frequency`, {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                                      body: JSON.stringify({ frequencyHz: next }),
                                    })
                                    await refreshRadioState(radio.id)
                                  }}
                                >
                                  +{step}k
                                </button>
                              ))}
                              {[0.1, 0.5, 1].map((step) => (
                                <button
                                  key={`-${step}`}
                                  className="btn secondary"
                                  onClick={async () => {
                                    const current = toFrequencyHz(formatFrequencyMHz(state.frequency))
                                    if (!current) return
                                    const next = current - step * 1_000
                                    await fetch(`/api/radios/${radio.id}/frequency`, {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                                      body: JSON.stringify({ frequencyHz: next }),
                                    })
                                    await refreshRadioState(radio.id)
                                  }}
                                >
                                  -{step}k
                                </button>
                              ))}
                            </div>
                          </div>

                          <div className="rig-control">
                            <label>Mode</label>
                            <div className="quick-select">
                              {['USB', 'LSB', 'CW', 'FM', 'AM', 'DIGI'].map((mode) => (
                                <button
                                  key={mode}
                                  className={`quick-btn ${inputs.mode === mode ? 'active' : ''}`}
                                  onClick={async () => {
                                    setControlInput(radio.id, { mode })
                                    await fetch(`/api/radios/${radio.id}/mode`, {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                                      body: JSON.stringify({ mode, bandwidth: Number(inputs.bandwidth) || 3000 }),
                                    })
                                    await refreshRadioState(radio.id)
                                  }}
                                >
                                  {mode}
                                </button>
                              ))}
                            </div>
                          </div>

                          <div className="rig-control">
                            <label>Bandwidth (Hz)</label>
                            <div className="rig-frequency-input">
                              <input
                                value={inputs.bandwidth}
                                onChange={(e) => setControlInput(radio.id, { bandwidth: e.target.value })}
                                placeholder="3000"
                              />
                              <button
                                className="btn secondary"
                                onClick={async () => {
                                  await fetch(`/api/radios/${radio.id}/mode`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                                    body: JSON.stringify({ mode: inputs.mode, bandwidth: Number(inputs.bandwidth) || 3000 }),
                                  })
                                  await refreshRadioState(radio.id)
                                }}
                              >
                                Apply
                              </button>
                            </div>
                          </div>

                          <div className="rig-control">
                            <label>Power (%)</label>
                            <div className="rig-slider">
                              <input
                                type="range"
                                min={0}
                                max={100}
                                value={inputs.power}
                                onChange={(e) => setControlInput(radio.id, { power: e.target.value })}
                              />
                              <span>{inputs.power}%</span>
                              <button
                                className="btn secondary"
                                onClick={async () => {
                                  await fetch(`/api/radios/${radio.id}/power`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                                    body: JSON.stringify({ power: Number(inputs.power) || 0 }),
                                  })
                                  await refreshRadioState(radio.id)
                                }}
                              >
                                Set
                              </button>
                            </div>
                          </div>

                          <div className="rig-control">
                            <label>PTT</label>
                            <div className="rig-ptt-row">
                              <button
                                className={`btn ${state.ptt ? 'danger' : 'secondary'}`}
                                onClick={async () => {
                                  await fetch(`/api/radios/${radio.id}/ptt`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                                    body: JSON.stringify({ enabled: !state.ptt }),
                                  })
                                  await refreshRadioState(radio.id)
                                }}
                              >
                                {state.ptt ? 'TX (PTT ON)' : 'RX (PTT OFF)'}
                              </button>
                            </div>
                          </div>

                          <div className="rig-control">
                            <label>VFO</label>
                            <div className="quick-select">
                              {['VFOA', 'VFOB', 'VFO'].map((vfo) => (
                                <button
                                  key={vfo}
                                  className={`quick-btn ${state.vfo === vfo ? 'active' : ''}`}
                                  onClick={async () => {
                                    await fetch(`/api/radios/${radio.id}/vfo`, {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                                      body: JSON.stringify({ vfo }),
                                    })
                                    await refreshRadioState(radio.id)
                                  }}
                                >
                                  {vfo}
                                </button>
                              ))}
                            </div>
                          </div>

                          <div className="rig-control">
                            <label>Raw Command</label>
                            <div className="rig-frequency-input">
                              <input
                                value={inputs.raw}
                                onChange={(e) => setControlInput(radio.id, { raw: e.target.value })}
                                placeholder="f (get freq)"
                              />
                              <button
                                className="btn secondary"
                                onClick={async () => {
                                  if (!inputs.raw.trim()) return
                                  await fetch(`/api/radios/${radio.id}/raw`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                                    body: JSON.stringify({ command: inputs.raw.trim() }),
                                  })
                                  setControlInput(radio.id, { raw: '' })
                                  await refreshRadioState(radio.id)
                                }}
                              >
                                Send
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Audio Source Configuration */}
                    <div className="radio-audio-config">
                      <h4>🔊 Audio Source</h4>
                      <div className="form-grid">
                        <div className="field">
                          <label>Source Type</label>
                          <select
                            value={radio.audioSourceType || 'none'}
                            onChange={async (e) => {
                              try {
                                await fetch(`/api/radios/${radio.id}`, {
                                  method: 'PUT',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ audioSourceType: e.target.value === 'none' ? null : e.target.value }),
                                })
                                await fetchRadios()
                              } catch (error) {
                                console.error('Failed to update audio source:', error)
                              }
                            }}
                          >
                            <option value="none">No Audio</option>
                            <option value="janus">Janus Gateway</option>
                            <option value="http-stream">HTTP Stream</option>
                            <option value="loopback">Loopback (Test/Demo)</option>
                          </select>
                        </div>
                        {radio.audioSourceType === 'janus' && (
                          <>
                            <div className="field">
                              <label>Janus Room ID</label>
                              <input
                                value={radio.janusRoomId || ''}
                                onChange={async (e) => {
                                  try {
                                    await fetch(`/api/radios/${radio.id}`, {
                                      method: 'PUT',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ janusRoomId: e.target.value }),
                                    })
                                    await fetchRadios()
                                  } catch (error) {
                                    console.error('Failed to update Janus room:', error)
                                  }
                                }}
                                placeholder="1234"
                              />
                            </div>
                            <div className="field">
                              <label>Janus Stream ID</label>
                              <input
                                value={radio.janusStreamId || ''}
                                onChange={async (e) => {
                                  try {
                                    await fetch(`/api/radios/${radio.id}`, {
                                      method: 'PUT',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ janusStreamId: e.target.value }),
                                    })
                                    await fetchRadios()
                                  } catch (error) {
                                    console.error('Failed to update stream ID:', error)
                                  }
                                }}
                                placeholder="radio1"
                              />
                            </div>
                          </>
                        )}
                        {radio.audioSourceType === 'http-stream' && (
                          <div className="field" style={{ gridColumn: '1 / -1' }}>
                            <label>HTTP Stream URL</label>
                            <input
                              value={radio.httpStreamUrl || ''}
                              onChange={async (e) => {
                                try {
                                  await fetch(`/api/radios/${radio.id}`, {
                                    method: 'PUT',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ httpStreamUrl: e.target.value }),
                                  })
                                  await fetchRadios()
                                } catch (error) {
                                  console.error('Failed to update HTTP stream URL:', error)
                                }
                              }}
                              placeholder="http://192.168.1.100:8080/audio.mp3"
                            />
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="radio-actions">
                      {!radio.isEnabled ? (
                        <button
                          className="btn btn-success"
                          onClick={async () => {
                            try {
                              const response = await fetch(`/api/radios/${radio.id}`, {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ isEnabled: true }),
                              })
                              if (response.ok) {
                                await fetchRadios()
                              }
                            } catch (error) {
                              console.error('Failed to enable radio:', error)
                            }
                          }}
                        >
                          Enable & Connect
                        </button>
                      ) : (
                        <button
                          className="btn btn-warning"
                          onClick={async () => {
                            try {
                              const response = await fetch(`/api/radios/${radio.id}`, {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ isEnabled: false }),
                              })
                              if (response.ok) {
                                await fetchRadios()
                              }
                            } catch (error) {
                              console.error('Failed to disable radio:', error)
                            }
                          }}
                        >
                          Disable
                        </button>
                      )}
                      <button
                        className="btn"
                        onClick={async () => {
                          try {
                            const response = await fetch(`/api/radios/${radio.id}/test`, {
                              method: 'POST',
                            })
                            const data = await response.json().catch(() => ({}))
                            if (response.ok) {
                              setRadioCardTestResults(prev => ({
                                ...prev,
                                [radio.id]: {
                                  success: true,
                                  message: data.info ? `Connected: ${data.info}` : 'Connection successful',
                                  state: data.state,
                                  info: data.info,
                                },
                              }))
                              addSuccess('Radio test successful')
                            } else {
                              setRadioCardTestResults(prev => ({
                                ...prev,
                                [radio.id]: {
                                  success: false,
                                  message: data.error || 'Test failed',
                                  error: data.error,
                                },
                              }))
                              addError(`Test failed: ${data.error || 'Unknown error'}`)
                            }
                          } catch (error) {
                            const message = error instanceof Error ? error.message : String(error)
                            setRadioCardTestResults(prev => ({
                              ...prev,
                              [radio.id]: {
                                success: false,
                                message,
                                error: message,
                              },
                            }))
                            addError(`Test failed: ${message}`)
                          }
                        }}
                      >
                        Test
                      </button>
                      {!assignment && (
                        <select
                          onChange={async (e) => {
                            const stationId = e.target.value
                            if (!stationId) return
                            try {
                              const response = await fetch('/api/radio-assignments', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                                body: JSON.stringify({
                                  radioId: radio.id,
                                  stationId,
                                }),
                              })
                              if (response.ok) {
                                await fetchRadios()
                                addSuccess('Radio assigned')
                                // await fetchRadioAssignments()
                              } else {
                                const data = await response.json().catch(() => ({}))
                                addError(data.error || 'Failed to assign radio')
                              }
                            } catch (error) {
                              console.error('Failed to assign radio:', error)
                              addError('Failed to assign radio')
                            }
                            e.target.value = ''
                          }}
                          defaultValue=""
                        >
                          <option value="">Assign to station...</option>
                          {stations.map(station => (
                            <option key={station.id} value={station.id}>
                              {station.callsign}
                            </option>
                          ))}
                        </select>
                      )}
                      {assignment && (
                        <button
                          className="btn"
                          onClick={async () => {
                            try {
                              const response = await fetch(`/api/radio-assignments/${assignment.id}/unassign`, {
                                method: 'POST',
                                headers: { ...getAuthHeaders() },
                              })
                              if (response.ok) {
                                await fetchRadios()
                                addSuccess('Radio unassigned')
                                // await fetchRadioAssignments()
                              } else {
                                const data = await response.json().catch(() => ({}))
                                addError(data.error || 'Failed to unassign radio')
                              }
                            } catch (error) {
                              console.error('Failed to unassign radio:', error)
                              addError('Failed to unassign radio')
                            }
                          }}
                        >
                          Unassign
                        </button>
                      )}
                      {deleteConfirmId === radio.id && deleteConfirmType === 'radio' ? (
                        <>
                          <span style={{ fontSize: '0.85rem', opacity: 0.8, alignSelf: 'center' }}>Sure?</span>
                          <button 
                            className="btn danger" 
                            style={{ fontSize: '0.85rem', padding: '0.4rem 0.8rem' }}
                            onClick={async () => {
                              try {
                                const response = await fetch(`/api/radios/${radio.id}`, {
                                  method: 'DELETE',
                                })
                                if (response.ok) {
                                  await fetchRadios()
                                  setDeleteConfirmId(null)
                                  setDeleteConfirmType(null)
                                }
                              } catch (error) {
                                console.error('Failed to delete radio:', error)
                              }
                            }}
                          >
                            Yes
                          </button>
                          <button 
                            className="btn secondary" 
                            style={{ fontSize: '0.85rem', padding: '0.4rem 0.8rem' }}
                            onClick={() => { setDeleteConfirmId(null); setDeleteConfirmType(null); }}
                          >
                            No
                          </button>
                        </>
                      ) : (
                        <button 
                          className="btn btn-danger" 
                          onClick={() => { setDeleteConfirmId(radio.id); setDeleteConfirmType('radio'); }}
                        >
                          🗑 Delete
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        </div>
      </div>
    )
  }

  // Utility functions for location-based calculations
  function latLonToGridSquare(lat: number, lon: number): string {
    // Convert to Maidenhead grid square
    // Normalize latitude and longitude to 0-180, 0-360 respectively
    lat = lat + 90
    lon = lon + 180

    // First letter
    let letter1 = String.fromCharCode(65 + Math.floor(lon / 20))
    let letter2 = String.fromCharCode(65 + Math.floor(lat / 10))

    // First number
    let num1 = Math.floor((lon % 20) / 2)
    let num2 = Math.floor((lat % 10) / 1)

    // Second letter
    let sub_lon = ((lon % 20) - Math.floor((lon % 20) / 2) * 2) * 60 / 2
    let sub_lat = ((lat % 10) - Math.floor((lat % 10) / 1) * 1) * 60 / 1
    let letter3 = String.fromCharCode(97 + Math.floor(sub_lon / 5))
    let letter4 = String.fromCharCode(97 + Math.floor(sub_lat / 2.5))

    return letter1 + letter2 + num1 + num2 + letter3 + letter4
  }

  async function autoDetectLocation() {
    setLocationDetecting(true)
    try {
      const position = await new Promise<GeolocationCoordinates>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve(pos.coords),
          (err) => reject(err),
          { timeout: 10000 }
        )
      })

      const lat = position.latitude
      const lon = position.longitude
      const grid = latLonToGridSquare(lat, lon)

      setStationLatitude(lat.toFixed(4))
      setStationLongitude(lon.toFixed(4))
      setStationGrid(grid)
      
      // Elevation from GPS
      if (position.altitude) {
        setStationElevation(Math.round(position.altitude * 3.28084).toString()) // meters to feet
      }

      // Reverse geocode to get county and possibly more details
      try {
        const geoResponse = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=10&addressdetails=1`,
          { headers: { 'User-Agent': 'YAHAML-Contest-Logger/1.0' } }
        )
        if (geoResponse.ok) {
          const geoData = await geoResponse.json()
          const address = geoData.address || {}
          
          // Set county
          if (address.county) {
            setStationCounty(address.county.replace(' County', ''))
          }
          
          // Set state for ARRL section lookup
          if (address.state_code || address.state) {
            setStationSection(address.state_code || address.state)
          }
        }
      } catch (err) {
        console.error('Reverse geocoding failed:', err)
      }

      // Lookup CQ and ITU zones by coordinates
      try {
        const zoneResponse = await fetch(`/api/locations/zones?lat=${lat}&lon=${lon}`)
        if (zoneResponse.ok) {
          const zones = await zoneResponse.json()
          if (zones.cqZone) setStationCqZone(zones.cqZone.toString())
          if (zones.ituZone) setStationItuZone(zones.ituZone.toString())
        }
      } catch (err) {
        console.error('Zone lookup failed:', err)
      }
    } catch (error: any) {
      const message = error.code === 1 ? 'Location permission denied' : 'Failed to get location'
      addError(message)
    } finally {
      setLocationDetecting(false)
    }
  }

  async function fetchLocations() {
    try {
      const response = await fetch('/api/locations')
      if (response.ok) {
        const data = await response.json()
        setSavedLocations(data)
        // Select default location if available
        const defaultLoc = data.find((loc: any) => loc.isDefault)
        if (defaultLoc && !selectedLocationId) {
          loadLocation(defaultLoc)
        }
      }
    } catch (error) {
      console.error('Failed to fetch locations:', error)
    }
  }

  function loadLocation(location: any) {
    setSelectedLocationId(location.id)
    setLocationName(location.name)
    setStationLatitude(location.latitude || '')
    setStationLongitude(location.longitude || '')
    setStationGrid(location.grid || '')
    setStationSection(location.section || '')
    setStationCounty(location.county || '')
    setStationCqZone(location.cqZone?.toString() || '')
    setStationItuZone(location.ituZone?.toString() || '')
    setStationElevation(location.elevation?.toString() || '')
  }

  async function saveLocationAs() {
    if (!locationName.trim()) {
      addError('Location name is required')
      return
    }

    try {
      const response = await fetch('/api/locations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: locationName,
          latitude: stationLatitude || null,
          longitude: stationLongitude || null,
          grid: stationGrid || null,
          elevation: stationElevation ? parseInt(stationElevation) : null,
          section: stationSection || null,
          county: stationCounty || null,
          cqZone: stationCqZone ? parseInt(stationCqZone) : null,
          ituZone: stationItuZone ? parseInt(stationItuZone) : null,
          isDefault: false,
        }),
      })
      if (response.ok) {
        const newLocation = await response.json()
        await fetchLocations()
        setSelectedLocationId(newLocation.id)
        addSuccess('Location saved successfully')
      } else {
        const data = await response.json().catch(() => ({}))
        if (data.details) {
          addError(`${data.error || 'Failed to save location'}: ${data.details}`)
          return
        }
        addError(data.error || 'Failed to save location')
      }
    } catch (error) {
      addError('Failed to save location')
    }
  }

  async function updateSelectedLocation() {
    if (!selectedLocationId) {
      addError('No location selected to update')
      return
    }

    try {
      const response = await fetch(`/api/locations/${selectedLocationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: locationName,
          latitude: stationLatitude || null,
          longitude: stationLongitude || null,
          grid: stationGrid || null,
          elevation: stationElevation ? parseInt(stationElevation) : null,
          section: stationSection || null,
          county: stationCounty || null,
          cqZone: stationCqZone ? parseInt(stationCqZone) : null,
          ituZone: stationItuZone ? parseInt(stationItuZone) : null,
        }),
      })
      if (response.ok) {
        await fetchLocations()
        addSuccess('Location updated successfully')
      } else {
        const data = await response.json().catch(() => ({}))
        if (data.details) {
          addError(`${data.error || 'Failed to update location'}: ${data.details}`)
          return
        }
        addError(data.error || 'Failed to update location')
      }
    } catch (error) {
      addError('Failed to update location')
    }
  }

  async function setAsDefaultLocation() {
    if (!selectedLocationId) {
      addError('No location selected')
      return
    }

    try {
      const response = await fetch(`/api/locations/${selectedLocationId}/set-default`, {
        method: 'PATCH',
      })
      if (response.ok) {
        await fetchLocations()
        addSuccess('Set as default location')
      } else {
        const data = await response.json().catch(() => ({}))
        if (data.details) {
          addError(`${data.error || 'Failed to set default'}: ${data.details}`)
          return
        }
        addError(data.error || 'Failed to set default')
      }
    } catch (error) {
      addError('Failed to set default location')
    }
  }

  async function applyLocationToStation() {
    const callsign = localStorage.getItem(storageKey)
    if (!callsign) {
      addError('No active callsign selected')
      return
    }
    if (!selectedLocationId) {
      addError('No location selected to apply')
      return
    }

    try {
      const response = await fetch(`/api/stations/${callsign}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          locationId: selectedLocationId,
        }),
      })
      if (response.ok) {
        await fetchStations()
        addSuccess('Location applied to station')
      } else {
        const data = await response.json().catch(() => ({}))
        if (response.status === 404) {
          addError('Station not found. Save your callsign first, then try again.')
          return
        }
        if (data.details) {
          addError(`${data.error || 'Failed to apply location'}: ${data.details}`)
          return
        }
        addError(data.error || 'Failed to apply location')
      }
    } catch (error) {
      addError('Failed to apply location')
    }
  }



  function renderStationView() {
    const currentCall = localStorage.getItem(storageKey) || 'Not set'
    const currentStation = stations.find(s => s.callsign === currentCall)
    
    return (
      <div className="view-container">
        <div className="view-header">
          <h1>Station Configuration</h1>
          <p className="view-description">
            Personal callsign details, club association, and contest participation
          </p>
        </div>
        <div className="view-content">
          <section className="panel">
            <h2>Operator Callsign</h2>
            <div className="field">
              <label>Your Callsign *</label>
              <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
                <input
                  value={callsignInput}
                  onChange={(event) => setCallsignInput(event.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && saveCallsign()}
                  placeholder="W1AW"
                  className={stationFormErrors.callsign ? 'input-error' : undefined}
                  style={{ flex: 1 }}
                />
                <button className="btn primary" onClick={saveCallsign}>
                  💾 Save
                </button>
              </div>
              {stationFormErrors.callsign && (
                <div className="field-error">{stationFormErrors.callsign}</div>
              )}
            </div>
            <p className="hint">Currently active: <strong>{currentCall}</strong></p>
            {currentStation && (
              <div style={{ marginTop: '1rem', padding: '1rem', background: 'var(--surface-muted)', borderRadius: '6px' }}>
                <div><strong>Name:</strong> {currentStation.name}</div>
                {currentStation.grid && <div><strong>Grid:</strong> {currentStation.grid}</div>}
                {currentStation.section && <div><strong>Section:</strong> {currentStation.section}</div>}
                <div><strong>QSOs:</strong> {currentStation._count?.qsoLogs || 0}</div>
              </div>
            )}
          </section>

          <section className="panel">
            <h2>Operator Information</h2>
            <p className="hint">Lookup from HamDB or edit manually</p>
            <div style={{ marginBottom: '1rem' }}>
              <button 
                className="btn secondary"
                onClick={() => lookupCallsignInHamDB(currentCall)}
                disabled={currentCall === 'Not set' || stationLookupLoading}
              >
                {stationLookupLoading ? '🔍 Searching HamDB...' : '🔍 Lookup in HamDB'}
              </button>
            </div>
            <div className="form-grid">
              <div className="field">
                <label>Name</label>
                <input 
                  type="text" 
                  placeholder="Your Name" 
                  value={stationName}
                  onChange={(e) => setStationName(e.target.value)}
                />
              </div>
              <div className="field">
                <label>License Class</label>
                <div className="quick-select">
                  <button
                    type="button"
                    className={`quick-btn ${stationLicenseClass === '' ? 'active' : ''}`}
                    onClick={() => setStationLicenseClass('')}
                  >
                    None
                  </button>
                  <button
                    type="button"
                    className={`quick-btn ${stationLicenseClass === 'E' ? 'active' : ''}`}
                    onClick={() => setStationLicenseClass('E')}
                  >
                    Extra
                  </button>
                  <button
                    type="button"
                    className={`quick-btn ${stationLicenseClass === 'A' ? 'active' : ''}`}
                    onClick={() => setStationLicenseClass('A')}
                  >
                    Advanced
                  </button>
                  <button
                    type="button"
                    className={`quick-btn ${stationLicenseClass === 'G' ? 'active' : ''}`}
                    onClick={() => setStationLicenseClass('G')}
                  >
                    General
                  </button>
                  <button
                    type="button"
                    className={`quick-btn ${stationLicenseClass === 'T' ? 'active' : ''}`}
                    onClick={() => setStationLicenseClass('T')}
                  >
                    Tech
                  </button>
                  <button
                    type="button"
                    className={`quick-btn ${stationLicenseClass === 'N' ? 'active' : ''}`}
                    onClick={() => setStationLicenseClass('N')}
                  >
                    Novice
                  </button>
                </div>
              </div>
              <div className="field" style={{ gridColumn: '1 / -1' }}>
                <label>Address</label>
                <input 
                  type="text" 
                  placeholder="123 Radio Lane"
                  value={stationAddress}
                  onChange={(e) => setStationAddress(e.target.value)}
                />
              </div>
              <div className="field">
                <label>City</label>
                <input 
                  type="text" 
                  placeholder="Boston"
                  value={stationCity}
                  onChange={(e) => setStationCity(e.target.value)}
                />
              </div>
              <div className="field">
                <label>State/Province</label>
                <input 
                  type="text" 
                  placeholder="MA"
                  value={stationState}
                  onChange={(e) => setStationState(e.target.value.toUpperCase())}
                  maxLength={2}
                />
              </div>
              <div className="field">
                <label>ZIP/Postal Code</label>
                <input 
                  type="text" 
                  placeholder="02101"
                  value={stationZip}
                  onChange={(e) => setStationZip(e.target.value)}
                />
              </div>
              <div className="field">
                <label>Country</label>
                <input 
                  type="text" 
                  placeholder="United States"
                  value={stationCountry}
                  onChange={(e) => setStationCountry(e.target.value)}
                />
              </div>
            </div>
            <div className="action-buttons" style={{ marginTop: '0' }}>
              <button 
                className="btn primary"
                onClick={saveStationDetails}
              >
                💾 Save Operator Information
              </button>
            </div>
          </section>

          <section className="panel">
            <h2>Operating Location</h2>
            <p className="hint">Save and manage operating locations. GPS auto-detect fills coordinates. Select a saved location or create a new one.</p>
            
            {/* Location Selection */}
            <div style={{ marginBottom: '1rem' }}>
              <div className="field">
                <label>Saved Location</label>
                <div className="quick-select">
                  <button
                    type="button"
                    className={`quick-btn secondary ${selectedLocationId === '' ? 'active' : ''}`}
                    onClick={() => {
                      setSelectedLocationId('')
                      setLocationName('')
                      setStationLatitude('')
                      setStationLongitude('')
                      setStationGrid('')
                      setStationSection('')
                      setStationCounty('')
                      setStationCqZone('')
                      setStationItuZone('')
                      setStationElevation('')
                    }}
                  >
                    + New Location
                  </button>
                  {savedLocations.map((loc) => (
                    <button
                      key={loc.id}
                      type="button"
                      className={`quick-btn ${selectedLocationId === loc.id ? 'active' : ''}`}
                      onClick={() => loadLocation(loc)}
                    >
                      {loc.isDefault ? '⭐ ' : ''}{loc.name}
                    </button>
                  ))}
                </div>
              </div>
              <div className="field" style={{ marginTop: '1rem' }}>
                <label>Location Name</label>
                <input 
                  type="text" 
                  placeholder="Home QTH, Field Day Site, etc."
                  value={locationName}
                  onChange={(e) => setLocationName(e.target.value)}
                />
              </div>
            </div>
            
            {/* Location Fields */}
            <div className="form-grid">
              <div className="field">
                <label>Latitude</label>
                <input 
                  type="number" 
                  placeholder="44.8468" 
                  value={stationLatitude}
                  onChange={(e) => setStationLatitude(e.target.value)}
                  step="0.0001"
                />
              </div>
              <div className="field">
                <label>Longitude</label>
                <input 
                  type="number" 
                  placeholder="-123.2208" 
                  value={stationLongitude}
                  onChange={(e) => setStationLongitude(e.target.value)}
                  step="0.0001"
                />
              </div>
              <div className="field">
                <label>Grid Square (Auto)</label>
                <input 
                  type="text" 
                  placeholder="CN84ju"
                  value={stationGrid}
                  onChange={(e) => setStationGrid(e.target.value.toUpperCase())}
                  readOnly={!!stationLatitude && !!stationLongitude}
                />
              </div>
              <div className="field">
                <label>Elevation (ft)</label>
                <input 
                  type="number" 
                  placeholder="500"
                  value={stationElevation}
                  onChange={(e) => setStationElevation(e.target.value)}
                />
              </div>
              <div className="field">
                <label>ARRL Section</label>
                <input 
                  type="text" 
                  placeholder="OR"
                  value={stationSection}
                  onChange={(e) => setStationSection(e.target.value.toUpperCase())}
                  maxLength={3}
                />
              </div>
              <div className="field">
                <label>County</label>
                <input 
                  type="text" 
                  placeholder="Polk"
                  value={stationCounty}
                  onChange={(e) => setStationCounty(e.target.value)}
                />
              </div>
              <div className="field">
                <label>CQ Zone (1-40)</label>
                <input 
                  type="number" 
                  placeholder="3"
                  value={stationCqZone}
                  onChange={(e) => setStationCqZone(e.target.value)}
                  min="1"
                  max="40"
                />
              </div>
              <div className="field">
                <label>ITU Zone (1-90)</label>
                <input 
                  type="number" 
                  placeholder="2"
                  value={stationItuZone}
                  onChange={(e) => setStationItuZone(e.target.value)}
                  min="1"
                  max="90"
                />
              </div>
            </div>
            <div className="action-buttons" style={{ marginTop: '0' }}>
              <button 
                className="btn secondary" 
                onClick={autoDetectLocation}
                disabled={locationDetecting}
              >
                📍 {locationDetecting ? 'Detecting...' : 'Auto-detect from GPS'}
              </button>
              {selectedLocationId ? (
                <>
                  <button 
                    className="btn primary"
                    onClick={updateSelectedLocation}
                  >
                    💾 Update Location
                  </button>
                  <button 
                    className="btn secondary"
                    onClick={setAsDefaultLocation}
                  >
                    ⭐ Set as Default
                  </button>
                  <button 
                    className="btn primary"
                    onClick={applyLocationToStation}
                  >
                    ✓ Apply to Station
                  </button>
                </>
              ) : (
                <button 
                  className="btn primary"
                  onClick={saveLocationAs}
                  disabled={!locationName.trim()}
                >
                  💾 Save as New Location
                </button>
              )}
            </div>
            {stationGrid && stationLatitude && stationLongitude && (
              <div style={{ marginTop: '1rem', padding: '1rem', background: 'var(--accent-muted)', borderRadius: '6px' }}>
                <div style={{ fontSize: '0.9rem' }}>
                  <strong>Detected:</strong> Grid {stationGrid}
                </div>
                <div style={{ fontSize: '0.85rem', opacity: 0.8, marginTop: '0.5rem' }}>
                  {stationLatitude}, {stationLongitude}
                </div>
              </div>
            )}
          </section>

          <section className="panel">
            <h2>Club Association</h2>
            <p className="hint">Link this station to a club for coordinated operations</p>
            <div className="field">
              <label>Associated Club</label>
              <div className="quick-select">
                <button
                  type="button"
                  className={`quick-btn ${stationClubId === '' ? 'active' : ''} ${stationFormErrors.clubId ? 'error' : ''}`}
                  onClick={() => updateStationClub('')}
                >
                  Independent
                </button>
                {clubs.map((club: any) => (
                  <button
                    key={club.id}
                    type="button"
                    className={`quick-btn ${stationClubId === club.id ? 'active' : ''} ${stationFormErrors.clubId ? 'error' : ''}`}
                    onClick={() => updateStationClub(club.id)}
                  >
                    {club.callsign}
                  </button>
                ))}
              </div>
              {stationFormErrors.clubId && (
                <div className="field-error">{stationFormErrors.clubId}</div>
              )}
            </div>
          </section>

          <section className="panel">
            <h2>Contest Participation</h2>
            <p className="hint">Select active contest for this operating session</p>
            <div className="field">
              <label>Active Contest</label>
              <div className="quick-select">
                <button
                  type="button"
                  className={`quick-btn ${stationContestId === '' ? 'active' : ''}`}
                  onClick={() => updateStationContest('')}
                >
                  No Contest
                </button>
                {contest && contest.isActive && (
                  <button
                    type="button"
                    className={`quick-btn ${stationContestId === contest.id ? 'active' : ''}`}
                    onClick={() => updateStationContest(contest.id)}
                  >
                    {contest.name}
                  </button>
                )}
              </div>
            </div>
          </section>

          <section className="panel">
            <h2>OAuth Authentication</h2>
            <p className="hint">Optional: For remote access and cloud sync</p>
            <div className="action-buttons">
              <button className="btn secondary">🔗 GitHub OAuth</button>
              <button className="btn secondary">🔗 Google OAuth</button>
            </div>
          </section>
        </div>
      </div>
    )
  }

  function renderLoggingView() {
    return <LoggingPage stationId={selectedStationId || ''} isActive={effectiveView === 'logging'} />
  }
  function renderAdminView() {
    const saveAdminList = async () => {
      const callsigns = adminListInput
        .split(',')
        .map(c => c.trim().toUpperCase())
        .filter(c => c.length > 0)
      
      try {
        const response = await fetch('/api/admin/callsigns', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({ callsigns }),
        })
        if (response.ok) {
          await fetchAdminList()
        }
      } catch (error) {
        console.error('Failed to save admin list:', error)
      }
    }

    // Group scenarios by category
    const scenariosByCategory = scenarios.reduce((acc, scenario) => {
      const category = scenario.category || 'other'
      if (!acc[category]) acc[category] = []
      acc[category].push(scenario)
      return acc
    }, {} as Record<string, any[]>)

    const categoryLabels: Record<string, string> = {
      'home': '🏠 Home Use',
      'pota': '🏕️ POTA - Parks on the Air',
      'field-day': '🏕️ Field Day',
      'complex': '🌐 Complex Scenarios',
    }
    
    return (
      <div className="view-container">
        <div className="view-header">
          <h1>Admin Controls</h1>
          <p className="view-description">
            Global system settings and administrative controls
          </p>
        </div>
        <div className="view-content">
          <section className="panel">
            <h2>Authorization</h2>
            <p className="hint">
              <strong>Current Status:</strong> {isAdmin ? '✅ You have admin access' : '❌ Not authorized'}
            </p>
          </section>

          <section className="panel">
            <h2>👥 Station Management</h2>
            <p className="hint">
              View and manage all stations in the system. Check for duplicate callsigns and active sessions.
            </p>
            <button
              className="btn primary"
              onClick={() => fetchAllStations()}
              style={{ marginBottom: '1rem' }}
            >
              {stationsLoading ? '⏳ Loading...' : '🔄 Refresh Stations'}
            </button>
            {allStations.length === 0 ? (
              <p style={{ color: 'var(--text-secondary)' }}>No stations found.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: '0.9rem',
                }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border)' }}>
                      <th style={{ padding: '0.75rem', textAlign: 'left', width: '2rem' }}></th>
                      <th style={{ padding: '0.75rem', textAlign: 'left' }}>Callsign</th>
                      <th style={{ padding: '0.75rem', textAlign: 'left' }}>Name</th>
                      <th style={{ padding: '0.75rem', textAlign: 'center' }}>Sessions</th>
                      <th style={{ padding: '0.75rem', textAlign: 'center' }}>QSOs</th>
                      <th style={{ padding: '0.75rem', textAlign: 'center' }}>Radios</th>
                      <th style={{ padding: '0.75rem', textAlign: 'left' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allStations.map((station: any) => (
                      <>
                        <tr key={station.id} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '0.75rem', textAlign: 'center', width: '2rem' }}>
                            {station.sessions?.length > 0 && (
                              <button
                                className="btn"
                                onClick={() => setExpandedStationId(expandedStationId === station.id ? null : station.id)}
                                title="Show session details"
                                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem' }}
                              >
                                {expandedStationId === station.id ? '▼' : '▶'}
                              </button>
                            )}
                          </td>
                          <td style={{ padding: '0.75rem', fontWeight: '600' }}>{station.callsign}</td>
                          <td style={{ padding: '0.75rem' }}>{station.name}</td>
                          <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                            <span style={{
                              display: 'inline-block',
                              padding: '0.25rem 0.5rem',
                              backgroundColor: station.sessions?.length > 0 ? 'var(--success-bg)' : 'var(--surface-secondary)',
                              color: station.sessions?.length > 0 ? 'var(--success)' : 'var(--text-secondary)',
                              borderRadius: '4px',
                              fontSize: '0.85rem',
                              fontWeight: '600',
                            }}>
                              {station.sessions?.length || 0}
                            </span>
                          </td>
                          <td style={{ padding: '0.75rem', textAlign: 'center' }}>{station._count?.qsoLogs || 0}</td>
                          <td style={{ padding: '0.75rem', textAlign: 'center' }}>{station._count?.radioAssignments || 0}</td>
                          <td style={{ padding: '0.75rem' }}>
                            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                              {station.sessions?.length > 0 && (
                                <button
                                  className="btn secondary"
                                  onClick={() => clearStationSessions(station.id)}
                                  title="Clear all sessions for this station"
                                  style={{ fontSize: '0.8rem', padding: '0.4rem 0.6rem' }}
                                >
                                  Clear Sessions
                                </button>
                              )}
                              {selectedStationId !== station.id && (
                                <button
                                  className="btn danger"
                                  onClick={() => deleteStation(station.id)}
                                  title="Delete this station"
                                  style={{ fontSize: '0.8rem', padding: '0.4rem 0.6rem' }}
                                >
                                  Delete
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                        {expandedStationId === station.id && station.sessions?.length > 0 && (
                          <tr style={{ backgroundColor: 'var(--surface-secondary)', borderBottom: '1px solid var(--border)' }}>
                            <td colSpan={8} style={{ padding: '0.75rem' }}>
                              <div style={{ marginLeft: '2rem' }}>
                                <h4 style={{ marginTop: 0, marginBottom: '0.5rem', fontSize: '0.95rem' }}>
                                  Session Details ({station.sessions.length})
                                </h4>
                                <div style={{ display: 'grid', gap: '0.5rem' }}>
                                  {station.sessions.map((session: any) => (
                                    <div
                                      key={session.id}
                                      style={{
                                        padding: '0.5rem 0.75rem',
                                        backgroundColor: 'var(--surface)',
                                        borderRadius: '4px',
                                        fontSize: '0.85rem',
                                        border: '1px solid var(--border)',
                                      }}
                                    >
                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
                                        <div style={{ flex: 1 }}>
                                          <div>
                                            <strong>Source:</strong>{' '}
                                            <span
                                              style={{
                                                padding: '0.2rem 0.4rem',
                                                backgroundColor:
                                                  session.sourceType === 'n3fjp'
                                                    ? '#ff9500'
                                                    : session.sourceType === 'mobile'
                                                      ? '#2196f3'
                                                      : session.sourceType === 'api'
                                                        ? '#9c27b0'
                                                        : '#4caf50',
                                                color: '#fff',
                                                borderRadius: '3px',
                                                fontWeight: '600',
                                                fontSize: '0.8rem',
                                              }}
                                            >
                                              {session.sourceType.toUpperCase()}
                                            </span>
                                            {session.sourceInfo && <span style={{ marginLeft: '0.5rem', opacity: 0.8 }}>({session.sourceInfo})</span>}
                                          </div>
                                          <div style={{ marginTop: '0.25rem', opacity: 0.8 }}>
                                            <strong>Created:</strong> {new Date(session.createdAt).toLocaleString()}
                                          </div>
                                          <div style={{ marginTop: '0.25rem', opacity: 0.8 }}>
                                            <strong>Last Activity:</strong> {new Date(session.lastActivity).toLocaleString()}
                                          </div>
                                          <div style={{ marginTop: '0.25rem', opacity: 0.8 }}>
                                            <strong>Expires:</strong> {new Date(session.expiresAt).toLocaleString()}
                                          </div>
                                        </div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                          Token: {session.token.substring(0, 12)}...
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {allStations.length > 0 && (
              <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: 'var(--surface-secondary)', borderRadius: '6px', fontSize: '0.9rem' }}>
                <strong>💡 Tip:</strong> Look for duplicate callsigns in the list above. If you see your callsign twice, you can delete the duplicate station to clean up. All sessions will be cleared when you delete a station.
              </div>
            )}
          </section>

          <section className="panel">
            <h2>🎬 Scenario Loading</h2>
            <p className="hint">
              Fully reset the instance and load example data. Choose a scenario to get started with realistic demo configurations.
            </p>
            {scenarioLoadConfirm && (
              <div className="alert alert-warning" style={{ marginBottom: '1rem' }}>
                <strong>⚠️ Confirm Scenario Load</strong>
                <p>This will completely erase all current data and load the selected scenario. This action cannot be undone.</p>
                <div className="action-buttons" style={{ marginTop: '0.5rem' }}>
                  <button
                    className="btn danger"
                    onClick={() => loadScenario(scenarioLoadConfirm)}
                    disabled={scenarioLoading}
                  >
                    {scenarioLoading ? '⏳ Loading...' : '✓ Confirm & Load'}
                  </button>
                  <button
                    className="btn secondary"
                    onClick={() => setScenarioLoadConfirm(null)}
                    disabled={scenarioLoading}
                  >
                    ✗ Cancel
                  </button>
                </div>
              </div>
            )}
            {Object.entries(scenariosByCategory).map(([category, items]) => (
              <div key={category} style={{ marginBottom: '1.5rem' }}>
                <h3 style={{ fontSize: '0.95rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {categoryLabels[category] || category}
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 'var(--space-sm)' }}>
                  {items.map((scenario: any) => (
                    <div
                      key={scenario.id}
                      style={{
                        padding: 'var(--space-md)',
                        border: '1px solid var(--border)',
                        borderRadius: '6px',
                        backgroundColor: 'var(--surface-secondary)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 'var(--space-sm)',
                      }}
                    >
                      <div>
                        <h4 style={{ margin: '0 0 0.25rem 0', fontSize: '0.95rem', fontWeight: '600' }}>
                          {scenario.name}
                        </h4>
                        <p style={{ margin: '0', fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                          {scenario.description}
                        </p>
                      </div>
                      <button
                        className="btn primary"
                        onClick={() => setScenarioLoadConfirm(scenario.id)}
                        disabled={scenarioLoading || scenarioLoadingId === scenario.id}
                        style={{ marginTop: 'auto' }}
                      >
                        {scenarioLoadingId === scenario.id ? '⏳ Loading...' : '📥 Load Scenario'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </section>

          <section className="panel">
            <h2>Admin Callsigns Whitelist</h2>
            <p className="hint">
              Restrict admin controls to specific callsigns (comma-separated). Leave empty for unrestricted access.
            </p>
            <div className="field">
              <label>Admin Callsigns</label>
              <textarea
                rows={3}
                value={adminListInput}
                onChange={(e) => setAdminListInput(e.target.value)}
                placeholder="W1AW, K1LI, N1XYZ"
              ></textarea>
            </div>
            <div className="action-buttons">
              <button className="btn primary" onClick={saveAdminList}>
                💾 Save Admin List
              </button>
            </div>
          </section>

          <section className="panel">
            <h2>System Info</h2>
            <div className="info-row">
              <span>Active Stations:</span>
              <strong>{stations.length}</strong>
            </div>
            <div className="info-row">
              <span>Total QSOs:</span>
              <strong>
                {stations.reduce((sum, s) => sum + s._count.qsoLogs, 0)}
              </strong>
            </div>
            <div className="info-row">
              <span>Database:</span>
              <strong>SQLite</strong>
            </div>
          </section>
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      <header className="navbar">
        <div className="navbar-left">
          <div className="brand">
            <div className="logo">YH</div>
            <span className="title">YAHAML</span>
          </div>
          
          <nav className="nav-items">
            <button
              className={`nav-btn ${effectiveView === 'dashboard' ? 'active' : ''}`}
              onClick={() => handleViewChange('dashboard')}
            >
              Dashboard
            </button>
            <button
              className={`nav-btn ${effectiveView === 'club' ? 'active' : ''}`}
              onClick={() => handleViewChange('club')}
              disabled={!hasActiveCallsign}
            >
              Club
            </button>
            <button
              className={`nav-btn ${effectiveView === 'contests' ? 'active' : ''}`}
              onClick={() => {
                if (!hasActiveCallsign) {
                  addError('Select a callsign to continue.')
                  return
                }
                handleViewChange('contests')
                fetchContestTemplates()
                fetchUpcomingContests()
              }}
              disabled={!hasActiveCallsign}
            >
              Contests
            </button>
            <button
              className={`nav-btn ${effectiveView === 'station' ? 'active' : ''}`}
              onClick={() => handleViewChange('station')}
              disabled={!hasActiveCallsign}
            >
              Station
            </button>
            <button
              className={`nav-btn ${effectiveView === 'logging' ? 'active' : ''}`}
              onClick={() => handleViewChange('logging')}
              disabled={!hasActiveCallsign}
            >
              Logging
            </button>
            <button
              className={`nav-btn ${effectiveView === 'rig' ? 'active' : ''}`}
              onClick={() => handleViewChange('rig')}
              disabled={!hasActiveCallsign}
            >
              Rig
            </button>
            {isAdmin && (
              <button
                className={`nav-btn ${effectiveView === 'admin' ? 'active' : ''}`}
                onClick={() => handleViewChange('admin')}
                disabled={!hasActiveCallsign}
              >
                Admin
              </button>
            )}
            <button
              className={`nav-btn ${effectiveView === 'debug' ? 'active' : ''}`}
              onClick={() => handleViewChange('debug')}
              disabled={!hasActiveCallsign}
              title="Debug logs and system status"
            >
              🐛 Debug
            </button>
          </nav>
        </div>

        <div className="navbar-right">
          {contest && contest.isActive && (
            <div className="contest-badge">
              <span>📡</span>
              <span>{contest.name}</span>
            </div>
          )}

          {hasActiveCallsign && (
            <div className="voice-room-toolbar-indicator">
              <VoiceRoomPanel
                stationId={selectedStationId || ''}
                sessionToken={sessionToken}
                compact={true}
              />
            </div>
          )}
          
          <div className="theme-toggle">
            <button
              className={`theme-btn ${theme === 'auto' ? 'active' : ''}`}
              onClick={() => setTheme('auto')}
              title="Auto"
            >
              🔄
            </button>
            <button
              className={`theme-btn ${theme === 'light' ? 'active' : ''}`}
              onClick={() => setTheme('light')}
              title="Light Mode"
            >
              ☀️
            </button>
            <button
              className={`theme-btn ${theme === 'dark' ? 'active' : ''}`}
              onClick={() => setTheme('dark')}
              title="Dark Mode"
            >
              🌙
            </button>
          </div>
          
          <button className="btn-icon" onClick={fetchStations} title="Refresh">
            🔄
          </button>

          <div className="callsign-picker">
            <button
              className={`callsign-toggle ${hasActiveCallsign ? '' : 'callsign-toggle--empty'}`}
              onClick={() => setShowCallsignPicker((prev) => !prev)}
              aria-expanded={showCallsignPicker}
            >
              <span>{callsignDisplay}</span>
              <span className="callsign-toggle-caret">▾</span>
            </button>
            {showCallsignPicker && (
              <div className="callsign-picker-panel">
                <div className="callsign-picker-title">Select Callsign</div>
                <div className="quick-select">
                  {sortedStations.map((station) => (
                    <button
                      key={station.id}
                      className={`quick-btn ${station.callsign === currentCallsign ? 'active' : ''}`}
                      onClick={() => handleCallsignSelect(station.callsign)}
                    >
                      {station.callsign}
                    </button>
                  ))}
                  <button className="quick-btn secondary" onClick={() => handleCallsignSelect('__new__')}>
                    ＋ Add new callsign
                  </button>
                  {hasActiveCallsign && (
                    <button className="quick-btn" onClick={() => handleCallsignSelect('__unset__')}>
                      Unset callsign
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

        </div>
      </header>

      <main>
        {globalMessages.length > 0 && (
          <div className="global-messages">
            {globalMessages.map((msg, idx) => (
              <div key={idx} className={`global-message ${msg.type}`}>{msg.text}</div>
            ))}
          </div>
        )}
        {!hasActiveCallsign && !allowCallsignSetup && (
          <div className="callsign-gate">
            <strong>Callsign required.</strong> Select one from the top-right selector to unlock logging, station, and rig tabs.
          </div>
        )}
        {effectiveView === 'dashboard' && renderDashboard()}
        {effectiveView === 'club' && renderClubView()}
        {effectiveView === 'contests' && renderContestsView()}
        {effectiveView === 'station' && renderStationView()}
        <div style={{ display: effectiveView === 'logging' ? 'block' : 'none' }} aria-hidden={effectiveView !== 'logging'}>
          {renderLoggingView()}
        </div>
        {effectiveView === 'rig' && renderRigView()}
        {effectiveView === 'admin' && renderAdminView()}
        {effectiveView === 'debug' && <DebugPanel />}
      </main>
    </div>
  )
}

function AppWithTheme() {
  return (
    <ThemeProvider>
      <App />
    </ThemeProvider>
  )
}

export default AppWithTheme
