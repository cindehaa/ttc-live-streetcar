import type { VehicleLocation } from '../types'

export type LatLon = { lat: number; lon: number }

const EARTH_R = 6371

export function haversineKm(a: LatLon, b: LatLon): number {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLon = ((b.lon - a.lon) * Math.PI) / 180
  const lat1 = (a.lat * Math.PI) / 180
  const lat2 = (b.lat * Math.PI) / 180
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_R * Math.asin(Math.sqrt(h))
}

function projectOnSegment(
  p: LatLon,
  a: LatLon,
  b: LatLon,
): { t: number; distKm: number } {
  const dx = b.lon - a.lon
  const dy = b.lat - a.lat
  const len2 = dx * dx + dy * dy
  let t = 0
  if (len2 > 0) {
    t = ((p.lon - a.lon) * dx + (p.lat - a.lat) * dy) / len2
    t = Math.max(0, Math.min(1, t))
  }
  const proj: LatLon = { lat: a.lat + t * dy, lon: a.lon + t * dx }
  return { t, distKm: haversineKm(p, proj) }
}

export function arcDistAlongPath(
  p: LatLon,
  path: LatLon[],
): { arcKm: number; minDistKm: number } {
  if (path.length < 2) return { arcKm: 0, minDistKm: Infinity }

  let bestArcKm = 0
  let bestDist = Infinity
  let cumKm = 0

  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i]
    const b = path[i + 1]
    const segKm = haversineKm(a, b)
    const { t, distKm } = projectOnSegment(p, a, b)

    if (distKm < bestDist) {
      bestDist = distKm
      bestArcKm = cumKm + t * segKm
    }
    cumKm += segKm
  }

  return { arcKm: bestArcKm, minDistKm: bestDist }
}

const MAX_ON_PATH_KM = 0.15
const MIN_BEHIND_KM = 0.03

export type WaitResult = {
  vehicleId: string
  routeTag: string
  speedKmHr: number
  distToDestKm: number
  etaMinutes: number
  walkMinutes: number
  netWaitMinutes: number
}

export function calculateWaits(
  userPos: LatLon | null,
  destPos: LatLon,
  vehicles: VehicleLocation[],
  paths: LatLon[][],
  walkSpeedKmH = 5,
  maxResults = 10,
): WaitResult[] {
  if (paths.length === 0 || vehicles.length === 0) return []

  const walkKm = userPos ? haversineKm(userPos, destPos) : 0
  const walkMinutes = (walkKm / walkSpeedKmH) * 60

  const destResults = paths.map((path) => arcDistAlongPath(destPos, path))
  const destPathIdx = destResults.reduce(
    (best, cur, i) => (cur.minDistKm < destResults[best].minDistKm ? i : best),
    0,
  )
  const destPath = paths[destPathIdx]
  const destArcKm = destResults[destPathIdx].arcKm

  const candidates: WaitResult[] = []

  for (const v of vehicles) {
    const vehiclePos: LatLon = { lat: v.lat, lon: v.lon }

    const { arcKm: vArcKm, minDistKm: vDistKm } = arcDistAlongPath(vehiclePos, destPath)

    if (vDistKm > MAX_ON_PATH_KM) continue

    const distToDestKm = destArcKm - vArcKm
    if (distToDestKm < MIN_BEHIND_KM) continue

    const speedKmH = Math.max(v.speedKmHr, 3)
    const etaMinutes = (distToDestKm / speedKmH) * 60

    candidates.push({
      vehicleId: v.id,
      routeTag: v.routeTag,
      speedKmHr: v.speedKmHr,
      distToDestKm,
      etaMinutes,
      walkMinutes,
      netWaitMinutes: etaMinutes - walkMinutes,
    })
  }

  candidates.sort((a, b) => a.etaMinutes - b.etaMinutes)
  return candidates.slice(0, maxResults)
}
