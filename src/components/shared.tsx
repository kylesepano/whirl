import {
  AlertCircle,
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
import { motion, useReducedMotion } from 'motion/react'
import type { CSSProperties, ReactNode } from 'react'
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
    detail: 'Uncover the image',
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
export function Wheel({
  rotation = 0,
  eligible,
}: {
  rotation?: number
  eligible?: Kind[]
}) {
  const reduced = useReducedMotion()
  return (
    <div className="wheel-scene" aria-hidden="true">
      <div className="orbital orbit-a" />
      <div className="orbital orbit-b" />
      <div className="orbital orbit-c" />
      <i className="star star-a" />
      <i className="star star-b" />
      <i className="star star-c" />
      <i className="star star-d" />
      <div className="wheel-frame">
        <div className="wheel-pointer" />
        <motion.div
          className="wheel-face"
          animate={{ rotate: rotation }}
          transition={{
            duration: reduced ? 0 : 3.2,
            ease: [0.12, 0.66, 0.12, 1],
          }}
        >
          {categories.map(({ kind, label, color, icon: Icon }, i) => (
            <div
              key={kind}
              className={
                'slice ' +
                (eligible && !eligible.includes(kind) ? 'slice-off' : '')
              }
              style={
                {
                  '--angle': i * 60 + 'deg',
                  '--accent': color,
                } as CSSProperties
              }
            >
              <div>
                <Icon strokeWidth={1.8} />
                <span>{label}</span>
              </div>
            </div>
          ))}
        </motion.div>
        <div className="wheel-hub">
          <Orbit size={29} />
        </div>
      </div>
    </div>
  )
}
export function CategoryGrid() {
  return (
    <div className="category-grid">
      {categories.map(({ color, label, detail, icon: Icon }) => (
        <div
          className="category-card"
          key={label}
          style={{ '--accent': color } as CSSProperties}
        >
          <div className="icon-box">
            <Icon size={19} />
          </div>
          <strong>{label}</strong>
          <span>{detail}</span>
        </div>
      ))}
    </div>
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
