# Implementation progress

The first question bank expansion brought the bank to 36 questions in 27 reviewed topic bundles.

The general knowledge catalog adds 1,285 source-backed questions across nine subjects, bringing the bundled total to 1,321. The Question bank now filters by subject. WHO and WHAT also support typed clues alongside their existing visual rounds.

The next expansion adds 36 sourced questions in five subjects, bringing the bundled total to 1,357. Animals leads the batch with 14 questions, including reasoning and ordering rounds.

## Guest play and admin-only question management

- Public quiz modes start a guest session without an account form. Admin sign-in is the only sign-in screen. Previous student and instructor profiles migrate to guest.
- Admins can create, edit, publish, and delete variants. Deletion preserves recorded rounds and results.
- WHERE uses MapLibre with bundled Natural Earth data and no remote tile provider.

| Phase | Implemented |
| --- | --- |
| 1 | Vite/React/TypeScript/Tailwind shell, routes, local registration and sign-in, Supabase Auth integration, migrations, role restrictions. |
| 2 | Topic/variant model, source and license fields, review workflow, validation, transaction-based scoring. |
| 3 | Uniform eligible-category roulette, animated result, quick/classic/marathon/practice/course/assessment sessions, persistent results. |
| 4 | Four NASA portrait choices with neutral labels, same-medium ranking, opaque stored asset names. |
| 5 | MapLibre, pannable and zoomable map, draggable marker, coordinate fallback, distance scoring and target reveal. |
| 6 | Timeline selection and zoom, year entry and BCE/CE, accepted date ranges and exponential scoring. |
| 7 | Four mystery reveal levels, server-tracked deductions, choice and typed alias mechanics. |
| 8 | Evidence, cause matching, and causal-chain controls with partial credit. |
| 9 | Drag and drop plus keyboard/touch reorder buttons, pairwise scoring, solution order. |
| 10 | Published course catalog, enrollment, lessons, assessments, class summaries, progress, XP/streaks, achievements, ranked scores. |
| 11 | Verified starter data, author/editor preview, storage integration, resumable Wikidata importer, moderation and player reports. |
| 12 | Database and UI tests, Playwright journeys, responsive and reduced-motion UI, deploy and demo documentation. |

## Local verification

- 20 Vitest tests and 5 Chromium Playwright journeys passed. Coverage includes the catalog count and subjects, guest play, admin question management, mobile subject filtering, and map scoring with external network requests blocked.
- The production build succeeded. Vite reports a size warning for the initial bundle and the lazy MapLibre bundle.
- The local database has 1,357 distinct published questions. All five new subjects are available through the public subject filter.
- A live Wikidata dry run returned candidates. The idempotency test verified that imported records remain in review.

## Remaining against the full brief

- Continue editorial review and add more distinct portrait sets, image reveals, and reasoning puzzles. The broader catalog concentrates on typed clues, timelines, and map pins.
- Connect a real Supabase project and check email confirmation, hosted Storage uploads, migrations, and Vercel deployment. The external project was unavailable in this workspace.
- The editor uses structured text fields for some relationships and media credits. Rich graph authoring and a generalized, searchable portrait/media library are future work.
- Moderation includes player reports and structural checks. Automated source credibility and semantic-duplicate checks, image link monitoring, and bulk licensed media ingestion are pending.

