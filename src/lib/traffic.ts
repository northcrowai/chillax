export type TrafficCushionMinutes = 0 | 5 | 10 | 15
export type TrafficMapTheme = 'light' | 'dark'

export interface TrafficPreferences {
  version: 1
  homeAddress: string
  arrivalTime: string
  cushionMinutes: TrafficCushionMinutes
}

export interface TrafficLatLng {
  latitude: number
  longitude: number
}

export type TrafficOrigin =
  | ({ kind: 'coordinates' } & TrafficLatLng)
  | { kind: 'address'; address: string }

export interface TrafficPlan {
  leaveBy: string
  requestedDepartureTime: string
  desiredArrivalTime: string
  deadlineTime: string
  predictedArrivalTime: string
  durationSeconds: number
  staticDurationSeconds: number
  trafficDelaySeconds: number
  distanceMeters: number
  encodedPolyline: string
  startLocation: TrafficLatLng
  endLocation: TrafficLatLng
  fetchedAt: string
  iterations: number
  leaveNow: boolean
  converged: boolean
}

export type TrafficErrorCode =
  | 'invalid-home'
  | 'invalid-origin'
  | 'invalid-arrival'
  | 'invalid-cushion'
  | 'past-arrival'
  | 'configuration'
  | 'network'
  | 'service'
  | 'no-route'
  | 'invalid-response'

export class TrafficError extends Error {
  readonly code: TrafficErrorCode

  constructor(code: TrafficErrorCode, message: string) {
    super(message)
    this.name = 'TrafficError'
    this.code = code
  }
}

export interface SolveTrafficRouteOptions {
  origin: TrafficOrigin
  homeAddress: string
  desiredArrival: Date
  bufferMinutes: TrafficCushionMinutes
  apiKey: string
  seedDurationSeconds?: number
  signal?: AbortSignal
  fetchImpl?: TrafficFetch
  now?: Date
}

export interface BuildStaticMapUrlOptions {
  plan: Pick<TrafficPlan, 'encodedPolyline' | 'startLocation' | 'endLocation'>
  apiKey: string
  theme?: TrafficMapTheme
  width?: number
  height?: number
  scale?: 1 | 2
}

export type TrafficFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>

export const TRAFFIC_PREFERENCES_STORAGE_KEY = 'chillax:traffic:v1'

export const DEFAULT_TRAFFIC_PREFERENCES: TrafficPreferences = Object.freeze({
  version: 1,
  homeAddress: '',
  arrivalTime: '18:00',
  cushionMinutes: 5,
})

export const GOOGLE_ROUTES_ENDPOINT =
  'https://routes.googleapis.com/directions/v2:computeRoutes'

export const GOOGLE_ROUTES_FIELD_MASK = [
  'routes.duration',
  'routes.staticDuration',
  'routes.distanceMeters',
  'routes.polyline.encodedPolyline',
  'routes.legs.startLocation',
  'routes.legs.endLocation',
  'routes.viewport',
].join(',')

const GOOGLE_STATIC_MAP_ENDPOINT = 'https://maps.googleapis.com/maps/api/staticmap'
const MAX_ADDRESS_LENGTH = 200
const MAX_POLYLINE_LENGTH = 12_000
const DEFAULT_ROUTE_DURATION_SECONDS = 30 * 60
const MAX_ROUTE_DURATION_SECONDS = 24 * 60 * 60
const MIN_FUTURE_DEPARTURE_MS = 60_000
const CONVERGENCE_THRESHOLD_MS = 60_000
const MAX_SOLVE_REQUESTS = 4

const TRAFFIC_NETWORK_ERROR =
  "We couldn't reach Google Maps. Check your connection and try again."
const TRAFFIC_SERVICE_ERROR =
  'Google Maps could not calculate this drive right now. Please try again shortly.'
const TRAFFIC_RESPONSE_ERROR =
  'Google Maps returned an incomplete route. Please try again.'

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

const isAbortError = (error: unknown): boolean =>
  isObject(error) && error.name === 'AbortError'

const isCushionMinutes = (value: unknown): value is TrafficCushionMinutes =>
  value === 0 || value === 5 || value === 10 || value === 15

const normalizeAddress = (value: string): string =>
  typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''

const isPersistableAddress = (value: unknown): value is string =>
  typeof value === 'string' && value.length <= MAX_ADDRESS_LENGTH

const isRequiredAddress = (value: unknown): value is string => {
  if (!isPersistableAddress(value)) return false
  const normalized = normalizeAddress(value)
  return normalized.length >= 2 && /[\p{L}\p{N}]/u.test(normalized)
}

const parseClockTime = (value: unknown): { hours: number; minutes: number } | null => {
  if (typeof value !== 'string') return null
  const match = /^(\d{2}):(\d{2})$/.exec(value)
  if (!match) return null

  const hours = Number(match[1])
  const minutes = Number(match[2])
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59
    ? { hours, minutes }
    : null
}

const isTrafficPreferences = (value: unknown): value is TrafficPreferences =>
  isObject(value)
  && value.version === 1
  && isPersistableAddress(value.homeAddress)
  && parseClockTime(value.arrivalTime) !== null
  && isCushionMinutes(value.cushionMinutes)

const createDefaultPreferences = (): TrafficPreferences => ({
  ...DEFAULT_TRAFFIC_PREFERENCES,
})

const getBrowserStorage = (): Storage | null => {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

const normalizePreferences = (preferences: TrafficPreferences): TrafficPreferences => ({
  version: 1,
  homeAddress: normalizeAddress(preferences.homeAddress),
  arrivalTime: preferences.arrivalTime,
  cushionMinutes: preferences.cushionMinutes,
})

export function loadTrafficPreferences(
  storage: Storage | null = getBrowserStorage(),
): TrafficPreferences {
  if (!storage) return createDefaultPreferences()

  try {
    const serialized = storage.getItem(TRAFFIC_PREFERENCES_STORAGE_KEY)
    if (!serialized) return createDefaultPreferences()

    const value = JSON.parse(serialized) as unknown
    if (!isTrafficPreferences(value)) return createDefaultPreferences()
    return normalizePreferences(value)
  } catch {
    return createDefaultPreferences()
  }
}

export function saveTrafficPreferences(
  preferences: TrafficPreferences,
  storage: Storage | null = getBrowserStorage(),
): boolean {
  if (!storage || !isTrafficPreferences(preferences)) return false

  try {
    const serialized = JSON.stringify(normalizePreferences(preferences))
    if (storage.getItem(TRAFFIC_PREFERENCES_STORAGE_KEY) === serialized) return false
    storage.setItem(TRAFFIC_PREFERENCES_STORAGE_KEY, serialized)
    return true
  } catch {
    return false
  }
}

export function clearTrafficPreferences(
  storage: Storage | null = getBrowserStorage(),
): boolean {
  if (!storage) return false

  try {
    const hadPreferences = storage.getItem(TRAFFIC_PREFERENCES_STORAGE_KEY) !== null
    storage.removeItem(TRAFFIC_PREFERENCES_STORAGE_KEY)
    return hadPreferences
  } catch {
    return false
  }
}

export function getTodayArrival(arrivalTime: string, now = new Date()): Date {
  const parsed = parseClockTime(arrivalTime)
  if (!parsed || !Number.isFinite(now.getTime())) {
    throw new TrafficError('invalid-arrival', 'Choose a valid arrival time for today.')
  }

  const arrival = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    parsed.hours,
    parsed.minutes,
    0,
    0,
  )

  // A daylight-saving transition can normalize a clock time that never occurs.
  if (arrival.getHours() !== parsed.hours || arrival.getMinutes() !== parsed.minutes) {
    throw new TrafficError('invalid-arrival', 'That time does not occur today. Choose another time.')
  }

  return arrival
}

const requireApiKey = (apiKey: string): string => {
  const normalized = typeof apiKey === 'string' ? apiKey.trim() : ''
  if (!normalized) {
    throw new TrafficError(
      'configuration',
      'Traffic is not configured yet. Add the Google Maps keys to enable route planning.',
    )
  }
  return normalized
}

const requireLatLng = (value: unknown): TrafficLatLng => {
  if (!isObject(value)
    || !isFiniteNumber(value.latitude)
    || !isFiniteNumber(value.longitude)
    || value.latitude < -90
    || value.latitude > 90
    || value.longitude < -180
    || value.longitude > 180) {
    throw new TrafficError('invalid-response', TRAFFIC_RESPONSE_ERROR)
  }

  return {
    latitude: value.latitude,
    longitude: value.longitude,
  }
}

const requireOrigin = (origin: TrafficOrigin): TrafficOrigin => {
  const value: unknown = origin
  if (!isObject(value)) {
    throw new TrafficError('invalid-origin', 'Choose a valid starting point and try again.')
  }

  if (value.kind === 'coordinates'
    && isFiniteNumber(value.latitude)
    && isFiniteNumber(value.longitude)
    && value.latitude >= -90
    && value.latitude <= 90
    && value.longitude >= -180
    && value.longitude <= 180) {
    return { kind: 'coordinates', latitude: value.latitude, longitude: value.longitude }
  }

  if (value.kind === 'address' && isRequiredAddress(value.address)) {
    return { kind: 'address', address: normalizeAddress(value.address) }
  }

  throw new TrafficError('invalid-origin', 'Choose a valid starting point and try again.')
}

const toGoogleWaypoint = (origin: TrafficOrigin): Record<string, unknown> =>
  origin.kind === 'coordinates'
    ? { location: { latLng: { latitude: origin.latitude, longitude: origin.longitude } } }
    : { address: origin.address }

const parseDurationSeconds = (value: unknown): number => {
  if (typeof value !== 'string') {
    throw new TrafficError('invalid-response', TRAFFIC_RESPONSE_ERROR)
  }

  const match = /^(\d+(?:\.\d+)?)s$/.exec(value)
  const seconds = match ? Number(match[1]) : Number.NaN
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds > MAX_ROUTE_DURATION_SECONDS) {
    throw new TrafficError('invalid-response', TRAFFIC_RESPONSE_ERROR)
  }
  return seconds
}

interface ParsedTrafficRoute {
  durationSeconds: number
  staticDurationSeconds: number
  distanceMeters: number
  encodedPolyline: string
  startLocation: TrafficLatLng
  endLocation: TrafficLatLng
}

const parseTrafficRoute = (payload: unknown): ParsedTrafficRoute => {
  if (!isObject(payload) || !Array.isArray(payload.routes)) {
    throw new TrafficError('invalid-response', TRAFFIC_RESPONSE_ERROR)
  }
  if (payload.routes.length === 0) {
    throw new TrafficError('no-route', 'Google Maps could not find a driving route for these places.')
  }

  const route = payload.routes[0]
  if (!isObject(route)
    || !isFiniteNumber(route.distanceMeters)
    || route.distanceMeters <= 0
    || !isObject(route.polyline)
    || typeof route.polyline.encodedPolyline !== 'string'
    || route.polyline.encodedPolyline.length === 0
    || route.polyline.encodedPolyline.length > MAX_POLYLINE_LENGTH
    || !Array.isArray(route.legs)
    || route.legs.length === 0) {
    throw new TrafficError('invalid-response', TRAFFIC_RESPONSE_ERROR)
  }

  const firstLeg = route.legs[0]
  const lastLeg = route.legs[route.legs.length - 1]
  if (!isObject(firstLeg)
    || !isObject(lastLeg)
    || !isObject(firstLeg.startLocation)
    || !isObject(lastLeg.endLocation)) {
    throw new TrafficError('invalid-response', TRAFFIC_RESPONSE_ERROR)
  }

  return {
    durationSeconds: parseDurationSeconds(route.duration),
    staticDurationSeconds: parseDurationSeconds(route.staticDuration),
    distanceMeters: route.distanceMeters,
    encodedPolyline: route.polyline.encodedPolyline,
    startLocation: requireLatLng(firstLeg.startLocation.latLng),
    endLocation: requireLatLng(lastLeg.endLocation.latLng),
  }
}

const requestTrafficRoute = async (
  options: SolveTrafficRouteOptions,
  origin: TrafficOrigin,
  homeAddress: string,
  apiKey: string,
  departureTime: Date,
): Promise<ParsedTrafficRoute> => {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch
  let response: Response

  try {
    response = await fetchImpl(GOOGLE_ROUTES_ENDPOINT, {
      method: 'POST',
      referrerPolicy: 'origin',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': GOOGLE_ROUTES_FIELD_MASK,
      },
      body: JSON.stringify({
        origin: toGoogleWaypoint(origin),
        destination: { address: homeAddress },
        travelMode: 'DRIVE',
        routingPreference: 'TRAFFIC_AWARE_OPTIMAL',
        trafficModel: 'BEST_GUESS',
        departureTime: departureTime.toISOString(),
        computeAlternativeRoutes: false,
        polylineQuality: 'OVERVIEW',
        polylineEncoding: 'ENCODED_POLYLINE',
        units: 'IMPERIAL',
      }),
      signal: options.signal,
    })
  } catch (error) {
    if (isAbortError(error)) throw error
    throw new TrafficError('network', TRAFFIC_NETWORK_ERROR)
  }

  if (!response.ok) {
    throw new TrafficError('service', TRAFFIC_SERVICE_ERROR)
  }

  let payload: unknown
  try {
    payload = await response.json() as unknown
  } catch {
    throw new TrafficError('invalid-response', TRAFFIC_RESPONSE_ERROR)
  }

  return parseTrafficRoute(payload)
}

const isSameLocalDay = (first: Date, second: Date): boolean =>
  first.getFullYear() === second.getFullYear()
  && first.getMonth() === second.getMonth()
  && first.getDate() === second.getDate()

const createPlan = (
  route: ParsedTrafficRoute,
  requestedDepartureMs: number,
  leaveByMs: number,
  desiredArrivalMs: number,
  deadlineMs: number,
  fetchedAt: Date,
  iterations: number,
  leaveNow: boolean,
  converged: boolean,
): TrafficPlan => ({
  leaveBy: new Date(leaveByMs).toISOString(),
  requestedDepartureTime: new Date(requestedDepartureMs).toISOString(),
  desiredArrivalTime: new Date(desiredArrivalMs).toISOString(),
  deadlineTime: new Date(deadlineMs).toISOString(),
  predictedArrivalTime: new Date(leaveByMs + route.durationSeconds * 1000).toISOString(),
  durationSeconds: route.durationSeconds,
  staticDurationSeconds: route.staticDurationSeconds,
  trafficDelaySeconds: Math.max(0, route.durationSeconds - route.staticDurationSeconds),
  distanceMeters: route.distanceMeters,
  encodedPolyline: route.encodedPolyline,
  startLocation: { ...route.startLocation },
  endLocation: { ...route.endLocation },
  fetchedAt: fetchedAt.toISOString(),
  iterations,
  leaveNow,
  converged,
})

export async function solveTrafficRoute(
  options: SolveTrafficRouteOptions,
): Promise<TrafficPlan> {
  const startedAt = new Date(options.now ?? new Date())
  const nowMs = startedAt.getTime()
  if (!Number.isFinite(nowMs)) {
    throw new TrafficError('invalid-arrival', 'Choose a valid arrival time for today.')
  }

  const desiredArrival = new Date(options.desiredArrival)
  const desiredArrivalMs = desiredArrival.getTime()
  if (!Number.isFinite(desiredArrivalMs) || !isSameLocalDay(desiredArrival, startedAt)) {
    throw new TrafficError('invalid-arrival', 'Choose a valid arrival time for today.')
  }
  if (desiredArrivalMs <= nowMs) {
    throw new TrafficError('past-arrival', 'That arrival time has already passed. Choose a later time today.')
  }
  if (!isCushionMinutes(options.bufferMinutes)) {
    throw new TrafficError('invalid-cushion', 'Choose a 0, 5, 10, or 15 minute arrival cushion.')
  }

  const homeAddress = isRequiredAddress(options.homeAddress)
    ? normalizeAddress(options.homeAddress)
    : ''
  if (!homeAddress) {
    throw new TrafficError('invalid-home', 'Enter a valid Home address.')
  }

  const origin = requireOrigin(options.origin)
  const apiKey = requireApiKey(options.apiKey)
  const seedDurationSeconds = isFiniteNumber(options.seedDurationSeconds)
    && options.seedDurationSeconds > 0
    && options.seedDurationSeconds <= MAX_ROUTE_DURATION_SECONDS
    ? options.seedDurationSeconds
    : DEFAULT_ROUTE_DURATION_SECONDS

  const deadlineMs = desiredArrivalMs - options.bufferMinutes * 60_000
  const minimumRequestMs = nowMs + MIN_FUTURE_DEPARTURE_MS
  let candidateMs = Math.max(deadlineMs - seedDurationSeconds * 1000, minimumRequestMs)
  const priorCandidates: number[] = []
  let lastRoute: ParsedTrafficRoute | null = null
  let lastRequestedMs = candidateMs
  let nextCandidateMs = candidateMs

  for (let iteration = 1; iteration <= MAX_SOLVE_REQUESTS; iteration += 1) {
    const requestedMs = Math.max(candidateMs, minimumRequestMs)
    const route = await requestTrafficRoute(
      options,
      origin,
      homeAddress,
      apiKey,
      new Date(requestedMs),
    )
    lastRoute = route
    lastRequestedMs = requestedMs
    nextCandidateMs = deadlineMs - route.durationSeconds * 1000

    if (nextCandidateMs <= nowMs) {
      return createPlan(
        route,
        requestedMs,
        nowMs,
        desiredArrivalMs,
        deadlineMs,
        startedAt,
        iteration,
        true,
        true,
      )
    }

    if (Math.abs(nextCandidateMs - requestedMs) <= CONVERGENCE_THRESHOLD_MS) {
      return createPlan(
        route,
        requestedMs,
        Math.min(requestedMs, nextCandidateMs),
        desiredArrivalMs,
        deadlineMs,
        startedAt,
        iteration,
        false,
        true,
      )
    }

    const cycleCandidate = priorCandidates.find(
      (previousCandidate) => Math.abs(previousCandidate - nextCandidateMs)
        <= CONVERGENCE_THRESHOLD_MS,
    )
    if (cycleCandidate !== undefined) {
      return createPlan(
        route,
        requestedMs,
        Math.min(requestedMs, nextCandidateMs, cycleCandidate),
        desiredArrivalMs,
        deadlineMs,
        startedAt,
        iteration,
        false,
        false,
      )
    }

    priorCandidates.push(requestedMs)
    candidateMs = nextCandidateMs
  }

  if (!lastRoute) {
    throw new TrafficError('invalid-response', TRAFFIC_RESPONSE_ERROR)
  }

  const leaveByMs = Math.min(lastRequestedMs, nextCandidateMs)
  return createPlan(
    lastRoute,
    lastRequestedMs,
    leaveByMs <= nowMs ? nowMs : leaveByMs,
    desiredArrivalMs,
    deadlineMs,
    startedAt,
    MAX_SOLVE_REQUESTS,
    leaveByMs <= nowMs,
    false,
  )
}

const requireMapDimension = (value: number | undefined, fallback: number): number => {
  const dimension = value ?? fallback
  if (!Number.isInteger(dimension) || dimension < 1 || dimension > 640) {
    throw new TrafficError('configuration', 'The traffic map size is invalid.')
  }
  return dimension
}

const mapStyles: Readonly<Record<TrafficMapTheme, readonly string[]>> = {
  dark: [
    'element:geometry|color:0x24172b',
    'element:labels.text.fill|color:0xe9e1ed',
    'element:labels.text.stroke|color:0x1a101f',
    'feature:poi|visibility:off',
    'feature:road|element:geometry|color:0x4b3a54',
    'feature:road.highway|element:geometry|color:0x765482',
    'feature:transit|visibility:off',
    'feature:water|element:geometry|color:0x17303c',
  ],
  light: [
    'element:geometry|color:0xf5eff7',
    'element:labels.text.fill|color:0x493d4f',
    'element:labels.text.stroke|color:0xffffff',
    'feature:poi|visibility:off',
    'feature:road|element:geometry|color:0xffffff',
    'feature:road.highway|element:geometry|color:0xdbc4e4',
    'feature:transit|visibility:off',
    'feature:water|element:geometry|color:0xc8e3ea',
  ],
}

const formatCoordinate = (value: number): string => value.toFixed(6)

export function buildStaticMapUrl(options: BuildStaticMapUrlOptions): string {
  const apiKey = requireApiKey(options.apiKey)
  const theme = options.theme ?? 'dark'
  if (theme !== 'light' && theme !== 'dark') {
    throw new TrafficError('configuration', 'The traffic map theme is invalid.')
  }

  const width = requireMapDimension(options.width, 640)
  const height = requireMapDimension(options.height, 400)
  const scale = options.scale ?? 2
  if (scale !== 1 && scale !== 2) {
    throw new TrafficError('configuration', 'The traffic map scale is invalid.')
  }

  const start = requireLatLng(options.plan.startLocation)
  const end = requireLatLng(options.plan.endLocation)
  const polyline = options.plan.encodedPolyline
  if (typeof polyline !== 'string'
    || polyline.length === 0
    || polyline.length > MAX_POLYLINE_LENGTH) {
    throw new TrafficError('invalid-response', TRAFFIC_RESPONSE_ERROR)
  }

  const url = new URL(GOOGLE_STATIC_MAP_ENDPOINT)
  url.searchParams.set('size', `${width}x${height}`)
  url.searchParams.set('scale', String(scale))
  url.searchParams.set('format', 'png')
  url.searchParams.set('maptype', 'roadmap')
  url.searchParams.set('language', 'en')
  mapStyles[theme].forEach((style) => url.searchParams.append('style', style))
  url.searchParams.append('path', `weight:6|color:0xb347d9ff|enc:${polyline}`)
  url.searchParams.append(
    'markers',
    `size:mid|color:0x7cdece|label:A|${formatCoordinate(start.latitude)},${formatCoordinate(start.longitude)}`,
  )
  url.searchParams.append(
    'markers',
    `size:mid|color:0xb347d9|label:H|${formatCoordinate(end.latitude)},${formatCoordinate(end.longitude)}`,
  )
  url.searchParams.set('key', apiKey)
  return url.toString()
}
