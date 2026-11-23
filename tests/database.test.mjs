import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { openLocal, rpc } from '../scripts/local-db.mjs'
import { commitPage, makeCandidate } from '../scripts/import.mjs'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { selectPortraits } from '../scripts/portraits.mjs'
let db, guest, other, admin
async function user(role) {
  const { id } = (
    await db.query('insert into auth.users default values returning id')
  ).rows[0]
  if (role)
    await db.query('update public.profiles set role=$1 where id=$2', [role, id])
  return id
}
beforeAll(async () => {
  db = await openLocal()
  guest = await user()
  other = await user()
  admin = await user('admin')
})
afterAll(async () => {
  await db?.close()
})
const game = (action, p, who = guest) => rpc(db, who, 'play', action, p)
const work = (action, p, who = guest) => rpc(db, who, 'workspace', action, p)
const score = async (kind, solution, answer, reveals = 0) =>
  (
    await db.query('select public.whirl_score($1,$2,$3,$4) as result', [
      kind,
      JSON.stringify(solution),
      JSON.stringify(answer),
      reveals,
    ])
  ).rows[0].result
const question = {
  kind: 'when',
  title: 'A sourced test draft',
  subject: 'History',
  prompt: 'In which year did this test example take place?',
  difficulty: 'standard',
  presentation: { min: 1500, max: 2000, precision: 'year' },
  solution: {
    min: 1700,
    max: 1700,
    precision: 'year',
    scale: 15,
    label: '1700 CE',
  },
  explanation: 'A review test fixture to exercise authorization.',
  source_title: 'Library of Congress',
  source_url: 'https://loc.gov/',
}
describe('authorization and publication', () => {
  it('requires a session owner for play and rejects guest admin actions', async () => {
    await expect(game('start', { mode: 'quick' }, null)).rejects.toThrow()
    await expect(work('admin_stats', {})).rejects.toThrow('Administrator')
    await expect(work('save_question', { ...question, role: 'admin' }, guest)).rejects.toThrow(
      'Administrator',
    )
    await expect(work('delete_question', {}, other)).rejects.toThrow(
      'Administrator',
    )
    await expect(
      db.transaction(async (tx) => {
        await tx.exec('set local role authenticated')
        await tx.query(
          "select public.whirl_workspace_internal('admin_stats', '{}')",
        )
      }),
    ).rejects.toThrow('permission denied')
  })
  it('blocks direct answer key access with the API roles', async () => {
    await expect(
      db.transaction(async (tx) => {
        await tx.exec('set local role authenticated')
        await tx.query('select solution from public.questions')
      }),
    ).rejects.toThrow('permission denied')
    const browse = await work('browse', {}, null)
    expect(browse).toHaveLength(21)
    expect(JSON.stringify(browse)).not.toMatch(/solution|verified_at|credits/)
  })
  it('blocks incomplete and unconfirmed publication, then publishes verified records', async () => {
    const draft = await work(
      'save_question',
      { ...question, source_url: '' },
      admin,
    )
    expect(draft.warnings).toContain('Add a source title and HTTPS link.')
    await expect(
      work(
        'review',
        { question: draft.id, decision: 'publish', confirm: true },
        admin,
      ),
    ).rejects.toThrow('HTTPS')
    await expect(
      work('editor_get', { question: draft.id }, other),
    ).rejects.toThrow('Administrator')
    await work('save_question', { ...question, question: draft.id }, admin)
    await expect(
      work('review', { question: draft.id, decision: 'publish' }, admin),
    ).rejects.toThrow('Confirm')
    await work(
      'review',
      { question: draft.id, decision: 'publish', confirm: true },
      admin,
    )
    await expect(
      work('editor_get', { question: draft.id }, guest),
    ).rejects.toThrow('Administrator')
    await work('review', { question: draft.id, decision: 'reject' }, admin)
  })
  it('validates all published starter questions', async () => {
    const { rows } = await db.query(
      "select prompt,public.whirl_validate(kind,presentation,solution,explanation,source_url,source_title) warnings from public.questions where status='published'",
    )
    expect(rows.filter((q) => q.warnings.length)).toEqual([])
  })
  it('deletes a published variant without losing a round or preventing a replacement', async () => {
    const fixture = {
      ...question,
      title: 'Deletion fixture',
      prompt: 'When did the archived test question happen?',
    }
    const { id } = await work('save_question', fixture, admin)
    await work(
      'review',
      { question: id, decision: 'publish', confirm: true },
      admin,
    )
    const session = await game('start', { mode: 'quick' })
    const round = (
      await db.query(
        `insert into public.rounds(session_id,question_id,position,snapshot)
      select $1,q.id,1,to_jsonb(q) || jsonb_build_object('subject','History') from public.questions q
      where id=$2 returning id`,
        [session.id, id],
      )
    ).rows[0]
    const feedback = await game('submit', {
      id: session.id,
      round: round.id,
      answer: 1700,
    })
    const payload = { question: id }
    await expect(work('delete_question', payload)).rejects.toThrow(
      'Administrator',
    )
    await work('delete_question', payload, admin)
    await work('delete_question', payload, admin)
    expect(await work('browse', { search: fixture.prompt })).toEqual([])
    expect(
      (await work('editor_list', {}, admin)).some((q) => q.id === id),
    ).toBe(false)
    await expect(work('editor_get', payload, admin)).rejects.toThrow(
      'unavailable',
    )
    expect(
      (await game('session', { id: session.id })).rounds[0].feedback,
    ).toEqual(feedback)
    expect((await work('save_question', fixture, admin)).id).not.toBe(id)
  })
})
describe('server scoring', () => {
  it('calculates great-circle distances and regional scoring', async () => {
    const target = { lat: 0, lng: 0, scale: 500, label: 'Target' }
    expect(
      (await score('where', target, { lat: 0, lng: 1 })).difference,
    ).toBeCloseTo(111.195, 2)
    const region = {
      ...target,
      polygon: [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ],
    }
    expect((await score('where', region, { lat: 0.5, lng: 0.5 })).score).toBe(
      1000,
    )
    expect(
      (await score('where', region, { lat: 0, lng: 2 })).difference,
    ).toBeCloseTo(111.195, 2)
    await expect(score('where', region, { lat: 97, lng: 2 })).rejects.toThrow(
      'outside',
    )
  })
  it('scores astronomical BCE / CE and approximate dates', async () => {
    const target = { min: -43, max: -43, scale: 10, label: '44 BCE' }
    expect((await score('when', target, -43)).score).toBe(1000)
    expect((await score('when', target, 1)).difference).toBe(44)
    expect((await score('when', { ...target, max: -36 }, -39)).score).toBe(1000)
  })
  it('handles exact alias matches, reveal deductions and portrait IDs', async () => {
    expect(
      (await score('what', { aliases: ['Eagle II'] }, '  EAGLE   ii! ', 2))
        .score,
    ).toBe(600)
    expect(
      (await score('what', { aliases: ['Eagle II'] }, 'Eagle III')).score,
    ).toBe(0)
    expect((await score('what', { aliases: ['C++'] }, 'C')).score).toBe(0)
    expect(
      (await score('who', { correct: 'private-id' }, 'private-id')).score,
    ).toBe(1000)
  })
  it('awards partial causal and sequence credit and clamps incorrect links', async () => {
    expect(
      (
        await score('why', { mechanic: 'evidence', correct: ['a', 'b', 'c'] }, [
          'a',
          'b',
          'x',
        ])
      ).score,
    ).toBe(333)
    expect(
      (
        await score(
          'why',
          { mechanic: 'chain', correct: ['a', 'b', 'c', 'd'] },
          ['a', 'b', 'd', 'c'],
        )
      ).score,
    ).toBe(0)
    expect(
      (
        await score(
          'why',
          { mechanic: 'matching', correct: { a: 'b', c: 'd', e: 'f' } },
          { a: 'b', c: 'x', e: 'f' },
        )
      ).score,
    ).toBe(333)
    expect(
      (
        await score('how', { correct: ['a', 'b', 'c', 'd'] }, [
          'a',
          'c',
          'b',
          'd',
        ])
      ).score,
    ).toBe(833)
    await expect(
      score('how', { correct: ['a', 'b', 'c'] }, ['a', 'a', 'c']),
    ).rejects.toThrow('once')
  })
})
describe('game session', () => {
  it('spins uniformly across all six eligible categories on first round', async () => {
    const counts = {}
    for (let i = 0; i < 120; i++) {
      const s = await game('start', { mode: 'quick' })
      const r = await game('spin', { id: s.id })
      counts[r.kind] = (counts[r.kind] ?? 0) + 1
    }
    expect(Object.keys(counts)).toHaveLength(6)
    for (const count of Object.values(counts)) expect(count).toBeGreaterThan(3)
  })
  it('persists rounds, prevents concurrent double submissions and covers each seed without repeats', async () => {
    const s = await game('start', { mode: 'practice' })
    const kinds = new Set(),
      seen = new Set()
    for (let i = 0; i < 21; i++) {
      const r = await game('spin', { id: s.id })
      expect(r).not.toHaveProperty('solution')
      expect(r.display).not.toHaveProperty('images')
      for (const option of r.display.options ?? [])
        expect(option.id).toMatch(/^[a-f\d-]{36}$/)
      expect((await game('spin', { id: s.id })).id).toBe(r.id)
      const {
        rows: [privateRound],
      } = await db.query(
        'select question_id,snapshot from public.rounds where id=$1',
        [r.id],
      )
      const key = privateRound.snapshot.solution
      kinds.add(r.kind)
      seen.add(privateRound.question_id)
      const answer =
        r.kind === 'where'
          ? { lat: key.lat, lng: key.lng }
          : r.kind === 'when'
            ? key.min
            : key.correct
      if (r.kind === 'what') {
        expect(
          (await game('reveal', { id: s.id, round: r.id, stage: 1 })).reveals,
        ).toBe(1)
        expect(
          (await game('reveal', { id: s.id, round: r.id, stage: 1 })).reveals,
        ).toBe(1)
      }
      const p = { id: s.id, round: r.id, answer }
      const [a, b] = await Promise.all([game('submit', p), game('submit', p)])
      expect(a).toEqual(b)
      expect(a.score).toBe(r.kind === 'what' ? 800 : 1000)
    }
    expect(kinds.size).toBe(6)
    expect(seen.size).toBe(21)
    await game('finish', { id: s.id })
    await expect(game('session', { id: s.id }, other)).rejects.toThrow(
      'Session unavailable',
    )
    expect((await game('session', { id: s.id })).total).toBe(20800)
    expect(await work('leaderboard', {}, null)).toEqual([])
  })
  it('rejects late scores and returns the saved timeout feedback on retry', async () => {
    const s = await game('start', { mode: 'quick' })
    const r = await game('spin', { id: s.id })
    await db.query(
      "update public.rounds set deadline=clock_timestamp()-interval '1 second' where id=$1",
      [r.id],
    )
    const result = await game('submit', { id: s.id, round: r.id, answer: null })
    expect(result).toMatchObject({ score: 0, expired: true })
    expect(
      await game('submit', { id: s.id, round: r.id, answer: 'other' }),
    ).toEqual(result)
  })
  it('retires new course and assessment sessions', async () => {
    await expect(game('start', { mode: 'assessment' })).rejects.toThrow(
      'public quiz mode',
    )
    await expect(game('start', { mode: 'course' })).rejects.toThrow(
      'public quiz mode',
    )
  })
  it('keeps submissions after reopening the embedded database', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'whirl-test-'))
    let disk
    try {
      disk = await openLocal(join(dir, 'db'))
      const { id } = (
        await disk.query('insert into auth.users default values returning id')
      ).rows[0]
      const s = await rpc(disk, id, 'play', 'start', { mode: 'quick' })
      const r = await rpc(disk, id, 'play', 'spin', { id: s.id })
      await disk.close()
      disk = await openLocal(join(dir, 'db'))
      expect(
        (await rpc(disk, id, 'play', 'session', { id: s.id })).rounds[0].id,
      ).toBe(r.id)
    } finally {
      await disk?.close()
      await rm(dir, { recursive: true, force: true })
    }
  })
})
describe('content ingestion', () => {
  it('chooses relevant, distinct, licensed portraits of the same medium', () => {
    const target = {
      subject: 'Person A',
      image: 'a',
      url: 'https://example.com/a',
      artist: 'Photographer',
      license: 'Public Domain',
      occupation: 'astronaut',
      period: 'Apollo',
      birth: 1930,
      medium: 'photograph',
    }
    const related = ['b', 'c', 'd', 'e'].map((x, i) => ({
      ...target,
      subject: 'Person ' + x,
      image: x,
      birth: 1931 + i,
    }))
    const result = selectPortraits(target, [
      target,
      { ...related[0], image: 'a' },
      { ...related[0], medium: 'painting' },
      ...related,
    ])
    expect(result.map((c) => c.image)).toEqual(['a', 'b', 'c', 'd'])
    expect(selectPortraits(target, related.slice(0, 2))).toEqual([])
  })
  it('resumes an idempotent import without publishing unreviewed data', async () => {
    const c = makeCandidate(
      {
        item: { value: 'http://www.wikidata.org/entity/Q123456789' },
        label: { value: 'Test Museum' },
        inception: { value: '+1901-01-01T00:00:00Z' },
      },
      'Q33506',
    )
    expect(c.year).toBe(1901)
    const p = { job: 'test source', cursor: 123456789, candidates: [c] }
    expect(await db.transaction((tx) => commitPage(tx, p))).toBe(1)
    expect(await db.transaction((tx) => commitPage(tx, p))).toBe(0)
    const { rows } = await db.query(
      "select status from public.questions q join public.topics t on t.id=q.topic_id where t.slug='wikidata-q123456789'",
    )
    expect(rows).toEqual([{ status: 'review' }])
  })
})
