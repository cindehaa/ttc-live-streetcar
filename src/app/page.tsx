'use client'

import { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef } from 'react'
import dynamic from 'next/dynamic'
import { RouteSelector } from './components/RouteSelector'
import { WaitTimePanel } from './components/WaitTimePanel'
import { STREETCAR_ROUTES, matchesDirection } from './types'
import type { VehicleLocation, RouteDirectionFilter, RouteConfig, RouteStop } from './types'
import { arcDistAlongPath, calculateWaits, haversineKm } from './lib/routing'
import type { LatLon } from './lib/routing'
import styles from './page.module.css'

const StreetcarMap = dynamic(() => import('./components/StreetcarMap'), {
  ssr: false,
  loading: () => <div className={styles.mapPlaceholder} />,
})

const POLL_INTERVAL_MS = 10_000
const DIRECTION_FILTERS_KEY = 'ttc-direction-filters'

function secondsAgo(ts: number): string {
  const sec = Math.round((Date.now() - ts) / 1000)
  if (sec < 5) return 'just now'
  if (sec < 60) return `${sec}s ago`
  return `${Math.round(sec / 60)}m ago`
}

function configToLatLon(paths: [number, number][][]): LatLon[][] {
  return paths.map((path) => path.map(([lat, lon]) => ({ lat, lon })))
}

function LastUpdated({ ts }: { ts: number | null }) {
  const [label, setLabel] = useState(() => (ts ? secondsAgo(ts) : ''))
  useEffect(() => {
    if (!ts) return
    setLabel(secondsAgo(ts))
    const id = setInterval(() => setLabel(secondsAgo(ts)), 1000)
    return () => clearInterval(id)
  }, [ts])
  if (!ts) return null
  return <span className={styles.lastUpdate}>{label}</span>
}

export default function TTCPage() {
  const [selected, setSelected] = useState<Set<string>>(new Set(['501', '504', '510']))
  const [vehicles, setVehicles] = useState<VehicleLocation[]>([])
  const [lastUpdated, setLastUpdated] = useState<number | null>(null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [routeDirections, setRouteDirections] = useState<Record<string, RouteDirectionFilter>>({})

  const [routeConfigs, setRouteConfigs] = useState<Record<string, RouteConfig>>({})
  const routeConfigsRef = useRef<Record<string, RouteConfig>>({})
  routeConfigsRef.current = routeConfigs
  const [showPaths, setShowPaths] = useState(true)
  const [showStops, setShowStops] = useState(true)

  const fetchRouteConfigs = useCallback(async (tags: string[]) => {
    const missing = tags.filter((t) => !routeConfigsRef.current[t])
    if (missing.length === 0) return
    try {
      const res = await fetch(`/api/projects/ttc/route-config?routes=${missing.join(',')}`, {
        cache: 'no-store',
      })
      if (!res.ok) return
      const data = await res.json()
      if (data.routes) {
        setRouteConfigs((prev) => ({ ...prev, ...data.routes }))
      }
    } catch {
      // non-critical
    }
  }, [])

  useLayoutEffect(() => {
    try {
      const saved = localStorage.getItem('ttc-selected-routes')
      if (saved) setSelected(new Set(JSON.parse(saved) as string[]))
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem('ttc-selected-routes', JSON.stringify(Array.from(selected)))
    } catch {
      // ignore
    }
  }, [selected])

  useEffect(() => {
    const tags = Array.from(selected)
    if (tags.length > 0) fetchRouteConfigs(tags)
  }, [selected, fetchRouteConfigs])

  const [userPos, setUserPos] = useState<LatLon | null>(null)
  const [geoStatus, setGeoStatus] = useState<string | null>(null)
  const [focusUserPin, setFocusUserPin] = useState(false)

  const [selectedStop, setSelectedStop] = useState<RouteStop | null>(null)
  const [selectedStopRouteTag, setSelectedStopRouteTag] = useState<string | null>(null)

  useLayoutEffect(() => {
    try {
      const stored = localStorage.getItem(DIRECTION_FILTERS_KEY)
      if (stored) setRouteDirections(JSON.parse(stored))
    } catch {
      // ignore
    }
  }, [])

  const fetchVehicles = useCallback(async () => {
    if (selected.size === 0) {
      setVehicles([])
      return
    }
    setStatus('loading')
    const tags = Array.from(selected)
    try {
      const res = await fetch(`/api/projects/ttc?routes=${tags.join(',')}`, {
        cache: 'no-store',
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setVehicles(data.vehicles ?? [])
      setLastUpdated(data.timestamp ?? Date.now())
      setStatus('idle')
    } catch {
      setStatus('error')
    }
  }, [selected])

  useEffect(() => {
    fetchVehicles()
    const id = setInterval(fetchVehicles, POLL_INTERVAL_MS)
    return () => clearInterval(id)
  }, [fetchVehicles])

  function toggleRoute(tag: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(tag)) next.delete(tag)
      else next.add(tag)
      return next
    })
  }

  const vehicleCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const v of vehicles) {
      counts[v.routeTag] = (counts[v.routeTag] ?? 0) + 1
    }
    return counts
  }, [vehicles])

  function setRouteDirection(tag: string, dir: RouteDirectionFilter) {
    setRouteDirections((prev) => {
      const next = { ...prev, [tag]: dir }
      try {
        localStorage.setItem(DIRECTION_FILTERS_KEY, JSON.stringify(next))
      } catch {
        // ignore
      }
      return next
    })
  }

  const geolocate = useCallback(() => {
    if (!navigator.geolocation) {
      setGeoStatus('Geolocation not supported by this browser.')
      return
    }
    if (!window.isSecureContext) {
      setGeoStatus('Location requires HTTPS or localhost.')
      return
    }
    setGeoStatus('Locating…')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserPos({ lat: pos.coords.latitude, lon: pos.coords.longitude })
        setFocusUserPin(true)
        setGeoStatus(null)
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setGeoStatus('Location denied. Right-click map to set manually.')
          return
        }
        if (err.code === err.POSITION_UNAVAILABLE) {
          setGeoStatus('Location unavailable. Right-click map to set manually.')
          return
        }
        if (err.code === err.TIMEOUT) {
          setGeoStatus('Location timed out. Right-click map to set manually.')
          return
        }
        setGeoStatus('Could not get location. Right-click map to set manually.')
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 15000 },
    )
  }, [])

  useEffect(() => {
    geolocate()
  }, [geolocate])

  function handleMapClick(pos: LatLon) {
    setUserPos(pos)
    setGeoStatus(null)
    setFocusUserPin(false)
  }

  function handleStopClick(stop: RouteStop, routeTag: string) {
    setSelectedStop(stop)
    setSelectedStopRouteTag(routeTag)
  }

  function clearArrivals() {
    setSelectedStop(null)
    setSelectedStopRouteTag(null)
  }

  const filteredVehicles = useMemo(() => {
    return vehicles.filter((v) => {
      const route = STREETCAR_ROUTES.find((r) => r.tag === v.routeTag)
      if (!route) return true
      return matchesDirection(v.heading, route, routeDirections[v.routeTag] ?? 'both')
    })
  }, [vehicles, routeDirections])

  const convertedConfigs = useMemo(() => {
    const result: Record<string, LatLon[][]> = {}
    for (const [tag, cfg] of Object.entries(routeConfigs)) {
      result[tag] = configToLatLon(cfg.paths)
    }
    return result
  }, [routeConfigs])

  const waitResults = useMemo(() => {
    if (!selectedStop || !selectedStopRouteTag) return []
    const destPos = { lat: selectedStop.lat, lon: selectedStop.lon }

    let routeTag = selectedStopRouteTag
    if (!selected.has(routeTag)) {
      let bestTag: string | null = null
      let bestDist = Infinity
      for (const [tag, paths] of Object.entries(convertedConfigs)) {
        if (!selected.has(tag)) continue
        for (const path of paths) {
          const { minDistKm } = arcDistAlongPath(destPos, path)
          if (minDistKm < bestDist) {
            bestDist = minDistKm
            bestTag = tag
          }
        }
      }
      if (!bestTag) return []
      routeTag = bestTag
    }

    const paths = convertedConfigs[routeTag]
    if (!paths) return []
    const routeVehicles = filteredVehicles.filter((v) => v.routeTag === routeTag)
    return calculateWaits(userPos, destPos, routeVehicles, paths)
  }, [selectedStop, selectedStopRouteTag, convertedConfigs, filteredVehicles, userPos, selected])

  const walkMinutes = useMemo(() => waitResults[0]?.walkMinutes ?? null, [waitResults])

  const nearbyVehicles = useMemo(() => {
    if (!userPos || filteredVehicles.length === 0) return []
    return filteredVehicles
      .map((v) => {
        const distKm = haversineKm(userPos, { lat: v.lat, lon: v.lon })
        const speedKmH = Math.max(v.speedKmHr, 3)
        const etaMinutes = (distKm / speedKmH) * 60
        const routeInfo = STREETCAR_ROUTES.find((r) => r.tag === v.routeTag)
        return {
          vehicleId: v.id,
          routeTag: v.routeTag,
          routeLabel: routeInfo?.label ?? '',
          color: routeInfo?.color ?? '#587bda',
          distKm,
          etaMinutes,
        }
      })
      .sort((a, b) => a.distKm - b.distKm)
      .slice(0, 5)
  }, [userPos, filteredVehicles])

  const totalVehicles = filteredVehicles.length

  return (
    <div className={styles.root}>
      <header className={styles.topBar}>
        <div className={styles.topLeft}>
          <span className={styles.title}>TTC Streetcars</span>
          <span className={styles.divider}>|</span>
          <span className={styles.subtitle}>Toronto Transit Commission</span>
        </div>
        <div className={styles.topRight}>
          {status === 'error' && <span className={styles.errorBadge}>Connection error</span>}
          {totalVehicles > 0 && (
            <span className={styles.vehicleCount}>
              {totalVehicles} vehicle{totalVehicles !== 1 ? 's' : ''}
            </span>
          )}
          <LastUpdated ts={lastUpdated} />
          <button
            className={styles.geoBtn}
            onClick={geolocate}
            title={geoStatus ?? (userPos ? 'Re-locate me' : 'Detect your location')}
          >
            ⊕ Locate me
          </button>
          <span className={`${styles.liveChip} ${status === 'loading' ? styles.liveLoading : ''}`}>
            <span className={styles.liveDot} />
            LIVE
          </span>
        </div>
      </header>

      <div className={styles.body}>
        <RouteSelector
          routes={STREETCAR_ROUTES}
          selected={selected}
          onToggle={toggleRoute}
          onSelectAll={() => setSelected(new Set(STREETCAR_ROUTES.map((r) => r.tag)))}
          onClearAll={() => setSelected(new Set())}
          vehicleCounts={vehicleCounts}
          routeDirections={routeDirections}
          onDirectionChange={setRouteDirection}
          showPaths={showPaths}
          showStops={showStops}
          onTogglePaths={() => setShowPaths((p) => !p)}
          onToggleStops={() => setShowStops((p) => !p)}
        />
        <div className={styles.mapArea}>
          {selected.size === 0 ? (
            <div className={styles.emptyState}>
              <p className={styles.emptyText}>Select one or more routes to view streetcars.</p>
            </div>
          ) : (
            <>
              <StreetcarMap
                vehicles={filteredVehicles}
                routes={STREETCAR_ROUTES}
                selected={selected}
                arrivalsEnabled={true}
                userPos={userPos}
                onMapClick={handleMapClick}
                focusUserPin={focusUserPin}
                onFocusedUserPin={() => setFocusUserPin(false)}
                routeConfigs={routeConfigs}
                showPaths={showPaths}
                showStops={showStops}
                onStopClick={handleStopClick}
                selectedStop={selectedStop}
                routeDirections={routeDirections}
                nearbyVehicles={nearbyVehicles}
              />

              {selectedStop && (
                <WaitTimePanel
                  results={waitResults}
                  stopTitle={selectedStop.title}
                  routeTag={selectedStopRouteTag}
                  routes={STREETCAR_ROUTES}
                  walkMinutes={walkMinutes}
                  onClear={clearArrivals}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
