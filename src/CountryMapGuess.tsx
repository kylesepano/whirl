import { useEffect, useRef, useState } from 'react'
import type { Map as MapInstance, MapLayerMouseEvent } from 'maplibre-gl'
import { CountrySelect, countriesByCode } from './CountrySelect'
import { createWorldMap } from './WorldMap'
import { addWorldLabels } from './WorldMapStyle'

export type CountryGuess = { country: string }

const LAND = '#2b4152'
const GUESS = '#9976df'
const CORRECT = '#31b994'

export default function CountryMapGuess({
  value,
  onChange,
  correct,
}: {
  value: CountryGuess | null
  onChange: (value: CountryGuess | null) => void
  correct?: string
}) {
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<MapInstance | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const selected = value?.country ?? ''
  const name = countriesByCode.get(selected)?.name

  useEffect(() => {
    if (!container.current) return
    const controller = new AbortController()
    try {
      const m = createWorldMap(container.current, true)
      map.current = m
      m.on('error', () =>
        setError('Part of the map could not load. You can still choose from the list below.'),
      )
      m.on('load', () => {
        setLoaded(true)
        void addWorldLabels(m, controller.signal).catch(() => {
          if (!controller.signal.aborted) setError('Map labels could not load.')
        })
      })
      return () => {
        controller.abort()
        m.remove()
        map.current = null
      }
    } catch {
      setError('Map rendering is unavailable. Choose a country from the list below.')
    }
  }, [])

  useEffect(() => {
    const m = map.current
    if (!m || !loaded || correct) return
    const select = (event: MapLayerMouseEvent) => {
      const code = event.features?.[0]?.properties.code
      if (typeof code === 'string' && countriesByCode.has(code)) onChange({ country: code })
    }
    const enter = () => { m.getCanvas().style.cursor = 'pointer' }
    const leave = () => { m.getCanvas().style.cursor = '' }
    m.on('click', 'land', select)
    m.on('mouseenter', 'land', enter)
    m.on('mouseleave', 'land', leave)
    return () => {
      m.off('click', 'land', select)
      m.off('mouseenter', 'land', enter)
      m.off('mouseleave', 'land', leave)
      leave()
    }
  }, [loaded, correct, onChange])

  useEffect(() => {
    const m = map.current
    if (!m || !loaded) return
    m.setPaintProperty('land', 'fill-color', [
      'case',
      ['==', ['get', 'code'], correct ?? ''], CORRECT,
      ['==', ['get', 'code'], selected], GUESS,
      LAND,
    ])
    const target = countriesByCode.get(correct ?? '')?.center
    if (target) {
      const guess = countriesByCode.get(selected)?.center
      const [lng, lat] = target
      if (guess && selected !== correct) {
        const nearbyLng = lng + (guess[0] - lng + 540) % 360 - 180
        m.fitBounds(
          [
            Math.min(lng, nearbyLng),
            Math.min(lat, guess[1]),
            Math.max(lng, nearbyLng),
            Math.max(lat, guess[1]),
          ],
          { padding: 64, maxZoom: 4, duration: 0 },
        )
      } else {
        m.jumpTo({ center: [lng, lat], zoom: 2 })
      }
    }
  }, [loaded, correct, selected])

  return (
    <div className="map-guess">
      <div ref={container} className="map" aria-label="Interactive country map" />
      {error && !correct && <p className="muted" role="status">{error}</p>}
      {correct ? (
        <div className="country-map-legend">
          {name && selected !== correct && (
            <span><i className="country-swatch" />Your guess · {name}</span>
          )}
          <span>
            <i className="country-swatch correct" />
            Correct country · {countriesByCode.get(correct)?.name ?? correct}
          </span>
        </div>
      ) : (
        <label>
          Country guess
          <CountrySelect
            value={selected}
            onChange={(event) => {
              const code = event.target.value
              onChange(code ? { country: code } : null)
              const center = countriesByCode.get(code)?.center
              if (center) {
                const [lng, lat] = center
                map.current?.jumpTo({ center: [lng, lat] })
              }
            }}
          />
        </label>
      )}
    </div>
  )
}
