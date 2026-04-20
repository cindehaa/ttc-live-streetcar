export type VehicleLocation = {
  id: string
  routeTag: string
  lat: number
  lon: number
  secsSinceReport: number
  heading: number
  speedKmHr: number
  predictable: boolean
}

/** Whether the primary corridor runs East-West or North-South */
export type RouteAxis = 'EW' | 'NS'

/**
 * 'both' = show all vehicles
 * 'a'    = direction A (East for EW routes, North for NS routes)
 * 'b'    = direction B (West for EW routes, South for NS routes)
 */
export type RouteDirectionFilter = 'both' | 'a' | 'b'

export type RouteInfo = {
  tag: string
  label: string
  shortName: string
  color: string
  axis: RouteAxis
  dirA: string
  dirB: string
}

/**
 * Returns true if the vehicle's heading matches the direction filter.
 */
export function matchesDirection(
  heading: number,
  route: RouteInfo,
  filter: RouteDirectionFilter,
): boolean {
  if (filter === 'both') return true
  const rad = (heading * Math.PI) / 180
  if (route.axis === 'EW') {
    const goingA = Math.sin(rad) >= 0
    return filter === 'a' ? goingA : !goingA
  } else {
    const goingA = Math.cos(rad) >= 0
    return filter === 'a' ? goingA : !goingA
  }
}

export type RouteStop = {
  tag: string
  title: string
  lat: number
  lon: number
}

export type RouteConfig = {
  paths: [number, number][][]
  stops: RouteStop[]
  directionStops?: Record<string, string[]>
}

export const STREETCAR_ROUTES: RouteInfo[] = [
  { tag: '501', label: 'Queen', shortName: '501', color: '#ef4444', axis: 'EW', dirA: 'East', dirB: 'West' },
  { tag: '504', label: 'King', shortName: '504', color: '#f97316', axis: 'EW', dirA: 'East', dirB: 'West' },
  { tag: '505', label: 'Dundas', shortName: '505', color: '#eab308', axis: 'EW', dirA: 'East', dirB: 'West' },
  { tag: '506', label: 'Carlton', shortName: '506', color: '#22c55e', axis: 'EW', dirA: 'East', dirB: 'West' },
  { tag: '508', label: 'Lake Shore', shortName: '508', color: '#06b6d4', axis: 'EW', dirA: 'East', dirB: 'West' },
  { tag: '509', label: 'Harbourfront', shortName: '509', color: '#a855f7', axis: 'EW', dirA: 'East', dirB: 'West' },
  { tag: '510', label: 'Spadina', shortName: '510', color: '#3b82f6', axis: 'NS', dirA: 'North', dirB: 'South' },
  { tag: '511', label: 'Bathurst', shortName: '511', color: '#ec4899', axis: 'NS', dirA: 'North', dirB: 'South' },
  { tag: '512', label: 'St Clair', shortName: '512', color: '#14b8a6', axis: 'EW', dirA: 'East', dirB: 'West' },
]
