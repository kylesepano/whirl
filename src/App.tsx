import { lazy, Suspense, useState } from 'react'
import { Link, Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { LogOut, Orbit } from 'lucide-react'
import { currentUser, logout, message, type User } from './api'
import { ErrorBox, Loading } from './components/shared'
import { Button } from './components/ui/button'
import { Auth, PlayModes } from './Home'

const Game = lazy(() => import('./Game'))
const Staff = lazy(() => import('./Staff'))

export default function App() {
  const { data: user, isPending, error } = useQuery({
    queryKey: ['user'],
    queryFn: currentUser,
  })
  const [signingOut, setSigningOut] = useState(false)
  const [signOutError, setSignOutError] = useState('')
  const navigate = useNavigate()
  const client = useQueryClient()
  const admin = user?.role === 'admin'

  function signedIn(person: User) {
    client.setQueryData(['user'], person)
    void client.invalidateQueries({ queryKey: ['work'] })
  }

  async function signOut() {
    setSigningOut(true)
    setSignOutError('')
    try {
      await logout()
      client.removeQueries({ queryKey: ['work'] })
      client.removeQueries({ queryKey: ['session'] })
      client.setQueryData(['user'], null)
      navigate('/')
    } catch (e) {
      setSignOutError(message(e))
    } finally {
      setSigningOut(false)
    }
  }

  const session = (results = false) =>
    isPending ? (
      <Loading />
    ) : error ? (
      <ErrorBox error={message(error)} />
    ) : user ? (
      <Game results={results} />
    ) : (
      <Navigate to="/" replace />
    )
  const play = <PlayModes user={user} onUser={signedIn} />

  return (
    <div className="shell">
      <a className="skip" href="#main">
        Skip to content
      </a>
      <header className="topbar">
        <Link to="/" className="brand" aria-label="WHIRL home">
          <span className="brand-glyph">
            <Orbit size={24} />
          </span>
          <span>WHIRL</span>
        </Link>
        {admin && (
          <nav className="top-actions" aria-label="Admin">
            <Link to="/admin/questions">Question bank</Link>
            <Button variant="ghost" size="small" onClick={signOut} disabled={signingOut}>
              <LogOut size={17} /> Sign out
            </Button>
          </nav>
        )}
      </header>
      <main id="main" className="content" tabIndex={-1}>
        {signOutError && <ErrorBox error={signOutError} />}
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route path="/" element={play} />
            <Route path="/play" element={play} />
            <Route path="/play/roulette" element={<Navigate to="/" replace />} />
            <Route path="/play/session/:id" element={session()} />
            <Route path="/results/:id" element={session(true)} />
            <Route
              path="/login"
              element={
                isPending ? (
                  <Loading />
                ) : admin ? (
                  <Navigate to="/admin/questions" replace />
                ) : (
                  <Auth onUser={signedIn} />
                )
              }
            />
            <Route path="/question-bank" element={<Navigate to="/admin/questions" replace />} />
            <Route
              path="/admin/questions"
              element={
                isPending ? (
                  <Loading />
                ) : error ? (
                  <ErrorBox error={message(error)} />
                ) : admin ? (
                  <Staff />
                ) : (
                  <Navigate to="/login" replace />
                )
              }
            />
            <Route path="/admin/*" element={<Navigate to="/admin/questions" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </main>
    </div>
  )
}
