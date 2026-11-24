import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { Flame, Infinity as InfinityIcon, Orbit, Timer, Zap } from 'lucide-react'
import {
  authenticateAdmin,
  ensureGuestSession,
  message,
  play,
  type Kind,
  type Session,
  type User,
} from './api'
import { categories, CategoryGrid, ErrorBox, PageTitle } from './components/shared'
import { Button } from './components/ui/button'
const modes = [
  {
    id: 'quick',
    label: 'Quick Play',
    detail: '5 questions',
    description: 'A short round for a quick burst of discovery.',
    icon: Zap,
    color: '#64dedf',
  },
  {
    id: 'classic',
    label: 'Classic Roulette',
    detail: '10 questions',
    description: 'Ten rounds in the categories you choose.',
    icon: Orbit,
    color: '#b196ff',
  },
  {
    id: 'marathon',
    label: 'Marathon',
    detail: '20 questions',
    description: 'Settle in for a longer game.',
    icon: Flame,
    color: '#f6ac80',
  },
  {
    id: 'practice',
    label: 'Practice',
    detail: 'Unlimited questions',
    description: 'Play at your own pace for as many rounds as you like.',
    icon: InfinityIcon,
    color: '#91e3bb',
  },
]
export const modeName = (mode: string) =>
  modes.find((m) => m.id === mode)?.label ||
  (mode === 'assessment' ? 'Assessment' : 'Course Challenge')
export function Auth({ onUser }: { onUser: (u: User) => void }) {
  const {
    register: field,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<{ email: string; password: string }>()
  const [error, setError] = useState('')
  const navigate = useNavigate()

  async function login(data: { email: string; password: string }) {
    setError('')
    try {
      onUser(await authenticateAdmin(data))
      navigate('/admin/questions', { replace: true })
    } catch (e) {
      setError(message(e))
    }
  }

  return (
    <div className="auth-wrap">
      <div className="panel auth-panel">
        <div className="brand-glyph">
          <Orbit size={25} />
        </div>
        <h1>Admin sign in</h1>
        <p>Sign in to manage the question bank. Anyone can play as a guest.</p>
        <form onSubmit={handleSubmit(login)} className="stack">
          <label>
            Email
            <input
              type="email"
              autoComplete="username"
              required
              {...field('email')}
            />
          </label>
          <label>
            Password
            <input
              type="password"
              autoComplete="current-password"
              required
              {...field('password')}
            />
          </label>
          {error && <ErrorBox error={error} />}
          <Button disabled={isSubmitting}>Sign in</Button>
        </form>
        <Link to="/play">Play as guest</Link>
      </div>
    </div>
  )
}
export function PlayModes({
  user,
  onUser,
}: {
  user?: User | null
  onUser: (u: User) => void
}) {
  const [starting, setStarting] = useState(''),
    [error, setError] = useState('')
  const [selected, setSelected] = useState<Kind[]>([])
  const navigate = useNavigate()
  async function start(mode: string) {
    setStarting(mode)
    setError('')
    try {
      const person = await ensureGuestSession()
      if (person.id !== user?.id) onUser(person)
      const requested = selected.length < categories.length ? selected : []
      const s = await play<Session>('start', {
        mode,
        ...(requested.length
          ? { categories: requested, ...(requested.length === 1 ? { category: requested[0] } : {}) }
          : {}),
      })
      if (requested.length) {
        const saved = s.categories ?? (s.category ? [s.category] : [])
        if (
          saved.length !== requested.length ||
          !requested.every((kind) => saved.includes(kind)) ||
          s.eligible.some((kind) => !requested.includes(kind))
        ) {
          throw new Error('The game server could not save your category selection. This site needs a database update for custom games.')
        }
      }
      navigate('/play/session/' + s.id)
    } catch (e) {
      setError(message(e))
      setStarting('')
    }
  }
  return (
    <>
      <PageTitle
        title="Play WHIRL"
        text="Pick one or more categories, then choose a game mode."
      />
      {error && <ErrorBox error={error} />}
      <CategoryGrid selected={selected} onChange={setSelected} disabled={Boolean(starting)} />
      <div className="mode-grid">
        {modes.map(({ id, label, detail, description, icon: Icon, color }) => (
          <div className="mode-card panel" key={id}>
            <span className="mode-icon" style={{ color }}>
              <Icon size={25} />
            </span>
            <div className="mode-meta">
              <span>
                <Timer size={14} />
                {detail}
              </span>
            </div>
            <h2>{label}</h2>
            <p>{description}</p>
            <Button
              variant={id === 'classic' ? 'primary' : 'outline'}
              onClick={() => start(id)}
              disabled={Boolean(starting)}
            >
              {starting === id ? 'Starting…' : 'Start ' + label}
            </Button>
          </div>
        ))}
      </div>
    </>
  )
}
