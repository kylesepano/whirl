import { mkdir, readFile, writeFile } from 'node:fs/promises'

const upstream =
  'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/'
const output = new URL('../public/maps/', import.meta.url)
const sourceFiles = process.argv.slice(2)
const collection = (features) => ({ type: 'FeatureCollection', features })
const rounded = (coordinates) =>
  coordinates.map((value) =>
    Array.isArray(value) ? rounded(value) : Math.round(value * 10000) / 10000,
  )
const point = (coordinates, properties) => ({
  type: 'Feature',
  geometry: { type: 'Point', coordinates: rounded(coordinates) },
  properties,
})

async function dataset(name, localFile) {
  if (localFile) return JSON.parse(await readFile(localFile, 'utf8'))
  const response = await fetch(upstream + name + '.geojson')
  if (!response.ok) throw new Error(name + ': HTTP ' + response.status)
  return response.json()
}

const [countries, places] = await Promise.all([
  dataset('ne_110m_admin_0_countries', sourceFiles[0]),
  dataset('ne_110m_populated_places_simple', sourceFiles[1]),
])
const land = countries.features.map(({ geometry }) => ({
  type: 'Feature',
  geometry: { ...geometry, coordinates: rounded(geometry.coordinates) },
  properties: {},
}))
const countryLabels = countries.features
  .filter(
    ({ properties: p }) =>
      p.NAME_EN && Number.isFinite(p.LABEL_X) && Math.abs(p.LABEL_Y) < 80,
  )
  .map(({ properties: p }) =>
    point([p.LABEL_X, p.LABEL_Y], {
      name: p.NAME_EN,
      rank: p.LABELRANK,
      type: 'country',
    }),
  )
const cityLabels = places.features.map(({ geometry, properties: p }) =>
  point(geometry.coordinates, {
    name: p.name,
    rank: p.scalerank,
    type: 'city',
  }),
)
const labels = [...countryLabels, ...cityLabels].map((feature, id) => ({
  ...feature,
  properties: { ...feature.properties, icon: 'atlas-label-' + id },
}))
await mkdir(output, { recursive: true })
await Promise.all([
  writeFile(
    new URL('countries.geojson', output),
    JSON.stringify(collection(land)) + '\n',
  ),
  writeFile(
    new URL('labels.geojson', output),
    JSON.stringify(collection(labels)) + '\n',
  ),
])
