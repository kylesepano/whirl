import {
  AlertCircle,
  Check,
  Compass,
  MapPin,
  ScanLine,
  Timer,
  UserRound,
  Waypoints,
  ListOrdered,
  Sparkles,
  Orbit,
} from 'lucide-react'
import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from 'motion/react'
import { useEffect, type CSSProperties, type ReactNode } from 'react'
import type { Kind } from '../api'
export const categories = [
  {
    kind: 'who',
    label: 'WHO',
    name: 'Portraits',
    detail: 'Identify the person',
    color: '#b99aff',
    icon: UserRound,
  },
  {
    kind: 'where',
    label: 'WHERE',
    name: 'Geography',
    detail: 'Pin the location',
    color: '#5fe3df',
    icon: MapPin,
  },
  {
    kind: 'when',
    label: 'WHEN',
    name: 'Timelines',
    detail: 'Place it in history',
    color: '#8aa9ff',
    icon: Timer,
  },
  {
    kind: 'what',
    label: 'WHAT',
    name: 'Mysteries',
    detail: 'Solve a clue',
    color: '#f697d8',
    icon: ScanLine,
  },
  {
    kind: 'why',
    label: 'WHY',
    name: 'Cause & effect',
    detail: 'Connect the causes',
    color: '#f7bc80',
    icon: Waypoints,
  },
  {
    kind: 'how',
    label: 'HOW',
    name: 'Sequences',
    detail: 'Put steps in order',
    color: '#8ee9b3',
    icon: ListOrdered,
  },
] as const
type WheelCategory = (typeof categories)[number]

export function spinToCategory(
  rotation: number,
  kind: Kind,
  slices: readonly WheelCategory[] = categories,
) {
  const target = (-slices.findIndex((category) => category.kind === kind) * 360) / slices.length
  const remaining = (((target - rotation) % 360) + 360) % 360
  return rotation + 1440 + remaining
}

export function Wheel({
  rotation = 0,
  eligible,
  slices = categories,
  selected,
  onSpinComplete,
}: {
  rotation?: number
  eligible?: Kind[]
  slices?: readonly WheelCategory[]
  selected?: Kind
  onSpinComplete?: () => void
}) {
  const reduced = useReducedMotion()
  const sliceDegrees = 360 / slices.length
  const angle = useMotionValue(rotation)
  const upright = useTransform(angle, (value) => -value)
  useEffect(() => {
    if (angle.get() === rotation) return
    const animation = animate(angle, rotation, {
      duration: reduced ? 0 : 2.8,
      ease: [0.12, 0.66, 0.12, 1],
      onComplete: onSpinComplete,
    })
    return () => animation.stop()
  }, [angle, rotation, reduced, onSpinComplete])

  return (
    <div className="wheel-scene" aria-hidden="true">
      <div className="orbital orbit-a" />
      <div className="orbital orbit-b" />
      <div className="orbital orbit-c" />
      <i className="star star-a" />
      <i className="star star-b" />
      <i className="star star-c" />
      <i className="star star-d" />
      <div
        className="wheel-frame"
        style={
          { '--slice-size': sliceDegrees + 'deg', '--half-slice': sliceDegrees / 2 + 'deg' } as CSSProperties
        }
      >
        <div className="wheel-pointer" />
        <motion.div className="wheel-face" style={{ rotate: angle }}>
          {slices.map(({ kind, color }, i) => (
            <div
              key={kind}
              data-category={kind}
              className={
                'slice ' +
                (eligible && !eligible.includes(kind) ? 'slice-off ' : '') +
                (kind === selected ? 'slice-selected' : '')
              }
              style={
                {
                  '--angle': i * sliceDegrees + 'deg',
                  '--accent': color,
                } as CSSProperties
              }
            />
          ))}
          {slices.map(({ kind, label, color, icon: Icon }, i) => {
            const radians = (i * sliceDegrees * Math.PI) / 180
            return (
              <div
                className="wheel-label"
                key={kind}
                data-category={kind}
                style={{
                  left: 50 + 34 * Math.sin(radians) + '%',
                  top: 50 - 34 * Math.cos(radians) + '%',
                  color,
                  opacity: eligible && !eligible.includes(kind) ? 0.45 : 1,
                }}
              >
                <motion.div style={{ rotate: upright }}>
                  <Icon strokeWidth={1.8} />
                  <span>{label}</span>
                </motion.div>
              </div>
            )
          })}
        </motion.div>
        <div className="wheel-hub">
          <Orbit size={29} />
        </div>
      </div>
    </div>
  )
}
export function CategoryGrid({
  selected,
  onChange,
  disabled,
}: {
  selected: Kind[]
  onChange: (selected: Kind[]) => void
  disabled: boolean
}) {
  const all = selected.length === 0 || selected.length === categories.length
  return (
    <section className="category-picker" aria-labelledby="category-heading">
      <div className="category-picker-heading">
        <h2 id="category-heading">Question categories</h2>
        <div className="category-picker-actions">
          <span aria-live="polite">
            {!all && selected.length + ' selected'}
          </span>
          <button
            type="button"
            className="category-all"
            aria-pressed={all}
            onClick={() => onChange(categories.map(({ kind }) => kind))}
            disabled={disabled}
          >
            {all && <Check size={15} />}
            All categories
          </button>
        </div>
      </div>
      <div className="category-grid">
        {categories.map(({ color, kind, label, name, icon: Icon }) => {
          const active = selected.includes(kind)
          return (
            <button
              type="button"
              className="category-card"
              key={kind}
              style={{ '--accent': color } as CSSProperties}
              aria-pressed={active}
              aria-label={label + ' · ' + name}
              disabled={disabled}
              onClick={() => onChange(active ? selected.filter((item) => item !== kind) : [...selected, kind])}
            >
              <span className="category-card-top">
                <span className="icon-box"><Icon size={20} /></span>
                <span className="category-check" aria-hidden="true">
                  {active && <Check size={13} />}
                </span>
              </span>
              <strong>{label}</strong>
              <span>{name}</span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
export function PageTitle({
  eyebrow,
  title,
  text,
  children,
}: {
  eyebrow?: string
  title: string
  text?: string
  children?: ReactNode
}) {
  return (
    <div className="page-title">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {text && <p>{text}</p>}
      </div>
      {children}
    </div>
  )
}
export function Empty({
  title,
  text,
  children,
}: {
  title: string
  text: string
  children?: ReactNode
}) {
  return (
    <div className="empty panel">
      <Compass size={28} />
      <h3>{title}</h3>
      <p>{text}</p>
      {children}
    </div>
  )
}
export function ErrorBox({ error }: { error: string }) {
  return (
    <p className="error-box" role="alert">
      <AlertCircle size={17} />
      {error}
    </p>
  )
}
export function Loading() {
  return (
    <div role="status" aria-label="Loading" className="skeleton">
      <div />
      <div />
      <div />
    </div>
  )
}
