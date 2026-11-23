import express from 'express'
import { rateLimit } from 'express-rate-limit'
import {
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { z } from 'zod'
import { openLocal, rpc } from './local-db.mjs'

for (const path of ['.env.local', '.env']) {
  if (existsSync(path)) process.loadEnvFile(path)
}
const directory = process.env.WHIRL_LOCAL_DIR || '.whirl/local'
await mkdir(directory, { recursive: true })
const db = await openLocal(directory + '/db')
const app = express()
app.disable('x-powered-by')
app.use(express.json({ limit: '100kb' }))
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store')
  const origin = req.get('origin')
  if (origin && !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin))
    return res.status(403).json({ error: 'Invalid request origin' })
  next()
})
app.use(
  '/api/auth',
  rateLimit({
    windowMs: 60_000,
    limit: 45,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
  }),
)
const credentials = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  password: z.string().min(8).max(128),
})
const hash = (value) => createHash('sha256').update(value).digest('hex')
const cookie = 'whirl_local'
function token(req) {
  return req.headers.cookie?.match(/(?:^|; *)whirl_local=([a-f0-9]{64})\b/)?.[1]
}
async function user(req) {
  const value = token(req)
  if (!value) return null
  return (
    (
      await db.query(
        'select user_id from local_auth.tokens where hash=$1 and expires>now()',
        [hash(value)],
      )
    ).rows[0]?.user_id ?? null
  )
}
async function grant(res, id) {
  const value = randomBytes(32).toString('hex')
  await db.query('insert into local_auth.tokens(hash,user_id) values($1,$2)', [
    hash(value),
    id,
  ])
  res.cookie(cookie, value, {
    httpOnly: true,
    sameSite: 'strict',
    path: '/api',
    maxAge: 1_209_600_000,
  })
  return res.json(await rpc(db, id, 'workspace', 'me'))
}
async function provisionAdmin() {
  const { WHIRL_ADMIN_EMAIL: email, WHIRL_ADMIN_PASSWORD: password } =
    process.env
  if (!email && !password) return
  const input = credentials.safeParse({ email, password })
  if (!input.success)
    throw new Error(
      'Set a valid WHIRL_ADMIN_EMAIL and a WHIRL_ADMIN_PASSWORD of at least 8 characters.',
    )
  await db.transaction(async (tx) => {
    const existing = (
      await tx.query(
        'select p.role from local_auth.accounts a join public.profiles p on p.id=a.user_id where a.email=$1',
        [input.data.email],
      )
    ).rows[0]
    if (existing?.role === 'admin') return
    if (existing)
      throw new Error('Use a new email address for the local admin.')
    const {
      rows: [{ id }],
    } = await tx.query(
      'insert into auth.users(raw_user_meta_data) values($1) returning id',
      [JSON.stringify({ name: 'Admin' })],
    )
    const salt = randomBytes(16).toString('hex')
    await tx.query('insert into local_auth.accounts values($1,$2,$3)', [
      input.data.email,
      salt + ':' + scryptSync(input.data.password, salt, 64).toString('hex'),
      id,
    ])
    await tx.query("update public.profiles set role='admin' where id=$1", [id])
  })
}
await db.query(`delete from local_auth.tokens t using local_auth.accounts a, public.profiles p
 where t.user_id=a.user_id and p.id=t.user_id and p.role='admin'
  and p.name='Jamie Rivera' and a.email ~ '^[a-f0-9]{24}@example[.]invalid$'`)
await provisionAdmin()
app.get('/api/health', (_req, res) => res.json({ ok: true }))
app.get('/api/auth/me', async (req, res) => {
  const id = await user(req)
  res.json(id ? await rpc(db, id, 'workspace', 'me') : null)
})
app.post('/api/auth/guest', async (req, res) => {
  const active = await user(req)
  if (active) return res.json(await rpc(db, active, 'workspace', 'me'))
  const {
    rows: [{ id }],
  } = await db.query(
    'insert into auth.users(raw_user_meta_data) values($1) returning id',
    [JSON.stringify({ name: 'Guest' })],
  )
  return grant(res, id)
})
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = credentials.parse(req.body)
  const account = (
    await db.query(
      "select a.* from local_auth.accounts a join public.profiles p on p.id=a.user_id where a.email=$1 and p.role='admin'",
      [email],
    )
  ).rows[0]
  const [salt, stored] = account?.password.split(':') ?? [
    'invalid',
    '0'.repeat(128),
  ]
  if (
    !timingSafeEqual(
      scryptSync(password, salt, 64),
      Buffer.from(stored, 'hex'),
    ) ||
    !account
  )
    return res.status(401).json({ error: 'Email or password is incorrect' })
  return grant(res, account.user_id)
})
app.post('/api/auth/logout', async (req, res) => {
  if (token(req))
    await db.query('delete from local_auth.tokens where hash=$1', [
      hash(token(req)),
    ])
  return res.clearCookie(cookie, { path: '/api' }).json(true)
})
app.use('/api/auth', (_req, res) =>
  res.status(404).json({ error: 'Unknown authentication action' }),
)
app.post('/api/:service/:action', async (req, res) => {
  res.json(
    await rpc(
      db,
      await user(req),
      req.params.service,
      req.params.action,
      req.body,
    ),
  )
})
app.use((error, _req, res, _next) => {
  const friendly =
    error.code === '23505'
      ? 'That email, question, or record already exists'
      : error.code === '42501'
        ? 'You do not have access to this action'
        : error.issues?.[0]?.message || error.message
  res.status(error.code === '42501' ? 403 : 400).json({ error: friendly })
})
const port = Number(process.env.WHIRL_API_PORT || 4317)
app.listen(port, '127.0.0.1', (error) => {
  if (error) {
    console.error(error.message)
    process.exitCode = 1
    void db.close()
    return
  }
  console.log('WHIRL local database API ready on port ' + port)
  process.send?.('ready')
})
