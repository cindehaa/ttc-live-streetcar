'use client'

import { useEffect, useRef, useState } from 'react'
import type { Map as LeafletMap, Marker as LeafletMarker, Polyline as LeafletPolyline, CircleMarker as LeafletCircleMarker, Popup as LeafletPopup } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import styles from './StreetcarMap.module.css'
import type { VehicleLocation, RouteInfo, RouteConfig, RouteStop, RouteDirectionFilter } from '../types'
import type { LatLon } from '../lib/routing'

// This file is loaded client-side only (ssr: false in page.tsx)

interface Props {
  vehicles: VehicleLocation[]
  routes: RouteInfo[]
  selected: Set<string>
  arrivalsEnabled?: boolean
  userPos?: LatLon | null
  /** Called when the map is clicked in arrivals mode (to set user location) */
  onMapClick?: (pos: LatLon) => void
  focusUserPin?: boolean
  onFocusedUserPin?: () => void
  routeConfigs?: Record<string, RouteConfig>
  showPaths?: boolean
  showStops?: boolean
  /** Called when a stop marker is clicked */
  onStopClick?: (stop: RouteStop, routeTag: string) => void
  /** The currently selected stop (highlighted on map) */
  selectedStop?: RouteStop | null
  /** Per-route direction filters (used to show/hide stop markers) */
  routeDirections?: Record<string, RouteDirectionFilter>
  /** Nearby vehicles shown in the user-pin popup */
  nearbyVehicles?: Array<{
    vehicleId: string
    routeTag: string
    routeLabel: string
    color: string
    distKm: number
    etaMinutes: number
  }>
}

const TORONTO = [43.6532, -79.3832] as [number, number]

function getRouteColor(tag: string, routes: RouteInfo[]): string {
  return routes.find((r) => r.tag === tag)?.color ?? '#587bda'
}

function buildVehicleIcon(L: typeof import('leaflet'), color: string, heading: number) {
  const rad = (heading * Math.PI) / 180
  const arrowLen = 9
  const cx = 12
  const cy = 12
  const tx = cx + Math.sin(rad) * arrowLen
  const ty = cy - Math.cos(rad) * arrowLen

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="6" fill="${color}" stroke="rgba(255,255,255,0.75)" stroke-width="1.5"/>
    <line x1="${cx}" y1="${cy}" x2="${tx}" y2="${ty}" stroke="rgba(255,255,255,0.9)" stroke-width="1.5" stroke-linecap="round"/>
  </svg>`

  return L.divIcon({
    html: svg,
    className: '',
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -14],
  })
}

function buildUserPinIcon(L: typeof import('leaflet')) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22">
    <circle cx="11" cy="11" r="9" fill="rgba(41,80,188,0.25)" stroke="#587bda" stroke-width="1.5"/>
    <circle cx="11" cy="11" r="4" fill="#587bda" stroke="white" stroke-width="1.5"/>
  </svg>`
  return L.divIcon({
    html: svg,
    className: '',
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    popupAnchor: [0, -14],
  })
}

/** Returns true if a stop should be visible given the current direction filter */
function isStopVisibleForDirection(
  stopTag: string,
  dirFilter: RouteDirectionFilter,
  directionStops: Record<string, string[]> | undefined,
  route: RouteInfo | undefined,
): boolean {
  if (dirFilter === 'both' || !directionStops || !route) return true
  const dirName = dirFilter === 'a' ? route.dirA : route.dirB
  const tagsInDir = directionStops[dirName]
  if (!tagsInDir) return true // direction data not available, show all
  return tagsInDir.includes(stopTag)
}

type StopEntry = { marker: LeafletCircleMarker; stopTag: string; stop: RouteStop; routeTag: string }

export default function StreetcarMap({
  vehicles,
  routes,
  selected,
  arrivalsEnabled = false,
  userPos,
  onMapClick,
  focusUserPin = false,
  onFocusedUserPin,
  routeConfigs = {},
  showPaths = true,
  showStops = true,
  onStopClick,
  selectedStop,
  routeDirections = {},
  nearbyVehicles = [],
}: Props) {
  const [mapReady, setMapReady] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<LeafletMap | null>(null)
  const markersRef = useRef<globalThis.Map<string, LeafletMarker>>(new globalThis.Map())
  const LRef = useRef<typeof import('leaflet') | null>(null)
  const userMarkerRef = useRef<LeafletMarker | null>(null)
  const pathLayersRef = useRef<globalThis.Map<string, LeafletPolyline[]>>(new globalThis.Map())
  const stopLayersRef = useRef<globalThis.Map<string, StopEntry[]>>(new globalThis.Map())
  const confirmPopupRef = useRef<LeafletPopup | null>(null)
  const nearbyVehiclesRef = useRef(nearbyVehicles)
  useEffect(() => { nearbyVehiclesRef.current = nearbyVehicles }, [nearbyVehicles])

  // Keep stable refs so layer effects can check current state without re-running
  const showPathsRef = useRef(showPaths)
  const showStopsRef = useRef(showStops)
  useEffect(() => { showPathsRef.current = showPaths }, [showPaths])
  useEffect(() => { showStopsRef.current = showStops }, [showStops])

  // Stable refs for callback closures
  const arrivalsEnabledRef = useRef(arrivalsEnabled)
  const onMapClickRef = useRef(onMapClick)
  const onStopClickRef = useRef(onStopClick)
  useEffect(() => { arrivalsEnabledRef.current = arrivalsEnabled }, [arrivalsEnabled])
  useEffect(() => { onMapClickRef.current = onMapClick }, [onMapClick])
  useEffect(() => { onStopClickRef.current = onStopClick }, [onStopClick])

  // Stable refs for direction filtering (avoids re-running stop layer effect)
  const routeDirectionsRef = useRef(routeDirections)
  const routeConfigsStableRef = useRef(routeConfigs)
  const routesRef = useRef(routes)
  useEffect(() => { routeDirectionsRef.current = routeDirections }, [routeDirections])
  useEffect(() => { routeConfigsStableRef.current = routeConfigs }, [routeConfigs])
  useEffect(() => { routesRef.current = routes }, [routes])

  // Initialize map once
  useEffect(() => {
    if (mapRef.current || !containerRef.current) return

    let cancelled = false

    ;(async () => {
      const L = await import('leaflet')

      if (cancelled || !containerRef.current) return
      LRef.current = L

      const map = L.map(containerRef.current, {
        center: TORONTO,
        zoom: 13,
        zoomControl: false,
        attributionControl: true,
      })

      L.control.zoom({ position: 'bottomright' }).addTo(map)

      L.tileLayer(
        'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
        {
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
          maxZoom: 20,
          subdomains: 'abcd',
        },
      ).addTo(map)

      // Map click: snap to nearest visible stop within a pixel radius
      const STOP_SNAP_PX = 150
      map.on('click', (e: import('leaflet').LeafletMouseEvent) => {
        if (!onStopClickRef.current) return
        const clickPt = map.latLngToContainerPoint(e.latlng)
        let bestDist = Infinity
        let bestStop: RouteStop | null = null
        let bestTag = ''
        stopLayersRef.current.forEach((entries, routeTag) => {
          entries.forEach(({ marker, stop }) => {
            if (!map.hasLayer(marker)) return
            const pt = map.latLngToContainerPoint(marker.getLatLng())
            const dist = Math.hypot(pt.x - clickPt.x, pt.y - clickPt.y)
            if (dist < bestDist) { bestDist = dist; bestStop = stop; bestTag = routeTag }
          })
        })
        if (bestStop && bestDist <= STOP_SNAP_PX) {
          onStopClickRef.current(bestStop, bestTag)
        }
      })

      // Right-click to set user location (arrivals mode)
      map.on('contextmenu', (e: import('leaflet').LeafletMouseEvent) => {
        if (!arrivalsEnabledRef.current) return
        confirmPopupRef.current?.close()
        const popup = L.popup({ closeButton: true, minWidth: 170, className: 'ttc-confirm-popup' })
          .setLatLng(e.latlng)
          .setContent(
            `<div style="font-family:'Space Grotesk',sans-serif;font-size:13px;line-height:1.5;text-align:center;padding:2px 4px">
              <div style="margin-bottom:8px;font-weight:500;color:#e0e0e0">Set location here?</div>
              <button
                id="ttc-confirm-loc"
                style="background:#587bda;color:white;border:none;border-radius:6px;padding:5px 16px;font-size:12px;cursor:pointer;font-family:inherit;font-weight:500"
              >Confirm</button>
            </div>`
          )
          .openOn(map)
        confirmPopupRef.current = popup
      })

      map.on('popupopen', (e) => {
        const btn = e.popup.getElement()?.querySelector<HTMLButtonElement>('#ttc-confirm-loc')
        if (!btn) return
        btn.addEventListener('click', () => {
          const latlng = confirmPopupRef.current?.getLatLng()
          if (latlng && onMapClickRef.current) {
            onMapClickRef.current({ lat: latlng.lat, lon: latlng.lng })
          }
          map.closePopup()
          confirmPopupRef.current = null
        }, { once: true })
      })

      mapRef.current = map
      setMapReady(true)
    })()

    return () => {
      cancelled = true
      if (mapRef.current) {
        try {
          mapRef.current.remove()
        } catch {
          // Leaflet may try to removeChild on a node React already detached
        }
        mapRef.current = null
        markersRef.current.clear()
        pathLayersRef.current.clear()
        stopLayersRef.current.clear()
      }
    }
  }, [])

  // Sync route path polylines and stop circle markers
  // mapReady is in deps so this re-runs once Leaflet finishes async init,
  // fixing the race where routeConfigs arrive before the map is ready.
  useEffect(() => {
    const L = LRef.current
    const map = mapRef.current
    if (!L || !map) return

    // Remove layers for routes no longer selected
    Array.from(pathLayersRef.current.entries()).forEach(([tag, polylines]) => {
      if (!selected.has(tag)) {
        polylines.forEach((p) => p.remove())
        pathLayersRef.current.delete(tag)
      }
    })
    Array.from(stopLayersRef.current.entries()).forEach(([tag, entries]) => {
      if (!selected.has(tag)) {
        entries.forEach(({ marker }) => marker.remove())
        stopLayersRef.current.delete(tag)
      }
    })

    // Add layers for selected routes that now have a loaded config
    Array.from(selected).forEach((tag) => {
      const config = routeConfigs[tag]
      if (!config) return
      const color = getRouteColor(tag, routes)

      // Paths
      if (!pathLayersRef.current.has(tag) && config.paths.length > 0) {
        const polylines = config.paths.map((path) =>
          L.polyline(path as [number, number][], {
            color,
            weight: 3,
            opacity: 0.6,
            interactive: false,
          }),
        )
        pathLayersRef.current.set(tag, polylines)
        if (showPathsRef.current) {
          polylines.forEach((p) => p.addTo(map))
        }
      }

      // Stops
      if (!stopLayersRef.current.has(tag) && config.stops.length > 0) {
        const routeInfo = routes.find((r) => r.tag === tag)
        const entries: StopEntry[] = config.stops.map((stop) => {
          const marker = L.circleMarker([stop.lat, stop.lon], {
            radius: 4,
            fillColor: color,
            fillOpacity: 0.85,
            color: 'rgba(0,0,0,0.35)',
            weight: 1,
          }).bindTooltip(
            `<div style="font-family:'Space Grotesk',sans-serif;font-size:12px;line-height:1.5;min-width:80px;">
              <strong style="color:${color}">${tag}</strong><br/>
              ${stop.title}
            </div>`,
            { sticky: true, opacity: 0.95 },
          )

          return { marker, stopTag: stop.tag, stop, routeTag: tag }
        })

        stopLayersRef.current.set(tag, entries)

        if (showStopsRef.current) {
          const dirFilter = routeDirectionsRef.current[tag] ?? 'both'
          entries.forEach(({ marker, stopTag }) => {
            const visible = isStopVisibleForDirection(stopTag, dirFilter, config.directionStops, routeInfo)
            if (visible) marker.addTo(map)
          })
        }
      }
    })
  }, [routeConfigs, selected, routes, mapReady])

  // Toggle path layer visibility
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    Array.from(pathLayersRef.current.values()).forEach((polylines) => {
      polylines.forEach((p) => {
        if (showPaths) {
          if (!map.hasLayer(p)) p.addTo(map)
        } else {
          p.remove()
        }
      })
    })
  }, [showPaths])

  // Update stop layer visibility when direction filter or showStops changes
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    Array.from(stopLayersRef.current.entries()).forEach(([tag, entries]) => {
      const config = routeConfigsStableRef.current[tag]
      const routeInfo = routesRef.current.find((r) => r.tag === tag)
      const dirFilter = routeDirections[tag] ?? 'both'
      entries.forEach(({ marker, stopTag }) => {
        const dirVisible = isStopVisibleForDirection(stopTag, dirFilter, config?.directionStops, routeInfo)
        const shouldShow = showStops && dirVisible
        if (shouldShow) {
          if (!map.hasLayer(marker)) marker.addTo(map)
        } else {
          marker.remove()
        }
      })
    })
  }, [showStops, routeDirections])

  // Highlight the selected stop
  useEffect(() => {
    Array.from(stopLayersRef.current.entries()).forEach(([, entries]) => {
      entries.forEach(({ marker, stopTag }) => {
        const isSelected = selectedStop?.tag === stopTag
        if (isSelected) {
          marker.setStyle({ radius: 7, fillOpacity: 1, color: 'white', weight: 2 })
          marker.bringToFront()
        } else {
          marker.setStyle({ radius: 4, fillOpacity: 0.85, color: 'rgba(0,0,0,0.35)', weight: 1 })
        }
      })
    })
  }, [selectedStop])

  // Sync user-position pin
  useEffect(() => {
    const L = LRef.current
    const map = mapRef.current
    if (!L || !map) return

    if (!arrivalsEnabled || !userPos) {
      userMarkerRef.current?.remove()
      userMarkerRef.current = null
      return
    }

    const latLng = L.latLng(userPos.lat, userPos.lon)
    const icon = buildUserPinIcon(L)
    if (userMarkerRef.current) {
      userMarkerRef.current.setLatLng(latLng).setIcon(icon)
    } else {
      const marker = L.marker(latLng, { icon, zIndexOffset: 900 }).addTo(map)
      marker.on('click', (e: import('leaflet').LeafletMouseEvent) => {
        L.DomEvent.stopPropagation(e)
        const nearby = nearbyVehiclesRef.current
        const rows = nearby.map((v) => {
          const dist = v.distKm < 1 ? `${Math.round(v.distKm * 1000)}m` : `${v.distKm.toFixed(1)}km`
          const eta = Math.round(v.etaMinutes)
          return `<div style="display:flex;align-items:center;gap:7px;padding:4px 0;border-top:1px solid rgba(255,255,255,0.07)">
            <span style="width:8px;height:8px;border-radius:50%;background:${v.color};display:inline-block;flex-shrink:0"></span>
            <strong style="color:${v.color};font-size:12px">${v.routeTag}</strong>
            <span style="color:#9a9db0;flex:1;font-size:11px">${v.routeLabel}</span>
            <span style="color:#dfe0e2;font-size:11px">${dist}</span>
            <span style="color:#757b8a;font-size:11px">~${eta}m</span>
          </div>`
        }).join('')
        const content = nearby.length === 0
          ? `<div style="font-family:'Space Grotesk',sans-serif;font-size:12px;color:#757b8a;padding:2px 0">No streetcars nearby.</div>`
          : `<div style="font-family:'Space Grotesk',sans-serif;min-width:190px">
              <div style="font-weight:600;font-size:12px;color:#e0e0e0;margin-bottom:4px;letter-spacing:0.03em">Nearby streetcars</div>
              ${rows}
            </div>`
        L.popup({ className: 'ttc-confirm-popup', minWidth: 190 })
          .setLatLng(marker.getLatLng())
          .setContent(content)
          .openOn(map)
      })
      userMarkerRef.current = marker
    }
  }, [userPos, arrivalsEnabled])

  // Optionally focus map on the user pin (used after Locate Me succeeds)
  useEffect(() => {
    const map = mapRef.current
    if (!map || !arrivalsEnabled || !focusUserPin || !userPos) return
    const latLng: [number, number] = [userPos.lat, userPos.lon]
    map.flyTo(latLng, Math.max(map.getZoom(), 14), { duration: 0.6 })
    onFocusedUserPin?.()
  }, [focusUserPin, userPos, arrivalsEnabled, onFocusedUserPin])

  // Sync vehicle markers
  useEffect(() => {
    const L = LRef.current
    const map = mapRef.current
    if (!L || !map) return

    const incoming = new Set(vehicles.map((v) => v.id))

    // Remove stale markers
    Array.from(markersRef.current.entries()).forEach(([id, marker]) => {
      if (!incoming.has(id)) {
        marker.remove()
        markersRef.current.delete(id)
      }
    })

    // Add / update markers
    for (const v of vehicles) {
      const color = getRouteColor(v.routeTag, routes)
      const icon = buildVehicleIcon(L, color, v.heading)
      const latLng = L.latLng(v.lat, v.lon)

      const existing = markersRef.current.get(v.id)
      if (existing) {
        existing.setLatLng(latLng)
        existing.setIcon(icon)
      } else {
        const routeInfo = routes.find((r) => r.tag === v.routeTag)
        const marker = L.marker(latLng, { icon })
          .bindPopup(
            `<div style="font-family:'Space Grotesk',sans-serif;font-size:13px;line-height:1.6;min-width:120px;">
              <strong style="color:${color}">${v.routeTag} ${routeInfo?.label ?? ''}</strong><br/>
              <span style="color:#757b8a">Vehicle</span> ${v.id}<br/>
              <span style="color:#757b8a">Speed</span> ${v.speedKmHr} km/h<br/>
              <span style="color:#757b8a">Heading</span> ${v.heading}°<br/>
              <span style="color:#757b8a">Updated</span> ${v.secsSinceReport}s ago
            </div>`,
          )
        marker.addTo(map)
        markersRef.current.set(v.id, marker)
      }
    }
  }, [vehicles, routes])

  return (
    <div
      ref={containerRef}
      className={`${styles.map} ${arrivalsEnabled ? styles.mapEta : ''}`}
    />
  )
}
