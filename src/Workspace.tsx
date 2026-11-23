import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  CheckCircle2,
  Flame,
  Medal,
  Orbit,
  Target,
  Trophy,
  Zap,
} from 'lucide-react'
import { message, number, useWork, type Question, type Stats } from './api'
import { modeName } from './Home'
import {
  categories,
  Empty,
  ErrorBox,
  Loading,
  PageTitle,
} from './components/shared'
import { Button, buttonStyle } from './components/ui/button'
export default function Workspace() {
  const { pathname } = useLocation()
  if (pathname === '/question-bank') return <Bank />
  if (pathname === '/leaderboard') return <Leaderboard />
  return <Progress achievements={pathname === '/achievements'} />
}
function Bank() {
  const [text, setText] = useState(''),
    [kind, setKind] = useState(''),
    [page, setPage] = useState(0)
  const q = useWork<Question[]>('browse', {
    search: text,
    kind,
    offset: page * 24,
  })
  return (
    <>
      <PageTitle
        eyebrow="CONTENT LIBRARY"
        title="Question bank"
        text="Browse published prompts by category or topic."
      />
      <div className="catalog-filter">
        <input
          aria-label="Search questions"
          placeholder="Search questions, topics, or subjects"
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setPage(0)
          }}
        />
        <select
          aria-label="Question category"
          value={kind}
          onChange={(e) => {
            setKind(e.target.value)
            setPage(0)
          }}
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option value={c.kind} key={c.kind}>
              {c.label}
            </option>
          ))}
        </select>
      </div>
      {q.isPending ? (
        <Loading />
      ) : q.error ? (
        <ErrorBox error={message(q.error)} />
      ) : q.data.length ? (
        <div className="panel table-wrap">
          <table>
            <thead>
              <tr>
                <th>Question</th>
                <th>Category</th>
                <th>Topic</th>
              </tr>
            </thead>
            <tbody>
              {q.data.map((r) => (
                <tr key={r.id}>
                  <td>{r.prompt}</td>
                  <td>
                    <span className="badge">{r.kind.toUpperCase()}</span>
                  </td>
                  <td>{r.title}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty
          title="No matching questions"
          text="Try another search or category."
        />
      )}
      <div className="row section">
        <Button
          size="small"
          variant="outline"
          disabled={page === 0}
          onClick={() => setPage(page - 1)}
        >
          Previous
        </Button>
        <span className="muted">Page {page + 1}</span>
        <Button
          size="small"
          variant="outline"
          disabled={q.data?.length !== 24}
          onClick={() => setPage(page + 1)}
        >
          Next
        </Button>
      </div>
    </>
  )
}
function Leaderboard() {
  const q =
    useWork<{ name: string; points: number; games: number }[]>('leaderboard')
  return (
    <>
      <PageTitle
        eyebrow="RANKED PLAY"
        title="Leaderboard"
        text="Scores from completed Quick Play, Classic Roulette, and Marathon sessions."
      />
      {q.isPending ? (
        <Loading />
      ) : q.error ? (
        <ErrorBox error={message(q.error)} />
      ) : q.data.length ? (
        <div className="panel table-wrap">
          <table>
            <thead>
              <tr>
                <th>Rank</th>
                <th>Player</th>
                <th>Finished games</th>
                <th>Points</th>
              </tr>
            </thead>
            <tbody>
              {q.data.map((r, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td>
                    <strong>{r.name}</strong>
                  </td>
                  <td>{r.games}</td>
                  <td>{number(r.points)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty
          title="The leaderboard is open"
          text="Complete a ranked session to set the first score."
        >
          <Link className={buttonStyle()} to="/play">
            Play a ranked game
          </Link>
        </Empty>
      )}
    </>
  )
}
export function Chart({ data }: { data: { name: string; score: number }[] }) {
  return (
    <div className="chart-box">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ left: -20, bottom: 2, right: 4 }}>
          <CartesianGrid stroke="#292b45" vertical={false} />
          <XAxis
            dataKey="name"
            tick={{ fill: '#b5bbd4', fontSize: 11 }}
            tickLine={false}
          />
          <YAxis tick={{ fill: '#a1a7c3', fontSize: 11 }} tickLine={false} />
          <Tooltip
            contentStyle={{
              background: '#151829',
              border: '1px solid #3c3a5b',
              borderRadius: 8,
            }}
            cursor={{ fill: '#9a7bfa12' }}
          />
          <Bar dataKey="score" fill="#a88dff" radius={[5, 5, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
function Progress({ achievements }: { achievements: boolean }) {
  const q = useWork<Stats>('stats')
  if (q.isPending) return <Loading />
  if (q.error) return <ErrorBox error={message(q.error)} />
  const s = q.data
  if (achievements) {
    const badges = [
      {
        label: 'First Spin',
        detail: 'Answer your first question',
        earned: s.answered >= 1,
      },
      {
        label: 'Perfect Round',
        detail: 'Score 1,000 points in one round',
        earned: s.perfect > 0,
      },
      ...[
        'Portrait Detective',
        'Geography Explorer',
        'Time Traveler',
        'Mystery Solver',
        'Cause Detective',
        'Sequence Master',
      ].map((label, i) => ({
        label,
        detail: 'Score 700+ in ' + categories[i].label,
        earned:
          (s.categories.find((c) => c.name === categories[i].kind)?.passed ??
            0) > 0,
      })),
      ...[100, 1000].map((n) => ({
        label: number(n) + ' Questions',
        detail: 'Submit ' + number(n) + ' answers',
        earned: s.answered >= n,
      })),
    ]
    return (
      <>
        <PageTitle
          eyebrow="MILESTONES"
          title="Achievements"
          text={
            badges.filter((b) => b.earned).length +
            ' of ' +
            badges.length +
            ' unlocked'
          }
        />
        <div className="achievements-grid">
          {badges.map((b) => (
            <div
              className={'panel achievement ' + (b.earned ? 'unlocked' : '')}
              key={b.label}
            >
              <Medal size={26} />
              <h3>{b.label}</h3>
              <p>{b.detail}</p>
              <small>{b.earned ? 'Unlocked' : 'Locked'}</small>
            </div>
          ))}
        </div>
      </>
    )
  }
  const cards = [
    {
      name: 'Level ' + (Math.floor(s.xp / 500) + 1),
      value: number(s.xp) + ' XP',
      icon: Zap,
    },
    { name: 'Overall accuracy', value: s.accuracy + '%', icon: Target },
    { name: 'Daily streak', value: s.streak + ' days', icon: Flame },
    { name: 'Personal best', value: number(s.best) + ' pts', icon: Trophy },
  ]
  return (
    <>
      <PageTitle
        eyebrow="LEARNING ANALYTICS"
        title="My progress"
        text={
          s.answered +
          ' questions answered · ' +
          s.minutes +
          ' minutes of active quiz time'
        }
      />
      <div className="stats-grid">
        {cards.map(({ name, value, icon: Icon }) => (
          <div className="panel stat-card" key={name}>
            <Icon size={23} color="#bda6ff" />
            <div>
              <span>{name}</span>
              <strong>{value}</strong>
            </div>
          </div>
        ))}
      </div>
      <div className="section analytics-grid">
        <div className="panel padded">
          <h2>Performance by category</h2>
          {s.categories.length ? (
            <>
              <Chart
                data={s.categories.map((c) => ({
                  ...c,
                  name: c.name.toUpperCase(),
                }))}
              />
              <p className="muted">
                Strongest: {s.categories[0].name.toUpperCase()} · Needs
                practice: {s.categories.at(-1)?.name.toUpperCase()}
              </p>
            </>
          ) : (
            <p className="muted">Answer some questions to see a breakdown.</p>
          )}
        </div>
        <div className="panel padded">
          <h2>Subject mastery</h2>
          {s.subjects.length ? (
            <div className="stack">
              {s.subjects.map((a) => (
                <div className="staff-row" key={a.name}>
                  <strong>{a.name}</strong>
                  <span>{number(a.score)} avg.</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">Subjects will appear after your first game.</p>
          )}
        </div>
      </div>
      <div className="section analytics-grid">
        <div className="panel padded">
          <h2>Recent sessions</h2>
          {s.sessions.length ? (
            s.sessions.map((r) => (
              <Link
                className="staff-row"
                key={r.id}
                to={(r.finished_at ? '/results/' : '/play/session/') + r.id}
              >
                <Orbit size={16} />
                <span>{modeName(r.mode)}</span>
                <strong>{number(r.points)} pts</strong>
              </Link>
            ))
          ) : (
            <p className="muted">No sessions yet.</p>
          )}
        </div>
        <div className="panel padded">
          <h2>Questions to revisit</h2>
          {s.mistakes.length ? (
            s.mistakes.slice(0, 7).map((r, i) => (
              <Link
                key={i}
                to={'/results/' + r.id + '#round-' + r.position}
                className="staff-row"
              >
                <span>{r.prompt}</span>
                <small>{number(r.score)} pts</small>
              </Link>
            ))
          ) : (
            <p className="muted">
              Questions that score below 700 will appear here.
            </p>
          )}
          {s.mistakes.length > 0 && (
            <Link className="text-link" to="/play">
              <CheckCircle2 size={16} /> Practice these skills
            </Link>
          )}
        </div>
      </div>
    </>
  )
}
