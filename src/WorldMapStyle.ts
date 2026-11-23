import type { Map, StyleSpecification } from 'maplibre-gl'
import type { FeatureCollection, Point } from 'geojson'

type Label = {
  name: string
  rank: number
  type: 'country' | 'city'
  icon: string
}

export const worldStyle: StyleSpecification = {
  version: 8,
  sources: {
    countries: {
      type: 'geojson',
      data: '/maps/countries.geojson',
      attribution:
        '<a href="https://www.naturalearthdata.com/" target="_blank" rel="noopener">Natural Earth</a> · Public domain',
    },
  },
  layers: [
    {
      id: 'ocean',
      type: 'background',
      paint: { 'background-color': '#111d32' },
    },
    {
      id: 'land',
      type: 'fill',
      source: 'countries',
      paint: { 'fill-color': '#2b4152' },
    },
    {
      id: 'borders',
      type: 'line',
      source: 'countries',
      paint: { 'line-color': '#637d8c', 'line-width': 0.8 },
    },
  ],
}

export async function addWorldLabels(map: Map, signal: AbortSignal) {
  const response = await fetch('/maps/labels.geojson', { signal })
  if (!response.ok) throw new Error('Map labels unavailable')
  const labels: FeatureCollection<Point, Label> = await response.json()
  if (signal.aborted) return
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return
  for (const { properties: label } of labels.features) {
    const font =
      label.type === 'country' ? '700 23px system-ui' : '500 22px system-ui'
    context.font = font
    canvas.width = Math.ceil(context.measureText(label.name).width) + 14
    canvas.height = 36
    context.font = font
    context.textBaseline = 'middle'
    context.lineJoin = 'round'
    context.lineWidth = 5
    context.strokeStyle = '#111d32'
    context.fillStyle = label.type === 'country' ? '#d3e4ec' : '#bacbd9'
    context.strokeText(label.name, 7, 18)
    context.fillText(label.name, 7, 18)
    map.addImage(
      label.icon,
      context.getImageData(0, 0, canvas.width, canvas.height),
      { pixelRatio: 2 },
    )
  }
  map.addSource('atlas-labels', { type: 'geojson', data: labels })
  map.addLayer({
    id: 'country-names',
    type: 'symbol',
    source: 'atlas-labels',
    minzoom: 1,
    filter: ['==', ['get', 'type'], 'country'],
    layout: {
      'icon-image': ['get', 'icon'],
      'symbol-sort-key': ['get', 'rank'],
    },
  })
  map.addLayer({
    id: 'cities',
    type: 'circle',
    source: 'atlas-labels',
    minzoom: 3,
    filter: ['==', ['get', 'type'], 'city'],
    paint: { 'circle-color': '#a4c3cb', 'circle-radius': 2.5 },
  })
  map.addLayer({
    id: 'city-names',
    type: 'symbol',
    source: 'atlas-labels',
    minzoom: 3,
    filter: ['==', ['get', 'type'], 'city'],
    layout: {
      'icon-image': ['get', 'icon'],
      'icon-anchor': 'bottom',
      'icon-offset': [0, -3],
      'symbol-sort-key': ['get', 'rank'],
    },
  })
}
