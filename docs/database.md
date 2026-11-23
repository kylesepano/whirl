# Database

Supabase hosts PostgreSQL, Auth, and optional image uploads. The loopback demo applies the same SQL migrations to PGlite, adding a local-only shim for the two API roles, `auth.users`, and `auth.uid()`.

## Data model

| Tables | Responsibility |
| --- | --- |
| `profiles` | Display name and role. New auth identities receive the guest role. An admin is provisioned explicitly. |
| `topics`, `questions` | Unique topic slugs, one variant per mechanic and topic, original prompts, credits, sources, review status, and mechanic-specific JSON data. |
| `courses`, `lessons`, `enrollments`, `lesson_progress` | Legacy course and lesson data kept for existing installations. |
| `course_questions`, `assessments`, `assessment_questions` | Legacy challenge and assessment definitions. |
| `sessions`, `rounds`, `submissions` | Persistent round state, private historical snapshots, and one scored submission per round. |
| `import_jobs`, `reports` | Committed importer cursors and player reports for moderators. |

## API boundary

RLS is enabled on every application table. Authenticated roles can select only their own profile and sessions through direct database API grants. Question, round, and result access goes through `whirl_workspace` and `whirl_play`, which enforce grants, role checks, and session ownership. Guests receive only public display fields from the question browser. Only the admin can access the editor and review queues. Legacy student and instructor profiles migrate to guest.

Rounds take a private snapshot when opened. Publishing, rejecting, editing, or deleting a question affects future selection. A deleted variant is hidden from the bank and editor while old round snapshots and results remain available. Answer submission locks the owning session and round, writes a unique submission, and closes a finite session at its target. Retrying a submitted round returns the recorded result, with the originally submitted answer. A WHAT reveal retry at the same stage returns the same stage.

Roulette draws uniformly from eligible categories, then selects an eligible question. It exhausts unseen items before repeating within a session and considers recent attempts across sessions. Practice prioritizes previous low-scoring attempts among the eligible questions in each selected category. New course and assessment sessions are disabled.

## Scoring

- Point and regional map questions use an exponential curve. Point distance uses Haversine. Polygons use ray casting with a local approximation for the nearest segment, designed for ordinary non-antimeridian polygons.
- Timelines use astronomical years. Year 0 represents 1 BCE. Values inside the accepted date interval score full credit, and values outside fall off exponentially. Exact dates use the fraction of a Gregorian year elapsed.
- Choice-based portraits and mysteries use opaque card IDs. Typed aliases use normalized exact matching. Additional mystery reveals cost 200 points each.
- WHY supports evidence, links in a chain, and explicit observation-to-cause mappings. Incorrect links reduce partial credit down to zero.
- HOW scores relative pair order. Only the server writes the final score. Expired timed answers receive zero points.

XP, streaks, achievements, and dashboards are derived from durable submissions. Ranked leaderboards use completed quick, classic, and marathon sessions only. Course assessments and practice are excluded.

