import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { FileQuestion } from 'lucide-react'
import {
  message,
  supabase,
  useWork,
  work,
  type Display,
  type Feedback,
  type Kind,
  type Question,
  type Round,
} from './api'
import {
  categories,
  Empty,
  ErrorBox,
  Loading,
  PageTitle,
} from './components/shared'
import {
  initialAnswer,
  QuestionControls,
  SolutionDetails,
  validAnswer,
} from './components/QuestionControls'
import { Button } from './components/ui/button'
import { FocusDialog } from './Game'
import type { Point } from './MapGuess'
import { CountrySelect, countriesByCode } from './CountrySelect'
const MapPicker = lazy(() => import('./MapGuess'))
export default function Staff() {
  return (
    <>
      <PageTitle title="Question bank" text="Add, edit, and publish questions for WHIRL." />
      <QuestionManager />
    </>
  )
}
function Media() {
  const [url, setUrl] = useState('')
  const upload = useMutation({
    mutationFn: async (file: File) => {
      if (!supabase)
        throw new Error('Connect Supabase Storage to upload media.')
      const ext = (
        {
          'image/jpeg': 'jpg',
          'image/png': 'png',
          'image/webp': 'webp',
          'image/avif': 'avif',
        } as Record<string, string>
      )[file.type]
      if (!ext || file.size > 5_000_000)
        throw new Error('Choose a JPEG, PNG, WebP, or AVIF under 5 MB.')
      const path = crypto.randomUUID() + '.' + ext
      const { error } = await supabase.storage
        .from('question-media')
        .upload(path, file, { contentType: file.type })
      if (error) throw new Error(error.message)
      return supabase.storage.from('question-media').getPublicUrl(path).data
        .publicUrl
    },
    onSuccess: setUrl,
  })
  return (
    <div className="panel padded stack">
      <h2>Question media</h2>
      <p className="muted">
        Upload an image with documented reuse rights. Copy its URL into a
        question and add the source, creator, and license in the editor.
      </p>
      {supabase ? (
        <label>
          Image file
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif"
            disabled={upload.isPending}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) upload.mutate(file)
            }}
          />
        </label>
      ) : (
        <p className="muted">
          The local demo includes NASA images. Uploading requires a connected
          Supabase Storage bucket.
        </p>
      )}
      {upload.error && <ErrorBox error={message(upload.error)} />}{' '}
      {url && (
        <label>
          Asset URL
          <input readOnly value={url} onFocus={(e) => e.target.select()} />
        </label>
      )}
    </div>
  )
}
type EditorRecord = {
  id: string
  kind: Kind
  prompt: string
  difficulty: string
  presentation: Display
  solution: Record<string, unknown>
  explanation: string
  source_url: string
  source_title: string
  status: string
  topic: { title: string; subject: string }
  warnings: string[]
}
function QuestionManager() {
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const queue = status === 'review'
  const [active, setActive] = useState<string | null>(null),
    [offset, setOffset] = useState(0),
    [notice, setNotice] = useState('')
  const finishEditing = (id: string | null) => {
    setNotice(id === null ? 'Question deleted.' : '')
    setActive(id)
  }
  const q = useWork<Question[]>('editor_list', {
    status: status || undefined,
    search,
    offset,
  })
  const record = useWork<EditorRecord>(
    'editor_get',
    { question: active },
    Boolean(active && active !== 'new'),
  )
  const reports = useWork<{ id: string; prompt: string; reason: string }[]>(
    'reports',
    {},
    queue,
  )
  return (
    <div className="detail-grid">
      <div className="panel padded stack">
        <div className="row">
          <Button variant="outline" size="small" onClick={() => finishEditing('new')}>
            <FileQuestion size={16} /> New question
          </Button>
        </div>
        <label>
          Search questions
          <input value={search} maxLength={100} onChange={(event) => {
            setSearch(event.target.value)
            setOffset(0)
          }} />
        </label>
        <label>
          Status
          <select value={status} onChange={(event) => {
            setStatus(event.target.value)
            setOffset(0)
          }}>
            <option value="">All questions</option>
            <option value="published">Published</option>
            <option value="review">Pending review</option>
            <option value="rejected">Rejected</option>
          </select>
        </label>
        {notice && (
          <p className="success" role="status">
            {notice}
          </p>
        )}
        {q.isPending ? (
          <Loading />
        ) : q.error ? (
          <ErrorBox error={message(q.error)} />
        ) : q.data.length ? (
          q.data.map((r) => (
            <button
              type="button"
              key={r.id}
              className="staff-row"
              style={{ textAlign: 'left' }}
              onClick={() => finishEditing(r.id)}
            >
              <div>
                <strong>{r.prompt}</strong>
                <p>{r.title}</p>
              </div>
              <span className="badge">{r.status}</span>
            </button>
          ))
        ) : (
          <p className="muted">No variants in this view.</p>
        )}
        <div className="row">
          <Button
            variant="outline"
            size="small"
            disabled={!offset}
            onClick={() => setOffset(offset - 24)}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="small"
            disabled={q.data?.length !== 24}
            onClick={() => setOffset(offset + 24)}
          >
            Next
          </Button>
        </div>
        {queue && (
          <>
            <h3>Player reports</h3>
            {reports.data?.length ? (
              reports.data.map((r) => (
                <div key={r.id} className="staff-row">
                  <div>
                    <strong>{r.prompt}</strong>
                    <p>{r.reason}</p>
                  </div>
                </div>
              ))
            ) : (
              <p className="muted">No reports submitted.</p>
            )}
          </>
        )}
      </div>
      {active === 'new' ? (
        <QuestionEditor key="new" onSaved={finishEditing} />
      ) : active ? (
        record.isPending ? (
          <Loading />
        ) : record.error ? (
          <ErrorBox error={message(record.error)} />
        ) : (
          <QuestionEditor
            key={record.data.id}
            record={record.data}
            onSaved={finishEditing}
          />
        )
      ) : (
        <Empty
          title="Select a question"
          text="Review question details and source references before publishing."
        />
      )}
    </div>
  )
}
function QuestionEditor({
  record,
  onSaved,
}: {
  record?: EditorRecord
  onSaved: (id: string | null) => void
}) {
  const [kind, setKind] = useState<Kind>(record?.kind ?? 'when')
  const [mechanic, setMechanic] = useState(
    record?.kind === 'why'
      ? (record.presentation.mechanic ?? 'evidence')
      : 'evidence',
  )
  const [typed, setTyped] = useState(Boolean(record?.solution.aliases))
  const [textOnly, setTextOnly] = useState(
    record?.presentation.mechanic === 'text',
  )
  const textClue = textOnly && (kind === 'who' || kind === 'what')
  const [whereMode, setWhereMode] = useState(
    record?.presentation.mechanic === 'country' ? 'country' : 'pin',
  )
  const countryQuestion = kind === 'where' && whereMode === 'country'
  const [preview, setPreview] = useState<Round | null>(null),
    [answer, setAnswer] = useState<unknown>()
  const [previewFeedback, setPreviewFeedback] = useState<Feedback | null>(null)
  const [showMap, setShowMap] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)
  const [lat, setLat] = useState(String(record?.solution.lat ?? '')),
    [lng, setLng] = useState(String(record?.solution.lng ?? ''))
  const [warnings, setWarnings] = useState<string[] | null>(
      record?.warnings ?? null,
    ),
    [notice, setNotice] = useState(''),
    [error, setError] = useState('')
  const [confirmation, setConfirmation] = useState<
    'publish' | 'reject' | 'delete' | null
  >(null)
  const [dirty, setDirty] = useState(false)
  const client = useQueryClient()
  const existing = record?.kind === kind ? record : undefined
  const existingOptions = existing?.presentation.options ?? []
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    setPreview(null)
    setWarnings(record?.warnings ?? null)
    setNotice('')
    setError('')
    setDirty(false)
  }, [record?.id])
  const invalidate = () => void client.invalidateQueries({ queryKey: ['work'] })
  function formValues(form: HTMLFormElement) {
    const fd = new FormData(form),
      str = (key: string) => String(fd.get(key) ?? '').trim(),
      num = (key: string) => (str(key) === '' ? undefined : Number(str(key)))
    const lines = (key: string) =>
      str(key)
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean)
    const options = (key: string) =>
      lines(key).map((label, i) => ({ label, id: 'opt-' + (i + 1) }))
    const credits = () => JSON.parse(str('credits') || '[]')
    const display: Display = {
      seconds: num('seconds'),
      maxScore: num('maxScore'),
    }
    const solution: Record<string, unknown> = {
      label: str('label'),
      multiplier: num('multiplier'),
    }
    if (kind === 'when') {
      Object.assign(display, {
        min: num('domainMin'),
        max: num('domainMax'),
        precision: str('precision'),
      })
      Object.assign(solution, {
        min: num('min'),
        max: num('max') ?? num('min'),
        scale: num('scale'),
        precision: str('precision'),
      })
    } else if (countryQuestion) {
      const code = str('country')
      display.mechanic = 'country'
      solution.country = code
      solution.label = countriesByCode.get(code)?.name
    } else if (kind === 'where') {
      Object.assign(solution, {
        lat: num('lat'),
        lng: num('lng'),
        scale: num('scale'),
        ...(str('polygon') ? { polygon: JSON.parse(str('polygon')) } : {}),
      })
    } else if (textClue) {
      display.mechanic = 'text'
      solution.aliases = lines('aliases')
    } else if (kind === 'who') {
      display.options = lines('options').map((image, i) => ({
        image,
        id: 'opt-' + (i + 1),
      }))
      solution.correct = 'opt-' + num('correct')
      solution.credits = credits().map(
        (c: Record<string, unknown>, i: number) => ({
          ...c,
          id: display.options?.[i]?.id,
          image: display.options?.[i]?.image,
        }),
      )
    } else if (kind === 'what') {
      display.images = lines('images')
      solution.credits = credits()
      if (typed) solution.aliases = lines('aliases')
      else {
        display.options = options('options')
        solution.correct = 'opt-' + num('correct')
      }
    } else if (kind === 'why' && mechanic === 'matching') {
      display.pairs = options('pairs')
      display.matches = options('matches')
      display.mechanic = mechanic
      const indices = str('correct')
        .split(',')
        .map((s) => Number(s.trim()))
      Object.assign(solution, {
        mechanic,
        correct: Object.fromEntries(
          display.pairs.map((o, i) => [o.id, 'opt-' + indices[i]]),
        ),
      })
    } else {
      display.options = options('options')
      const order =
        kind === 'how'
          ? display.options.map((o) => o.id)
          : str('correct')
              .split(',')
              .map((s) => 'opt-' + Number(s.trim()))
      if (kind === 'why') {
        display.mechanic = mechanic
        solution.mechanic = mechanic
      }
      solution.correct = order
    }
    return {
      question: record?.id,
      kind,
      title: str('title'),
      subject: str('subject'),
      prompt: str('prompt'),
      difficulty: str('difficulty'),
      explanation: str('explanation'),
      source_url: str('source_url'),
      source_title: str('source_title'),
      presentation: display,
      solution,
    }
  }
  async function handle(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setBusy(true)
    setError('')
    setNotice('')
    const action = (e.nativeEvent as SubmitEvent).submitter?.getAttribute(
      'value',
    )
    try {
      const p = formValues(e.currentTarget)
      if (action === 'preview') {
        const r: Round = {
          id: crypto.randomUUID(),
          kind,
          prompt: p.prompt,
          position: 1,
          topic: p.subject,
          difficulty: p.difficulty,
          deadline: null,
          reveals: 0,
          feedback: null,
          display: {
            ...p.presentation,
            image: p.presentation.images?.[0],
            options:
              kind === 'how'
                ? [...(p.presentation.options ?? [])].reverse()
                : p.presentation.options,
          },
        }
        setPreview(r)
        setAnswer(initialAnswer(r))
        setPreviewFeedback(null)
      } else if (action === 'validate') {
        const result = await work<string[]>('validate', p)
        setWarnings(result)
        setNotice(
          result.length
            ? 'Validation found issues.'
            : 'Structure checks passed. Check the source and media rights before publishing.',
        )
      } else {
        const result = await work<{ id: string; warnings: string[] }>(
          'save_question',
          p,
        )
        setWarnings(result.warnings)
        setDirty(false)
        setNotice('Saved to the review queue.')
        invalidate()
        onSaved(result.id)
      }
    } catch (e) {
      setError(message(e))
    } finally {
      setBusy(false)
    }
  }
  async function scorePreview() {
    if (!formRef.current || !preview) return
    setBusy(true)
    setError('')
    try {
      const data = await work<Feedback>('preview_score', {
        ...formValues(formRef.current),
        answer,
        reveals: preview.reveals,
      })
      setPreviewFeedback(data)
    } catch (e) {
      setError(message(e))
    } finally {
      setBusy(false)
    }
  }
  const review = useMutation({
    mutationFn: (decision: string) =>
      work(decision === 'delete' ? 'delete_question' : 'review', {
        question: record?.id,
        decision,
        confirm: true,
      }),
    onSuccess: (_, decision) => {
      if (decision === 'delete') onSaved(null)
      setConfirmation(null)
      invalidate()
      setNotice('Review decision saved.')
    },
  })
  const field = (
    name: string,
    label: string,
    value: unknown = '',
    type = 'text',
    required = false,
  ) => (
    <label>
      {label}
      <input
        name={name}
        type={type}
        step={type === 'number' ? 'any' : undefined}
        defaultValue={String(value ?? '')}
        required={required}
      />
    </label>
  )
  const area = (
    name: string,
    label: string,
    value: unknown = '',
    required = false,
  ) => (
    <label>
      {label}
      <textarea
        name={name}
        defaultValue={String(value ?? '')}
        required={required}
      />
    </label>
  )
  const oldOrder = existing?.solution.correct as string[] | undefined
  const cardLabels = (
    kind === 'how' && Array.isArray(oldOrder)
      ? oldOrder.map((id) => existingOptions.find((o) => o.id === id))
      : existingOptions
  )
    .map((o) => (kind === 'who' ? o?.image : o?.label))
    .join('\n')
  const indices = (value: unknown) =>
    (Array.isArray(value) ? value : [value])
      .map((v) => existingOptions.findIndex((o) => o.id === v) + 1)
      .join(',')
  return (
    <div className="stack">
      <form
        ref={formRef}
        className="panel padded stack"
        onSubmit={handle}
        onChange={() => {
          setDirty(true)
          setPreview(null)
        }}
      >
        <h2>{record ? 'Edit variant' : 'New variant'}</h2>
        <div className="form-grid">
          {field('title', 'Topic title', record?.topic.title, 'text', true)}
          {field('subject', 'Subject', record?.topic.subject, 'text', true)}
          <label>
            Question type
            <select
              value={kind}
              onChange={(e) => {
                setKind(e.target.value as Kind)
                setPreview(null)
              }}
            >
              {categories.map((c) => (
                <option value={c.kind} key={c.kind}>
                  {c.label} · {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Difficulty
            <select
              name="difficulty"
              defaultValue={record?.difficulty ?? 'standard'}
            >
              <option>easy</option>
              <option>standard</option>
              <option>hard</option>
            </select>
          </label>
        </div>
        {area('prompt', 'Question prompt', record?.prompt, true)}
        <div className="stack" key={kind}>
          {(kind === 'who' || kind === 'what') && !textClue && (
            <details>
              <summary>Upload question media</summary>
              <Media />
            </details>
          )}
          {!countryQuestion && field(
            'label',
            'Correct answer label',
            existing?.solution.label,
            'text',
            true,
          )}
          {kind === 'where' && (
            <label>
              Map answer type
              <select value={whereMode} onChange={(e) => setWhereMode(e.target.value)}>
                <option value="pin">Map pin</option>
                <option value="country">Select a country</option>
              </select>
            </label>
          )}
          {countryQuestion && (
            <label>
              Correct country
              <CountrySelect name="country" defaultValue={String(existing?.solution.country ?? '')} required />
            </label>
          )}
          {kind === 'where' && !countryQuestion && (
            <>
              <div className="form-grid">
                <label>
                  Target latitude
                  <input
                    name="lat"
                    type="number"
                    min="-90"
                    max="90"
                    step="any"
                    value={lat}
                    onChange={(e) => setLat(e.target.value)}
                    required
                  />
                </label>
                <label>
                  Target longitude
                  <input
                    name="lng"
                    type="number"
                    min="-180"
                    max="180"
                    step="any"
                    value={lng}
                    onChange={(e) => setLng(e.target.value)}
                    required
                  />
                </label>
                {field(
                  'scale',
                  'Tolerance in km',
                  existing?.solution.scale ?? 500,
                  'number',
                  true,
                )}
              </div>
              <div>
                <Button
                  type="button"
                  size="small"
                  variant="outline"
                  onClick={() => setShowMap(!showMap)}
                >
                  {showMap ? 'Hide map' : 'Pick a location on the map'}
                </Button>
              </div>
              {showMap && (
                <Suspense fallback={<Loading />}>
                  <MapPicker
                    value={
                      lat &&
                      lng &&
                      Math.abs(+lat) <= 90 &&
                      Math.abs(+lng) <= 180
                        ? { lat: +lat, lng: +lng }
                        : null
                    }
                    onChange={(p: Point | null) => {
                      setLat(p ? String(p.lat) : '')
                      setLng(p ? String(p.lng) : '')
                      setDirty(true)
                      setPreview(null)
                    }}
                  />
                </Suspense>
              )}
              {area(
                'polygon',
                'Optional polygon as longitude and latitude pairs',
                existing?.solution.polygon
                  ? JSON.stringify(existing.solution.polygon)
                  : '',
              )}
            </>
          )}
          {kind === 'when' && (
            <>
              <div className="form-grid">
                {field(
                  'min',
                  'Earliest accepted astronomical year',
                  existing?.solution.min,
                  'number',
                  true,
                )}
                {field(
                  'max',
                  'Latest accepted year (optional)',
                  existing?.solution.max,
                  'number',
                )}
                {field(
                  'domainMin',
                  'Timeline start',
                  existing?.presentation.min ?? 1500,
                  'number',
                  true,
                )}
                {field(
                  'domainMax',
                  'Timeline end',
                  existing?.presentation.max ?? 2026,
                  'number',
                  true,
                )}
                {field(
                  'scale',
                  'Tolerance in years',
                  existing?.solution.scale ?? 15,
                  'number',
                  true,
                )}
                <label>
                  Precision
                  <select
                    name="precision"
                    defaultValue={
                      (existing?.solution.precision as string) ?? 'year'
                    }
                  >
                    {['year', 'day', 'decade', 'century', 'range'].map((p) => (
                      <option key={p}>{p}</option>
                    ))}
                  </select>
                </label>
              </div>
              <p className="mini-help">
                Use 0 for 1 BCE and −1 for 2 BCE. Exact dates use a fractional
                astronomical year.
              </p>
            </>
          )}
          {kind === 'why' && (
            <label>
              Reasoning mechanic
              <select
                value={mechanic}
                onChange={(e) => setMechanic(e.target.value as typeof mechanic)}
              >
                <option value="evidence">Evidence selection</option>
                <option value="matching">Cause matching</option>
                <option value="chain">Causal chain</option>
              </select>
            </label>
          )}
          {(kind === 'who' || kind === 'what') && (
            <label className="check-row">
              <input
                type="checkbox"
                checked={textOnly}
                onChange={(e) => setTextOnly(e.target.checked)}
              />
              Text clue
            </label>
          )}
          {textClue &&
            area(
              'aliases',
              'Accepted answers (one per line)',
              (existing?.solution.aliases as string[] | undefined)?.join('\n'),
              true,
            )}
          {kind === 'what' && !textClue && (
            <>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={typed}
                  onChange={(e) => setTyped(e.target.checked)}
                />{' '}
                Accept typed aliases
              </label>
              {area(
                'images',
                'Image stage URLs, least to most revealed (one per line)',
                existing?.presentation.images?.join('\n'),
                true,
              )}
              {typed &&
                area(
                  'aliases',
                  'Accepted aliases (one per line)',
                  (existing?.solution.aliases as string[] | undefined)?.join(
                    '\n',
                  ),
                  true,
                )}
            </>
          )}
          {kind === 'why' && mechanic === 'matching' ? (
            <div className="stack" key="matching">
              {area(
                'pairs',
                'Observations (one per line)',
                existing?.presentation.pairs?.map((o) => o.label).join('\n'),
                true,
              )}
              {area(
                'matches',
                'Explanations (one per line)',
                existing?.presentation.matches?.map((o) => o.label).join('\n'),
                true,
              )}
              {field(
                'correct',
                'Correct explanation positions, in observation order',
                existing?.presentation.pairs
                  ?.map(
                    (o) =>
                      (existing.presentation.matches?.findIndex(
                        (m) =>
                          m.id ===
                          (
                            existing.solution.correct as Record<string, string>
                          )?.[o.id],
                      ) ?? -1) + 1,
                  )
                  .join(','),
                'text',
                true,
              )}
            </div>
          ) : (
            !textClue &&
            (kind === 'who' ||
              kind === 'how' ||
              kind === 'why' ||
              (kind === 'what' && !typed)) && (
              <div className="stack" key="cards">
                {area(
                  'options',
                  kind === 'who'
                    ? 'Opaque portrait URLs (one per line)'
                    : kind === 'how'
                      ? 'Steps in correct order (one per line)'
                      : 'Answer cards (one per line)',
                  cardLabels,
                  true,
                )}
                {kind !== 'how' &&
                  field(
                    'correct',
                    kind === 'why'
                      ? 'Correct card positions (comma separated)'
                      : 'Correct card position (1–4)',
                    indices(existing?.solution.correct) === '0'
                      ? ''
                      : indices(existing?.solution.correct),
                    'text',
                    true,
                  )}
              </div>
            )
          )}
          {!textClue && (kind === 'who' || kind === 'what') && (
            <>
              {area(
                'credits',
                'Media credits as JSON',
                JSON.stringify(existing?.solution.credits ?? [], null, 2),
                true,
              )}
              <p className="mini-help">
                Include artist, url, and license for each asset. WHO also needs
                subject and medium, in the same order as the portraits.
              </p>
            </>
          )}
        </div>
        <div className="form-grid">
          {field(
            'seconds',
            'Optional time limit (seconds)',
            record?.presentation.seconds,
            'number',
          )}
          {field(
            'maxScore',
            'Maximum points',
            record?.presentation.maxScore ?? 1000,
            'number',
          )}
          {field(
            'multiplier',
            'Difficulty multiplier',
            record?.solution.multiplier ?? 1,
            'number',
          )}
        </div>
        {area('explanation', 'Explanation', record?.explanation, true)}
        <div className="form-grid">
          {field(
            'source_title',
            'Source title',
            record?.source_title,
            'text',
            true,
          )}
          {field('source_url', 'Source URL', record?.source_url, 'url', true)}
        </div>
        {error && <ErrorBox error={error} />}{' '}
        {warnings && warnings.length > 0 && (
          <ul className="solution-list" role="status">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        )}
        {notice && (
          <p className="success" role="status">
            {notice}
          </p>
        )}
        <div className="row wrap">
          <Button value="save" disabled={busy}>
            Save for review
          </Button>
          <Button value="validate" variant="outline" disabled={busy}>
            Validate
          </Button>
          <Button value="preview" variant="outline" disabled={busy}>
            Play preview
          </Button>
        </div>
        {record && (
          <div className="row wrap">
            <span className="badge">{record.status}</span>
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmation('publish')}
              disabled={dirty || record.status === 'published'}
            >
              Publish
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setConfirmation('reject')}
              disabled={dirty || record.status === 'rejected'}
            >
              Reject
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmation('delete')}
              disabled={busy}
            >
              Delete question
            </Button>
          </div>
        )}
      </form>
      {preview && (
        <div className="preview-panel question panel" key={preview.id}>
          <span className="badge">Preview</span>
          <h2>{preview.prompt}</h2>
          <QuestionControls
            round={preview}
            answer={answer}
            onChange={setAnswer}
            feedback={previewFeedback}
            revealing={false}
            reveal={() => {
              const next = Math.min(3, preview.reveals + 1)
              setPreview({
                ...preview,
                reveals: next,
                display: {
                  ...preview.display,
                  image: preview.display.images?.[next],
                },
              })
            }}
          />
          {previewFeedback ? (
            <div className="feedback">
              <strong>
                {previewFeedback.solution.label} · {previewFeedback.score} pts
              </strong>
              <p>{previewFeedback.explanation}</p>
              <SolutionDetails round={preview} feedback={previewFeedback} />
            </div>
          ) : (
            <div className="question-foot">
              <Button
                disabled={busy || !validAnswer(preview, answer)}
                onClick={scorePreview}
              >
                Score preview
              </Button>
            </div>
          )}
        </div>
      )}
      {confirmation && (
        <div className="dialog-backdrop">
          <FocusDialog
            title={
              confirmation === 'delete'
                ? 'Delete this question?'
                : confirmation === 'publish'
                  ? 'Publish this question?'
                  : 'Reject this question?'
            }
            text={
              confirmation === 'delete'
                ? 'This removes the question from the bank and future spins. Saved results will still be available.'
                : confirmation === 'publish'
                  ? 'Confirm that you checked the answer, explanation, citations, and applicable media rights.'
                  : 'This question will be removed from the playable pool.'
            }
            onClose={() => {
              review.reset()
              setConfirmation(null)
            }}
            onConfirm={() => review.mutate(confirmation)}
            pending={review.isPending}
            error={review.error ? message(review.error) : undefined}
          />
        </div>
      )}
    </div>
  )
}
