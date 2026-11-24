import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowRight,
  Check,
  Flag,
  Orbit,
  Timer,
  Trophy,
  Zap,
} from 'lucide-react'
import { useReducedMotion } from 'motion/react'
import {
  message,
  number,
  play,
  work,
  type Feedback,
  type Round,
  type Session,
} from './api'
import { modeName } from './Home'
import {
  categories,
  Empty,
  ErrorBox,
  Loading,
  PageTitle,
  spinToCategory,
  Wheel,
} from './components/shared'
import {
  QuestionControls,
  initialAnswer,
  SolutionDetails,
  validAnswer,
} from './components/QuestionControls'
import { Button, buttonStyle } from './components/ui/button'

function RoundView({
  round,
  id,
  refresh,
  onNext,
  nextLabel,
}: {
  round: Round
  id: string
  refresh: () => void
  onNext: () => void
  nextLabel: string
}) {
  const [shown, setShown] = useState(round)
  const [answer, setAnswer] = useState(
    round.feedback?.answer ?? initialAnswer(round),
  )
  const [clock, setClock] = useState(Date.now())
  const [reporting, setReporting] = useState(false),
    [reason, setReason] = useState('')
  const submit = useMutation({
    mutationFn: () => play<Feedback>('submit', { id, round: round.id, answer }),
    onSuccess: () => refresh(),
  })
  const reveal = useMutation({
    mutationFn: () =>
      play<Round>('reveal', { id, round: round.id, stage: shown.reveals + 1 }),
    onSuccess: setShown,
  })
  const report = useMutation({
    mutationFn: () =>
      work('report', { question: feedback?.questionId, reason }),
    onSuccess: () => setReporting(false),
  })
  const feedback = submit.data ?? round.feedback
  const remaining = round.deadline
    ? Math.max(
        0,
        Math.ceil((new Date(round.deadline).getTime() - clock) / 1000),
      )
    : null
  const expired = remaining === 0
  useEffect(() => {
    if (!round.deadline || feedback) return
    const t = setInterval(() => setClock(Date.now()), 400)
    return () => clearInterval(t)
  }, [round.deadline, feedback])
  const cat = categories.find((c) => c.kind === round.kind)!
  const error = submit.error ?? reveal.error ?? report.error
  return (
    <div className="question panel">
      <div className="question-top">
        <span
          className="category-badge"
          style={{ '--accent': cat.color } as CSSProperties}
        >
          <cat.icon size={16} /> {cat.label} ·{' '}
          {round.display.mechanic === 'text' ? 'Text clue' : cat.name}
        </span>
        {remaining !== null && !feedback && (
          <span className={'timer ' + (expired ? 'expired' : '')}>
            <Timer size={17} />
            {expired ? 'Time expired' : remaining + 's'}
          </span>
        )}
      </div>
      <h2>{round.prompt}</h2>
      {round.topic && (
        <p className="muted">
          {round.topic} · {round.difficulty}
        </p>
      )}
      <QuestionControls
        round={shown}
        answer={answer}
        onChange={setAnswer}
        feedback={feedback}
        reveal={() => reveal.mutate()}
        revealing={reveal.isPending}
      />
      {error && <ErrorBox error={message(error)} />}
      {feedback ? (
        <>
          <div className="feedback" aria-live="polite">
            <div>
              <Check size={20} />
              <strong>
                {feedback.expired ? 'Time expired' : feedback.solution.label}
              </strong>
              <span>+{number(feedback.score)} pts</span>
            </div>
            <p>{feedback.explanation}</p>
            <SolutionDetails round={shown} feedback={feedback} />
            <a href={feedback.sourceUrl} target="_blank" rel="noreferrer">
              {feedback.sourceTitle}
            </a>
          </div>
          <div className="question-foot">
            <Button
              variant="ghost"
              size="small"
              onClick={() => setReporting(!reporting)}
            >
              <Flag size={15} /> Report question
            </Button>
            <Button onClick={onNext}>
              {nextLabel}
              <ArrowRight size={17} />
            </Button>
          </div>
          {report.isSuccess && !reporting && (
            <p className="success" role="status">
              Report saved.
            </p>
          )}
          {reporting && (
            <div className="stack">
              <label>
                Describe the problem
                <textarea
                  value={reason}
                  maxLength={1000}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
              <Button
                variant="outline"
                onClick={() => report.mutate()}
                disabled={reason.trim().length < 5 || report.isPending}
              >
                Send report
              </Button>
            </div>
          )}
        </>
      ) : (
        <div className="question-foot">
          <span className="muted">
            {round.kind === 'what' && round.display.mechanic !== 'text'
              ? 'Reveals reduce the maximum score.'
              : 'Up to ' + number(round.display.maxScore ?? 1000) + ' points'}
          </span>
          <Button
            onClick={() => submit.mutate()}
            disabled={
              submit.isPending ||
              reveal.isPending ||
              (!expired && !validAnswer(round, answer))
            }
          >
            {submit.isPending
              ? 'Saving…'
              : expired
                ? 'See answer'
                : 'Submit answer'}
            <ArrowRight size={17} />
          </Button>
        </div>
      )}
    </div>
  )
}
export default function Game({ results = false }: { results?: boolean }) {
  const { id = '' } = useParams()
  return <GameSession key={id} id={id} results={results} />
}

function GameSession({ id, results }: { id: string; results: boolean }) {
  const navigate = useNavigate(),
    client = useQueryClient(),
    reduced = useReducedMotion(),
    { hash } = useLocation()
  const [rotation, setRotation] = useState(0),
    [phase, setPhase] = useState<'ready' | 'selecting' | 'spinning' | 'landed'>(
      'ready',
    ),
    [fresh, setFresh] = useState<Round | null>(null),
    [advance, setAdvance] = useState(false),
    [endDialog, setEndDialog] = useState(false)
  const session = useQuery({
    queryKey: ['session', id],
    queryFn: () => play<Session>('session', { id }),
  })
  const refresh = () => {
    void session.refetch()
  }
  const onSpinComplete = useCallback(() => setPhase('landed'), [])
  useEffect(() => {
    if (phase !== 'landed') return
    const t = setTimeout(
      () => {
        setAdvance(false)
        setPhase('ready')
      },
      reduced ? 160 : 500,
    )
    return () => clearTimeout(t)
  }, [phase, reduced])
  const spin = useMutation({
    mutationFn: () => play<Round>('spin', { id }),
    onMutate: () => setPhase('selecting'),
    onSuccess: (r) => {
      setFresh(r)
      setRotation((angle) => spinToCategory(angle, r.kind))
      setPhase('spinning')
    },
    onError: () => setPhase('ready'),
  })
  const finish = useMutation({
    mutationFn: () => play<Session>('finish', { id }),
    onSuccess: (s) => {
      client.setQueryData(['session', id], s)
      refresh()
      navigate('/results/' + id)
    },
  })
  if (!session.data)
    return session.error ? (
      <ErrorBox error={message(session.error)} />
    ) : (
      <Loading />
    )
  const s = session.data,
    last = s.rounds.at(-1)
  if (results)
    return (
      <>
        <PageTitle
          eyebrow="SESSION REPORT"
          title={s.finished_at ? 'Session complete' : 'Results so far'}
          text={modeName(s.mode)}
        />
        <div className="panel result-summary">
          <Trophy size={32} />
          <div>
            <p>Total score</p>
            <strong>{number(s.total)}</strong>
          </div>
          <div>
            <p>Answered</p>
            <strong>{s.rounds.filter((r) => r.feedback).length}</strong>
          </div>
          <Link
            className={buttonStyle()}
            to={s.finished_at ? '/play' : '/play/session/' + id}
          >
            {s.finished_at ? 'Play again' : 'Resume session'}
          </Link>
        </div>
        <div className="stack results-list">
          {s.rounds
            .filter((r) => r.feedback)
            .map((r) => (
              <details
                id={'round-' + r.position}
                open={hash === '#round-' + r.position || undefined}
                key={r.id}
                className="panel"
                aria-label={'Round ' + r.position}
              >
                <summary>
                  <span className="badge">{r.kind.toUpperCase()}</span>
                  <strong>{r.prompt}</strong>
                  <span>{number(r.feedback!.score)} pts</span>
                </summary>
                <div>
                  <h3>{r.feedback!.solution.label}</h3>
                  <p>{r.feedback!.explanation}</p>
                  <SolutionDetails round={r} feedback={r.feedback!} />
                  <a
                    href={r.feedback!.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {r.feedback!.sourceTitle}
                  </a>
                </div>
              </details>
            ))}
          {!s.rounds.some((r) => r.feedback) && (
            <Empty
              title="No answers yet"
              text="Answer a round to see your results."
            />
          )}
        </div>
      </>
    )
  const spinning = phase !== 'ready'
  const selected = phase === 'landed' ? fresh?.kind : undefined
  const shown = spinning || advance ? null : (fresh ?? last)
  const latest = shown && last?.id === shown.id ? { ...shown, ...last } : shown
  const answered = s.rounds.filter((r) => r.feedback).length
  function next() {
    if (s.finished_at || (latest && s.target === latest.position)) {
      navigate('/results/' + id)
      return
    }
    setFresh(null)
    setAdvance(true)
  }
  return (
    <>
      <PageTitle
        title={modeName(s.mode)}
      >
        <div className="session-status">
          <span>
            <Zap size={17} />
            {number(s.total)} pts
          </span>
          <span>
            Round{' '}
            {Math.min(s.target ?? Infinity, latest?.position ?? answered + 1)}
            {s.target ? ' / ' + s.target : ''}
          </span>
        </div>
      </PageTitle>
      {latest ? (
        <RoundView
          key={latest.id}
          round={latest}
          id={id}
          refresh={refresh}
          onNext={next}
          nextLabel={
            s.finished_at || s.target === latest.position
              ? 'View results'
              : 'Next round'
          }
        />
      ) : (
        <div className="game-stage panel">
          <Wheel
            rotation={rotation}
            eligible={s.eligible}
            selected={selected}
            onSpinComplete={onSpinComplete}
          />
          <div>
            <h2 role="status">
              {selected
                ? categories.find((category) => category.kind === selected)
                    ?.label + ' selected'
                : phase === 'spinning'
                  ? 'Spinning…'
                  : phase === 'selecting'
                    ? 'Selecting a category…'
                    : 'Ready to spin?'}
            </h2>
            <p>
              {s.mode === 'assessment'
                ? 'Open the next question in this assessment.'
                : 'The wheel selects from available, verified questions.'}
            </p>
            {s.eligible.length < 6 && (
              <p className="muted">
                Dimmed categories have no questions for this session.
              </p>
            )}
            <Button
              disabled={spinning || spin.isPending || Boolean(s.finished_at)}
              onClick={() => spin.mutate()}
            >
              <Orbit size={19} />
              {spinning
                ? 'Spin in progress'
                : s.mode === 'assessment'
                  ? 'Open question'
                  : 'Spin the wheel'}
            </Button>
            {spin.error && <ErrorBox error={message(spin.error)} />}
          </div>
        </div>
      )}
      {s.mode === 'practice' && !spinning && (!latest || latest.feedback) && (
        <Button
          className="end-button"
          variant="outline"
          onClick={() => setEndDialog(true)}
        >
          End practice
        </Button>
      )}
      {endDialog && (
        <div className="dialog-backdrop">
          <FocusDialog
            title="End this practice session?"
            text="Your answers will be available in results."
            onClose={() => setEndDialog(false)}
            onConfirm={() => finish.mutate()}
            pending={finish.isPending}
            error={finish.error ? message(finish.error) : undefined}
          />
        </div>
      )}
    </>
  )
}
export function FocusDialog({
  title,
  text,
  onClose,
  onConfirm,
  pending,
  error,
}: {
  title: string
  text: string
  onClose: () => void
  onConfirm: () => void
  pending?: boolean
  error?: string
}) {
  return (
    <div
      className="panel dialog"
      role="alertdialog"
      aria-modal="true"
      aria-label={title}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose()
        if (e.key === 'Tab') {
          const buttons = Array.from(
            e.currentTarget.querySelectorAll<HTMLButtonElement>(
              'button:not(:disabled)',
            ),
          )
          const next =
            buttons[
              (buttons.indexOf(document.activeElement as HTMLButtonElement) +
                (e.shiftKey ? -1 : 1) +
                buttons.length) %
                buttons.length
            ]
          if (next) {
            e.preventDefault()
            next.focus()
          }
        }
      }}
    >
      <h2>{title}</h2>
      <p>{text}</p>
      {error && <ErrorBox error={error} />}
      <div className="row">
        <Button autoFocus variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button disabled={pending} onClick={onConfirm}>
          Confirm
        </Button>
      </div>
    </div>
  )
}
