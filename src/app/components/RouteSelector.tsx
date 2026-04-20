'use client'

import { useEffect, useState, type CSSProperties } from 'react'
import styles from './RouteSelector.module.css'
import type { RouteDirectionFilter, RouteInfo } from '../types'

interface Props {
  routes: RouteInfo[]
  selected: Set<string>
  onToggle: (tag: string) => void
  vehicleCounts: Record<string, number>
  showPaths?: boolean
  showStops?: boolean
  onTogglePaths?: () => void
  onToggleStops?: () => void
  routeDirections?: Record<string, RouteDirectionFilter>
  onDirectionChange?: (tag: string, dir: RouteDirectionFilter) => void
  onSelectAll?: () => void
  onClearAll?: () => void
}

export function RouteSelector({
  routes,
  selected,
  onToggle,
  vehicleCounts,
  showPaths = true,
  showStops = true,
  onTogglePaths,
  onToggleStops,
  routeDirections = {},
  onDirectionChange,
  onSelectAll,
  onClearAll,
}: Props) {
  const [collapsed, setCollapsed] = useState(false)
  const [menuRouteTag, setMenuRouteTag] = useState<string | null>(null)
  const allSelected = routes.every((r) => selected.has(r.tag))
  const selectedCount = selected.size
  const totalLiveVehicles = Object.values(vehicleCounts).reduce((sum, count) => sum + count, 0)

  useEffect(() => {
    // Start collapsed on mobile so the panel doesn't obscure the map
    if (typeof window !== 'undefined' && window.innerWidth <= 640) {
      setCollapsed(true)
    }

    function closeMenu() {
      setMenuRouteTag(null)
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setMenuRouteTag(null)
      }
    }

    window.addEventListener('pointerdown', closeMenu)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('pointerdown', closeMenu)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  function handleSelectAll() {
    if (allSelected) {
      onClearAll?.()
    } else {
      onSelectAll?.()
    }
  }

  function getDirectionState(dir: RouteDirectionFilter) {
    return {
      a: dir === 'both' || dir === 'a',
      b: dir === 'both' || dir === 'b',
    }
  }

  function getFilterFromState(a: boolean, b: boolean): RouteDirectionFilter {
    if (a && b) return 'both'
    if (a) return 'a'
    return 'b'
  }

  function handleDirectionToggle(tag: string, current: RouteDirectionFilter, key: 'a' | 'b') {
    const next = getDirectionState(current)
    next[key] = !next[key]

    if (!next.a && !next.b) {
      return
    }

    if (!selected.has(tag)) {
      onToggle(tag)
    }

    onDirectionChange?.(tag, getFilterFromState(next.a, next.b))
  }

  function directionLabel(route: RouteInfo, dir: RouteDirectionFilter): string {
    if (dir === 'a') return route.dirA
    if (dir === 'b') return route.dirB
    return 'Both'
  }

  const chevron = (dir: 'left' | 'right') => (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path
        d={dir === 'left' ? 'M9 2L4 7l5 5' : 'M5 2l5 5-5 5'}
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )

  if (collapsed) {
    return (
      <aside className={`${styles.panel} ${styles.panelCollapsed}`}>
        <div className={styles.collapsedRail}>
          <button
            className={styles.expandBtn}
            onClick={() => setCollapsed(false)}
            aria-label="Expand sidebar"
            title="Expand routes panel"
          >
            <span className={styles.expandIcon}>{chevron('right')}</span>
            <span className={styles.expandLabel}>Routes</span>
          </button>

          <div className={styles.collapsedStats} aria-hidden>
            <span className={styles.collapsedStat}>{selectedCount}</span>
            <span className={styles.collapsedStatMuted}>{totalLiveVehicles}</span>
          </div>
        </div>

        {/* Mobile-only: show active route dots so user can see what's on */}
        <div className={styles.collapsedMobileDots} aria-hidden="true">
          {routes.filter((r) => selected.has(r.tag)).map((r) => (
            <span
              key={r.tag}
              className={styles.collapsedMobileDot}
              style={{ background: r.color }}
              title={r.label}
            />
          ))}
        </div>
      </aside>
    )
  }

  return (
    <aside className={styles.panel}>
      <button
        className={styles.mobileCollapseBtn}
        onClick={() => setCollapsed(true)}
        aria-label="Minimize routes panel"
        title="Minimize routes panel"
      >
        <span className={styles.mobileCollapseHandle} aria-hidden />
        <span className={styles.mobileCollapseText}>Routes</span>
        <span className={styles.mobileCollapseIcon} aria-hidden>
          {chevron('left')}
        </span>
      </button>

      <div className={styles.header}>
        <div className={styles.headingGroup}>
          <span className={styles.heading}>Routes</span>
          {selectedCount > 0 && (
            <span className={styles.selectedCount}>{selectedCount}</span>
          )}
        </div>
        <div className={styles.headerActions}>
          <button className={styles.selectAll} onClick={handleSelectAll}>
            {allSelected ? 'clear' : 'all'}
          </button>
          <button
            className={styles.collapseBtn}
            onClick={() => setCollapsed(true)}
            aria-label="Collapse sidebar"
          >
            {chevron('left')}
          </button>
        </div>
      </div>

      <ul className={styles.list}>
        {routes.map((route) => {
          const active = selected.has(route.tag)
          const count = vehicleCounts[route.tag] ?? 0
          const currentDirection = routeDirections[route.tag] ?? 'both'
          return (
            <li key={route.tag} className={styles.routeItem}>
              {/* pillRow wraps the main toggle button and the direction filter button as siblings
                  (a <button> inside another <button> is invalid HTML and causes hydration errors) */}
              <div className={styles.pillRow}>
                <button
                  className={`${styles.pill} ${active ? styles.pillActive : ''}`}
                  style={active ? ({ '--route-color': route.color } as CSSProperties) : undefined}
                  onClick={() => onToggle(route.tag)}
                  title="Tap to toggle route"
                >
                  <span
                    className={styles.dot}
                    style={{ background: active ? route.color : undefined }}
                  />
                  <span className={styles.routeNum}>{route.tag}</span>
                  <span className={styles.routeName}>{route.label}</span>
                  {active && currentDirection !== 'both' && (
                    <span className={styles.directionTag}>{directionLabel(route, currentDirection)}</span>
                  )}
                  {active && count > 0 && (
                    <span className={styles.count}>{count}</span>
                  )}
                </button>
                <button
                  className={`${styles.directionTrigger} ${menuRouteTag === route.tag ? styles.directionTriggerActive : ''}`}
                  onClick={(event) => {
                    event.stopPropagation()
                    setMenuRouteTag((prev) => (prev === route.tag ? null : route.tag))
                  }}
                  onPointerDown={(event) => event.stopPropagation()}
                  aria-label={`Set direction filter for ${route.tag}`}
                  title="Filter by direction"
                  type="button"
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
                    <path d="M1 4h10M8 1.5 10.5 4 8 6.5M11 8H1M4 5.5 1.5 8 4 10.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              </div>

              {menuRouteTag === route.tag && (
                <div
                  className={styles.directionMenu}
                  onClick={(event) => event.stopPropagation()}
                  onPointerDown={(event) => event.stopPropagation()}
                  role="menu"
                  aria-label={`${route.tag} direction filter`}
                >
                  <div className={styles.directionMenuHeader}>Direction filter</div>
                  <button
                    className={`${styles.directionOption} ${getDirectionState(currentDirection).a ? styles.directionOptionActive : ''}`}
                    onClick={() => handleDirectionToggle(route.tag, currentDirection, 'a')}
                    role="menuitemcheckbox"
                    aria-checked={getDirectionState(currentDirection).a}
                  >
                    <span className={styles.directionCheck}>{getDirectionState(currentDirection).a ? '✓' : ''}</span>
                    <span>{route.dirA}</span>
                  </button>
                  <button
                    className={`${styles.directionOption} ${getDirectionState(currentDirection).b ? styles.directionOptionActive : ''}`}
                    onClick={() => handleDirectionToggle(route.tag, currentDirection, 'b')}
                    role="menuitemcheckbox"
                    aria-checked={getDirectionState(currentDirection).b}
                  >
                    <span className={styles.directionCheck}>{getDirectionState(currentDirection).b ? '✓' : ''}</span>
                    <span>{route.dirB}</span>
                  </button>
                </div>
              )}
            </li>
          )
        })}
      </ul>

      {/* Layer toggles */}
      <div className={styles.layersSection}>
        <span className={styles.layersHeading}>Layers</span>
        <div className={styles.layerToggles}>
          <button
            className={`${styles.layerBtn} ${showPaths ? styles.layerBtnActive : ''}`}
            onClick={onTogglePaths}
            title="Toggle route paths"
          >
            <span className={styles.layerIcon}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M2 11 Q4 3 7 7 Q10 11 12 3" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" fill="none"/>
              </svg>
            </span>
            <span className={styles.layerLabel}>Route paths</span>
          </button>
          <button
            className={`${styles.layerBtn} ${showStops ? styles.layerBtnActive : ''}`}
            onClick={onToggleStops}
            title="Toggle stops"
          >
            <span className={styles.layerIcon}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <circle cx="7" cy="7" r="3.5" fill="currentColor"/>
              </svg>
            </span>
            <span className={styles.layerLabel}>Stops</span>
          </button>
        </div>
      </div>
    </aside>
  )
}
