// Applies supabase/migrations/*.sql to your Supabase database, in order, once each.
//   npm run db:migrate   apply anything new
//   npm run db:status    show what is applied and check the setup
// Reads SUPABASE_DB_URL from .env.local. Applied migrations are recorded in
// supabase_migrations.schema_migrations, the same table the Supabase CLI uses,
// so `supabase db push` will agree with this script later.
import fs from 'node:fs'
import path from 'node:path'
import pg from 'pg'

const root = path.join(import.meta.dirname, '..')

function loadEnv() {
  const file = path.join(root, '.env.local')
  if (!fs.existsSync(file)) return
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}
loadEnv()

/** Read a line from the terminal without echoing it. */
async function askHidden(question) {
  const { stdin, stdout } = process
  stdout.write(question)
  stdin.setRawMode(true)
  stdin.resume()
  stdin.setEncoding('utf8')
  let value = ''
  return new Promise((resolve) => {
    const onData = (ch) => {
      if (ch === '\r' || ch === '\n' || ch === '\u0004') {
        stdin.setRawMode(false)
        stdin.pause()
        stdin.off('data', onData)
        stdout.write('\n')
        resolve(value)
      } else if (ch === '\u0003') {
        stdout.write('\n')
        process.exit(130)
      } else if (ch === '\u007f' || ch === '\b') {
        value = value.slice(0, -1)
      } else {
        value += ch
      }
    }
    stdin.on('data', onData)
  })
}

let url = process.env.SUPABASE_DB_URL
if (!url || url.includes('your-project-ref')) {
  console.error('Set SUPABASE_DB_URL in .env.local (Supabase → Connect → Session pooler connection string).')
  process.exit(1)
}
if (url.includes('[YOUR-PASSWORD]')) {
  if (!process.stdin.isTTY) {
    console.error('SUPABASE_DB_URL still has [YOUR-PASSWORD]. Put the password in .env.local, or run this command in a terminal to be asked for it.')
    process.exit(1)
  }
  const pw = await askHidden('Supabase database password (typing is hidden): ')
  if (!pw) {
    console.error('No password entered.')
    process.exit(1)
  }
  url = url.replace('[YOUR-PASSWORD]', encodeURIComponent(pw))
}

// Supabase requires TLS. Certificate verification is skipped because the
// pooler uses Supabase's own CA; the connection is still encrypted.
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
const mode = process.argv[2] ?? 'status'

const dir = path.join(root, 'supabase', 'migrations')
const files = fs.readdirSync(dir).filter((f) => /^\d{14}_.+\.sql$/.test(f)).sort()

try {
  await client.connect()
} catch (e) {
  const msg = String(e.message)
  console.error('Could not connect:', msg.replace(url, '<SUPABASE_DB_URL>'))
  if (/password/i.test(msg)) console.error('→ Check the database password in SUPABASE_DB_URL.')
  if (/ENOTFOUND|EHOSTUNREACH|ENETUNREACH/.test(msg)) console.error('→ Use the "Session pooler" connection string (the direct one needs IPv6).')
  process.exit(1)
}

await client.query(`create schema if not exists supabase_migrations;
  create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text)`)
const { rows } = await client.query('select version from supabase_migrations.schema_migrations')
const applied = new Set(rows.map((r) => r.version))

if (mode === 'migrate') {
  let n = 0
  for (const f of files) {
    const version = f.slice(0, 14)
    if (applied.has(version)) continue
    const sql = fs.readFileSync(path.join(dir, f), 'utf8')
    process.stdout.write(`applying ${f} … `)
    try {
      await client.query('begin')
      await client.query(sql)
      await client.query('insert into supabase_migrations.schema_migrations (version, name, statements) values ($1, $2, $3)', [version, f.slice(15, -4), [sql]])
      await client.query('commit')
      console.log('done')
      n++
    } catch (e) {
      await client.query('rollback')
      console.log('FAILED')
      console.error(e.message)
      await client.end()
      process.exit(1)
    }
  }
  console.log(n ? `${n} migration(s) applied.` : 'Database already up to date.')
}

// status / verification
const after = new Set((await client.query('select version from supabase_migrations.schema_migrations')).rows.map((r) => r.version))
for (const f of files) console.log(after.has(f.slice(0, 14)) ? '✓' : '·', f)
const pending = files.filter((f) => !after.has(f.slice(0, 14)))
if (!pending.length) {
  const q = async (sql) => (await client.query(sql)).rows[0]
  const checks = [
    ['tables', `select count(*)::int n from information_schema.tables where table_schema='public' and table_type='BASE TABLE'`, (r) => r.n >= 43],
    ['GST states', `select count(*)::int n from public.states where gst_code is not null`, (r) => r.n === 37],
    ['airlines', `select count(*)::int n from public.airlines where org_id is null`, (r) => r.n >= 30],
    ['row level security on every tenant table', `select count(*)::int n from pg_tables where schemaname='public' and not rowsecurity`, (r) => r.n === 0],
    ['app functions callable by signed-in users', `select has_function_privilege('authenticated', 'public.save_invoice(uuid, jsonb, jsonb, boolean)', 'execute') ok`, (r) => r.ok],
    ['anonymous users blocked from app functions', `select not has_function_privilege('anon', 'public.save_invoice(uuid, jsonb, jsonb, boolean)', 'execute') ok`, (r) => r.ok],
  ]
  console.log('')
  let bad = 0
  for (const [name, sql, test] of checks) {
    const r = await q(sql)
    const pass = test(r)
    if (!pass) bad++
    console.log(pass ? 'PASS' : 'FAIL', name, r.n !== undefined ? `(${r.n})` : '')
  }
  if (bad) process.exitCode = 1
} else {
  console.log(`\n${pending.length} migration(s) not applied yet — run: npm run db:migrate`)
}
await client.end()
