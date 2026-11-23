// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import {
  QuestionControls,
  initialAnswer,
} from '../src/components/QuestionControls'
import type { Round } from '../src/api'
import { formatHistoricalDate, parseHistoricalDate } from '../src/dates'
afterEach(cleanup)
const timeline: Round = {
  id: 'time',
  kind: 'when',
  prompt: 'When was it?',
  position: 1,
  topic: 'History',
  difficulty: 'standard',
  deadline: null,
  reveals: 0,
  feedback: null,
  display: { min: -150, max: 150 },
}
function Controls({ round }: { round: Round }) {
  const [answer, set] = useState(initialAnswer(round))
  return (
    <>
      <QuestionControls
        round={round}
        answer={answer}
        onChange={set}
        reveal={() => {}}
        revealing={false}
      />
      <output>{JSON.stringify(answer)}</output>
    </>
  )
}
it('can enter a BCE date with a keyboard-accessible year field', () => {
  render(<Controls round={timeline} />)
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Year' }), {
    target: { value: '44' },
  })
  expect(screen.getByRole('status').textContent).toEqual('-43')
})
it('reorders process cards using accessible move buttons', () => {
  render(
    <Controls
      round={{
        ...timeline,
        kind: 'how',
        display: {
          options: [
            { id: 'x', label: 'Start' },
            { id: 'y', label: 'Finish' },
          ],
        },
      }}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Move Finish up' }))
  expect(screen.getByRole('status').textContent).toEqual('["y","x"]')
})
it('converts exact dates and preserves Gregorian leap days', () => {
  const date = parseHistoricalDate('0001-02-29 BCE')
  expect(date).not.toBeNull()
  expect(formatHistoricalDate(date!)).toBe('Feb 29, 1 BCE')
  expect(parseHistoricalDate('1900-02-29 CE')).toBeNull()
})
