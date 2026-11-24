import { createClient } from '@supabase/supabase-js'
import { useQuery } from '@tanstack/react-query'
export type Role = 'guest' | 'admin'
export type User = { id: string; name: string; role: Role }
export type Kind = 'who' | 'where' | 'when' | 'what' | 'why' | 'how'
export type Option = { id: string; label?: string; image?: string }
export type Display = {
  options?: Option[]
  image?: string
  images?: string[]
  mechanic?: 'matching' | 'evidence' | 'chain' | 'text' | 'country'
  pairs?: Option[]
  matches?: Option[]
  min?: number
  max?: number
  precision?: string
  seconds?: number
  maxScore?: number
}
export type Credit = {
  subject?: string
  image?: string
  id?: string
  artist: string
  url: string
  license: string
  medium?: string
}
export type Solution = {
  label: string
  correct?: string | string[] | Record<string, string>
  credits?: Credit[]
  lat?: number
  lng?: number
  country?: string
  min?: number
  max?: number
  precision?: string
  polygon?: number[][]
}
export type Feedback = {
  score: number
  answer: unknown
  difference?: number
  expired?: boolean
  solution: Solution
  explanation: string
  sourceUrl: string
  sourceTitle: string
  questionId: string
}
export type Round = {
  id: string
  kind: Kind
  position: number
  topic: string
  prompt: string
  difficulty: string
  deadline: string | null
  reveals: number
  display: Display
  feedback: Feedback | null
}
export type Session = {
  id: string
  mode: string
  total: number
  target: number | null
  rounds: Round[]
  eligible: Kind[]
  finished_at: string | null
}
export type SessionRow = {
  id: string
  mode: string
  points: number
  created_at: string
  finished_at: string | null
  target: number | null
}
export type Stat = { name: string; score: number; n: number; passed?: number }
export type Stats = {
  answered: number
  accuracy: number
  xp: number
  best: number
  streak: number
  perfect: number
  minutes: number
  subjects: Stat[]
  categories: Stat[]
  sessions: SessionRow[]
  mistakes: { id: string; prompt: string; score: number; position: number }[]
}
export type Question = {
  id: string
  kind: Kind
  title: string
  subject: string
  difficulty: string
  prompt: string
  status: string
}
const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
export const supabase = url && key ? createClient(url, key) : null
export const local = import.meta.env.DEV && !supabase
async function localFetch<T>(
  path: string,
  data?: Record<string, unknown>,
): Promise<T> {
  if (!local) throw new Error('Configure Supabase to enable this workspace.')
  const res = await fetch(
    '/api/' + path,
    data === undefined
      ? {}
      : {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        },
  )
  const body = await res.json()
  if (!res.ok) throw new Error(body.error)
  return body as T
}
export async function rpc<T>(
  service: 'play' | 'workspace',
  action: string,
  p: Record<string, unknown> = {},
): Promise<T> {
  if (!supabase) return localFetch<T>(service + '/' + action, p)
  const { data, error } = await supabase.rpc('whirl_' + service, { action, p })
  if (error) throw new Error(error.message)
  return data as T
}
export const work = <T>(action: string, p: Record<string, unknown> = {}) =>
  rpc<T>('workspace', action, p)
export const play = <T>(action: string, p: Record<string, unknown> = {}) =>
  rpc<T>('play', action, p)
export const useWork = <T>(
  action: string,
  p: Record<string, unknown> = {},
  enabled = true,
) =>
  useQuery({
    queryKey: ['work', action, p],
    queryFn: () => work<T>(action, p),
    enabled,
  })
export async function currentUser() {
  if (!supabase) return local ? localFetch<User | null>('auth/me') : null
  const { data } = await supabase.auth.getSession()
  return data.session ? work<User>('me') : null
}
export async function authenticateAdmin(data: {
  email: string
  password: string
}) {
  if (!supabase) return localFetch<User>('auth/login', data)
  const { error } = await supabase.auth.signInWithPassword(data)
  if (error) throw new Error(error.message)
  const person = await work<User>('me')
  if (person.role !== 'admin') {
    await supabase.auth.signOut({ scope: 'local' })
    throw new Error('This sign-in is for administrators.')
  }
  return person
}
let openingGuest: Promise<User> | undefined
export function ensureGuestSession() {
  if (!openingGuest) {
    openingGuest = (async () => {
      const existing = await currentUser()
      if (existing) return existing
      if (!supabase) return localFetch<User>('auth/guest', {})
      const { error } = await supabase.auth.signInAnonymously({
        options: { data: { name: 'Guest' } },
      })
      if (error) throw new Error(error.message)
      return work<User>('me')
    })().finally(() => {
      openingGuest = undefined
    })
  }
  return openingGuest
}
export async function logout() {
  if (!supabase) return localFetch<boolean>('auth/logout', {})
  const { error } = await supabase.auth.signOut()
  if (error) throw new Error(error.message)
}
export const message = (e: unknown) =>
  e instanceof Error ? e.message : 'Something went wrong. Try again.'
export const number = (n: number) => n.toLocaleString()
export function yearLabel(y: number) {
  return y >= 1 ? y + ' CE' : 1 - y + ' BCE'
}
