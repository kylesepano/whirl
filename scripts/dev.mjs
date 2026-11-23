import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const cwd = fileURLToPath(new URL('..', import.meta.url))
const api = spawn(process.execPath, ['scripts/local-server.mjs'], {
  cwd,
  stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
})
let ui
api.once('message', (message) => {
  if (message !== 'ready') return
  ui = spawn(
    process.execPath,
    ['node_modules/vite/bin/vite.js', '--strictPort', ...process.argv.slice(2)],
    { cwd, stdio: 'inherit' },
  )
  ui.on('exit', stop)
})
api.on('exit', stop)

function stop(code) {
  if (ui?.exitCode === null) ui.kill()
  if (api.exitCode === null) api.kill()
  process.exitCode = typeof code === 'number' ? code : 0
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, stop)
