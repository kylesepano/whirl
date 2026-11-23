import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import {
  ArrowRight,
  ChartNoAxesCombined,
  Flame,
  Gamepad2,
  Infinity as InfinityIcon,
  Orbit,
  RotateCcw,
  Sparkles,
  Target,
  Timer,
  Trophy,
  Zap,
} from 'lucide-react'
import {
  authenticateAdmin,
  ensureGuestSession,
  message,
  number,
  play,
  useWork,
  type Session,
  type Stats,
  type User,
} from './api'
import {
  CategoryGrid,
  Empty,
  ErrorBox,
  PageTitle,
  Wheel,
} from './components/shared'
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
    description: 'The signature WHIRL experience across six categories.',
    icon: Orbit,
    color: '#b196ff',
  },
  {
    id: 'marathon',
    label: 'Marathon',
    detail: '20 questions',
    description: 'Settle in for the longest ranked challenge.',
    icon: Flame,
    color: '#f6ac80',
  },
  {
    id: 'practice',
    label: 'Practice',
    detail: 'Unlimited questions',
    description: 'Learn at your own pace and revisit difficult questions.',
    icon: InfinityIcon,
    color: '#91e3bb',
  },
]
export const modeName = (mode: string) =>
  modes.find((m) => m.id === mode)?.label ||
  (mode === 'assessment' ? 'Assessment' : 'Course Challenge')
const statCards = [
  {
    label: 'Questions answered',
    icon: Target,
    color: '#b9a2ff',
    key: 'answered',
  },
  {
    label: 'Overall accuracy',
    icon: ChartNoAxesCombined,
    color: '#64deda',
    key: 'accuracy',
  },
  { label: 'Experience points', icon: Zap, color: '#88a7ff', key: 'xp' },
  { label: 'Daily streak', icon: Flame, color: '#f5b282', key: 'streak' },
] as const
export function Home({ user }: { user?: User | null }) {
  const { data: stats } = useWork<Stats>('stats', {}, Boolean(user))
  return (
    <>
      <section className="hero">
        <div className="hero-grid" />
        <div className="hero-copy">
          <div className="hero-kicker">
            <Sparkles size={14} /> SIX WAYS TO KNOW
          </div>
          <h1>
            Spin. Think.
            <br />
            <span>Discover.</span>
          </h1>
          <p>
            One wheel. Six ways to challenge what you know.
            <br className="wide-only" /> Take a spin and see where curiosity
            lands.
          </p>
          <div className="hero-actions">
            <Button asChild>
              <Link to="/play">
                <Gamepad2 size={19} /> Play Roulette
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/question-bank">Browse Questions</Link>
            </Button>
          </div>
        </div>
        <Wheel />
      </section>
      <section className="section">
        <div className="section-heading">
          <div>
            <h2>Six ways to play</h2>
            <p>Every category puts a different skill to the test.</p>
          </div>
          <Link to="/question-bank" className="text-link">
            Question bank <ArrowRight size={15} />
          </Link>
        </div>
        <CategoryGrid />
      </section>
      <section className="section">
        <div className="section-heading">
          <div>
            <h2>Your progress</h2>
            <p>See what you’ve learned, one round at a time.</p>
          </div>
          <Link to="/progress" className="text-link">
            View progress <ArrowRight size={15} />
          </Link>
        </div>
        <div className="stats-grid">
          {statCards.map(({ icon: Icon, label, key, color }) => (
            <div className="stat-card panel" key={key}>
              <div className="stat-icon" style={{ color }}>
                <Icon size={18} />
              </div>
              <div>
                <span>{label}</span>
                <strong>
                  {number(stats?.[key] ?? 0)}
                  {key === 'accuracy' ? '%' : key === 'streak' ? ' days' : ''}
                </strong>
              </div>
            </div>
          ))}
        </div>
      </section>
      <section className="section">
        <div className="section-heading">
          <div>
            <h2>Recent sessions</h2>
            <p>Pick up a game or revisit your results.</p>
          </div>
        </div>
        {stats?.sessions.length ? (
          <div className="panel list-panel">
            {stats.sessions.slice(0, 4).map((s) => (
              <Link
                key={s.id}
                to={(s.finished_at ? '/results/' : '/play/session/') + s.id}
              >
                <Orbit size={20} />
                <strong>{modeName(s.mode)}</strong>
                <span>{number(s.points)} pts</span>
                <ArrowRight size={16} />
              </Link>
            ))}
          </div>
        ) : (
          <Empty
            title="The wheel is waiting"
            text="Your games will appear here after your first spin."
          />
        )}
      </section>
    </>
  )
}
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
  roulette,
}: {
  user?: User | null
  onUser: (u: User) => void
  roulette?: boolean
}) {
  const [starting, setStarting] = useState(''),
    [error, setError] = useState('')
  const navigate = useNavigate()
  const { data } = useWork<Stats>('stats', {}, Boolean(user))
  const open = data?.sessions.find((s) => !s.finished_at)
  async function start(mode: string) {
    setStarting(mode)
    setError('')
    try {
      const person = await ensureGuestSession()
      if (person.id !== user?.id) onUser(person)
      const s = await play<Session>('start', { mode })
      navigate('/play/session/' + s.id)
    } catch (e) {
      setError(message(e))
      setStarting('')
    }
  }
  return (
    <>
      <PageTitle
        eyebrow="THE GAME ROOM"
        title={roulette ? 'Roulette' : 'Choose your game'}
        text="Spin the wheel to discover which skill you’ll use next."
      />
      {error && <ErrorBox error={error} />}
      {open && (
        <Link className="resume panel" to={'/play/session/' + open.id}>
          <RotateCcw size={20} />
          <div>
            <strong>Resume {modeName(open.mode)}</strong>
            <span>{number(open.points)} points so far</span>
          </div>
          <ArrowRight size={18} />
        </Link>
      )}
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
              {id !== 'practice' && (
                <span>
                  <Trophy size={14} /> Ranked
                </span>
              )}
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
