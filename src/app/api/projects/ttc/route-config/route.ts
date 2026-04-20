import { NextResponse } from 'next/server'

const UMOIQ_BASE = 'https://retro.umoiq.com/service/publicXMLFeed'

function getAttr(attrs: string, name: string): string {
  const m = attrs.match(new RegExp(`${name}="([^"]*)"`))
  return m ? m[1] : ''
}

function parseRouteConfig(xml: string) {
  const paths: [number, number][][] = []
  const pathRe = /<path>([\s\S]*?)<\/path>/g
  let pathMatch: RegExpExecArray | null
  while ((pathMatch = pathRe.exec(xml)) !== null) {
    const pathContent = pathMatch[1]
    const points: [number, number][] = []
    const pointRe = /<point\s+((?:[^/]|\/(?!>))*?)\/>/g
    let pointMatch: RegExpExecArray | null
    while ((pointMatch = pointRe.exec(pathContent)) !== null) {
      const lat = parseFloat(getAttr(pointMatch[1], 'lat'))
      const lon = parseFloat(getAttr(pointMatch[1], 'lon'))
      if (!isNaN(lat) && !isNaN(lon)) {
        points.push([lat, lon])
      }
    }
    if (points.length > 0) paths.push(points)
  }

  const stops: { tag: string; title: string; lat: number; lon: number }[] = []
  const seenTags = new Set<string>()
  const stopRe = /<stop\s+((?:[^/]|\/(?!>))*?)\/>/g
  let stopMatch: RegExpExecArray | null
  while ((stopMatch = stopRe.exec(xml)) !== null) {
    const attrs = stopMatch[1]
    const lat = parseFloat(getAttr(attrs, 'lat'))
    const lon = parseFloat(getAttr(attrs, 'lon'))
    if (!isNaN(lat) && !isNaN(lon)) {
      const tag = getAttr(attrs, 'tag')
      if (!seenTags.has(tag)) {
        seenTags.add(tag)
        stops.push({ tag, title: getAttr(attrs, 'title'), lat, lon })
      }
    }
  }

  const directionStops: Record<string, string[]> = {}
  const dirRe = /<direction\s+((?:[^/]|\/(?!>))*?)>([\s\S]*?)<\/direction>/g
  let dirMatch: RegExpExecArray | null
  while ((dirMatch = dirRe.exec(xml)) !== null) {
    const name = getAttr(dirMatch[1], 'name')
    if (!name) continue
    const dirContent = dirMatch[2]
    const dirStopTags: string[] = []
    const dirStopRe = /<stop\s+tag="([^"]+)"\s*\/>/g
    let dsm: RegExpExecArray | null
    while ((dsm = dirStopRe.exec(dirContent)) !== null) {
      dirStopTags.push(dsm[1])
    }
    if (!directionStops[name]) {
      directionStops[name] = dirStopTags
    } else {
      const existing = new Set(directionStops[name])
      for (const t of dirStopTags) existing.add(t)
      directionStops[name] = Array.from(existing)
    }
  }

  return { paths, stops, directionStops }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const routesParam = searchParams.get('routes') ?? '501'
  const tags = routesParam.split(',').map((r) => r.trim()).filter(Boolean)

  if (tags.length === 0) {
    return NextResponse.json({ routes: {} })
  }

  try {
    const results = await Promise.all(
      tags.map(async (tag) => {
        const url = `${UMOIQ_BASE}?command=routeConfig&a=ttc&r=${tag}`
        const res = await fetch(url, {
          next: { revalidate: 3600 },
          headers: { Accept: 'text/xml, application/xml' },
        })
        if (!res.ok)
          return [
            tag,
            {
              paths: [] as [number, number][][],
              stops: [] as { tag: string; title: string; lat: number; lon: number }[],
              directionStops: {} as Record<string, string[]>,
            },
          ] as const
        const xml = await res.text()
        return [tag, parseRouteConfig(xml)] as const
      }),
    )

    const routes: Record<
      string,
      {
        paths: [number, number][][]
        stops: { tag: string; title: string; lat: number; lon: number }[]
        directionStops: Record<string, string[]>
      }
    > = {}
    for (const [tag, config] of results) {
      routes[tag] = config
    }

    return NextResponse.json(
      { routes },
      {
        headers: {
          'Cache-Control': 's-maxage=3600, stale-while-revalidate=86400',
        },
      },
    )
  } catch (err) {
    console.error('[ttc/route-config] fetch error:', err)
    return NextResponse.json({ error: 'Failed to fetch route config' }, { status: 500 })
  }
}
