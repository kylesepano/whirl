import { lazy, Suspense, useState, type ReactNode } from 'react'
import {
  Link,
  NavLink,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ChartNoAxesCombined,
  ChevronDown,
  Compass,
  Database,
  Gamepad2,
  LayoutDashboard,
  LogOut,
  Menu,
  Orbit,
  ShieldCheck,
  Sparkles,
  Trophy,
  X,
} from 'lucide-react'
import { currentUser, logout, message, type User } from './api'
import { ErrorBox, Loading } from './components/shared'
import { buttonStyle } from './components/ui/button'
import { Home, Auth, PlayModes } from './Home'

const Game = lazy(() => import('./Game'))
const Workspace = lazy(() => import('./Workspace'))
const Staff = lazy(() => import('./Staff'))
const core = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/play', label: 'Play', icon: Gamepad2 },
  { to: '/leaderboard', label: 'Leaderboard', icon: Trophy },
]
const learning = [
  { to: '/progress', label: 'My progress', icon: ChartNoAxesCombined },
  { to: '/achievements', label: 'Achievements', icon: Sparkles },
  { to: '/question-bank', label: 'Question bank', icon: Database },
]
function SideLink({
  to,
  label,
  icon: Icon,
  close,
}: {
  to: string
  label: string
  icon: typeof Compass
  close: () => void
}) {
  const location = useLocation()
  return (
    <NavLink
      to={to}
      end={to === '/dashboard'}
      className={({ isActive }) =>
        'nav-link ' +
        (isActive || (to === '/dashboard' && location.pathname === '/')
          ? 'active'
          : '')
      }
      onClick={close}
    >
      <Icon size={18} />
      {label}
    </NavLink>
  )
}
export default function App() {
  const {
    data: user,
    isPending,
    error,
  } = useQuery({ queryKey: ['user'], queryFn: currentUser })
  const [mobile, setMobile] = useState(false)
  const [account, setAccount] = useState(false)
  const [notice, setNotice] = useState('')
  const location = useLocation(),
    navigate = useNavigate(),
    client = useQueryClient()
  const close = () => setMobile(false)
  const current = location.pathname
  const top =
    [...core, ...learning].find((x) => current.startsWith(x.to))?.label ||
    (current.startsWith('/admin')
      ? 'Administration'
      : current.startsWith('/results')
        ? 'Results'
        : 'Dashboard')
  const guard = (node: ReactNode, admin = false) =>
    isPending ? (
      <Loading />
    ) : error ? (
      <ErrorBox error={message(error)} />
    ) : admin && user?.role !== 'admin' ? (
      <Navigate to="/login" replace />
    ) : !user ? (
      <div className="panel padded stack">
        <h2>No quiz session on this browser</h2>
        <Link to="/play">Play as guest</Link>
      </div>
    ) : (
      node
    )
  const signedIn = (person: User) => {
    client.setQueryData(['user'], person)
    void client.invalidateQueries({ queryKey: ['work'] })
  }
  async function signOut() {
    try {
      await logout()
      client.removeQueries({ queryKey: ['work'] })
      client.removeQueries({ queryKey: ['session'] })
      client.setQueryData(['user'], null)
      setAccount(false)
      navigate('/')
    } catch (e) {
      setNotice(message(e))
    }
  }
  return (
    <div className="shell">
      <a className="skip" href="#main">
        Skip to content
      </a>
      {mobile && (
        <button
          className="mobile-cover"
          aria-label="Close navigation"
          onClick={close}
        />
      )}
      <aside
        className={'sidebar ' + (mobile ? 'sidebar-open' : '')}
        aria-label="Main navigation"
      >
        <Link to="/" className="brand" onClick={close}>
          <span className="brand-glyph">
            <Orbit size={24} />
          </span>
          <span>
            WHIRL<small>SIX WAYS TO KNOW</small>
          </span>
        </Link>
        <nav>
          <div className="nav-caption">EXPLORE</div>
          {core.map((item) => (
            <SideLink key={item.to} {...item} close={close} />
          ))}
          <div className="nav-caption">YOUR LEARNING</div>
          {learning.map((item) => (
            <SideLink key={item.to} {...item} close={close} />
          ))}
          {user?.role === 'admin' && (
            <SideLink
              to="/admin/dashboard"
              label="Administration"
              icon={ShieldCheck}
              close={close}
            />
          )}
        </nav>
        <div className="side-foot">
          <div className="side-orbit">
            <Orbit size={19} />
            <div>
              <strong>Stay curious.</strong>
              <small>Spin. Think. Discover.</small>
            </div>
          </div>
          <span>WHIRL LEARNING PLATFORM</span>
        </div>
      </aside>
      <div className="app-body">
        <header className="topbar">
          <div className="top-title">
            <button
              aria-label="Open navigation"
              className="icon-button mobile-menu"
              onClick={() => setMobile(!mobile)}
            >
              {mobile ? <X /> : <Menu />}
            </button>
            <span>{top}</span>
          </div>
          <div className="top-actions">
            {user?.role === 'admin' ? (
              <div className="account-wrap">
                <button
                  className="account"
                  onClick={() => setAccount(!account)}
                  aria-expanded={account}
                >
                  <span className="avatar">
                    {user.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span>{user.name}</span>
                  <ChevronDown size={13} />
                </button>
                {account && (
                  <div className="account-menu panel">
                    <button onClick={signOut}>
                      <LogOut size={17} /> Sign out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <Link
                className={buttonStyle({ variant: 'ghost', size: 'small' })}
                to="/login"
              >
                Admin sign in
              </Link>
            )}
          </div>
        </header>
        <main id="main" className="content" tabIndex={-1}>
          <Suspense fallback={<Loading />}>
            <Routes>
              <Route path="/" element={<Home user={user} />} />
              <Route path="/dashboard" element={<Home user={user} />} />
              <Route
                path="/login"
                element={
                  user?.role === 'admin' ? (
                    <Navigate to="/admin/questions" replace />
                  ) : (
                    <Auth onUser={signedIn} />
                  )
                }
              />
              <Route
                path="/register"
                element={<Navigate to="/play" replace />}
              />
              <Route
                path="/play"
                element={<PlayModes user={user} onUser={signedIn} />}
              />
              <Route
                path="/play/roulette"
                element={<PlayModes user={user} onUser={signedIn} roulette />}
              />
              <Route path="/play/session/:id" element={guard(<Game />)} />
              <Route path="/results/:id" element={guard(<Game results />)} />
              {['leaderboard', 'question-bank'].map((path) => (
                <Route key={path} path={'/' + path} element={<Workspace />} />
              ))}
              {['progress', 'achievements'].map((path) => (
                <Route
                  key={path}
                  path={'/' + path}
                  element={guard(<Workspace />)}
                />
              ))}
              <Route path="/admin/*" element={guard(<Staff />, true)} />
              <Route
                path="*"
                element={
                  <div className="panel padded">
                    <h1>Page unavailable</h1>
                    <Link to="/">Back to dashboard</Link>
                  </div>
                }
              />
            </Routes>
          </Suspense>
          {notice && (
            <div className="toast" role="status">
              {notice}
              <button onClick={() => setNotice('')} aria-label="Dismiss">
                <X size={15} />
              </button>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
