import * as maplibre from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import 'maplibre-gl/dist/maplibre-gl.css'
import { worldStyle } from './WorldMapStyle'

maplibre.setWorkerUrl(workerUrl)

export function createWorldMap(container: HTMLElement, countryMode = false) {
  const style = structuredClone(worldStyle)
  if (countryMode) {
    const source = style.sources.countries
    if (source.type === 'geojson') source.data = '/maps/country-boundaries.geojson'
  }
  const map = new maplibre.Map({
    container,
    center: [0, 21],
    zoom: countryMode ? 0.6 : 1.2,
    dragRotate: false,
    attributionControl: false,
    maxZoom: 9,
    style,
  })
  map.addControl(new maplibre.NavigationControl({ showCompass: false }), 'top-right')
  map.addControl(new maplibre.AttributionControl({ compact: false }))
  return map
}
