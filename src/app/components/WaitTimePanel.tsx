'use client'

import type { WaitResult } from '../lib/routing'
import type { RouteInfo } from '../types'
import styles from './WaitTimePanel.module.css'

interface Props {
  results: WaitResult[]
  stopTitle: string
  routeTag: string | null
  routes: RouteInfo[]
  walkMinutes: number | null
  onClear: () => void
}

function fmt(minutes: number): string {
  if (minutes < 1) return '<1 min'
  return `${Math.round(minutes)} min`
}

export function WaitTimePanel({
  results,
  stopTitle,
  routeTag,
  routes,
  walkMinutes,
  onClear,
}: Props) {
  const routeInfo = routes.find((r) => r.tag === routeTag)

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          {routeInfo && <span className={styles.routeDot} style={{ background: routeInfo.color }} />}
          <span className={styles.stopTitle} title={stopTitle}>
            {stopTitle}
          </span>
        </div>
        <button className={styles.clearBtn} onClick={onClear} title="Close" type="button">
          ×
        </button>
      </div>

      {walkMinutes !== null && walkMinutes > 0 && (
        <div className={styles.walkRow}>
          <span className={styles.walkLabel}>Walk from your location</span>
          <span className={styles.walkTime}>{fmt(walkMinutes)}</span>
        </div>
      )}

      <div className={styles.arrivalsList}>
        {results.length === 0 ? (
          <p className={styles.hint}>No streetcars approaching right now.</p>
        ) : (
          results.map((r, i) => {
            const wait = r.netWaitMinutes
            const urgent = walkMinutes !== null && wait < 1
            const comfortable = walkMinutes !== null && wait >= 3
            return (
              <div key={r.vehicleId} className={styles.arrivalRow}>
                <span className={styles.arrivalIndex}>{i + 1}</span>
                <div className={styles.arrivalMeta}>
                  <span className={styles.arrivalTime}>arrives in {fmt(r.etaMinutes)}</span>
                  <span className={styles.arrivalDetail}>
                    {(r.distToDestKm * 1000).toFixed(0)} m away · {r.speedKmHr} km/h
                  </span>
                </div>
                {walkMinutes !== null && (
                  <div
                    className={`${styles.badge} ${urgent ? styles.urgent : comfortable ? styles.comfortable : styles.neutral}`}
                  >
                    {wait < 0 ? (
                      <>
                        <span className={styles.badgeMain}>hurry</span>
                        <span className={styles.badgeSub}>{fmt(-wait)} short</span>
                      </>
                    ) : (
                      <>
                        <span className={styles.badgeMain}>{fmt(wait)}</span>
                        <span className={styles.badgeSub}>to spare</span>
                      </>
                    )}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
