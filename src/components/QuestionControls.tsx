import { lazy, Suspense, useState } from 'react'
import {
  ChevronDown,
  ChevronUp,
  Eye,
  GripVertical,
  MapPin,
  Minus,
  Plus,
} from 'lucide-react'
import {
  number,
  yearLabel,
  type Feedback,
  type Option,
  type Round,
} from '../api'
import { formatHistoricalDate, parseHistoricalDate } from '../dates'
import type { Point } from '../MapGuess'
import type { CountryGuess } from '../CountryMapGuess'
import { countriesByCode } from '../CountrySelect'
import { Button } from './ui/button'
import { Loading } from './shared'

const MapGuess = lazy(() => import('../MapGuess'))
const CountryMapGuess = lazy(() => import('../CountryMapGuess'))
function optionText(options: Option[] | undefined, id: string) {
  return options?.find((o) => o.id === id)?.label ?? id
}
export const initialAnswer = (round: Round): unknown =>
  round.kind === 'how' || round.display.mechanic === 'chain'
    ? (round.display.options?.map((o) => o.id) ?? [])
    : round.kind === 'when'
      ? Math.round(((round.display.min ?? 0) + (round.display.max ?? 2026)) / 2)
      : null
export function validAnswer(round: Round, answer: unknown) {
  if (answer == null) return false
  if (round.kind === 'where') {
    if (round.display.mechanic === 'country') {
      return countriesByCode.has((answer as CountryGuess).country)
    }
    const { lat, lng } = answer as Point
    return (
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      Math.abs(lat) <= 90 &&
      Math.abs(lng) <= 180
    )
  }
  if (round.kind === 'when')
    return typeof answer === 'number' && Number.isFinite(answer)
  if (round.display.mechanic === 'matching')
    return (
      Object.values(answer as Record<string, string>).filter(Boolean).length ===
      (round.display.pairs?.length ?? 0)
    )
  if (Array.isArray(answer)) return answer.length > 0
  return typeof answer === 'string' && answer.trim().length > 0
}
function Timeline({
  round,
  value,
  onChange,
  feedback,
}: {
  round: Round
  value: number | null
  onChange: (answer: number | null) => void
  feedback?: Feedback | null
}) {
  const domainMin = round.display.min ?? -500,
    domainMax = round.display.max ?? 2026
  const [windowRange, setRange] = useState([domainMin, domainMax])
  const [typedDate, setTypedDate] = useState('')
  const [min, max] = feedback
    ? [
        Math.min(
          domainMin,
          feedback.solution.min ?? domainMin,
          value ?? domainMin,
        ),
        Math.max(
          domainMax,
          feedback.solution.max ?? domainMax,
          value ?? domainMax,
        ),
      ]
    : windowRange
  const active = Math.min(
    max,
    Math.max(min, value ?? Math.round((min + max) / 2)),
  )
  const exact = round.display.precision === 'day'
  const position = (y: number) => ((y - min) / (max - min)) * 100 + '%'
  const label = (year: number) => yearLabel(Math.floor(year))
  function zoom(inward: boolean) {
    const width = Math.min(
      domainMax - domainMin,
      Math.max(exact ? 1 : 10, Math.round((max - min) * (inward ? 0.45 : 2))),
    )
    const low = Math.min(
      domainMax - width,
      Math.max(domainMin, Math.round(active - width / 2)),
    )
    setRange([low, low + width])
  }
  return (
    <div className="timeline">
      <div className="timeline-top">
        <span>
          {value === null
            ? 'Choose a year'
            : exact
              ? formatHistoricalDate(value)
              : label(value)}
        </span>
        {!feedback && (
          <div>
            <Button
              variant="outline"
              size="small"
              aria-label="Zoom out"
              onClick={() => zoom(false)}
            >
              <Minus size={16} />
            </Button>
            <Button
              variant="outline"
              size="small"
              aria-label="Zoom in"
              onClick={() => zoom(true)}
            >
              <Plus size={16} />
            </Button>
          </div>
        )}
      </div>
      <div className="timeline-track">
        <input
          aria-label="Timeline year"
          aria-valuetext={exact ? formatHistoricalDate(active) : label(active)}
          type="range"
          min={min}
          max={max}
          step={exact ? 0.001 : 1}
          value={active}
          onChange={(e) => {
            setTypedDate('')
            onChange(+e.target.value)
          }}
          disabled={Boolean(feedback)}
        />
        {feedback?.solution.min !== undefined && (
          <span
            className="timeline-answer"
            style={{
              left: position(feedback.solution.min),
              width:
                Math.max(
                  1,
                  (100 *
                    ((feedback.solution.max ?? feedback.solution.min) -
                      feedback.solution.min)) /
                    (max - min),
                ) + '%',
            }}
          />
        )}
      </div>
      <div className="timeline-ticks">
        {[0, 0.25, 0.5, 0.75, 1].map((p) => (
          <span key={p}>{label(Math.round(min + (max - min) * p))}</span>
        ))}
      </div>
      {!feedback && exact && (
        <label className="year-input">
          Enter a date (YYYY-MM-DD CE or BCE)
          <input
            value={typedDate}
            onChange={(e) => {
              setTypedDate(e.target.value)
              onChange(parseHistoricalDate(e.target.value))
            }}
            placeholder="1969-07-20 CE"
          />
        </label>
      )}
      {!feedback && !exact && (
        <label className="year-input">
          Enter a year (use era)
          <div className="row">
            <input
              type="number"
              aria-label="Year"
              min={exact ? undefined : 1}
              step={exact ? 0.001 : 1}
              value={
                value === null
                  ? ''
                  : exact
                    ? value
                    : value >= 1
                      ? value
                      : 1 - value
              }
              onChange={(e) =>
                onChange(
                  e.target.value === ''
                    ? null
                    : exact
                      ? +e.target.value
                      : (value ?? 1) >= 1
                        ? +e.target.value
                        : 1 - +e.target.value,
                )
              }
            />
            {!exact && (
              <select
                aria-label="Era"
                value={(value ?? 1) <= 0 ? 'BCE' : 'CE'}
                onChange={(e) => {
                  const n = (value ?? 1) >= 1 ? (value ?? 1) : 1 - (value ?? 1)
                  onChange(e.target.value === 'BCE' ? 1 - n : n)
                }}
              >
                <option>CE</option>
                <option>BCE</option>
              </select>
            )}
          </div>
        </label>
      )}
    </div>
  )
}
function SortCards({
  options,
  ids,
  onChange,
  locked,
}: {
  options: Option[]
  ids: string[]
  onChange: (v: string[]) => void
  locked: boolean
}) {
  const drag = useState<number | null>(null),
    [dragged, setDragged] = drag
  function move(old: number, next: number) {
    if (locked || old === next || next < 0 || next >= ids.length) return
    const nextIds = [...ids]
    nextIds.splice(next, 0, nextIds.splice(old, 1)[0])
    onChange(nextIds)
  }
  return (
    <ol className="sort-list">
      {ids.map((id, i) => (
        <li
          key={id}
          className={dragged === i ? 'dragging' : ''}
          draggable={!locked}
          onDragStart={(e) => {
            e.dataTransfer.setData('text/plain', id)
            setDragged(i)
          }}
          onDragOver={(e) => {
            if (!locked) e.preventDefault()
          }}
          onDrop={(e) => {
            e.preventDefault()
            if (dragged !== null) move(dragged, i)
            setDragged(null)
          }}
          onDragEnd={() => setDragged(null)}
        >
          <span className="sort-index">{i + 1}</span>
          <GripVertical size={16} />
          <span>{optionText(options, id)}</span>
          {!locked && (
            <div className="sort-actions">
              <button
                aria-label={'Move ' + optionText(options, id) + ' up'}
                disabled={i === 0}
                onClick={() => move(i, i - 1)}
              >
                <ChevronUp size={16} />
              </button>
              <button
                aria-label={'Move ' + optionText(options, id) + ' down'}
                disabled={i === ids.length - 1}
                onClick={() => move(i, i + 1)}
              >
                <ChevronDown size={16} />
              </button>
            </div>
          )}
        </li>
      ))}
    </ol>
  )
}
export function QuestionControls({
  round,
  answer,
  onChange,
  feedback,
  reveal,
  revealing,
}: {
  round: Round
  answer: unknown
  onChange: (a: unknown) => void
  feedback?: Feedback | null
  reveal: () => void
  revealing: boolean
}) {
  const { display, kind } = round
  const locked = Boolean(feedback)
  const options = display.options ?? []
  const portraits = kind === 'who' && display.mechanic !== 'text'
  const imageClue = kind === 'what' && display.mechanic !== 'choice' && display.mechanic !== 'text'
  if (display.mechanic === 'text')
    return (
      <p className="muted">
        {locked && typeof answer === 'string'
          ? 'Your answer was ' + answer
          : 'This question is unavailable. Start a new game to continue.'}
      </p>
    )
  if (kind === 'where' && display.mechanic === 'country')
    return (
      <>
        {!locked && (
          <p className="control-hint">
            <MapPin size={15} /> Select a country on the map or from the list below.
          </p>
        )}
        <Suspense fallback={<Loading />}>
          <CountryMapGuess
            value={answer as CountryGuess | null}
            onChange={onChange}
            correct={feedback?.solution.country}
          />
        </Suspense>
      </>
    )
  if (kind === 'where')
    return (
      <>
        <p className="control-hint">
          <MapPin size={15} /> Place a pin on the world map or enter
          coordinates.
        </p>
        <Suspense fallback={<Loading />}>
          <MapGuess
            value={answer as Point | null}
            onChange={onChange}
            solution={feedback?.solution}
          />
        </Suspense>
      </>
    )
  if (kind === 'when')
    return (
      <Timeline
        round={round}
        value={answer as number | null}
        onChange={onChange}
        feedback={feedback}
      />
    )
  if (kind === 'how' || display.mechanic === 'chain')
    return (
      <>
        <p className="control-hint">
          {kind === 'how'
            ? 'Drag the cards or use the move buttons to set their order.'
            : 'Arrange the cards to show the chain of causes.'}
        </p>
        <SortCards
          options={options}
          ids={(answer as string[]) ?? []}
          onChange={onChange}
          locked={locked}
        />
      </>
    )
  if (kind === 'why' && display.mechanic === 'matching')
    return (
      <div className="match-grid">
        {display.pairs?.map((o) => (
          <label key={o.id}>
            {o.label}
            <select
              disabled={locked}
              value={(answer as Record<string, string> | null)?.[o.id] ?? ''}
              onChange={(e) =>
                onChange({
                  ...(answer as Record<string, string>),
                  [o.id]: e.target.value,
                })
              }
            >
              <option value="">Choose an explanation</option>
              {display.matches?.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
    )
  if (kind === 'why')
    return (
      <div className="stack">
        <p className="control-hint">
          Select all the evidence that supports the explanation.
        </p>
        {options.map((o) => (
          <label className="check-row" key={o.id}>
            <input
              type="checkbox"
              checked={(answer as string[] | null)?.includes(o.id) ?? false}
              disabled={locked}
              onChange={(e) =>
                onChange(
                  e.target.checked
                    ? [...((answer as string[]) ?? []), o.id]
                    : (answer as string[]).filter((id) => id !== o.id),
                )
              }
            />
            {o.label}
          </label>
        ))}
      </div>
    )
  return (
    <>
      {imageClue && (
        <>
          <div className="mystery-image">
            {display.image ? (
              <img
                src={display.image}
                alt="Mystery image"
                style={{
                  imageRendering: round.reveals < 2 ? 'pixelated' : 'auto',
                }}
              />
            ) : (
              <span>Image unavailable</span>
            )}
          </div>
          {!locked && (
            <div className="reveal-row">
              <span>
                Reveal {round.reveals + 1} of 4 · Up to{' '}
                {number(
                  Math.round(
                    (display.maxScore ?? 1000) * (1 - round.reveals * 0.2),
                  ),
                )}{' '}
                pts
              </span>
              <Button
                onClick={reveal}
                disabled={revealing || round.reveals >= 3}
                variant="outline"
                size="small"
              >
                <Eye size={16} /> Reveal more
              </Button>
            </div>
          )}
        </>
      )}
      {options.length > 0 && (
        <div className={'options ' + (portraits ? 'portraits' : '')}>
          {options.map((o, i) => {
            const selected = answer === o.id
            const right = feedback?.solution.correct === o.id
            return (
              <button
                key={o.id}
                type="button"
                aria-pressed={selected}
                disabled={locked}
                className={
                  'option ' +
                  (selected ? 'selected ' : '') +
                  (right ? 'correct' : '')
                }
                onClick={() => onChange(o.id)}
              >
                {portraits && (
                  <div className="portrait-image">
                    <img
                      src={o.image}
                      alt=""
                      draggable={false}
                      onLoad={({ currentTarget: img }) => {
                        img.hidden = false
                        img.classList.toggle('portrait-tall', img.naturalHeight > img.naturalWidth * 1.18)
                      }}
                      onError={({ currentTarget: img }) => {
                        img.hidden = true
                      }}
                    />
                    <span className="portrait-unavailable">Image unavailable</span>
                  </div>
                )}
                <span>
                  <b>{String.fromCharCode(65 + i)}</b>
                  {portraits
                    ? locked
                      ? (feedback?.solution.credits?.find((c) => c.id === o.id)
                          ?.subject ?? 'Portrait ' + (i + 1))
                      : 'Portrait ' + (i + 1)
                    : o.label}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </>
  )
}
export function SolutionDetails({
  round,
  feedback,
}: {
  round: Round
  feedback: Feedback
}) {
  const key = feedback.solution.correct
  return (
    <>
      {round.kind === 'when' && feedback.difference !== undefined && (
        <p className="muted">
          Your guess was{' '}
          {feedback.difference.toFixed(feedback.difference % 1 ? 2 : 0)}{' '}
          {feedback.difference === 1 ? 'year' : 'years'} from the accepted
          range.
        </p>
      )}
      {round.kind === 'where' && feedback.difference !== undefined && (
        <p className="muted">
          {number(Math.round(feedback.difference))} km from the target.
        </p>
      )}
      {Array.isArray(key) && (
        <ol className="solution-list">
          {key.map((id) => (
            <li key={id}>{optionText(round.display.options, id)}</li>
          ))}
        </ol>
      )}
      {key && typeof key === 'object' && !Array.isArray(key) && (
        <ul className="solution-list">
          {Object.entries(key).map(([k, v]) => (
            <li key={k}>
              {optionText(round.display.pairs, k)} →{' '}
              {optionText(round.display.matches, v)}
            </li>
          ))}
        </ul>
      )}
      {feedback.solution.credits?.map((c) => (
        <p className="credit" key={c.url}>
          <a href={c.url} target="_blank" rel="noreferrer">
            {c.subject ?? c.artist}
          </a>{' '}
          · {c.license}
        </p>
      ))}
    </>
  )
}
