import { NextResponse } from 'next/server'

const UMOIQ_BASE = 'https://retro.umoiq.com/service/publicXMLFeed'

const VALID_ROUTE_TAGS = new Set(['501', '504', '505', '506', '508', '509', '510', '511', '512'])

function parseVehicles(xml: string) {
  const vehicles: {
    id: string
    routeTag: string
    lat: number
    lon: number
    secsSinceReport: number
    heading: number
    speedKmHr: number
    predictable: boolean
  }[] = []

  const re = /<vehicle\s+((?:[^/]|\/(?!>))*?)\/>/g
  let m: RegExpExecArray | null

  while ((m = re.exec(xml)) !== null) {
    const attrs = m[1]
    const get = (name: string): string => {
      const a = new RegExp(`${name}="([^"]*)"`)
      const r = attrs.match(a)
      return r ? r[1] : ''
    }

    const lat = parseFloat(get('lat'))
    const lon = parseFloat(get('lon'))
    if (isNaN(lat) || isNaN(lon)) continue

    vehicles.push({
      id: get('id'),
      routeTag: get('routeTag'),
      lat,
      lon,
      secsSinceReport: parseInt(get('secsSinceReport') || '0', 10),
      heading: parseInt(get('heading') || '0', 10),
      speedKmHr: parseInt(get('speedKmHr') || '0', 10),
      predictable: get('predictable') === 'true',
    })
  }

  return vehicles
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const routesParam = searchParams.get('routes') ?? '501'
  const routes = routesParam
    .split(',')
    .map((r) => r.trim())
    .filter((r) => VALID_ROUTE_TAGS.has(r))

  if (routes.length === 0) {
    return NextResponse.json({ vehicles: [], timestamp: Date.now() })
  }

  try {
    const results = await Promise.all(
      routes.map(async (routeTag) => {
        const url = `${UMOIQ_BASE}?command=vehicleLocations&a=ttc&r=${routeTag}&t=0`
        const res = await fetch(url, {
          next: { revalidate: 8 },
          headers: { Accept: 'text/xml, application/xml' },
        })
        if (!res.ok) return []
        const xml = await res.text()
        return parseVehicles(xml)
      }),
    )

    const vehicles = results.flat()
    return NextResponse.json({ vehicles, timestamp: Date.now() })
  } catch (err) {
    console.error('[ttc/route] fetch error:', err)
    return NextResponse.json({ error: 'Failed to fetch vehicle locations' }, { status: 500 })
  }
}
