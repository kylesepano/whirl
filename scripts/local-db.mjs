import { PGlite } from '@electric-sql/pglite'
import { readdir, readFile } from 'node:fs/promises'

export async function openLocal(path) {
  const db = await PGlite.create(path)
  await db.exec(`
 do $$ begin
  if not exists(select 1 from pg_roles where rolname='anon') then
   create role anon; create role authenticated;
  end if;
 end $$;
 create schema if not exists auth;
 create table if not exists auth.users(id uuid primary key default gen_random_uuid(), raw_user_meta_data jsonb);
 create or replace function auth.uid() returns uuid language sql stable as
 $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema auth to anon,authenticated;
 create schema if not exists local_auth;
 create table if not exists local_auth.migrations(name text primary key);
 create table if not exists local_auth.accounts(email text primary key, password text not null,
   user_id uuid unique references auth.users on delete cascade);
 create table if not exists local_auth.tokens(hash text primary key,user_id uuid references auth.users on delete cascade,
  expires timestamptz not null default now()+interval '14 days');
 `)
  const migrations = new URL('../supabase/migrations/', import.meta.url)
  for (const name of (await readdir(migrations))
    .filter((x) => x.endsWith('.sql'))
    .sort()) {
    await db.transaction(async (tx) => {
      if (
        (
          await tx.query('select 1 from local_auth.migrations where name=$1', [
            name,
          ])
        ).rows.length
      )
        return
      await tx.exec(await readFile(new URL(name, migrations), 'utf8'))
      await tx.query('insert into local_auth.migrations values($1)', [name])
    })
  }
  return db
}
export async function rpc(db, user, service, action, p = {}) {
  const fn = { play: 'whirl_play', workspace: 'whirl_workspace' }[service]
  if (!fn) throw new Error('Unknown service')
  return db.transaction(async (tx) => {
    await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [
      user ?? '',
    ])
    await tx.exec(user ? 'set local role authenticated' : 'set local role anon')
    return (
      await tx.query('select public.' + fn + '($1,$2::jsonb) as result', [
        action,
        JSON.stringify(p),
      ])
    ).rows[0].result
  })
}
