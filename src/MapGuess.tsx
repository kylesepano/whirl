import { useEffect, useRef, useState } from 'react'
import * as maplibre from 'maplibre-gl'
import type { GeoJSONSource, Map as MapInstance, Marker } from 'maplibre-gl'
import type { Solution } from './api'
import { Button } from './components/ui/button'
import { createWorldMap } from './WorldMap'
import { addWorldLabels } from './WorldMapStyle'
export type Point = { lat: number; lng: number }
export default function MapGuess({
  value,
  onChange,
  solution,
}: {
  value: Point | null
  onChange: (v: Point | null) => void
  solution?: Solution
}) {
  const ref = useRef<HTMLDivElement>(null),
    map = useRef<MapInstance | null>(null),
    pin = useRef<Marker | null>(null),
    answer = useRef<Marker | null>(null)
  const change = useRef(onChange),
    locked = useRef(Boolean(solution))
  const [error, setError] = useState(''),
    [coord, setCoord] = useState({ lat: '', lng: '' }),
    [loaded, setLoaded] = useState(false)
  useEffect(() => {
    change.current = onChange
    locked.current = Boolean(solution)
  }, [onChange, solution])
  useEffect(() => {
    if (!ref.current) return
    const controller = new AbortController()
    try {
      const m = createWorldMap(ref.current)
      map.current = m
      m.on('error', () =>
        setError(
          'Part of the map could not load. You can still enter coordinates below.',
        ),
      )
      m.on('load', () => {
        setLoaded(true)
        void addWorldLabels(m, controller.signal).catch(() => {
          if (!controller.signal.aborted) setError('Map labels could not load.')
        })
      })
      m.on('click', (e) => {
        if (!locked.current) {
          setCoord({ lat: '', lng: '' })
          change.current({ lat: e.lngLat.lat, lng: e.lngLat.wrap().lng })
        }
      })
      return () => {
        controller.abort()
        pin.current?.remove()
        answer.current?.remove()
        pin.current = null
        answer.current = null
        m.remove()
        map.current = null
      }
    } catch {
      setError(
        'Map rendering is unavailable on this device. Enter coordinates below.',
      )
    }
  }, [])
  useEffect(() => {
    const m = map.current
    if (!m) return
    if (!value) {
      pin.current?.remove()
      pin.current = null
      return
    }
    if (!pin.current) {
      pin.current = new maplibre.Marker({
        color: '#b293ff',
        draggable: !solution,
      })
        .setLngLat([value.lng, value.lat])
        .addTo(m)
      pin.current.getElement().setAttribute('aria-label', 'Your guess')
      pin.current.on('dragend', () => {
        const p = pin.current?.getLngLat().wrap()
        if (p && !locked.current) {
          setCoord({ lat: '', lng: '' })
          change.current({ lat: p.lat, lng: p.lng })
        }
      })
    }
    pin.current.setLngLat([value.lng, value.lat]).setDraggable(!solution)
  }, [solution, value])
  useEffect(() => {
    const m = map.current
    if (
      !m ||
      !loaded ||
      solution?.lng === undefined ||
      solution.lat === undefined
    )
      return
    const target: [number, number] = [solution.lng, solution.lat]
    answer.current ??= new maplibre.Marker({ color: '#5fe3b8' })
      .setLngLat(target)
      .addTo(m)
    answer.current.getElement().setAttribute('aria-label', 'Correct location')
    if (solution.polygon?.length && !m.getSource('target-area')) {
      const ring = [...solution.polygon, solution.polygon[0]]
      m.addSource('target-area', {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: { type: 'Polygon', coordinates: [ring] },
        },
      })
      m.addLayer({
        id: 'target-area',
        type: 'fill',
        source: 'target-area',
        paint: {
          'fill-color': '#5fe3b8',
          'fill-opacity': 0.27,
          'fill-outline-color': '#5fe3b8',
        },
      })
    }
    const points = value ? [[value.lng, value.lat], target] : [target]
    if (value) {
      const geo = {
        type: 'Feature' as const,
        properties: {},
        geometry: { type: 'LineString' as const, coordinates: points },
      }
      const src = m.getSource('guess-line') as GeoJSONSource | undefined
      if (src) src.setData(geo)
      else {
        m.addSource('guess-line', { type: 'geojson', data: geo })
        m.addLayer({
          id: 'guess-line',
          type: 'line',
          source: 'guess-line',
          paint: {
            'line-color': '#b69aff',
            'line-width': 3,
            'line-dasharray': [2, 2],
          },
        })
      }
      m.fitBounds(new maplibre.LngLatBounds([value.lng, value.lat], target), {
        padding: 55,
        maxZoom: 7,
        duration: 0,
      })
    } else m.jumpTo({ center: target, zoom: 4 })
  }, [solution, value, loaded])
  function enter(lat: string, lng: string) {
    setCoord({ lat, lng })
    if (
      lat !== '' &&
      lng !== '' &&
      Number.isFinite(+lat) &&
      Number.isFinite(+lng) &&
      Math.abs(+lat) <= 90 &&
      Math.abs(+lng) <= 180
    )
      onChange({ lat: +lat, lng: +lng })
    else onChange(null)
  }
  return (
    <div className="map-guess">
      <div ref={ref} className="map" aria-label="Interactive world map" />
      {error && (
        <p className="muted" role="status">
          {error}
        </p>
      )}
      {!solution && (
        <div className="coord-controls">
          <label>
            Latitude
            <input
              type="number"
              aria-label="Latitude"
              min="-90"
              max="90"
              step="any"
              value={coord.lat || String(value?.lat ?? '')}
              onChange={(e) =>
                enter(e.target.value, coord.lng || String(value?.lng ?? ''))
              }
            />
          </label>
          <label>
            Longitude
            <input
              type="number"
              aria-label="Longitude"
              min="-180"
              max="180"
              step="any"
              value={coord.lng || String(value?.lng ?? '')}
              onChange={(e) =>
                enter(coord.lat || String(value?.lat ?? ''), e.target.value)
              }
            />
          </label>
          <Button
            variant="outline"
            size="small"
            onClick={() => {
              setCoord({ lat: '', lng: '' })
              onChange(null)
            }}
          >
            Reset pin
          </Button>
        </div>
      )}
      {value && (
        <small className="muted">
          Your pin: {value.lat.toFixed(3)}, {value.lng.toFixed(3)}
        </small>
      )}
    </div>
  )
}
