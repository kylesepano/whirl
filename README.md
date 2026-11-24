# WHIRL

**Six Ways to Know**  
Spin. Think. Discover.

WHIRL is a roulette-based learning platform. The wheel chooses among portraits, geography, timelines, image mysteries, causal reasoning, and sequence puzzles. PostgreSQL owns question selection, timing, scoring, and session history.

## Run on this computer

Open PowerShell in the repository. Node.js 24 is the version used for local verification.

```powershell
npm.cmd ci
npm.cmd run dev
```

Visit **http://127.0.0.1:5173/** and choose a game mode. Guests can play without an account form. A game's answers and score are available on its results page.

The development server binds to loopback and stores its PostgreSQL database under the ignored `.whirl/` directory. WHERE rounds use MapLibre and bundled Natural Earth data. Country questions highlight the full country and provide a country list. Location questions accept a map pin or coordinates. The maps need no tile service or API key.

See [DEMO.md](DEMO.md) for a guided walkthrough.

## Set up the local admin

1. Stop the running server with **Ctrl+C** if needed.
2. Copy `.env.example` to `.env.local` if the file does not exist. Set `WHIRL_ADMIN_EMAIL` and `WHIRL_ADMIN_PASSWORD`. Keep this file private.
3. Run `npm.cmd run dev`. The server creates the admin on first boot with those settings. An existing admin keeps their password.
4. Go directly to **http://127.0.0.1:5173/login**. Sign in to open the Question Bank. Create or edit a question, save it for review, and publish it after checking the source. To delete a question, open it and confirm **Delete question**. Saved quiz results are preserved.

## Test and build

```powershell
npm.cmd test
npx.cmd playwright install chromium
npm.cmd run test:e2e
npm.cmd run build
```

Use an existing Chrome installation by setting `$env:WHIRL_BROWSER = "chrome"` before running Playwright. Browser tests provision their own admin in an isolated database under `.whirl/e2e`.

## Deploy with Supabase and Vercel

1. Create a Supabase project. Install the [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started), sign in, run `supabase link --project-ref YOUR_PROJECT_REF`, then run `supabase db push`. The migration history includes the curated starter content and image bucket.
2. Copy `.env.example` to `.env.local` for a local frontend connected to Supabase. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` from the project's Connect settings. The frontend uses Supabase Auth and RPCs when both are configured.
3. Import this repository into Vercel as a Vite project. Use `npm run build` and the `dist` output directory. Set the same two public environment variables in Vercel. The included SPA rewrite supports direct links to app routes.
4. Set the Supabase Auth Site URL to your Vercel URL and enable **Allow anonymous sign-ins** for guest games. Apply the new migration to existing projects as well. [Supabase anonymous sign-ins](https://supabase.com/docs/guides/auth/auth-anonymous)
5. Create an email/password user under **Authentication → Users** in Supabase. Verify the user UUID and run `update public.profiles set role = 'admin' where id = 'USER-UUID';` in the SQL Editor.
6. Test guest play, admin sign-in, and question management on the deployed site.

Keep the local admin password and database connection strings server-side. The local admin variables do not provision a hosted admin.

## Content and architecture

- [Database schema, RPCs, and permissions](docs/database.md)
- [Question sourcing, asset rights, and importer](docs/content.md)
- [Implementation status and remaining work](PROGRESS.md)

The bundled bank contains **10,802 published questions** across General knowledge, History, Science, Movie & TV series, Literature, Sports, Geography, Music, Pop culture, and other subjects. Admins can search the Question Bank by question, subject, or topic and filter by publication status.

New bundled questions load on local server startup or when the latest migrations are applied to hosted Supabase. The separate Wikidata importer stores dated claims as review candidates.

