import pg from 'pg'
import { setTimeout as wait } from 'node:timers/promises'
import { pathToFileURL } from 'node:url'
import { existsSync } from 'node:fs'
const classes = {
  Q33506: { subject: 'Arts & culture', noun: 'museum' },
  Q3914: { subject: 'Civics & world knowledge', noun: 'school' },
  Q4830453: { subject: 'Technology & inventions', noun: 'business' },
  Q7075: { subject: 'Arts & culture', noun: 'library' },
  Q515: { subject: 'Geography', noun: 'city' },
  Q62832: { subject: 'Science', noun: 'observatory' },
  Q43501: { subject: 'Nature & biology', noun: 'zoo' },
  Q16917: { subject: 'History', noun: 'hospital' },
}
const endpoint = 'https://query.wikidata.org/sparql'
export function makeCandidate(binding, kind) {
  const id = binding.item?.value?.split('/').at(-1)
  const title = binding.label?.value?.trim()
  const metadata = classes[kind]
  const match = /^\+?(\d{4})-\d{2}-\d{2}T/.exec(binding.inception?.value ?? '')
  const y = Number(match?.[1])
  if (
    !metadata ||
    !/^Q\d+$/.test(id ?? '') ||
    !title ||
    title.length < 3 ||
    title.length > 160 ||
    !Number.isInteger(y) ||
    y < 1000 ||
    y > 2025
  )
    return null
  return {
    id,
    title,
    year: y,
    subject: metadata.subject,
    prompt:
      'In what year was the ' +
      metadata.noun +
      ' ' +
      title +
      ' established, according to Wikidata’s inception record?',
    url: 'https://www.wikidata.org/wiki/' + id + '#P571',
  }
}
export async function commitPage(tx, { job, cursor, candidates }) {
  let inserted = 0
  for (const c of candidates) {
    await tx.query(
      'insert into public.topics(slug,title,subject) values($1,$2,$3) on conflict do nothing',
      ['wikidata-' + c.id.toLowerCase(), c.title, c.subject],
    )
    const result = await tx.query(
      `insert into public.questions(topic_id,kind,prompt,presentation,solution,explanation,source_url,source_title)
   select id,'when',$1,$2::jsonb,$3::jsonb,$4,$5,'Wikidata inception statement' from public.topics where slug=$6 on conflict do nothing`,
      [
        c.prompt,
        JSON.stringify({
          min: c.year < 1500 ? 1000 : 1500,
          max: c.year < 1500 ? 1750 : 2050,
          precision: 'year',
        }),
        JSON.stringify({
          min: c.year,
          max: c.year,
          scale: 18,
          precision: 'year',
          label: c.year + ' CE',
        }),
        'Wikidata records ' +
          c.year +
          ' as the inception year for ' +
          c.title +
          '. Check the cited reference and distinguish founding, opening, and reorganizations before publishing.',
        c.url,
        'wikidata-' + c.id.toLowerCase(),
      ],
    )
    inserted += result.rowCount ?? result.affectedRows ?? 0
  }
  await tx.query(
    `insert into public.import_jobs(source,cursor,processed) values($1,$2,$3) on conflict(source) do update
  set cursor=case when excluded.cursor::bigint>public.import_jobs.cursor::bigint then excluded.cursor else public.import_jobs.cursor end,
      processed=public.import_jobs.processed+excluded.processed,updated_at=now()`,
    [job, String(cursor), inserted],
  )
  return inserted
}
async function request(query, contact) {
  for (let n = 0; n < 5; n++) {
    let response
    try {
      response = await fetch(
        endpoint + '?' + new URLSearchParams({ query, format: 'json' }),
        {
          headers: {
            Accept: 'application/sparql-results+json',
            'User-Agent': 'WHIRL-KnowledgeImporter/1.0 (' + contact + ')',
          },
          signal: AbortSignal.timeout(65_000),
        },
      )
      if (response.ok) return (await response.json()).results.bindings
      if (
        response.status !== 429 &&
        response.status !== 408 &&
        response.status < 500
      )
        throw Object.assign(
          new Error('Wikidata returned HTTP ' + response.status),
          { fatal: true },
        )
    } catch (e) {
      if (e.fatal || n === 4) throw e
    }
    if (n === 4)
      throw new Error(
        'Wikidata unavailable. The last committed cursor was retained.',
      )
    const retryHeader = response?.headers.get('Retry-After')
    const retry =
      retryHeader && /^\d+$/.test(retryHeader) ? +retryHeader * 1000 : 0
    await wait(Math.max(retry, 1000 * 2 ** n))
  }
}
function sparql(kind, cursor, limit) {
  return `SELECT ?item ?label (SAMPLE(?time) AS ?inception) ?num WHERE {
  ?item wdt:P31 wd:${kind}; p:P571 ?statement; rdfs:label ?label.
  FILTER(LANG(?label)="en")
  ?statement psv:P571 [ wikibase:timeValue ?time; wikibase:timePrecision ?precision; wikibase:timeCalendarModel wd:Q1985727 ]; prov:wasDerivedFrom ?ref; wikibase:rank ?rank.
  FILTER(?precision>=9 && ?rank!=wikibase:DeprecatedRank)
  BIND(xsd:integer(STRAFTER(STR(?item),"entity/Q")) AS ?num)
  FILTER(?num > ${cursor})
 } GROUP BY ?item ?label ?num HAVING(COUNT(DISTINCT YEAR(?time))=1) ORDER BY ?num LIMIT ${limit}`
}
async function main() {
  for (const path of ['.env', '.env.local'])
    if (existsSync(path)) process.loadEnvFile(path)
  const args = process.argv.slice(2),
    arg = (name, fallback) =>
      args.includes(name) ? args[args.indexOf(name) + 1] : fallback
  const amount = Number(arg('--limit', '100'))
  const kind = arg('--class', 'Q33506')
  const contact = process.env.WHIRL_IMPORT_CONTACT
  const dry = args.includes('--dry-run')
  if (
    !classes[kind] ||
    !Number.isSafeInteger(amount) ||
    amount < 1 ||
    amount > 10_000
  )
    throw new Error('Use a supported --class and --limit between 1 and 10000.')
  if (!contact || /[\r\n]/.test(contact))
    throw new Error(
      'Set WHIRL_IMPORT_CONTACT to an email address or project URL.',
    )
  const connectionString = process.env.WHIRL_DATABASE_URL
  if (!dry && !connectionString)
    throw new Error('Set WHIRL_DATABASE_URL or use --dry-run.')
  const client = dry
    ? null
    : new pg.Client({ connectionString, connectionTimeoutMillis: 15000 })
  await client?.connect()
  const job = 'Wikidata inception: ' + kind
  try {
    if (client) {
      const lock = await client.query(
        'select pg_try_advisory_lock(hashtext($1)) ok',
        [job],
      )
      if (!lock.rows[0].ok)
        throw new Error('An import for this class is already running.')
    }
    let cursor = Number(
      (
        await client?.query(
          'select cursor from public.import_jobs where source=$1',
          [job],
        )
      )?.rows[0]?.cursor ?? 0,
    )
    let scanned = 0,
      inserted = 0
    while (scanned < amount) {
      const limit = Math.min(60, amount - scanned)
      const rows = await request(sparql(kind, cursor, limit), contact)
      if (!rows.length) break
      const next = Number(rows.at(-1).num?.value)
      if (!Number.isSafeInteger(next) || next <= cursor)
        throw new Error('Invalid Wikidata cursor.')
      const candidates = rows.map((r) => makeCandidate(r, kind)).filter(Boolean)
      if (client) {
        await client.query('begin')
        try {
          inserted += await commitPage(client, {
            job,
            cursor: next,
            candidates,
          })
          await client.query('commit')
        } catch (e) {
          await client.query('rollback')
          throw e
        }
      } else
        console.log(
          candidates
            .map((c) => c.id + ' ' + c.title + ' (' + c.year + ')')
            .join('\n'),
        )
      cursor = next
      scanned += rows.length
      console.log(
        'Scanned ' +
          scanned +
          ' claims · ' +
          inserted +
          ' new review candidates',
      )
      if (rows.length < limit) break
      await wait(1100)
    }
  } finally {
    await client?.end()
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch((e) => {
    console.error(e.message)
    process.exitCode = 1
  })
